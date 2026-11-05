import { bookingTitle, isLive } from "./availability";
import { formatDayLong, formatTime, zoneAbbr, zonedToUtc } from "./dates";
import { firstName, money } from "./format";
import type { Booking, DemoState, Message, WaitlistEntry } from "./types";

/**
 * The emails and texts the salon would send. Nothing leaves the browser: the API functions
 * add them to `state.outbox`, and reminders are worked out from upcoming bookings, so the
 * admin's Messages page shows exactly what a client would get and when.
 */

/** The outbox keeps the latest messages only, like a log. */
export const MAX_OUTBOX = 300;
/** Reminders go out by text this long before the appointment. */
export const REMINDER_HOURS = 24;

export function queueMessage(s: DemoState, m: Omit<Message, "id">) {
  const n = s.outbox.reduce((max, x) => Math.max(max, Number(x.id.slice(1)) || 0), 0) + 1;
  s.outbox.push({ id: `m${n}`, ...m });
  if (s.outbox.length > MAX_OUTBOX) s.outbox.splice(0, s.outbox.length - MAX_OUTBOX);
}

const when = (s: DemoState, b: Pick<Booking, "date" | "start">) =>
  `${formatDayLong(b.date)} at ${formatTime(b.start)} ${zoneAbbr(s.salon.timeZone, zonedToUtc(b.date, b.start, s.salon.timeZone))}`;

function names(s: DemoState, b: Booking) {
  const client = s.clients.find((c) => c.id === b.clientId);
  const staff = s.staff.find((p) => p.id === b.staffId);
  return { hi: `Hi ${client ? firstName(client.name) : "there"},`, staff: staff ? firstName(staff.name) : "the team", title: bookingTitle(s, b) };
}

export type BookingMessageKind = "confirmation" | "rescheduled" | "cancelled";

export function bookingMessage(s: DemoState, b: Booking, kind: BookingMessageKind, now: number): Omit<Message, "id"> {
  const { hi, staff, title } = names(s, b);
  const change = s.rules.cancelHours ? `You can change or cancel online until ${s.rules.cancelHours} hours before, from your booking link.` : "You can change or cancel online from your booking link.";
  const common = { at: new Date(now).toISOString(), channel: "email" as const, clientId: b.clientId, bookingId: b.id };
  if (kind === "confirmation") {
    return {
      ...common,
      kind,
      subject: `Booked: ${title}, ${when(s, b)}`,
      body: [hi, `You're booked for ${title} with ${staff} on ${when(s, b)}.`, `Reference ${b.ref} · ${money(b.price)}, paid at the salon.`, change, s.salon.name + ", " + s.salon.address].join("\n\n"),
    };
  }
  if (kind === "rescheduled") {
    return { ...common, kind, subject: `New time: ${title}, ${when(s, b)}`, body: [hi, `Your ${title} with ${staff} is now on ${when(s, b)}.`, `Reference ${b.ref}.`, change].join("\n\n") };
  }
  return { ...common, kind, subject: `Cancelled: ${title}, ${when(s, b)}`, body: [hi, `Your ${title} on ${when(s, b)} is cancelled.`, `Reference ${b.ref}. Book again any time on our booking page.`].join("\n\n") };
}

/** One email for a repeating series, listing every date that was booked and any that weren't. */
export function seriesMessage(s: DemoState, booked: Booking[], skipped: string[], now: number): Omit<Message, "id"> {
  const first = booked[0];
  const { hi, staff, title } = names(s, first);
  const lines = booked.map((b) => `• ${when(s, b)}`);
  const skippedText = skipped.length ? `\n\nWe couldn't fit ${skipped.join(", ")}; we'll call you about those.` : "";
  return {
    at: new Date(now).toISOString(),
    channel: "email",
    kind: "series",
    clientId: first.clientId,
    bookingId: first.id,
    subject: `${booked.length} appointments booked: ${title}`,
    body: `${hi}\n\nYour repeat appointments for ${title} with ${staff}:\n\n${lines.join("\n")}${skippedText}`,
  };
}

export function waitlistJoinedMessage(s: DemoState, e: WaitlistEntry, now: number): Omit<Message, "id"> {
  const client = s.clients.find((c) => c.id === e.clientId);
  const title = bookingTitle(s, e);
  return {
    at: new Date(now).toISOString(),
    channel: "email",
    kind: "waitlist-joined",
    clientId: e.clientId,
    subject: `You're on the waitlist: ${title}, ${formatDayLong(e.date)}`,
    body: [`Hi ${client ? firstName(client.name) : "there"},`, `You're on the waitlist for ${title} on ${formatDayLong(e.date)}${e.part === "any" ? "" : `, ${e.part}`}.`, `If a time opens up, we'll text you straight away.`].join("\n\n"),
  };
}

export function slotOpenMessage(s: DemoState, e: WaitlistEntry, starts: number[], now: number): Omit<Message, "id"> {
  const client = s.clients.find((c) => c.id === e.clientId);
  const times = starts.slice(0, 3).map(formatTime).join(", ");
  return {
    at: new Date(now).toISOString(),
    channel: "sms",
    kind: "slot-open",
    clientId: e.clientId,
    subject: "A time opened up",
    body: `${s.salon.name}: hi ${client ? firstName(client.name) : "there"}, ${bookingTitle(s, e)} is free on ${formatDayLong(e.date)} at ${times}. Call ${s.salon.phone} to take it.`,
  };
}

export interface ScheduledReminder {
  sendAt: number;
  booking: Booking;
  body: string;
}

/** Reminder texts due in the next `hours`, soonest first. */
export function upcomingReminders(s: DemoState, now: number, hours = 48): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  for (const b of s.bookings) {
    if (b.status !== "confirmed" || !isLive(b)) continue;
    const at = zonedToUtc(b.date, b.start, s.salon.timeZone);
    const sendAt = at - REMINDER_HOURS * 3_600_000;
    if (sendAt < now || sendAt > now + hours * 3_600_000) continue;
    const { staff, title } = names(s, b);
    out.push({ sendAt, booking: b, body: `${s.salon.name}: reminder of your ${title} with ${staff} tomorrow at ${formatTime(b.start)}. Need to change it? Use your booking link.` });
  }
  return out.sort((a, b) => a.sendAt - b.sendAt);
}
