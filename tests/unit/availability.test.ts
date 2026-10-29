import { describe, expect, it } from "vitest";
import { assignStaff, checkSlot, getSlots, nextAvailable, slotCounts, workingMinutes, type Schedule } from "@/lib/availability";
import { zonedToUtc } from "@/lib/dates";
import type { Booking, DayHours } from "@/lib/types";

// 2026-11-02 is a Monday. "Now" is the Friday before, 09:00 in London.
const MON = "2026-11-02";
const TUE = "2026-11-03";
const SUN = "2026-11-08";
const TZ = "Europe/London";
const at = (date: string, minutes: number) => zonedToUtc(date, minutes, TZ);
const NOW = at("2026-10-30", 540);

const day = (start: number, end: number, breaks: DayHours["breaks"] = []): DayHours => ({ start, end, breaks });
const weekdays = (d: DayHours) => [d, d, d, d, d, d, null];

function schedule(): Schedule {
  return {
    salon: { name: "Test", timeZone: TZ, address: "", phone: "", currency: "USD" },
    rules: { slotStep: 15, minNotice: 120, maxDaysAhead: 30, cancelHours: 24 },
    services: [
      { id: "cut", name: "Cut", category: "Cuts", description: "", duration: 45, buffer: 15, price: 50, staffIds: ["ana", "ben"], active: true },
      { id: "trim", name: "Trim", category: "Cuts", description: "", duration: 30, buffer: 0, price: 25, staffIds: ["ana", "ben"], active: true },
      { id: "colour", name: "Color", category: "Color", description: "", duration: 120, buffer: 0, price: 120, staffIds: ["ana"], active: true },
      { id: "old", name: "Retired", category: "Cuts", description: "", duration: 30, buffer: 0, price: 10, staffIds: ["ana"], active: false },
    ],
    staff: [
      { id: "ana", name: "Ana", role: "", bio: "", hue: 0, hours: weekdays(day(540, 720)) },
      { id: "ben", name: "Ben", role: "", bio: "", hue: 0, hours: weekdays(day(600, 720)) },
    ],
    timeOff: [],
    bookings: [],
  };
}

let n = 0;
function booking(p: Partial<Booking> & Pick<Booking, "staffId" | "date" | "start" | "end">): Booking {
  return { id: `b${++n}`, ref: "", token: "", serviceId: "trim", clientId: "c", status: "confirmed", price: 0, source: "online", anyStaff: false, notes: "", createdAt: "", ...p };
}

const starts = (s: Schedule, q: Partial<Parameters<typeof getSlots>[1]> = {}) => getSlots(s, { serviceId: "trim", date: MON, staffId: "ana", now: NOW, ...q }).map((x) => x.start);

