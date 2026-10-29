import { zonedToUtc } from "./dates";
import type { Booking, Salon, Service, Staff } from "./types";

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** An iCalendar file for one appointment, in UTC so every calendar app places it correctly. */
export function bookingIcs(b: Booking, service: Service, staff: Staff, salon: Salon, manageUrl: string, now = Date.now()) {
  const start = zonedToUtc(b.date, b.start, salon.timeZone);
  const end = zonedToUtc(b.date, b.end, salon.timeZone);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cadence//Booking demo//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@cadence.example`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${service.name} with ${staff.name.split(" ")[0]}`)}`,
    `LOCATION:${esc(`${salon.name}, ${salon.address}`)}`,
    `DESCRIPTION:${esc(`Booking ${b.ref}. Change or cancel: ${manageUrl}`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
