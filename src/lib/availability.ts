import { addDays, diffDays, weekday, zonedNow, zonedToUtc } from "./dates";
import type { Booking, DayPart, DemoState, ISODate, Interval, Service, Staff } from "./types";

/**
 * Availability engine. A start time is bookable for a staff member when:
 * - they offer the service and work that day (no full-day time off),
 * - the appointment fits inside their hours and misses their breaks and part-day time off,
 * - the appointment plus its clean-up buffer misses every live booking plus that booking's buffer,
 * - and, for online booking, it is at least `minNotice` minutes away (measured in real time, so a
 *   one-day notice also holds tomorrow morning) and within `maxDaysAhead` days.
 * Start times sit on a `slotStep` grid counted from the start of the staff member's day; online
 * bookings must use one of them.
 * A booking being rescheduled keeps its own length, even if the service's duration has changed since.
 */

export type Schedule = Pick<DemoState, "salon" | "rules" | "services" | "staff" | "timeOff" | "bookings">;

export type Reason = "unknown" | "not-offered" | "day-off" | "time-off" | "outside-hours" | "break" | "overlap" | "past" | "too-soon" | "too-far" | "off-grid";

export const REASON_TEXT: Record<Reason, string> = {
  unknown: "That service or staff member no longer exists.",
  "not-offered": "doesn't offer this service.",
  "day-off": "isn't working that day.",
  "time-off": "is off at that time.",
  "outside-hours": "isn't working at that time.",
  break: "is on a break at that time.",
  overlap: "already has an appointment then.",
  past: "That time has already passed.",
  "too-soon": "That time is too soon to book online.",
  "too-far": "That date is too far ahead to book online.",
  "off-grid": "That isn't one of the bookable start times.",
};

export interface SlotQuery {
  serviceId: string;
  /** Services added to the same visit, done right after the main one. */
  addOnIds?: string[];
  date: ISODate;
  /** A staff id, or "any" for the first available person. */
  staffId: string;
  now: number;
  /** A booking being rescheduled, which shouldn't block its own new time. */
  ignoreBookingId?: string;
  /** Online booking rules (notice, booking horizon). Off for the salon's own calendar. */
  enforceRules?: boolean;
}

