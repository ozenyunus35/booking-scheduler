import { describe, expect, it } from "vitest";
import { bookingTitle, getSlots, staffFor, visitFor } from "@/lib/availability";
import { bookFromWaitlist, cancelBooking, cancelSeries, createBooking, createSeries, joinWaitlist, moveBooking, planSeries, removeFromWaitlist, waitlistOpenings, type NewBooking } from "@/lib/api";
import { zonedToUtc } from "@/lib/dates";
import { MAX_OUTBOX, queueMessage, upcomingReminders } from "@/lib/messages";
import { createSeed, STATE_VERSION } from "@/lib/seed";
import type { DayHours, DemoState } from "@/lib/types";

// Monday 2 Nov 2026 in New York.
const TZ = "America/New_York";
const at = (date: string, minutes: number) => zonedToUtc(date, minutes, TZ);
const day = (start: number, end: number, breaks: DayHours["breaks"] = []): DayHours => ({ start, end, breaks });
const weekdays = (d: DayHours) => [d, d, d, d, d, d, null];
const MON_10 = at("2026-11-02", 600);
const WED = "2026-11-04";

function state(): DemoState {
  return {
    version: STATE_VERSION,
    seededOn: "2026-11-02",
    salon: { name: "Test Salon", timeZone: TZ, address: "1 Main St", phone: "(718) 555-0100", currency: "USD" },
    rules: { slotStep: 15, minNotice: 120, maxDaysAhead: 30, cancelHours: 24 },
    services: [
      { id: "color", name: "Color", category: "Color", description: "", duration: 90, buffer: 15, price: 120, staffIds: ["ana", "ben"], active: true },
      { id: "cut", name: "Cut", category: "Cuts", description: "", duration: 60, buffer: 10, price: 60, staffIds: ["ana", "cy"], active: true },
      { id: "blow", name: "Blowout", category: "Styling", description: "", duration: 30, buffer: 0, price: 40, staffIds: ["ana", "ben", "cy"], active: true },
    ],
    staff: [
      { id: "ana", name: "Ana Lee", role: "", bio: "", hue: 0, hours: weekdays(day(540, 1080)) },
      { id: "ben", name: "Ben Ode", role: "", bio: "", hue: 0, hours: weekdays(day(540, 1080)) },
      { id: "cy", name: "Cy Park", role: "", bio: "", hue: 0, hours: weekdays(day(540, 1080)) },
    ],
    timeOff: [],
    clients: [],
    bookings: [],
    waitlist: [],
    outbox: [],
  };
}

let n = 0;
const guest = () => ({ name: "Guest Person", email: `g${++n}@mail.example`, phone: "(718) 555-0150" });
const booking = (p: Partial<NewBooking>): NewBooking => ({ serviceId: "color", staffId: "ana", date: WED, start: 600, client: guest(), source: "phone", online: false, ...p });

describe("one visit, several services", () => {
  it("adds durations and prices, keeps the last buffer and only staff who do all of them", () => {
    const s = state();
    expect(visitFor(s, "color", ["cut"])).toMatchObject({ duration: 150, price: 180, buffer: 10, staffIds: ["ana"], name: "Color + Cut" });
    expect(staffFor(s, "color", ["cut"]).map((p) => p.id)).toEqual(["ana"]);
    expect(visitFor(s, "color", ["missing"])).toBeNull();
  });

  it("needs a gap long enough for the whole visit", () => {
    const s = state();
    createBooking(s, booking({ serviceId: "blow", start: 720 }), MON_10);
    const starts = getSlots(s, { serviceId: "color", addOnIds: ["cut"], staffId: "ana", date: WED, now: MON_10 }).map((x) => x.start);
    expect(starts).toContain(555); // 9:15 + 150 min + the cut's 10-minute buffer ends at 12:00
    expect(starts).not.toContain(570); // its buffer would run into the 12:00 blowout
    expect(starts).toContain(750); // after the blowout
  });

  it("books both services as one appointment with the summed price", () => {
    const s = state();
    const r = createBooking(s, booking({ addOnIds: ["cut"] }), MON_10);
    expect(r).toMatchObject({ ok: true, value: { serviceId: "color", addOnIds: ["cut"], start: 600, end: 750, price: 180 } });
    if (r.ok) expect(bookingTitle(s, r.value)).toBe("Color + Cut");
    // The cut's 10-minute buffer follows the visit, not the color's 15.
    expect(createBooking(s, booking({ serviceId: "blow", start: 760 }), MON_10)).toMatchObject({ ok: true });
  });

  it("refuses a visit no one can do and more than two add-ons", () => {
    const s = state();
    expect(createBooking(s, booking({ staffId: "ben", addOnIds: ["cut"] }), MON_10)).toMatchObject({ ok: false });
    expect(createBooking(s, booking({ serviceId: "blow", staffId: "any", addOnIds: ["color", "cut", "extra"] }), MON_10)).toMatchObject({ ok: false, error: "Add at most two services to one visit." });
  });
});

