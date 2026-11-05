import { describe, expect, it } from "vitest";
import { checkSlot, getSlots, nextAvailable } from "@/lib/availability";
import { cancelBooking, createBooking, isRealDate, moveBooking, validateClient, type NewBooking } from "@/lib/api";
import { zonedToUtc } from "@/lib/dates";
import { bookingIcs } from "@/lib/ics";
import { createSeed } from "@/lib/seed";
import type { DayHours, DemoState } from "@/lib/types";

// Monday 2 Nov 2026 in New York. The salon works Monday to Saturday, 9 AM to 6 PM.
const TZ = "America/New_York";
const at = (date: string, minutes: number) => zonedToUtc(date, minutes, TZ);
const day = (start: number, end: number, breaks: DayHours["breaks"] = []): DayHours => ({ start, end, breaks });
const weekdays = (d: DayHours) => [d, d, d, d, d, d, null];

function state(): DemoState {
  return {
    version: 1,
    seededOn: "2026-11-02",
    salon: { name: "Test", timeZone: TZ, address: "", phone: "", currency: "USD" },
    rules: { slotStep: 15, minNotice: 120, maxDaysAhead: 30, cancelHours: 24 },
    services: [
      { id: "cut", name: "Cut", category: "Cuts", description: "", duration: 60, buffer: 0, price: 50, staffIds: ["ana"], active: true },
      { id: "old", name: "Old", category: "Cuts", description: "", duration: 30, buffer: 0, price: 10, staffIds: ["ana"], active: false },
    ],
    staff: [{ id: "ana", name: "Ana Lee", role: "", bio: "", hue: 0, hours: weekdays(day(540, 1080)) }],
    timeOff: [],
    clients: [{ id: "c001", name: "Maria Real", email: "maria@mail.example", phone: "(718) 555-0101", notes: "", createdAt: "" }],
    bookings: [],
    waitlist: [],
    outbox: [],
  };
}

const guest = { name: "Bob Guest", email: "bob@mail.example", phone: "(718) 555-0102" };
const online = (p: Partial<NewBooking>): NewBooking => ({ serviceId: "cut", staffId: "ana", date: "2026-11-04", start: 600, client: guest, source: "online", online: true, ...p });
const MON_10 = at("2026-11-02", 600);

describe("minimum notice", () => {
  it("holds across midnight: a one-day notice keeps tomorrow morning closed", () => {
    const s = state();
    s.rules.minNotice = 1440;
    const now = at("2026-11-02", 18 * 60);
    expect(checkSlot(s, { serviceId: "cut", staffId: "ana", date: "2026-11-03", start: 540, now })).toBe("too-soon");
    expect(checkSlot(s, { serviceId: "cut", staffId: "ana", date: "2026-11-03", start: 18 * 60 - 60, now })).toBe("too-soon");
    expect(nextAvailable(s, { serviceId: "cut", staffId: "ana", now })).toEqual({ date: "2026-11-04", slot: { start: 540, staffIds: ["ana"] } });
  });

  it("still applies within the day", () => {
    const s = state();
    expect(checkSlot(s, { serviceId: "cut", staffId: "ana", date: "2026-11-02", start: 660, now: MON_10 })).toBe("too-soon");
    expect(checkSlot(s, { serviceId: "cut", staffId: "ana", date: "2026-11-02", start: 540, now: MON_10 })).toBe("past");
    expect(checkSlot(s, { serviceId: "cut", staffId: "ana", date: "2026-11-02", start: 720, now: MON_10 })).toBeNull();
  });
});

describe("rescheduling keeps the booking's own length", () => {
  it("doesn't double-book after the service got shorter", () => {
    const s = state();
    const a = createBooking(s, online({ start: 600 }), MON_10);
    createBooking(s, online({ start: 720 }), MON_10);
    s.services[0].duration = 30;
    if (!a.ok) throw new Error(a.error);
    // 11:30 would fit a 30-minute cut, but this booking is still 60 minutes and would run into 12:00.
    expect(moveBooking(s, a.value.id, { date: "2026-11-04", start: 690, staffId: "ana" }, MON_10, true)).toMatchObject({ ok: false });
    const starts = getSlots(s, { serviceId: "cut", staffId: "ana", date: "2026-11-04", now: MON_10, ignoreBookingId: a.value.id }).map((x) => x.start);
    expect(starts).not.toContain(690);
    expect(starts).toContain(660);
  });
});

describe("booking input is checked", () => {
  it.each([NaN, 601, 540.5, -15, 1440, Infinity])("refuses start %s", (start) => {
    expect(createBooking(state(), online({ start }), MON_10)).toMatchObject({ ok: false });
  });

  it.each(["", "2026-02-30", "2026-13-01", "garbage", "2026-11-4"])("refuses date %j", (date) => {
    expect(createBooking(state(), online({ date, online: false, source: "phone" }), MON_10)).toMatchObject({ ok: false, error: "Choose a valid date." });
  });

  it("only offers the grid times online, but the salon can book any minute", () => {
    expect(createBooking(state(), online({ start: 610 }), MON_10)).toMatchObject({ ok: false, error: "That isn't one of the bookable start times." });
    expect(createBooking(state(), online({ start: 610, online: false, source: "phone" }), MON_10)).toMatchObject({ ok: true });
  });

  it("refuses a service that is no longer offered, even with a named staff member", () => {
    expect(createBooking(state(), online({ serviceId: "old" }), MON_10)).toMatchObject({ ok: false });
  });

  it("refuses details the form would refuse", () => {
    expect(createBooking(state(), online({ client: { ...guest, phone: "call me" } }), MON_10)).toMatchObject({ ok: false });
    expect(createBooking(state(), online({ notes: "x".repeat(501) }), MON_10)).toMatchObject({ ok: false });
  });

  it("knows real dates", () => {
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
  });
});