export interface Slot {
  start: number;
  /** Everyone free at this time, in staff order. */
  staffIds: string[];
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * One visit: a main service and any add-ons done right after it by the same person. It takes
 * the sum of their durations and prices, the clean-up buffer of the last one, and only the
 * staff who offer all of them.
 */
export interface Visit {
  serviceIds: string[];
  name: string;
  duration: number;
  buffer: number;
  price: number;
  staffIds: string[];
  active: boolean;
}

export function visitFor(s: Pick<Schedule, "services">, serviceId: string, addOnIds: string[] = []): Visit | null {
  const ids = [serviceId, ...addOnIds.filter((id) => id !== serviceId)];
  const list = ids.map((id) => s.services.find((x) => x.id === id));
  if (list.some((x) => !x)) return null;
  const services = list as Service[];
  return {
    serviceIds: ids,
    name: services.map((x) => x.name).join(" + "),
    duration: services.reduce((n, x) => n + x.duration, 0),
    buffer: services[services.length - 1].buffer,
    price: services.reduce((n, x) => n + x.price, 0),
    staffIds: services[0].staffIds.filter((id) => services.every((x) => x.staffIds.includes(id))),
    active: services.every((x) => x.active),
  };
}

/** The services of a booking, main one first. */
export const bookingServiceIds = (b: Pick<Booking, "serviceId" | "addOnIds">) => [b.serviceId, ...(b.addOnIds ?? [])];

/** "Full color + Cut & finish" */
export function bookingTitle(s: Pick<Schedule, "services">, b: Pick<Booking, "serviceId" | "addOnIds">) {
  return bookingServiceIds(b)
    .map((id) => s.services.find((x) => x.id === id)?.name ?? "Removed service")
    .join(" + ");
}

/** Clean-up time after a booking: the buffer of its last service. */
function bufferOf(s: Pick<Schedule, "services">, b: Booking) {
  const ids = bookingServiceIds(b);
  return s.services.find((x) => x.id === ids[ids.length - 1])?.buffer ?? 0;
}

/** Morning ends at noon and the evening starts at 5 PM. */
export function inPart(start: number, part: DayPart) {
  if (part === "morning") return start < 720;
  if (part === "afternoon") return start >= 720 && start < 1020;
  if (part === "evening") return start >= 1020;
  return true;
}

/** Bookings that still hold time on the calendar. */
export const isLive = (b: Booking) => b.status === "confirmed" || b.status === "completed";

/** The salon's today, the current minute and the last date clients can book online. */
export function bookingWindow(s: Pick<Schedule, "salon" | "rules">, now: number) {
  const { date: today, minutes } = zonedNow(s.salon.timeZone, now);
  return { today, nowMinutes: minutes, lastDate: addDays(today, s.rules.maxDaysAhead) };
}

interface Day {
  hours: Interval;
  /** Breaks and part-day time off. */
  away: { at: Interval; reason: Reason }[];
  /** Live bookings with their buffers. */
  booked: Interval[];
}

/** Everything that shapes one person's day, or the reason they aren't working at all. */
function staffDay(s: Schedule, staff: Staff, date: ISODate, ignoreBookingId?: string): Day | Reason {
  const hours = staff.hours[weekday(date)];
  if (!hours) return "day-off";
  const away: Day["away"] = hours.breaks.map((b) => ({ at: b, reason: "break" as const }));
  for (const t of s.timeOff) {
    if (t.staffId !== staff.id || date < t.from || date > t.to) continue;
    if (t.start == null || t.end == null) return "time-off";
    away.push({ at: { start: t.start, end: t.end }, reason: "time-off" });
  }
  const booked = s.bookings
    .filter((b) => b.staffId === staff.id && b.date === date && isLive(b) && b.id !== ignoreBookingId)
    .map((b) => ({ start: b.start, end: b.end + bufferOf(s, b) }));
  return { hours, away, booked };
}

/** Minutes the appointment takes: a rescheduled booking keeps its own length. */
function lengthFor(s: Schedule, q: Pick<SlotQuery, "ignoreBookingId">, service: Visit): number {
  const moving = q.ignoreBookingId ? s.bookings.find((b) => b.id === q.ignoreBookingId) : undefined;
  return moving ? moving.end - moving.start : service.duration;
}

/** Why a start time doesn't work for this person, or null when it does. Ignores the online rules. */
function fit(day: Day, service: Visit, start: number, length: number): Reason | null {
  const visit = { start, end: start + length };
  if (visit.start < day.hours.start || visit.end > day.hours.end) return "outside-hours";
  const clash = day.away.find((a) => overlaps(visit, a.at));
  if (clash) return clash.reason;
  const held = { start, end: visit.end + service.buffer };
  if (day.booked.some((b) => overlaps(held, b))) return "overlap";
  return null;
}

function timing(s: Schedule, q: SlotQuery, start: number): Reason | null {
  if (q.enforceRules === false) return null;
  const w = bookingWindow(s, q.now);
  if (q.date < w.today) return "past";
  if (q.date > w.lastDate) return "too-far";
  // The notice is real time, so it can reach into the next days; later days need no check.
  if (diffDays(q.date, w.today) > Math.ceil(s.rules.minNotice / 1440)) return null;
  const at = zonedToUtc(q.date, start, s.salon.timeZone);
  if (at < q.now) return "past";
  if (at < q.now + s.rules.minNotice * 60_000) return "too-soon";
  return null;
}

/** Checks one exact start time for one staff member. Returns null when it can be booked. */
export function checkSlot(s: Schedule, q: SlotQuery & { start: number }): Reason | null {
  const service = visitFor(s, q.serviceId, q.addOnIds);
  const staff = s.staff.find((x) => x.id === q.staffId);
  if (!service || !staff) return "unknown";
  if (!service.staffIds.includes(staff.id)) return "not-offered";
  const t = timing(s, q, q.start);
  if (t) return t;
  const day = staffDay(s, staff, q.date, q.ignoreBookingId);
  if (typeof day === "string") return day;
  const reason = fit(day, service, q.start, lengthFor(s, q, service));
  if (reason) return reason;
  // Online, only the start times the booking page offers can be booked.
  if (q.enforceRules !== false && (q.start - day.hours.start) % s.rules.slotStep !== 0) return "off-grid";
  return null;
}

/** Staff who can do a service (and its add-ons), in display order. */
export function staffFor(s: Schedule, serviceId: string, addOnIds?: string[]): Staff[] {
  const visit = visitFor(s, serviceId, addOnIds);
  return visit ? s.staff.filter((p) => visit.staffIds.includes(p.id)) : [];
}

function startsFor(s: Schedule, q: SlotQuery, service: Visit, staff: Staff): number[] {
  const day = staffDay(s, staff, q.date, q.ignoreBookingId);
  if (typeof day === "string") return [];
  const length = lengthFor(s, q, service);
  const out: number[] = [];
  for (let t = day.hours.start; t + length <= day.hours.end; t += s.rules.slotStep) {
    if (!timing(s, q, t) && !fit(day, service, t, length)) out.push(t);
  }
  return out;
}

/** Bookable start times for a service on a date, for one person or merged across everyone ("any"). */
export function getSlots(s: Schedule, q: SlotQuery): Slot[] {
  const service = visitFor(s, q.serviceId, q.addOnIds);
  if (!service || !service.active) return [];
  const everyone = staffFor(s, q.serviceId, q.addOnIds);
  const team = q.staffId === "any" ? everyone : everyone.filter((p) => p.id === q.staffId);
  const byStart = new Map<number, string[]>();
  for (const person of team) {
    for (const t of startsFor(s, q, service, person)) {
      const list = byStart.get(t);
      if (list) list.push(person.id);
      else byStart.set(t, [person.id]);
    }
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, staffIds]) => ({ start, staffIds }));
}

