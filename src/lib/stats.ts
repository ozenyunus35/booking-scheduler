import { bookingServiceIds, bookingWindow, isLive, workingMinutes } from "./availability";
import { addDays, weekdayShort } from "./dates";
import type { Booking, BookingSource, DemoState, ISODate } from "./types";

/** Numbers for the salon dashboard. Pure, so the tiles and charts are unit tested. */

const inRange = (b: Booking, from: ISODate, to: ISODate) => b.date >= from && b.date <= to;

export interface DayPoint {
  date: ISODate;
  label: string;
  revenue: number;
  appointments: number;
}

function minutes(s: DemoState, from: ISODate, to: ISODate, staffId?: string) {
  let worked = 0;
  let booked = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const p of s.staff) {
      if (staffId && p.id !== staffId) continue;
      worked += workingMinutes(s, p, d);
    }
  }
  for (const b of s.bookings) if (isLive(b) && inRange(b, from, to) && (!staffId || b.staffId === staffId)) booked += b.end - b.start;
  return { worked, booked };
}

export function utilisation(s: DemoState, from: ISODate, to: ISODate, staffId?: string) {
  const { worked, booked } = minutes(s, from, to, staffId);
  return worked ? Math.min(1, booked / worked) : 0;
}

export function overview(s: DemoState, now: number) {
  const { today } = bookingWindow(s, now);
  const last7 = [addDays(today, -6), today] as const;
  const prev7 = [addDays(today, -13), addDays(today, -7)] as const;
  const next7 = [today, addDays(today, 6)] as const;
  const last30 = [addDays(today, -29), today] as const;

  // Revenue counts finished visits only; today's still-upcoming ones aren't earned yet.
  const revenue = (from: ISODate, to: ISODate) => s.bookings.filter((b) => b.status === "completed" && inRange(b, from, to)).reduce((n, b) => n + b.price, 0);
  const appointments = (from: ISODate, to: ISODate) => s.bookings.filter((b) => isLive(b) && inRange(b, from, to)).length;

  const finished = s.bookings.filter((b) => (b.status === "completed" || b.status === "no-show") && inRange(b, ...last30));
  const noShows = finished.filter((b) => b.status === "no-show").length;
  const prevFinished = s.bookings.filter((b) => (b.status === "completed" || b.status === "no-show") && inRange(b, addDays(today, -59), addDays(today, -30)));

  const daily: DayPoint[] = [];
  for (let i = 27; i >= 0; i--) {
    const date = addDays(today, -i);
    daily.push({ date, label: weekdayShort(date), revenue: revenue(date, date), appointments: appointments(date, date) });
  }

  const recent = s.bookings.filter((b) => inRange(b, ...last30) && b.status !== "cancelled");
  const sources = (["online", "phone", "walk-in", "waitlist"] as BookingSource[]).map((source) => ({ source, count: recent.filter((b) => b.source === source).length }));

  const byService = new Map<string, { revenue: number; count: number }>();
  for (const b of s.bookings) {
    if (b.status !== "completed" || !inRange(b, ...last30)) continue;
    // A visit with add-ons splits its price over its services by their list prices.
    const ids = bookingServiceIds(b);
    const list = ids.map((id) => s.services.find((x) => x.id === id)?.price ?? 0);
    const total = list.reduce((n, p) => n + p, 0) || 1;
    ids.forEach((id, i) => {
      const row = byService.get(id) ?? { revenue: 0, count: 0 };
      row.revenue += (b.price * list[i]) / total;
      row.count++;
      byService.set(id, row);
    });
  }
  const topServices = [...byService.entries()]
    .map(([id, v]) => ({ service: s.services.find((x) => x.id === id), ...v }))
    .filter((x) => x.service)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    today,
    revenue: { current: revenue(...last7), previous: revenue(...prev7), spark: daily.slice(-14).map((d) => d.revenue) },
    appointments: { current: appointments(...last7), previous: appointments(...prev7), spark: daily.slice(-14).map((d) => d.appointments) },
    booked: { current: utilisation(s, ...next7), previous: utilisation(s, ...last7), freeHours: Math.round(Math.max(0, minutes(s, ...next7).worked - minutes(s, ...next7).booked) / 60) },
    noShow: { current: finished.length ? noShows / finished.length : 0, previous: prevFinished.length ? prevFinished.filter((b) => b.status === "no-show").length / prevFinished.length : 0, count: noShows },
    daily,
    sources,
    topServices,
    staffLoad: s.staff.map((p) => ({ staff: p, today: utilisation(s, today, today, p.id), week: utilisation(s, ...next7, p.id) })),
  };
}

/** A client's visit history and totals for the clients page. */
export function clientSummary(s: DemoState, clientId: string, today: ISODate) {
  const visits = s.bookings.filter((b) => b.clientId === clientId).sort((a, b) => (a.date === b.date ? b.start - a.start : a.date < b.date ? 1 : -1));
  const done = visits.filter((b) => b.status === "completed");
  return {
    visits,
    completed: done.length,
    spent: done.reduce((n, b) => n + b.price, 0),
    noShows: visits.filter((b) => b.status === "no-show").length,
    lastVisit: done[0]?.date ?? null,
    next: visits.filter((b) => b.status === "confirmed" && b.date >= today).at(-1) ?? null,
  };
}
