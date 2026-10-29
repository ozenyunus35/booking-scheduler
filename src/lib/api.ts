import { assignStaff, checkSlot, getSlots, REASON_TEXT, type Reason } from "./availability";
import { zonedToUtc } from "./dates";
import { refFor } from "./seed";
import type { Booking, BookingSource, BookingStatus, Client, DemoState, ISODate } from "./types";

/**
 * Every change the demo makes, as pure functions over a draft state so they can
 * be unit tested and then applied through the store's `update()`. In a real
 * deployment these are the API routes, with the same checks on the server.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function reasonText(s: DemoState, reason: Reason, staffId?: string) {
  const text = REASON_TEXT[reason];
  if (/^[a-z]/.test(text)) {
    const who = s.staff.find((p) => p.id === staffId)?.name.split(" ")[0] ?? "They";
    return `${who} ${text}`;
  }
  return text;
}

export interface ClientInput {
  name: string;
  email: string;
  phone: string;
}

export function validateClient(c: ClientInput): Partial<Record<keyof ClientInput, string>> {
  const errors: Partial<Record<keyof ClientInput, string>> = {};
  if (c.name.trim().length < 2) errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) errors.email = "Enter a valid email address.";
  if (c.phone.replace(/\D/g, "").length < 7) errors.phone = "Enter a phone number we can text a reminder to.";
  return errors;
}

/** Finds a client by email (case-insensitive) or adds a new one. */
export function upsertClient(s: DemoState, input: ClientInput, now: number): Client {
  const email = input.email.trim().toLowerCase();
  const found = s.clients.find((c) => c.email.toLowerCase() === email);
  if (found) {
    found.name = input.name.trim() || found.name;
    found.phone = input.phone.trim() || found.phone;
    return found;
  }
  const n = s.clients.reduce((m, c) => Math.max(m, Number(c.id.slice(1)) || 0), 0) + 1;
  const client: Client = { id: `c${String(n).padStart(3, "0")}`, name: input.name.trim(), email, phone: input.phone.trim(), notes: "", createdAt: new Date(now).toISOString() };
  s.clients.push(client);
  return client;
}

function newToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

function nextRef(s: DemoState) {
  const used = new Set(s.bookings.map((b) => b.ref));
  let n = s.bookings.length + 1;
  while (used.has(refFor(n))) n++;
  return { n, ref: refFor(n) };
}

export interface NewBooking {
  serviceId: string;
  /** A staff id or "any". */
  staffId: string;
  date: ISODate;
  start: number;
  client: ClientInput | { id: string };
  notes?: string;
  source: BookingSource;
  /** True for the public booking page; the salon can book inside the notice period. */
  online: boolean;
}

export function createBooking(s: DemoState, input: NewBooking, now: number): Result<Booking> {
  const service = s.services.find((x) => x.id === input.serviceId);
  if (!service) return { ok: false, error: "That service is no longer available." };
  const q = { serviceId: service.id, date: input.date, now, enforceRules: input.online };

  let staffId = input.staffId;
  if (staffId === "any") {
    const slot = getSlots(s, { ...q, staffId: "any" }).find((x) => x.start === input.start);
    const chosen = slot && assignStaff(s, input.date, slot.staffIds);
    if (!chosen) return { ok: false, error: "Sorry, that time was just taken. Please pick another." };
    staffId = chosen;
  } else {
    const reason = checkSlot(s, { ...q, staffId, start: input.start });
    if (reason) return { ok: false, error: reason === "overlap" && input.online ? "Sorry, that time was just taken. Please pick another." : reasonText(s, reason, staffId) };
  }

  const client = "id" in input.client ? s.clients.find((c) => c.id === (input.client as { id: string }).id) : upsertClient(s, input.client, now);
  if (!client) return { ok: false, error: "Choose a client." };

  const { n, ref } = nextRef(s);
  const booking: Booking = {
    id: `bk${String(n).padStart(4, "0")}-${now.toString(36)}`,
    ref,
    token: newToken(),
    serviceId: service.id,
    staffId,
    clientId: client.id,
    date: input.date,
    start: input.start,
    end: input.start + service.duration,
    status: "confirmed",
    price: service.price,
    source: input.source,
    anyStaff: input.staffId === "any",
    notes: input.notes?.trim() ?? "",
    createdAt: new Date(now).toISOString(),
  };
  s.bookings.push(booking);
  return { ok: true, value: booking };
}

/** Whether the client may still change the booking online. */
export function canChangeOnline(s: DemoState, b: Booking, now: number) {
  if (b.status !== "confirmed") return false;
  return zonedToUtc(b.date, b.start, s.salon.timeZone) - now >= s.rules.cancelHours * 3_600_000;
}

export function moveBooking(s: DemoState, id: string, to: { date: ISODate; start: number; staffId: string }, now: number, online: boolean): Result<Booking> {
  const b = s.bookings.find((x) => x.id === id);
  if (!b) return { ok: false, error: "Booking not found." };
  if (b.status !== "confirmed") return { ok: false, error: "Only upcoming bookings can be moved." };
  if (online && !canChangeOnline(s, b, now)) return { ok: false, error: `Online changes close ${s.rules.cancelHours} hours before the appointment. Please call the salon.` };
  let staffId = to.staffId;
  const q = { serviceId: b.serviceId, date: to.date, now, ignoreBookingId: b.id, enforceRules: online };
  if (staffId === "any") {
    const slot = getSlots(s, { ...q, staffId: "any" }).find((x) => x.start === to.start);
    const chosen = slot && assignStaff(s, to.date, slot.staffIds.includes(b.staffId) ? [b.staffId] : slot.staffIds);
    if (!chosen) return { ok: false, error: "Sorry, that time was just taken. Please pick another." };
    staffId = chosen;
  } else {
    const reason = checkSlot(s, { ...q, staffId, start: to.start });
    if (reason) return { ok: false, error: reasonText(s, reason, staffId) };
  }
  const length = b.end - b.start;
  Object.assign(b, { date: to.date, start: to.start, end: to.start + length, staffId });
  return { ok: true, value: b };
}

export function cancelBooking(s: DemoState, id: string, now: number, online: boolean): Result<Booking> {
  const b = s.bookings.find((x) => x.id === id);
  if (!b) return { ok: false, error: "Booking not found." };
  if (b.status !== "confirmed") return { ok: false, error: "This booking is no longer active." };
  if (online && !canChangeOnline(s, b, now)) return { ok: false, error: `Online cancellation closes ${s.rules.cancelHours} hours before the appointment. Please call the salon.` };
  b.status = "cancelled";
  return { ok: true, value: b };
}

export function setStatus(s: DemoState, id: string, status: BookingStatus) {
  const b = s.bookings.find((x) => x.id === id);
  if (b) b.status = status;
}

/** Looks a booking up by its reference and the email it was made with, like a "manage booking" link. */
export function findBooking(s: DemoState, ref: string, email: string): Booking | null {
  const b = s.bookings.find((x) => x.ref.toUpperCase() === ref.trim().toUpperCase());
  if (!b) return null;
  const c = s.clients.find((x) => x.id === b.clientId);
  return c && c.email.toLowerCase() === email.trim().toLowerCase() ? b : null;
}

export const findByToken = (s: DemoState, token: string) => s.bookings.find((b) => b.token === token) ?? null;
