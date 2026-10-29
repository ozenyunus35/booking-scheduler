import type { ISODate } from "./types";

/** Salon dates are plain "YYYY-MM-DD" strings; arithmetic runs on UTC midnights so DST never shifts a day. */

const toUtc = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: ISODate, n: number): ISODate => fromUtc(toUtc(d) + n * 86_400_000);

export const diffDays = (a: ISODate, b: ISODate) => Math.round((toUtc(a) - toUtc(b)) / 86_400_000);

/** 0 = Monday … 6 = Sunday. */
export const weekday = (d: ISODate) => (new Date(toUtc(d)).getUTCDay() + 6) % 7;

export const startOfWeek = (d: ISODate) => addDays(d, -weekday(d));

const partsCache = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, timeZone: string) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    partsCache.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** The salon's local date and minute of the day at an instant. */
export function zonedNow(timeZone: string, ms = Date.now()): { date: ISODate; minutes: number } {
  const p = parts(ms, timeZone);
  return { date: `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`, minutes: p.h * 60 + p.mi };
}

/** Offset of the zone from UTC at an instant, in milliseconds. */
function offset(ms: number, timeZone: string) {
  const p = parts(ms, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** The instant of a salon wall-clock time. Times skipped by a DST jump resolve to the later offset. */
export function zonedToUtc(date: ISODate, minutes: number, timeZone: string): number {
  const wall = toUtc(date) + minutes * 60_000;
  let ms = wall - offset(wall, timeZone);
  const second = offset(ms, timeZone);
  if (wall - second !== ms) ms = wall - second;
  return ms;
}

/** "9:30 AM" */
export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "9 AM" on the hour, for calendar gutters. */
export const formatHour = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

/** "09:30", the value of an <input type="time">. */
export const toTimeInput = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const parseTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

const fmt = (d: ISODate, o: Intl.DateTimeFormatOptions) => new Date(toUtc(d)).toLocaleDateString("en-US", { timeZone: "UTC", ...o });

/** "Thu, Oct 30" */
export const formatDay = (d: ISODate) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
/** "Thursday, October 30" */
export const formatDayLong = (d: ISODate) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
/** "Oct 30, 2026" */
export const formatDate = (d: ISODate) => fmt(d, { day: "numeric", month: "short", year: "numeric" });
export const weekdayShort = (d: ISODate) => fmt(d, { weekday: "short" });
export const monthLong = (d: ISODate) => fmt(d, { month: "long", year: "numeric" });

/** "Today", "Tomorrow" or "Thu, Oct 30". */
export function relativeDay(d: ISODate, today: ISODate) {
  const n = diffDays(d, today);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return formatDay(d);
}

export const formatDuration = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
};
