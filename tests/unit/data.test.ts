import { describe, expect, it } from "vitest";
import { cancelBooking, canChangeOnline, createBooking, findBooking, findByToken, moveBooking, upsertClient, validateClient } from "@/lib/api";
import { checkSlot, getSlots, isLive } from "@/lib/availability";
import { addDays, zonedNow, zonedToUtc } from "@/lib/dates";
import { bookingIcs } from "@/lib/ics";
import { createSeed, refFor, TIME_ZONE } from "@/lib/seed";
import { clientSummary, overview } from "@/lib/stats";

// Thursday 29 Oct 2026, 11:00 in New York.
const NOW = zonedToUtc("2026-10-29", 660, TIME_ZONE);
const TODAY = zonedNow(TIME_ZONE, NOW).date;

describe("seed", () => {
  const s = createSeed(NOW);

  it("is built around the salon's today", () => {
    expect(s.seededOn).toBe("2026-10-29");
    expect(s.bookings.some((b) => b.date === TODAY)).toBe(true);
    expect(s.bookings.some((b) => b.date < addDays(TODAY, -28))).toBe(true);
    expect(s.bookings.some((b) => b.date > addDays(TODAY, 14))).toBe(true);
  });

  it("is deterministic for a day", () => {
    expect(createSeed(NOW + 60_000).bookings.map((b) => b.ref)).toEqual(s.bookings.map((b) => b.ref));
  });

  it("never double-books anyone", () => {
    for (const b of s.bookings.filter(isLive)) {
      const reason = checkSlot({ ...s, bookings: s.bookings }, { serviceId: b.serviceId, staffId: b.staffId, date: b.date, start: b.start, now: NOW, ignoreBookingId: b.id, enforceRules: false });
      expect(reason, `${b.ref} ${b.date} ${b.start} ${b.staffId}`).toBeNull();
    }
  });

  it("marks the past as done and the future as upcoming", () => {
    const now = zonedNow(TIME_ZONE, NOW);
    for (const b of s.bookings) {
      const past = b.date < now.date || (b.date === now.date && b.end <= now.minutes);
      if (past) expect(["completed", "no-show", "cancelled"]).toContain(b.status);
      else expect(["confirmed", "cancelled"]).toContain(b.status);
    }
  });

  it("uses only synthetic contact details and unique references", () => {
    for (const c of s.clients) {
      expect(c.email).toMatch(/@mail\.example$/);
      expect(c.phone).toMatch(/^\(718\) 555-01\d\d$/);
    }
    expect(new Set(s.bookings.map((b) => b.ref)).size).toBe(s.bookings.length);
    expect(new Set(s.clients.map((c) => c.email)).size).toBe(s.clients.length);
    expect(new Set(s.bookings.map((b) => b.token)).size).toBe(s.bookings.length);
  });

  it("only assigns services to staff who offer them", () => {
    for (const b of s.bookings) expect(s.services.find((x) => x.id === b.serviceId)!.staffIds).toContain(b.staffId);
  });

  it("makes readable references", () => {
    expect(refFor(1)).toMatch(/^HD-[2-9A-HJ-NP-Z]{4}$/);
    expect(refFor(1)).not.toBe(refFor(2));
  });
});

