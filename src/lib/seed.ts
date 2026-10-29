import { checkSlot } from "./availability";
import { addDays, weekday, zonedNow, zonedToUtc } from "./dates";
import type { Booking, BookingSource, Client, DayHours, DemoState, Service, Staff } from "./types";

/**
 * Synthetic demo data for Halden Hair Studio, a fictional salon. Everything is
 * generated relative to "today" in the salon's time zone, so the calendar is
 * always full around the current date: five weeks of history for the reports and
 * three weeks of upcoming appointments that thin out further ahead.
 */

export const STATE_VERSION = 1;
export const TIME_ZONE = "America/New_York";

const h = (hh: number, mm = 0) => hh * 60 + mm;
const hours = (start: number, end: number, lunch: number): DayHours => ({ start, end, breaks: [{ start: lunch, end: lunch + 30 }] });

export const STAFF: Staff[] = [
  {
    id: "maya",
    name: "Maya Lindqvist",
    role: "Owner · Senior stylist",
    bio: "Precision cuts and lived-in color. 14 years behind the chair.",
    hue: 265,
    hours: [hours(h(9), h(17), h(13)), hours(h(9), h(17), h(13)), null, hours(h(10), h(19), h(14)), hours(h(9), h(17), h(13)), hours(h(9), h(15), h(12)), null],
  },
  {
    id: "theo",
    name: "Theo Marsh",
    role: "Barber",
    bio: "Skin fades, beard work and classic men's cuts.",
    hue: 200,
    hours: [hours(h(10), h(18), h(14)), hours(h(10), h(18), h(14)), hours(h(10), h(18), h(14)), hours(h(11), h(20), h(15)), hours(h(10), h(18), h(14)), hours(h(9), h(16), h(12, 30)), null],
  },
  {
    id: "ines",
    name: "Inès Calder",
    role: "Color specialist",
    bio: "Balayage, color correction and blondes that stay healthy.",
    hue: 330,
    hours: [null, hours(h(9), h(17), h(13)), hours(h(9), h(17), h(13)), hours(h(11), h(19), h(15)), hours(h(9), h(17), h(13)), hours(h(9), h(16), h(12, 30)), null],
  },
  {
    id: "ravi",
    name: "Ravi Okafor",
    role: "Stylist",
    bio: "Textured hair, curls and blowouts for events.",
    hue: 150,
    hours: [hours(h(9), h(17), h(13)), null, hours(h(9), h(17), h(13)), hours(h(10), h(19), h(14)), hours(h(9), h(17), h(13)), hours(h(9), h(16), h(12, 30)), null],
  },
  {
    id: "june",
    name: "June Park",
    role: "Junior stylist",
    bio: "Fresh cuts, blowouts and treatments at junior prices.",
    hue: 40,
    hours: [hours(h(9, 30), h(17, 30), h(13, 30)), hours(h(9, 30), h(17, 30), h(13, 30)), hours(h(9, 30), h(17, 30), h(13, 30)), null, hours(h(9, 30), h(17, 30), h(13, 30)), hours(h(9), h(15), h(12)), null],
  },
];

const ALL = STAFF.map((s) => s.id);
const STYLISTS = ["maya", "ines", "ravi", "june"];