describe("messages", () => {
  it("confirms, reschedules and cancels by email", () => {
    const s = state();
    const r = createBooking(s, booking({}), MON_10);
    if (!r.ok) throw new Error(r.error);
    moveBooking(s, r.value.id, { date: WED, start: 660, staffId: "ana" }, MON_10, false);
    cancelBooking(s, r.value.id, MON_10, false);
    expect(s.outbox.map((m) => m.kind)).toEqual(["confirmation", "rescheduled", "cancelled"]);
    expect(s.outbox[0]).toMatchObject({ channel: "email", bookingId: r.value.id, subject: "Booked: Color, Wednesday, November 4 at 10:00 AM ET" });
    expect(s.outbox[0].body).toContain(r.value.ref);
  });

  it("keeps the outbox to the latest messages", () => {
    const s = state();
    for (let i = 0; i < MAX_OUTBOX + 5; i++) queueMessage(s, { at: "", channel: "sms", kind: "confirmation", clientId: "c", subject: String(i), body: "" });
    expect(s.outbox).toHaveLength(MAX_OUTBOX);
    expect(s.outbox[0].subject).toBe("5");
  });

  it("lists reminder texts due in the next two days", () => {
    const s = state();
    createBooking(s, booking({ date: "2026-11-03", start: 600 }), MON_10); // reminder Mon 10:00, now
    createBooking(s, booking({ date: "2026-11-03", start: 660, staffId: "ben" }), MON_10); // Mon 11:00
    createBooking(s, booking({ date: "2026-11-06", start: 600, staffId: "cy", serviceId: "cut" }), MON_10); // Thu, too far
    const due = upcomingReminders(s, MON_10 + 60_000);
    expect(due.map((x) => x.booking.start)).toEqual([660]);
    expect(due[0].body).toContain("tomorrow at 11:00 AM");
  });
});

describe("waitlist", () => {
  const join = (s: DemoState, p: Partial<Parameters<typeof joinWaitlist>[1]> = {}) =>
    joinWaitlist(s, { serviceId: "cut", staffId: "any", date: WED, part: "any", client: guest(), ...p }, MON_10);

  it("checks the request", () => {
    const s = state();
    expect(join(s, { date: "2026-10-30" })).toMatchObject({ ok: false, error: "That day has already passed." });
    expect(join(s, { staffId: "ben" })).toMatchObject({ ok: false });
    expect(join(s, { part: "night" as never })).toMatchObject({ ok: false });
    const client = guest();
    expect(join(s, { client })).toMatchObject({ ok: true });
    expect(join(s, { client })).toMatchObject({ ok: false, error: "You're already on the waitlist for that day." });
    expect(s.outbox.at(-1)).toMatchObject({ kind: "waitlist-joined" });
  });

  it("texts the people waiting when a cancellation frees a time that suits them, once", () => {
    const s = state();
    // Fill Ana's and Cy's Wednesday with cuts.
    const made = [];
    for (const staffId of ["ana", "cy"]) for (let t = 540; t + 60 <= 1080; t += 75) made.push(createBooking(s, booking({ serviceId: "cut", staffId, start: t }), MON_10));
    const morning = join(s, { part: "morning" });
    const evening = join(s, { part: "evening" });
    if (!morning.ok || !evening.ok) throw new Error("join failed");
    expect(waitlistOpenings(s, morning.value, MON_10)).toEqual([]);

    const tenTen = made[1];
    if (!tenTen.ok) throw new Error(tenTen.error);
    cancelBooking(s, tenTen.value.id, MON_10, false); // Ana 10:15, a morning time
    const texts = s.outbox.filter((m) => m.kind === "slot-open");
    expect(texts.map((m) => m.clientId)).toEqual([morning.value.clientId]);
    expect(texts[0]).toMatchObject({ channel: "sms" });
    expect(texts[0].body).toContain("10:15 AM");

    const other = made[2];
    if (!other.ok) throw new Error(other.error);
    cancelBooking(s, other.value.id, MON_10 + 60_000, false);
    expect(s.outbox.filter((m) => m.kind === "slot-open")).toHaveLength(1);
  });

  it("books a waitlisted client into an open time, and forgets removed entries", () => {
    const s = state();
    const e = join(s);
    if (!e.ok) throw new Error(e.error);
    const open = waitlistOpenings(s, e.value, MON_10);
    const r = bookFromWaitlist(s, e.value.id, open[0].start, open[0].staffIds[0], MON_10);
    expect(r).toMatchObject({ ok: true, value: { source: "waitlist", clientId: e.value.clientId } });
    expect(s.waitlist[0]).toMatchObject({ status: "booked" });
    expect(bookFromWaitlist(s, e.value.id, 900, "ana", MON_10)).toMatchObject({ ok: false });
    const f = join(s, { date: "2026-11-05" });
    if (!f.ok) throw new Error(f.error);
    removeFromWaitlist(s, f.value.id);
    expect(waitlistOpenings(s, f.value, MON_10)).toEqual([]);
  });
});