describe("clients", () => {
  it("an online booking with someone's email doesn't overwrite their record", () => {
    const s = state();
    const r = createBooking(s, online({ client: { name: "Not Maria", email: " MARIA@mail.example ", phone: "(718) 555-0199" } }), MON_10);
    expect(r.ok).toBe(true);
    expect(s.clients[0]).toMatchObject({ name: "Maria Real", phone: "(718) 555-0101" });
    if (r.ok) expect(r.value.notes).toBe("Booked online as Not Maria, (718) 555-0199.");
  });

  it("the salon's own form may update the record", () => {
    const s = state();
    createBooking(s, online({ online: false, source: "phone", client: { name: "Maria Reale", email: "maria@mail.example", phone: "(718) 555-0101" } }), MON_10);
    expect(s.clients[0].name).toBe("Maria Reale");
  });

  it("validates phone and name", () => {
    expect(validateClient({ name: "Bo", email: "b@mail.example", phone: "abc1234567" }).phone).toBeDefined();
    expect(validateClient({ name: "x".repeat(81), email: "b@mail.example", phone: "+90 532 000 00 00" }).name).toBeDefined();
    expect(validateClient({ name: "Bo", email: "b@mail.example", phone: "+90 532 000 00 00" })).toEqual({});
  });
});

describe("changes", () => {
  it("the salon can't move an appointment to a past day", () => {
    const s = state();
    const a = createBooking(s, online({ online: false, source: "phone" }), MON_10);
    if (!a.ok) throw new Error(a.error);
    expect(moveBooking(s, a.value.id, { date: "2026-10-30", start: 600, staffId: "ana" }, MON_10, false)).toEqual({ ok: false, error: "That day has already passed." });
    expect(moveBooking(s, a.value.id, { date: "2026-11-02", start: 540, staffId: "ana" }, MON_10, false)).toMatchObject({ ok: true });
  });

  it("says an appointment has started when cancelling online any time is allowed", () => {
    const s = state();
    s.rules.cancelHours = 0;
    const a = createBooking(s, online({ date: "2026-11-02", start: 600, online: false, source: "phone" }), at("2026-11-02", 500));
    if (!a.ok) throw new Error(a.error);
    expect(cancelBooking(s, a.value.id, at("2026-11-02", 610), true)).toEqual({ ok: false, error: "This appointment has already started. Please call the salon." });
    expect(cancelBooking(s, a.value.id, at("2026-11-02", 590), true)).toMatchObject({ ok: true });
  });
});

describe("dates and calendar files", () => {
  it("reads a time skipped by the spring jump as the time after it, and a repeated time as the first", () => {
    expect(new Date(zonedToUtc("2026-03-08", 150, TZ)).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(new Date(zonedToUtc("2026-11-01", 90, TZ)).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(new Date(zonedToUtc("2026-11-02", 540, TZ)).toISOString()).toBe("2026-11-02T14:00:00.000Z");
    expect(new Date(zonedToUtc("2026-07-01", 540, "Asia/Kolkata")).toISOString()).toBe("2026-07-01T03:30:00.000Z");
  });

  it("escapes text and folds long lines in the .ics file", () => {
    const s = state();
    const b = createBooking(s, online({}), MON_10);
    if (!b.ok) throw new Error(b.error);
    const ics = bookingIcs(b.value, s.services[0].name, s.staff[0], { ...s.salon, name: "Back\\slash; Salon, Ltd", address: "1 Ünïcode Street ".repeat(6) }, "https://example.com/manage/?b=" + "x".repeat(80), MON_10);
    const lines = ics.split("\r\n");
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("LOCATION:Back\\\\slash\\; Salon\\, Ltd\\,");
    expect(unfolded).toContain("x".repeat(80));
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("demo data", () => {
  it.each(["2026-10-29T14:00:00Z", "2026-11-05T16:00:00Z", "2027-03-08T12:00:00Z", "2027-07-15T20:00:00Z"])("keeps every client in one chair at a time and barbering for men (%s)", (iso) => {
    const s = createSeed(Date.parse(iso));
    const live = s.bookings.filter((b) => b.status !== "cancelled");
    for (const a of live) {
      for (const b of live) {
        if (a.id < b.id && a.clientId === b.clientId && a.date === b.date) expect(a.start < b.end && b.start < a.end, `${a.id} and ${b.id}`).toBe(false);
      }
    }
    const women = ["Amelia", "Olivia", "Isla", "Freya", "Ava", "Poppy", "Grace", "Sophie", "Lily", "Ella", "Chloe", "Hannah", "Zara", "Leah", "Nadia", "Priya", "Mei", "Elena", "Clara", "Rosa"];
    const barber = s.bookings.filter((b) => ["mens-cut", "skin-fade", "beard", "cut-beard"].includes(b.serviceId));
    expect(barber.length).toBeGreaterThan(20);
    for (const b of barber) expect(women).not.toContain(s.clients.find((c) => c.id === b.clientId)!.name.split(" ")[0]);
  });
});