describe("getSlots", () => {
  it("steps through the working day and keeps the whole visit inside it", () => {
    // 09:00–12:00, 30 min trim: last start 11:30.
    const t = starts(schedule());
    expect(t[0]).toBe(540);
    expect(t.at(-1)).toBe(690);
    expect(t).toHaveLength(11);
  });

  it("follows the slot step", () => {
    const s = schedule();
    s.rules.slotStep = 30;
    expect(starts(s)).toEqual([540, 570, 600, 630, 660, 690]);
  });

  it("returns nothing on a day off", () => {
    expect(starts(schedule(), { date: SUN })).toEqual([]);
  });

  it("keeps appointments out of breaks", () => {
    const s = schedule();
    s.staff[0].hours = weekdays(day(540, 720, [{ start: 600, end: 630 }]));
    const t = starts(s);
    // 09:30 would run into the 10:00 break; 10:00 and 10:15 start inside it.
    expect(t).toContain(570);
    expect(t).not.toContain(585);
    expect(t).not.toContain(600);
    expect(t).not.toContain(615);
    expect(t).toContain(630);
  });

  it("blocks existing bookings and the buffer after them", () => {
    const s = schedule();
    // A cut 10:00–10:45 holds the chair until 11:00 (15 min buffer).
    s.bookings.push(booking({ staffId: "ana", date: MON, start: 600, end: 645, serviceId: "cut" }));
    const t = starts(s);
    expect(t).toContain(570); // 09:30–10:00 ends exactly as the cut starts
    expect(t).not.toContain(585);
    expect(t).not.toContain(645);
    expect(t).toContain(660);
  });

  it("leaves room for the new service's own buffer before the next booking", () => {
    const s = schedule();
    s.bookings.push(booking({ staffId: "ana", date: MON, start: 660, end: 690 }));
    const cut = starts(s, { serviceId: "cut" });
    // Cut 45 + 15 buffer = 60 min held: 10:00 is the latest start before 11:00.
    expect(cut).toContain(600);
    expect(cut).not.toContain(615);
  });

  it("ignores cancelled and no-show bookings", () => {
    const s = schedule();
    s.bookings.push(booking({ staffId: "ana", date: MON, start: 600, end: 630, status: "cancelled" }));
    s.bookings.push(booking({ staffId: "ana", date: MON, start: 630, end: 660, status: "no-show" }));
    expect(starts(s)).toContain(600);
    expect(starts(s)).toContain(630);
  });

  it("frees a booking's own time when rescheduling it", () => {
    const s = schedule();
    const b = booking({ staffId: "ana", date: MON, start: 600, end: 630 });
    s.bookings.push(b);
    expect(starts(s)).not.toContain(600);
    expect(starts(s, { ignoreBookingId: b.id })).toContain(600);
  });

  it("handles whole-day and multi-day time off", () => {
    const s = schedule();
    s.timeOff.push({ id: "t", staffId: "ana", from: MON, to: TUE, reason: "Holiday" });
    expect(starts(s)).toEqual([]);
    expect(starts(s, { date: TUE })).toEqual([]);
    expect(starts(s, { date: "2026-11-04" }).length).toBeGreaterThan(0);
  });

  it("handles part-day time off", () => {
    const s = schedule();
    s.timeOff.push({ id: "t", staffId: "ana", from: MON, to: MON, start: 540, end: 660, reason: "Course" });
    expect(starts(s)).toEqual([660, 675, 690]);
  });

  it("only offers staff who do the service, and no inactive services", () => {
    expect(starts(schedule(), { serviceId: "colour", staffId: "ben" })).toEqual([]);
    expect(starts(schedule(), { serviceId: "old" })).toEqual([]);
    expect(starts(schedule(), { serviceId: "missing" })).toEqual([]);
  });

  it("merges everyone for any available and lists who is free", () => {
    const s = schedule();
    s.bookings.push(booking({ staffId: "ben", date: MON, start: 600, end: 630 }));
    const slots = getSlots(s, { serviceId: "trim", date: MON, staffId: "any", now: NOW });
    expect(slots[0]).toEqual({ start: 540, staffIds: ["ana"] }); // Ben starts at 10:00
    expect(slots.find((x) => x.start === 600)?.staffIds).toEqual(["ana"]);
    expect(slots.find((x) => x.start === 630)?.staffIds).toEqual(["ana", "ben"]);
  });

  it("is sorted by start time when merging", () => {
    const slots = getSlots(schedule(), { serviceId: "trim", date: MON, staffId: "any", now: NOW });
    expect(slots.map((x) => x.start)).toEqual([...slots.map((x) => x.start)].sort((a, b) => a - b));
  });
});

describe("online booking rules", () => {
  it("needs the minimum notice today", () => {
    const s = schedule();
    s.rules.minNotice = 60;
    // Monday 09:40: earliest online start is 10:40, so 10:45 on the grid.
    expect(starts(s, { now: at(MON, 580) })).toEqual([645, 660, 675, 690]);
    // With two hours' notice the 11:40 limit leaves no 30 min slot before 12:00.
    s.rules.minNotice = 120;
    expect(starts(s, { now: at(MON, 580) })).toEqual([]);
  });

  it("lets the salon book inside the notice period", () => {
    const t = starts(schedule(), { now: at(MON, 580), enforceRules: false });
    expect(t[0]).toBe(540);
  });

  it("returns nothing for past dates and beyond the horizon", () => {
    const s = schedule();
    expect(starts(s, { date: "2026-10-26" })).toEqual([]);
    s.rules.maxDaysAhead = 2;
    expect(starts(s, { date: MON })).toEqual([]); // 3 days after Friday
    expect(starts(s, { date: "2026-11-01" })).toEqual([]); // Sunday: in range, day off
    expect(starts(s, { date: "2026-10-31" }).length).toBeGreaterThan(0); // Saturday: in range
  });

  it("uses the salon's date, not UTC, to decide what today is", () => {
    const s = schedule();
    s.salon.timeZone = "America/New_York";
    // 02:00 UTC on Tuesday is still Monday 21:00 in New York.
    const now = Date.UTC(2026, 10, 3, 2, 0);
    expect(getSlots(s, { serviceId: "trim", date: MON, staffId: "ana", now })).toEqual([]);
    expect(getSlots(s, { serviceId: "trim", date: TUE, staffId: "ana", now }).length).toBe(11);
  });
});