describe("repeating appointments", () => {
  it("plans each date, moving to the nearest free time or skipping", () => {
    const s = state();
    s.timeOff.push({ id: "t1", staffId: "ana", from: "2026-11-25", to: "2026-11-25", reason: "Off" });
    createBooking(s, booking({ serviceId: "blow", date: "2026-11-18", start: 600 }), MON_10);
    const plan = planSeries(s, { serviceId: "cut", staffId: "ana", date: WED, start: 600 }, 1, 4, MON_10);
    expect(plan).toEqual([
      { date: "2026-11-11", start: 600, status: "ok" },
      { date: "2026-11-18", start: 630, status: "moved", reason: "Ana already has an appointment then." },
      { date: "2026-11-25", start: 600, status: "skipped", reason: "Ana is off at that time." },
    ]);
  });

  it("books the series with one email and cancels from a date onwards", () => {
    const s = state();
    const r = createSeries(s, booking({ serviceId: "cut", staffId: "any" }), 4, 3, MON_10);
    if (!r.ok) throw new Error(r.error);
    const dates = r.value.booked.map((b) => b.date);
    expect(dates).toEqual([WED, "2026-12-02", "2026-12-30"]);
    expect(new Set(r.value.booked.map((b) => b.seriesId)).size).toBe(1);
    expect(new Set(r.value.booked.map((b) => b.staffId)).size).toBe(1);
    expect(s.outbox.map((m) => m.kind)).toEqual(["series"]);
    expect(s.outbox[0].body).toContain("December 30");

    expect(cancelSeries(s, r.value.booked[1].id, MON_10)).toEqual({ ok: true, value: 2 });
    expect(s.bookings.map((b) => b.status)).toEqual(["confirmed", "cancelled", "cancelled"]);
    expect(createSeries(s, booking({ serviceId: "cut" }), 7, 3, MON_10)).toMatchObject({ ok: false });
    expect(createSeries(s, booking({ serviceId: "cut" }), 4, 13, MON_10)).toMatchObject({ ok: false });
  });
});

describe("seeded demo", () => {
  const s = createSeed(Date.parse("2026-10-29T14:00:00Z"));

  it("has visits with add-ons that add up", () => {
    const visits = s.bookings.filter((b) => b.addOnIds?.length);
    expect(visits.length).toBeGreaterThan(5);
    for (const b of visits) {
      const v = visitFor(s, b.serviceId, b.addOnIds)!;
      expect(b.end - b.start).toBe(v.duration);
      expect(b.price).toBe(v.price);
      expect(v.staffIds).toContain(b.staffId);
    }
  });

  it("has repeating series three weeks apart", () => {
    const series = new Map<string, string[]>();
    for (const b of s.bookings) if (b.seriesId) series.set(b.seriesId, [...(series.get(b.seriesId) ?? []), b.date]);
    expect(series.size).toBeGreaterThanOrEqual(2);
    for (const dates of series.values()) expect(dates.length).toBeGreaterThanOrEqual(2);
  });

  it("has people waiting and a recent outbox", () => {
    expect(s.waitlist.filter((e) => e.status === "waiting").length).toBe(4);
    expect(s.outbox.length).toBeGreaterThan(10);
    expect(s.outbox.every((m, i) => i === 0 || s.outbox[i - 1].at <= m.at)).toBe(true);
  });
});

describe("csv", () => {
  it("quotes cells and keeps formulas out", async () => {
    const { cell, toCsv, bookingsCsv, clientsCsv } = await import("@/lib/csv");
    expect(cell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(cell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(cell("-5")).toBe("'-5");
    expect(cell("line\nbreak")).toBe('"line\nbreak"');
    expect(cell(48)).toBe("48");
    expect(toCsv([["a", "b"]])).toBe("﻿a,b\r\n");
    const s = createSeed(Date.parse("2026-10-29T14:00:00Z"));
    const lines = bookingsCsv(s, "2026-10-29", "2026-10-29").split("\r\n");
    expect(lines[0]).toBe("﻿Reference,Date,Start,End,Service,Professional,Client,Email,Phone,Status,Source,Price,Series,Notes");
    expect(lines.length - 2).toBe(s.bookings.filter((b) => b.date === "2026-10-29").length);
    expect(clientsCsv(s).split("\r\n").length - 2).toBe(s.clients.length);
  });
});
