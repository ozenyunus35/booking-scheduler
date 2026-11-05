import { assignStaff, checkSlot, getSlots, inPart, REASON_TEXT, visitFor, type Reason } from "./availability";
import { addDays, formatDay, zonedNow, zonedToUtc } from "./dates";
import { refFor } from "./seed";
import { bookingMessage, queueMessage, seriesMessage, slotOpenMessage, waitlistJoinedMessage } from "./messages";
import type { Booking, BookingSource, BookingStatus, Client, DayPart, DemoState, ISODate, WaitlistEntry } from "./types";

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

/** Field limits, shared with the forms' maxLength. */
export const LIMITS = { name: 80, email: 254, phone: 24, notes: 500 } as const;

export function validateClient(c: ClientInput): Partial<Record<keyof ClientInput, string>> {
  const errors: Partial<Record<keyof ClientInput, string>> = {};
  const digits = c.phone.replace(/\D/g, "").length;
  if (c.name.trim().length < 2) errors.name = "Enter your name.";
  else if (c.name.trim().length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;
  if (c.email.trim().length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) errors.email = "Enter a valid email address.";
  if (!/^[\d\s+().-]*$/.test(c.phone.trim()) || digits < 7 || digits > 15) errors.phone = "Enter a phone number we can text a reminder to.";
  return errors;
}

const sameDigits = (a: string, b: string) => a.replace(/\D/g, "") === b.replace(/\D/g, "");

/**
 * Finds a client by email (case-insensitive) or adds a new one. Online, an existing
 * client's name and phone are never overwritten: anyone can type an email address.
 * The salon's own forms may update them.
 */
export function upsertClient(s: DemoState, input: ClientInput, now: number, online = false): Client {
  const email = input.email.trim().toLowerCase();
  const found = s.clients.find((c) => c.email.toLowerCase() === email);
  if (found) {
    if (!online) {
      found.name = input.name.trim() || found.name;
      found.phone = input.phone.trim() || found.phone;
    }
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
  /** Services done right after the main one, in the same visit. */
  addOnIds?: string[];
  /** A staff id or "any". */
  staffId: string;
  date: ISODate;
  start: number;
  client: ClientInput | { id: string };
  notes?: string;
  source: BookingSource;
  /** True for the public booking page; the salon can book inside the notice period. */
  online: boolean;
  /** Part of a repeating series. */
  seriesId?: string;
  /** Queue a confirmation email (default). A series sends one email for all its dates instead. */
  notify?: boolean;
}

/** A real "YYYY-MM-DD" date, not "2026-02-30". */
export const isRealDate = (d: unknown): d is ISODate => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && addDays(d, 0) === d;

/** A whole minute of the day. */
const isMinute = (m: unknown): m is number => Number.isInteger(m) && (m as number) >= 0 && (m as number) < 1440;

function checkWhen(date: unknown, start: unknown): string | null {
  if (!isRealDate(date)) return "Choose a valid date.";
  if (!isMinute(start)) return "Choose a valid time.";
  return null;
}

export function createBooking(s: DemoState, input: NewBooking, now: number): Result<Booking> {
  const addOnIds = [...new Set(input.addOnIds ?? [])].filter((id) => id !== input.serviceId);
  if (addOnIds.length > 2) return { ok: false, error: "Add at most two services to one visit." };
  const service = visitFor(s, input.serviceId, addOnIds);
  if (!service || !service.active) return { ok: false, error: "That service is no longer available." };
  if (!service.staffIds.length) return { ok: false, error: "No one on the team does all of these in one visit." };
  const when = checkWhen(input.date, input.start);
  if (when) return { ok: false, error: when };
  const notes = input.notes?.trim() ?? "";
  if (notes.length > LIMITS.notes) return { ok: false, error: `Keep the note under ${LIMITS.notes} characters.` };
  if (!("id" in input.client)) {
    const errors = validateClient(input.client);
    const first = Object.values(errors)[0];
    if (first) return { ok: false, error: first };
  }
  const q = { serviceId: input.serviceId, addOnIds, date: input.date, now, enforceRules: input.online };

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

  const typed = "id" in input.client ? null : input.client;
  const client = typed ? upsertClient(s, typed, now, input.online) : s.clients.find((c) => c.id === (input.client as { id: string }).id);
  if (!client) return { ok: false, error: "Choose a client." };
  // Online details that differ from the client on file go on the booking for the salon to check.
  const differs = typed && input.online && (typed.name.trim() !== client.name || !sameDigits(typed.phone, client.phone));
  const bookingNotes = differs ? [notes, `Booked online as ${typed.name.trim()}, ${typed.phone.trim()}.`].filter(Boolean).join("\n") : notes;

  const { n, ref } = nextRef(s);
  const booking: Booking = {
    id: `bk${String(n).padStart(4, "0")}-${now.toString(36)}`,
    ref,
    token: newToken(),
    serviceId: input.serviceId,
    ...(addOnIds.length ? { addOnIds } : {}),
    staffId,
    clientId: client.id,
    date: input.date,
    start: input.start,
    end: input.start + service.duration,
    ...(input.seriesId ? { seriesId: input.seriesId } : {}),
    status: "confirmed",
    price: service.price,
    source: input.source,
    anyStaff: input.staffId === "any",
    notes: bookingNotes,
    createdAt: new Date(now).toISOString(),
  };
  s.bookings.push(booking);
  if (input.notify !== false) queueMessage(s, bookingMessage(s, booking, "confirmation", now));
  return { ok: true, value: booking };
}

/** Whether the client may still change the booking online. */
export function canChangeOnline(s: DemoState, b: Booking, now: number) {
  if (b.status !== "confirmed") return false;
  const startsIn = zonedToUtc(b.date, b.start, s.salon.timeZone) - now;
  return startsIn > 0 && startsIn >= s.rules.cancelHours * 3_600_000;
}

/** Why online changes are closed for a booking. */
function changesClosed(s: DemoState, b: Booking, now: number, what: "changes" | "cancellation") {
  if (zonedToUtc(b.date, b.start, s.salon.timeZone) <= now) return "This appointment has already started. Please call the salon.";
  return `Online ${what} close${what === "changes" ? "" : "s"} ${s.rules.cancelHours} hours before the appointment. Please call the salon.`;
}

export function moveBooking(s: DemoState, id: string, to: { date: ISODate; start: number; staffId: string }, now: number, online: boolean): Result<Booking> {
  const b = s.bookings.find((x) => x.id === id);
  if (!b) return { ok: false, error: "Booking not found." };
  if (b.status !== "confirmed") return { ok: false, error: "Only upcoming bookings can be moved." };
  if (online && !canChangeOnline(s, b, now)) return { ok: false, error: changesClosed(s, b, now, "changes") };
  const when = checkWhen(to.date, to.start);
  if (when) return { ok: false, error: when };
  // The salon can fix a time earlier today, but not move an appointment to a past day.
  if (!online && to.date < zonedNow(s.salon.timeZone, now).date) return { ok: false, error: "That day has already passed." };
  let staffId = to.staffId;
  const q = { serviceId: b.serviceId, addOnIds: b.addOnIds, date: to.date, now, ignoreBookingId: b.id, enforceRules: online };
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
  const from = b.date;
  const changed = b.date !== to.date || b.start !== to.start || b.staffId !== staffId;
  Object.assign(b, { date: to.date, start: to.start, end: to.start + length, staffId });
  if (changed) {
    queueMessage(s, bookingMessage(s, b, "rescheduled", now));
    notifyWaitlist(s, from, now);
  }
  return { ok: true, value: b };
}

export function cancelBooking(s: DemoState, id: string, now: number, online: boolean): Result<Booking> {
  const b = s.bookings.find((x) => x.id === id);
  if (!b) return { ok: false, error: "Booking not found." };
  if (b.status !== "confirmed") return { ok: false, error: "This booking is no longer active." };
  if (online && !canChangeOnline(s, b, now)) return { ok: false, error: changesClosed(s, b, now, "cancellation") };
  b.status = "cancelled";
  queueMessage(s, bookingMessage(s, b, "cancelled", now));
  notifyWaitlist(s, b.date, now);
  return { ok: true, value: b };
}

/** Cancels this appointment and the later ones of its series. Returns how many were cancelled. */
export function cancelSeries(s: DemoState, id: string, now: number): Result<number> {
  const b = s.bookings.find((x) => x.id === id);
  if (!b?.seriesId) return { ok: false, error: "This appointment isn't part of a series." };
  const later = s.bookings.filter((x) => x.seriesId === b.seriesId && x.status === "confirmed" && (x.date > b.date || (x.date === b.date && x.start >= b.start)));
  for (const x of later) cancelBooking(s, x.id, now, false);
  return { ok: true, value: later.length };
}

// ── Waitlist ────────────────────────────────────────────────────────────────

export interface WaitlistInput {
  serviceId: string;
  addOnIds?: string[];
  staffId: string;
  date: ISODate;
  part: DayPart;
  client: ClientInput;
}

const PARTS: DayPart[] = ["any", "morning", "afternoon", "evening"];

/** Puts a client on the waitlist for a day that's full. One entry per client, day and service. */
export function joinWaitlist(s: DemoState, input: WaitlistInput, now: number): Result<WaitlistEntry> {
  const visit = visitFor(s, input.serviceId, input.addOnIds);
  if (!visit || !visit.active) return { ok: false, error: "That service is no longer available." };
  if (!isRealDate(input.date)) return { ok: false, error: "Choose a valid date." };
  if (!PARTS.includes(input.part)) return { ok: false, error: "Choose a time of day." };
  if (input.staffId !== "any" && !visit.staffIds.includes(input.staffId)) return { ok: false, error: "Choose someone who does this service." };
  const { date: today } = zonedNow(s.salon.timeZone, now);
  if (input.date < today) return { ok: false, error: "That day has already passed." };
  if (input.date > addDays(today, s.rules.maxDaysAhead)) return { ok: false, error: "That date is too far ahead to book online." };
  const first = Object.values(validateClient(input.client))[0];
  if (first) return { ok: false, error: first };
  const client = upsertClient(s, input.client, now, true);
  const same = s.waitlist.find((e) => e.status === "waiting" && e.clientId === client.id && e.date === input.date && e.serviceId === input.serviceId);
  if (same) return { ok: false, error: "You're already on the waitlist for that day." };
  const n = s.waitlist.reduce((m, e) => Math.max(m, Number(e.id.slice(1)) || 0), 0) + 1;
  const entry: WaitlistEntry = {
    id: `w${n}`,
    clientId: client.id,
    serviceId: input.serviceId,
    ...(input.addOnIds?.length ? { addOnIds: input.addOnIds } : {}),
    staffId: input.staffId,
    date: input.date,
    part: input.part,
    status: "waiting",
    createdAt: new Date(now).toISOString(),
  };
  s.waitlist.push(entry);
  queueMessage(s, waitlistJoinedMessage(s, entry, now));
  return { ok: true, value: entry };
}

/** Free start times that suit a waitlist entry, still ahead of now. */
export function waitlistOpenings(s: DemoState, e: WaitlistEntry, now: number) {
  if (e.status !== "waiting") return [];
  return getSlots(s, { serviceId: e.serviceId, addOnIds: e.addOnIds, staffId: e.staffId, date: e.date, now, enforceRules: false }).filter(
    (slot) => inPart(slot.start, e.part) && zonedToUtc(e.date, slot.start, s.salon.timeZone) > now,
  );
}

/** Texts everyone waiting for a day when a time that suits them opens up, at most once an hour each. */
export function notifyWaitlist(s: DemoState, date: ISODate, now: number) {
  for (const e of s.waitlist) {
    if (e.status !== "waiting" || e.date !== date) continue;
    if (e.notifiedAt && now - Date.parse(e.notifiedAt) < 3_600_000) continue;
    const open = waitlistOpenings(s, e, now);
    if (!open.length) continue;
    e.notifiedAt = new Date(now).toISOString();
    queueMessage(s, slotOpenMessage(s, e, open.map((x) => x.start), now));
  }
}

/** The salon books a waitlisted client into an open time. */
export function bookFromWaitlist(s: DemoState, entryId: string, start: number, staffId: string, now: number): Result<Booking> {
  const e = s.waitlist.find((x) => x.id === entryId);
  if (!e || e.status !== "waiting") return { ok: false, error: "That waitlist entry is no longer open." };
  const r = createBooking(s, { serviceId: e.serviceId, addOnIds: e.addOnIds, staffId, date: e.date, start, client: { id: e.clientId }, notes: "From the waitlist", source: "waitlist", online: false }, now);
  if (r.ok) Object.assign(e, { status: "booked", bookingId: r.value.id });
  return r;
}

export function removeFromWaitlist(s: DemoState, entryId: string) {
  const e = s.waitlist.find((x) => x.id === entryId);
  if (e && e.status === "waiting") e.status = "removed";
}

// ── Repeating appointments ──────────────────────────────────────────────────

export interface SeriesPlanItem {
  date: ISODate;
  /** The requested time, or the nearest free one that day with the same person. */
  start: number;
  status: "ok" | "moved" | "skipped";
  reason?: string;
}

/** Every `weeks` weeks after the first appointment, `count` appointments in all (the first included). */
export function planSeries(s: DemoState, first: { serviceId: string; addOnIds?: string[]; staffId: string; date: ISODate; start: number }, weeks: number, count: number, now: number): SeriesPlanItem[] {
  const out: SeriesPlanItem[] = [];
  for (let i = 1; i < count; i++) {
    const date = addDays(first.date, i * weeks * 7);
    const q = { serviceId: first.serviceId, addOnIds: first.addOnIds, staffId: first.staffId, date, now, enforceRules: false };
    const reason = checkSlot(s, { ...q, start: first.start });
    if (!reason) {
      out.push({ date, start: first.start, status: "ok" });
      continue;
    }
    const near = getSlots(s, q)
      .map((x) => x.start)
      .sort((a, b) => Math.abs(a - first.start) - Math.abs(b - first.start) || a - b)[0];
    if (near != null) out.push({ date, start: near, status: "moved", reason: reasonText(s, reason, first.staffId) });
    else out.push({ date, start: first.start, status: "skipped", reason: reasonText(s, reason, first.staffId) });
  }
  return out;
}

export const SERIES_WEEKS = [2, 3, 4, 5, 6, 8] as const;

/**
 * Books a repeating series: the first appointment as asked, then every planned date that
 * still fits (re-checked here). One email lists them all.
 */
export function createSeries(s: DemoState, input: NewBooking, weeks: number, count: number, now: number): Result<{ booked: Booking[]; skipped: ISODate[] }> {
  if (!SERIES_WEEKS.includes(weeks as (typeof SERIES_WEEKS)[number])) return { ok: false, error: "Choose how often it repeats." };
  if (!Number.isInteger(count) || count < 2 || count > 12) return { ok: false, error: "A series has 2 to 12 appointments." };
  const seriesId = `sr-${now.toString(36)}`;
  const first = createBooking(s, { ...input, seriesId, notify: false }, now);
  if (!first.ok) return first;
  const booked = [first.value];
  const skipped: ISODate[] = [];
  for (const item of planSeries(s, { ...input, staffId: first.value.staffId }, weeks, count, now)) {
    const r = item.status === "skipped" ? null : createBooking(s, { ...input, staffId: first.value.staffId, client: { id: first.value.clientId }, date: item.date, start: item.start, seriesId, notify: false }, now);
    if (r?.ok) booked.push(r.value);
    else skipped.push(item.date);
  }
  queueMessage(s, seriesMessage(s, booked, skipped.map((d) => formatDay(d)), now));
  return { ok: true, value: { booked, skipped } };
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