describe("checkSlot", () => {
  const q = { serviceId: "trim", date: MON, staffId: "ana", now: NOW };

  it("explains why a time can't be booked", () => {
    const s = schedule();
    s.staff[0].hours = weekdays(day(540, 720, [{ start: 600, end: 630 }]));
    s.bookings.push(booking({ staffId: "ana", date: MON, start: 660, end: 690 }));
    expect(checkSlot(s, { ...q, start: 540 })).toBeNull();
    expect(checkSlot(s, { ...q, start: 500 })).toBe("outside-hours");
    expect(checkSlot(s, { ...q, start: 700 })).toBe("outside-hours");
    expect(checkSlot(s, { ...q, start: 610 })).toBe("break");
    expect(checkSlot(s, { ...q, start: 650 })).toBe("overlap");
    expect(checkSlot(s, { ...q, date: SUN, start: 600 })).toBe("day-off");
    expect(checkSlot(s, { ...q, staffId: "ben", serviceId: "colour", start: 600 })).toBe("not-offered");
    expect(checkSlot(s, { ...q, staffId: "nobody", start: 600 })).toBe("unknown");
    expect(checkSlot(s, { ...q, date: "2026-10-26", start: 600 })).toBe("past");
  });

  it("accepts off-grid times the salon enters by hand", () => {
    expect(checkSlot(schedule(), { ...q, start: 547, enforceRules: false })).toBeNull();
  });

  it("reports time off", () => {
    const s = schedule();
    s.timeOff.push({ id: "t", staffId: "ana", from: MON, to: MON, reason: "Holiday" });
    expect(checkSlot(s, { ...q, start: 600 })).toBe("time-off");
  });
});

describe("helpers", () => {
  it("finds the next available time, skipping full days", () => {
    const s = schedule();
    // Friday 11:00 now: 13:00 is after closing, Saturday works, so Saturday 09:00.
    const next = nextAvailable(s, { serviceId: "trim", staffId: "ana", now: at("2026-10-30", 660) });
    expect(next).toEqual({ date: "2026-10-31", slot: { start: 540, staffIds: ["ana"] } });
  });

  it("returns null when nothing is free within the horizon", () => {
    const s = schedule();
    s.timeOff.push({ id: "t", staffId: "ana", from: "2026-10-01", to: "2026-12-31", reason: "Leave" });
    expect(nextAvailable(s, { serviceId: "colour", staffId: "any", now: NOW })).toBeNull();
  });

  it("counts slots per day", () => {
    const counts = slotCounts(schedule(), { serviceId: "trim", staffId: "ana", now: NOW }, MON, 7);
    expect(counts[MON]).toBe(11);
    expect(counts[SUN]).toBe(0);
    expect(Object.keys(counts)).toHaveLength(7);
  });

  it("gives any-available bookings to the least busy person", () => {
    const s = schedule();
    s.bookings.push(booking({ staffId: "ana", date: MON, start: 540, end: 600 }));
    expect(assignStaff(s, MON, ["ana", "ben"])).toBe("ben");
    expect(assignStaff(s, TUE, ["ana", "ben"])).toBe("ana");
    expect(assignStaff(s, MON, [])).toBeNull();
  });

  it("works out working minutes without breaks and time off", () => {
    const s = schedule();
    s.staff[0].hours = weekdays(day(540, 720, [{ start: 600, end: 630 }]));
    s.timeOff.push({ id: "t", staffId: "ana", from: TUE, to: TUE, start: 540, end: 600, reason: "" });
    expect(workingMinutes(s, s.staff[0], MON)).toBe(150);
    expect(workingMinutes(s, s.staff[0], TUE)).toBe(90);
    expect(workingMinutes(s, s.staff[0], SUN)).toBe(0);
  });
});

describe("zonedToUtc", () => {
  it("converts salon wall-clock times on both sides of DST", () => {
    expect(new Date(zonedToUtc("2026-07-01", 600, TZ)).toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(new Date(zonedToUtc("2026-12-01", 600, TZ)).toISOString()).toBe("2026-12-01T10:00:00.000Z");
    // Clocks go back on 25 Oct 2026; 10:00 that day is already GMT.
    expect(new Date(zonedToUtc("2026-10-25", 600, TZ)).toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(new Date(zonedToUtc("2026-11-02", 540, "America/New_York")).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("moves a time skipped by the spring jump forward", () => {
    // 01:30 doesn't exist in London on 29 Mar 2026.
    expect(new Date(zonedToUtc("2026-03-29", 90, TZ)).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
});

describe("formatting", () => {
  it("formats salon times and dates for US readers", async () => {
    const { formatTime, formatHour, formatDay, relativeDay, formatDuration } = await import("@/lib/dates");
    expect(formatTime(570)).toBe("9:30 AM");
    expect(formatTime(720)).toBe("12:00 PM");
    expect(formatTime(0)).toBe("12:00 AM");
    expect(formatTime(1005)).toBe("4:45 PM");
    expect(formatHour(780)).toBe("1 PM");
    expect(formatDay(MON)).toBe("Mon, Nov 2");
    expect(relativeDay(TUE, MON)).toBe("Tomorrow");
    expect(formatDuration(75)).toBe("1 h 15 min");
  });
});
