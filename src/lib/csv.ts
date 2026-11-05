import { bookingTitle } from "./availability";
import { formatTime } from "./dates";
import type { DemoState, ISODate } from "./types";

/**
 * CSV exports for the salon. Cells are quoted when they need it, and a cell that starts with
 * = + - @ (or a tab or carriage return) gets a leading apostrophe, so a spreadsheet never runs
 * a client's note as a formula.
 */

export function cell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows joined with CRLF, with a BOM so Excel reads UTF-8 names correctly. */
export const toCsv = (rows: (string | number | null | undefined)[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export function bookingsCsv(s: DemoState, from: ISODate, to: ISODate): string {
  const rows = s.bookings
    .filter((b) => b.date >= from && b.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  return toCsv([
    ["Reference", "Date", "Start", "End", "Service", "Professional", "Client", "Email", "Phone", "Status", "Source", "Price", "Series", "Notes"],
    ...rows.map((b) => {
      const client = s.clients.find((c) => c.id === b.clientId);
      return [
        b.ref,
        b.date,
        formatTime(b.start),
        formatTime(b.end),
        bookingTitle(s, b),
        s.staff.find((p) => p.id === b.staffId)?.name ?? "",
        client?.name ?? "",
        client?.email ?? "",
        client?.phone ?? "",
        b.status,
        b.source,
        b.price,
        b.seriesId ? "yes" : "",
        b.notes,
      ];
    }),
  ]);
}

export function clientsCsv(s: DemoState): string {
  return toCsv([
    ["Name", "Email", "Phone", "Visits", "No-shows", "Last visit", "Client since", "Notes"],
    ...[...s.clients]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const mine = s.bookings.filter((b) => b.clientId === c.id);
        const done = mine.filter((b) => b.status === "completed");
        const last = done.map((b) => b.date).sort().at(-1) ?? "";
        return [c.name, c.email, c.phone, done.length, mine.filter((b) => b.status === "no-show").length, last, c.createdAt.slice(0, 10), c.notes];
      }),
  ]);
}

/** Starts a download of a text file in the browser. */
export function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