describe("booking actions", () => {
  const client = { name: "Test Person", email: "Test.Person@mail.example", phone: "(718) 555-0100" };
  const tomorrow = addDays(TODAY, 1);

  function firstSlot(s: ReturnType<typeof createSeed>, serviceId: string, staffId: string, date = tomorrow) {
    const slot = getSlots(s, { serviceId, staffId, date, now: NOW })[0];
    expect(slot, "a free slot in the seed").toBeDefined();
    return slot;
  }

  it("validates client details", () => {
    expect(validateClient(client)).toEqual({});
    expect(Object.keys(validateClient({ name: "A", email: "nope", phone: "12" }))).toEqual(["name", "email", "phone"]);
  });

  it("books a free slot and adds the client", () => {
    const s = createSeed(NOW);
    const slot = firstSlot(s, "mens-cut", "theo");
    const r = createBooking(s, { serviceId: "mens-cut", staffId: "theo", date: tomorrow, start: slot.start, client, source: "online", online: true }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ staffId: "theo", status: "confirmed", end: slot.start + 45, price: 48, anyStaff: false });
    expect(s.clients.find((c) => c.id === r.value.clientId)?.email).toBe("test.person@mail.example");
    expect(findBooking(s, r.value.ref.toLowerCase(), " TEST.person@mail.example ")?.id).toBe(r.value.id);
    expect(findBooking(s, r.value.ref, "someone@else.example")).toBeNull();
    expect(findByToken(s, r.value.token)?.id).toBe(r.value.id);
  });

  it("refuses a time that was just taken", () => {
    const s = createSeed(NOW);
    const slot = firstSlot(s, "mens-cut", "theo");
    const input = { serviceId: "mens-cut", staffId: "theo", date: tomorrow, start: slot.start, client, source: "online" as const, online: true };
    expect(createBooking(s, input, NOW).ok).toBe(true);
    const again = createBooking(s, { ...input, client: { ...client, email: "other@mail.example" } }, NOW);
    expect(again).toEqual({ ok: false, error: "Sorry, that time was just taken. Please pick another." });
  });

  it("assigns someone free for any available", () => {
    const s = createSeed(NOW);
    const slot = firstSlot(s, "blowout", "any");
    const r = createBooking(s, { serviceId: "blowout", staffId: "any", date: tomorrow, start: slot.start, client, source: "online", online: true }, NOW);
    expect(r.ok && slot.staffIds.includes(r.value.staffId)).toBe(true);
    expect(r.ok && r.value.anyStaff).toBe(true);
  });

  it("re-uses an existing client by email", () => {
    const s = createSeed(NOW);
    const before = s.clients.length;
    const existing = s.clients[3];
    expect(upsertClient(s, { name: existing.name, email: existing.email.toUpperCase(), phone: "" }, NOW).id).toBe(existing.id);
    expect(s.clients.length).toBe(before);
  });

  it("moves a booking and keeps its length", () => {
    const s = createSeed(NOW);
    const slot = firstSlot(s, "womens-cut", "maya", addDays(TODAY, 5));
    const r = createBooking(s, { serviceId: "womens-cut", staffId: "maya", date: addDays(TODAY, 5), start: slot.start, client, source: "online", online: true }, NOW);
    if (!r.ok) throw new Error(r.error);
    const target = firstSlot(s, "womens-cut", "any", addDays(TODAY, 6));
    const moved = moveBooking(s, r.value.id, { date: addDays(TODAY, 6), start: target.start, staffId: "any" }, NOW, true);
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.value.end - moved.value.start).toBe(60);
  });

  it("explains why the salon can't move a booking somewhere", () => {
    const s = createSeed(NOW);
    const b = s.bookings.find((x) => x.status === "confirmed" && x.staffId === "theo" && x.date > TODAY)!;
    // Theo doesn't work Sundays.
    const sunday = addDays(TODAY, 3);
    const r = moveBooking(s, b.id, { date: sunday, start: 600, staffId: "theo" }, NOW, false);
    expect(r).toEqual({ ok: false, error: "Theo isn't working that day." });
  });

  it("closes online changes inside the cancellation window", () => {
    const s = createSeed(NOW);
    const soon = s.bookings.find((b) => b.status === "confirmed" && b.date === TODAY)!;
    expect(canChangeOnline(s, soon, NOW)).toBe(false);
    expect(cancelBooking(s, soon.id, NOW, true).ok).toBe(false);
    // The salon itself can still cancel.
    expect(cancelBooking(s, soon.id, NOW, false).ok).toBe(true);
    expect(cancelBooking(s, soon.id, NOW, false).ok).toBe(false);
  });
});

describe("calendar file", () => {
  it("writes the appointment in UTC with a reminder", () => {
    const s = createSeed(NOW);
    const b = { ...s.bookings[0], date: "2026-11-02", start: 600, end: 645 };
    const ics = bookingIcs(b, s.services[1].name, s.staff[1], s.salon, "https://example.com/manage", NOW);
    expect(ics).toContain("DTSTART:20261102T150000Z");
    expect(ics).toContain("DTEND:20261102T154500Z");
    expect(ics).toContain("SUMMARY:Men's cut with Theo");
    expect(ics).toContain("LOCATION:Halden Hair Studio\\, 218 Marlowe Street\\, Brooklyn\\, NY");
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});

describe("dashboard numbers", () => {
  const s = createSeed(NOW);
  const o = overview(s, NOW);

  it("covers 28 days and adds up", () => {
    expect(o.daily).toHaveLength(28);
    expect(o.daily.at(-1)!.date).toBe(TODAY);
    expect(o.daily.slice(-7).reduce((n, d) => n + d.revenue, 0)).toBe(o.revenue.current);
    expect(o.revenue.current).toBeGreaterThan(0);
  });

  it("keeps rates between 0 and 1", () => {
    for (const x of [o.booked.current, o.booked.previous, o.noShow.current]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    for (const row of o.staffLoad) expect(row.week).toBeLessThanOrEqual(1);
  });

  it("ranks the top services by revenue", () => {
    expect(o.topServices.length).toBe(5);
    expect(o.topServices.map((x) => x.revenue)).toEqual([...o.topServices.map((x) => x.revenue)].sort((a, b) => b - a));
  });

  it("summarises a client's history", () => {
    const regular = s.clients[0];
    const sum = clientSummary(s, regular.id, TODAY);
    expect(sum.visits.length).toBeGreaterThan(0);
    expect(sum.spent).toBe(sum.visits.filter((b) => b.status === "completed").reduce((n, b) => n + b.price, 0));
  });
});
