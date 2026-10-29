"use client";

import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { bookingWindow } from "@/lib/availability";
import { addDays, formatHour, formatTime, weekday, weekdayShort } from "@/lib/dates";
import type { DemoState, ISODate } from "@/lib/types";
import { CadenceMark, HaldenMark } from "../brand";
import { ThemeToggle } from "../theme-toggle";
import { cx } from "../ui";

/** Salon opening hours on a date: the earliest start and latest end across the team. */
export function openingHours(s: DemoState, date: ISODate) {
  const days = s.staff.map((p) => p.hours[weekday(date)]).filter((d) => d !== null);
  if (!days.length) return null;
  return { start: Math.min(...days.map((d) => d.start)), end: Math.max(...days.map((d) => d.end)) };
}

const hourLabel = (m: number) => (m % 60 ? formatTime(m) : formatHour(m));

function OpenStatus({ state, now }: { state: DemoState; now: number }) {
  const { today, nowMinutes } = bookingWindow(state, now);
  const hours = openingHours(state, today);
  let text: string;
  let open = false;
  if (hours && nowMinutes >= hours.start && nowMinutes < hours.end) {
    open = true;
    text = `Open now · until ${hourLabel(hours.end)}`;
  } else {
    let next = hours && nowMinutes < hours.start ? { date: today, h: hours } : null;
    for (let i = 1; !next && i < 8; i++) {
      const h = openingHours(state, addDays(today, i));
      if (h) next = { date: addDays(today, i), h };
    }
    text = next ? `Closed · opens ${next.date === today ? "" : `${weekdayShort(next.date)} `}${hourLabel(next.h.start)}` : "Closed";
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("size-1.5 rounded-full", open ? "bg-success" : "bg-faint")} aria-hidden />
      {text}
    </span>
  );
}

export function DemoBar() {
  return (
    <div className="border-b border-border bg-surface-2/60">
      <div className="mx-auto flex h-9 max-w-6xl items-center gap-2 px-4 text-xs text-muted sm:px-6">
        <CadenceMark size={16} />
        <span className="truncate">
          <span className="font-medium text-text">Cadence</span> booking demo<span className="hidden sm:inline"> · fictional salon, synthetic data</span>
        </span>
        <Link href="/admin/" target="_blank" className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-text hover:text-accent">
          Salon calendar <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function SalonHeader({ state, now, compact }: { state: DemoState; now: number; compact?: boolean }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className={cx("mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 sm:px-6", compact ? "py-4" : "py-6 sm:py-8")}>
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <HaldenMark size={compact ? 36 : 44} />
          <div className="min-w-0">
            <p className={cx("font-semibold tracking-[-0.015em]", compact ? "text-[15px]" : "text-lg sm:text-xl")}>{state.salon.name}</p>
            <p className="text-muted">Hair salon & barber</p>
          </div>
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted sm:ml-auto">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 text-faint" aria-hidden />
            {state.salon.address}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5 text-faint" aria-hidden />
            <OpenStatus state={state} now={now} />
          </span>
          <Link href="/manage/" className="font-medium text-text hover:text-accent">
            Manage a booking
          </Link>
        </div>
      </div>
    </header>
  );
}
