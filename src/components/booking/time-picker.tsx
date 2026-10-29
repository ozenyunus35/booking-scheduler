"use client";

import { CalendarX2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bookingWindow, getSlots, slotCounts, type Slot } from "@/lib/availability";
import { addDays, diffDays, formatDay, formatTime, monthLong, weekdayShort } from "@/lib/dates";
import type { DemoState, ISODate } from "@/lib/types";
import { cx } from "../ui";

export interface TimeChoice {
  date: ISODate;
  start: number;
}

const PARTS = [
  { label: "Morning", from: 0, to: 720 },
  { label: "Afternoon", from: 720, to: 1020 },
  { label: "Evening", from: 1020, to: 1440 },
];

/** Date strip plus the free start times on the chosen day, straight from the availability engine. */
export function TimePicker({
  state,
  serviceId,
  staffId,
  now,
  value,
  onChange,
  ignoreBookingId,
}: {
  state: DemoState;
  serviceId: string;
  staffId: string;
  now: number;
  value: TimeChoice | null;
  onChange: (p: TimeChoice, slot: Slot) => void;
  ignoreBookingId?: string;
}) {
  const w = bookingWindow(state, now);
  const total = diffDays(w.lastDate, w.today) + 1;
  const counts = useMemo(() => slotCounts(state, { serviceId, staffId, now, ignoreBookingId }, w.today, total), [state, serviceId, staffId, now, ignoreBookingId, w.today, total]);
  const firstOpen = Object.keys(counts).find((d) => counts[d] > 0) ?? w.today;
  const [date, setDate] = useState<ISODate>(value?.date ?? firstOpen);
  const strip = useRef<HTMLDivElement>(null);

  // A new service or person can leave the chosen day empty: jump to their first open day.
  const key = `${serviceId}|${staffId}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setDate(value?.date && counts[value.date] ? value.date : firstOpen);
  }

  useEffect(() => {
    strip.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [date]);

  const slots = useMemo(() => getSlots(state, { serviceId, staffId, date, now, ignoreBookingId }), [state, serviceId, staffId, date, now, ignoreBookingId]);
  const nextOpen = Object.keys(counts).find((d) => d > date && counts[d] > 0);
  const scroll = (dir: number) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium" aria-live="polite">
          {monthLong(date)}
        </p>
        <div className="flex gap-1">
          <button type="button" onClick={() => scroll(-1)} className="rounded-md border border-border p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Earlier dates">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => scroll(1)} className="rounded-md border border-border p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Later dates">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div ref={strip} className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pt-0.5 pb-2 [scrollbar-width:none]" role="group" aria-label="Dates">
        {Array.from({ length: total }, (_, i) => {
          const d = addDays(w.today, i);
          const n = counts[d] ?? 0;
          const on = d === date;
          return (
            <button
              key={d}
              type="button"
              disabled={!n}
              onClick={() => setDate(d)}
              aria-pressed={on}
              aria-label={`${formatDay(d)}, ${n ? `${n} times free` : "fully booked or closed"}`}
              className={cx(
                "flex w-[52px] shrink-0 snap-start flex-col items-center rounded-lg border py-2 transition-colors duration-150",
                on ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface hover:border-border-strong",
                !n && "cursor-not-allowed opacity-40",
              )}
            >
              <span className={cx("text-[11px]", on ? "text-accent-fg/80" : "text-muted")}>{i === 0 ? "Today" : weekdayShort(d)}</span>
              <span className="text-[15px] leading-6 font-semibold tabular-nums">{Number(d.slice(8))}</span>
              <span className={cx("mt-0.5 h-1 w-4 rounded-full", !n ? "bg-transparent" : on ? "bg-accent-fg/70" : n > 12 ? "bg-success" : "bg-warning")} aria-hidden />
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-4" aria-live="polite">
        {slots.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <CalendarX2 className="mb-2 size-5 text-faint" aria-hidden />
            <p className="font-medium">No free times on {formatDay(date)}</p>
            {nextOpen ? (
              <button type="button" onClick={() => setDate(nextOpen)} className="mt-2 font-medium text-accent hover:underline">
                Next opening: {formatDay(nextOpen)}
              </button>
            ) : (
              <p className="mt-1 text-muted">Nothing free in the next {total} days.</p>
            )}
          </div>
        ) : (
          PARTS.map((part) => {
            const list = slots.filter((s) => s.start >= part.from && s.start < part.to);
            if (!list.length) return null;
            return (
              <div key={part.label}>
                <p className="mb-2 text-xs text-muted">
                  {part.label} <span className="text-faint">· {list.length}</span>
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 xl:grid-cols-5">
                  {list.map((s) => {
                    const on = value?.date === date && value.start === s.start;
                    return (
                      <button
                        key={s.start}
                        type="button"
                        onClick={() => onChange({ date, start: s.start }, s)}
                        aria-pressed={on}
                        className={cx(
                          "h-9 rounded-md border text-[13px] font-medium tabular-nums transition-colors duration-150",
                          on ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface hover:border-accent hover:text-accent",
                        )}
                      >
                        {formatTime(s.start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
