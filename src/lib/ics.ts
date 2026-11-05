import { zonedToUtc } from "./dates";
import type { Booking, Salon, Staff } from "./types";

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** RFC 5545 text: backslash, semicolon and comma escaped, newlines as \n. */
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** RFC 5545 folds lines longer than 75 octets: CRLF and a space, without splitting a character. */
function fold(line: string) {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** An iCalendar file for one appointment, in UTC so every calendar app places it correctly. */
/** `title` is the visit, e.g. "Full color + Cut & finish". */
export function bookingIcs(b: Booking, title: string, staff: Staff, salon: Salon, manageUrl: string, now = Date.now()) {
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
    `SUMMARY:${esc(`${title} with ${staff.name.split(" ")[0]}`)}`,
    `LOCATION:${esc(`${salon.name}, ${salon.address}`)}`,
    `DESCRIPTION:${esc(`Booking ${b.ref}. Change or cancel: ${manageUrl}`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")
    .concat("\r\n");
}