export const SERVICES: Service[] = [
  { id: "womens-cut", name: "Cut & finish", category: "Cuts", description: "Consultation, wash, precision cut and a blowout finish.", duration: 60, buffer: 10, price: 85, staffIds: ["maya", "ravi", "june"], active: true, popular: true },
  { id: "mens-cut", name: "Men's cut", category: "Cuts", description: "Scissor or clipper cut, wash and style.", duration: 45, buffer: 5, price: 48, staffIds: ["theo", "ravi", "june"], active: true, popular: true },
  { id: "fringe", name: "Bang trim", category: "Cuts", description: "A quick tidy between appointments.", duration: 15, buffer: 0, price: 15, staffIds: ALL, active: true },
  { id: "kids-cut", name: "Kids' cut", category: "Cuts", description: "Under 12s. Calm, quick and no fuss.", duration: 30, buffer: 5, price: 30, staffIds: ["theo", "june"], active: true },
  { id: "full-color", name: "All-over color", category: "Color", description: "Root-to-tip permanent color with gloss and finish.", duration: 120, buffer: 15, price: 160, staffIds: ["ines", "maya"], active: true },
  { id: "roots", name: "Root touch-up", category: "Color", description: "Regrowth color up to 1 inch, with finish.", duration: 75, buffer: 10, price: 105, staffIds: ["ines", "maya", "ravi"], active: true },
  { id: "balayage", name: "Balayage", category: "Color", description: "Hand-painted lightening, toner and a blowout.", duration: 180, buffer: 15, price: 265, staffIds: ["ines"], active: true, popular: true },
  { id: "gloss", name: "Gloss & tone", category: "Color", description: "Refresh tone and shine between color visits.", duration: 45, buffer: 10, price: 70, staffIds: ["ines", "maya", "ravi"], active: true },
  { id: "blowout", name: "Wash & blowout", category: "Styling", description: "Smooth, bouncy or textured, your call.", duration: 45, buffer: 5, price: 55, staffIds: STYLISTS, active: true },
  { id: "event", name: "Event styling", category: "Styling", description: "Up-dos and special-occasion hair. Trial recommended.", duration: 75, buffer: 10, price: 110, staffIds: ["maya", "ravi"], active: true },
  { id: "skin-fade", name: "Skin fade", category: "Barbering", description: "Foil-shaver fade blended to the length you want.", duration: 45, buffer: 5, price: 50, staffIds: ["theo"], active: true, popular: true },
  { id: "beard", name: "Beard sculpt", category: "Barbering", description: "Shape, line-up and hot-towel finish.", duration: 30, buffer: 5, price: 32, staffIds: ["theo"], active: true },
  { id: "cut-beard", name: "Cut & beard", category: "Barbering", description: "Men's cut with a full beard sculpt.", duration: 75, buffer: 5, price: 72, staffIds: ["theo"], active: true },
  { id: "bond", name: "Bond repair treatment", category: "Treatments", description: "Strengthening treatment for color-treated or heat-styled hair.", duration: 30, buffer: 5, price: 45, staffIds: STYLISTS, active: true },
  { id: "scalp", name: "Scalp ritual", category: "Treatments", description: "Exfoliating scalp treatment and head massage.", duration: 40, buffer: 5, price: 55, staffIds: ["maya", "june"], active: true },
];

/** Small deterministic PRNG so every reset produces the same demo for the same day. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Amelia", "Olivia", "Isla", "Freya", "Ava", "Poppy", "Grace", "Sophie", "Lily", "Ella", "Chloe", "Hannah", "Zara", "Leah", "Nadia", "Priya", "Mei", "Elena", "Clara", "Rosa", "Oliver", "Harry", "Noah", "Jack", "Leo", "Arthur", "Oscar", "Ethan", "Samir", "Tom", "Felix", "Kai", "Daniel", "Marcus", "Hugo", "Luca"];
const LAST = ["Ashdown", "Bramley", "Carrow", "Denholm", "Ellery", "Fairley", "Garside", "Hollis", "Ingram", "Jessop", "Kendal", "Lowther", "Marlow", "Norbury", "Oakley", "Pemberton", "Quarry", "Radley", "Selwood", "Thorne", "Upton", "Vance", "Whitlock", "Yardley", "Ainsworth", "Blythe", "Crane", "Dunmore", "Everly", "Frome"];

/** Weighted service mix per staff member: what they're mostly booked for. */
const MIX: Record<string, [string, number][]> = {
  maya: [["womens-cut", 5], ["full-color", 2], ["roots", 2], ["event", 1], ["blowout", 2], ["gloss", 1], ["scalp", 1], ["fringe", 1]],
  theo: [["mens-cut", 4], ["skin-fade", 5], ["beard", 2], ["cut-beard", 3], ["kids-cut", 2], ["fringe", 1]],
  ines: [["full-color", 4], ["balayage", 3], ["roots", 4], ["gloss", 3], ["blowout", 1], ["bond", 1]],
  ravi: [["womens-cut", 4], ["mens-cut", 2], ["blowout", 3], ["event", 1], ["roots", 1], ["bond", 1], ["gloss", 1]],
  june: [["womens-cut", 3], ["mens-cut", 2], ["blowout", 3], ["kids-cut", 2], ["scalp", 1], ["bond", 1], ["fringe", 1]],
};

function pick<T>(r: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [v, w] of weighted) if ((x -= w) < 0) return v;
  return weighted[0][0];
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function phoneFor(i: number) {
  // 555-0100 to 555-0199 are reserved for fiction.
  return `(718) 555-01${pad(i % 100)}`;
}

function makeClients(r: () => number, today: string): Client[] {
  const used = new Set<string>();
  const out: Client[] = [];
  while (out.length < 96) {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    if (used.has(name)) continue;
    used.add(name);
    const [f, l] = name.toLowerCase().split(" ");
    const i = out.length;
    out.push({
      id: `c${pad(i + 1, 3)}`,
      name,
      email: `${f}.${l}@mail.example`,
      phone: phoneFor(i),
      notes: i % 9 === 0 ? "Prefers a quiet appointment." : i % 13 === 0 ? "Sensitive scalp: patch test before color." : "",
      createdAt: `${addDays(today, -60 - Math.floor(r() * 500))}T10:00:00.000Z`,
    });
  }
  return out;
}