/** Number of bookable times per date from `from` for `days` days, for the date picker. */
export function slotCounts(s: Schedule, q: Omit<SlotQuery, "date">, from: ISODate, days: number): Record<ISODate, number> {
  const out: Record<ISODate, number> = {};
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    out[date] = getSlots(s, { ...q, date }).length;
  }
  return out;
}

/** The earliest bookable time within the online booking horizon. */
export function nextAvailable(s: Schedule, q: Omit<SlotQuery, "date">): { date: ISODate; slot: Slot } | null {
  const w = bookingWindow(s, q.now);
  const days = diffDays(w.lastDate, w.today);
  for (let i = 0; i <= days; i++) {
    const date = addDays(w.today, i);
    const slots = getSlots(s, { ...q, date });
    if (slots.length) return { date, slot: slots[0] };
  }
  return null;
}

/**
 * Picks who takes an "any available" booking: the free person with the fewest
 * booked minutes that day, so work spreads evenly; ties go to staff order.
 */
export function assignStaff(s: Schedule, date: ISODate, staffIds: string[]): string | null {
  if (!staffIds.length) return null;
  const load = (id: string) => s.bookings.filter((b) => b.staffId === id && b.date === date && isLive(b)).reduce((n, b) => n + b.end - b.start, 0);
  return staffIds.reduce((best, id) => (load(id) < load(best) ? id : best));
}

/** Minutes a person works on a date (hours minus breaks and time off), for utilisation. */
export function workingMinutes(s: Schedule, staff: Staff, date: ISODate): number {
  const day = staffDay(s, staff, date);
  if (typeof day === "string") return 0;
  return day.hours.end - day.hours.start - day.away.reduce((n, a) => n + Math.max(0, Math.min(a.at.end, day.hours.end) - Math.max(a.at.start, day.hours.start)), 0);
}

/** Why a person isn't working a date, or null when they are. For greying out calendar columns. */
export function offReason(s: Schedule, staff: Staff, date: ISODate): Reason | null {
  const day = staffDay(s, staff, date);
  return typeof day === "string" ? day : null;
}