const NOTES = ["", "", "", "", "", "First visit", "Running 5 min late", "Patch test done", "Wants to go shorter", "Bring reference photo"];

export function createSeed(now = Date.now()): DemoState {
  const { date: today, minutes: nowMin } = zonedNow(TIME_ZONE, now);
  const r = rng(Number(today.replaceAll("-", "")));
  const clients = makeClients(r, today);
  const services = structuredClone(SERVICES);
  const staff = structuredClone(STAFF);

  const state: DemoState = {
    version: STATE_VERSION,
    seededOn: today,
    salon: { name: "Halden Hair Studio", timeZone: TIME_ZONE, address: "218 Marlowe Street, Brooklyn, NY", phone: phoneFor(42), currency: "USD" },
    rules: { slotStep: 15, minNotice: 120, maxDaysAhead: 30, cancelHours: 24 },
    services,
    staff,
    timeOff: [
      { id: "off-1", staffId: "ravi", from: addDays(today, 10 - weekday(today)), to: addDays(today, 11 - weekday(today)), reason: "Holiday" },
      { id: "off-2", staffId: "ines", from: addDays(today, 2), to: addDays(today, 2), start: h(9), end: h(12), reason: "Color course" },
      { id: "off-3", staffId: "june", from: addDays(today, -12), to: addDays(today, -11), reason: "Sick leave" },
    ],
    clients,
    bookings: [],
  };

  const byId = new Map(services.map((s) => [s.id, s]));
  let seq = 0;
  // Regulars come back: a third of the clients get most of the visits.
  const client = () => clients[r() < 0.6 ? Math.floor(r() * 32) : Math.floor(r() * clients.length)].id;

  for (let d = -35; d <= 21; d++) {
    const date = addDays(today, d);
    // Upcoming weeks fill up less the further out they are; Saturdays are busiest.
    const base = d < 0 ? 0.8 : d === 0 ? 0.72 : d <= 3 ? 0.55 : d <= 7 ? 0.42 : d <= 14 ? 0.28 : 0.14;
    const fill = Math.min(0.95, base + (weekday(date) === 5 ? 0.1 : 0) + (r() - 0.5) * 0.12);
    for (const person of staff) {
      const day = person.hours[weekday(date)];
      if (!day) continue;
      let t = day.start + (r() < 0.3 ? 15 * Math.floor(r() * 3) : 0);
      while (t < day.end) {
        if (r() > fill) {
          // Free time comes in bookable chunks, not slivers.
          t += [45, 60, 75][Math.floor(r() * 3)];
          continue;
        }
        const service = byId.get(pick(r, MIX[person.id]))!;
        const base = { serviceId: service.id, staffId: person.id, date, start: t, now, enforceRules: false };
        if (checkSlot(state, base)) {
          t += 15;
          continue;
        }
        const end = t + service.duration;
        const past = d < 0 || (d === 0 && end <= nowMin);
        const roll = r();
        const status: Booking["status"] = past ? (roll < 0.035 ? "no-show" : roll < 0.09 ? "cancelled" : "completed") : roll < 0.04 ? "cancelled" : "confirmed";
        const source: BookingSource = r() < 0.68 ? "online" : r() < 0.75 ? "phone" : "walk-in";
        // Booked 1–12 days ahead; anything that would land in the future was made in the last few days instead.
        const lead = 1 + Math.floor(r() * 12);
        let created = zonedToUtc(addDays(date, -lead), h(8) + Math.floor(r() * 13 * 60), TIME_ZONE);
        if (created > now - 600_000) created = now - 600_000 - Math.floor(r() * 4 * 86_400_000);
        seq++;
        state.bookings.push({
          id: `bk${pad(seq, 4)}`,
          ref: refFor(seq),
          token: Math.floor(r() * 2 ** 48).toString(36),
          serviceId: service.id,
          staffId: person.id,
          clientId: client(),
          date,
          start: t,
          end,
          status,
          price: service.price,
          source,
          anyStaff: source === "online" && r() < 0.3,
          notes: NOTES[Math.floor(r() * NOTES.length)],
          createdAt: new Date(created).toISOString(),
        });
        t = end + service.buffer;
        // Round up to the quarter hour like a real appointment book.
        t = Math.ceil(t / 15) * 15;
      }
    }
  }
  return state;
}

/** Short, readable booking reference: HD-7K3Q. No 0/O or 1/I to misread. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function refFor(n: number) {
  let x = (n * 2654435761) % 1048576;
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += ALPHABET[x % 32];
    x = Math.floor(x / 32);
  }
  return `HD-${s}`;
}
