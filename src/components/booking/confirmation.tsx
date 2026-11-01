"use client";

import { ArrowUpRight, CalendarPlus, CheckCircle2, Copy, Settings2 } from "lucide-react";
import Link from "next/link";
import { formatDayLong, formatDuration, formatTime, zoneAbbr } from "@/lib/dates";
import { firstName, money } from "@/lib/format";
import { bookingIcs } from "@/lib/ics";
import type { Booking, DemoState } from "@/lib/types";
import { useToast } from "../toast";
import { Avatar, Button, cx } from "../ui";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const manageUrl = (b: Booking) => `${window.location.origin}${BASE}/manage/?b=${b.token}`;

export function downloadIcs(state: DemoState, b: Booking) {
  const service = state.services.find((s) => s.id === b.serviceId)!;
  const staff = state.staff.find((p) => p.id === b.staffId)!;
  const blob = new Blob([bookingIcs(b, service, staff, state.salon, manageUrl(b))], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `halden-${b.ref.toLowerCase()}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The appointment as a card: used on the confirmation and the manage page. */
export function BookingCard({ state, booking, className }: { state: DemoState; booking: Booking; className?: string }) {
  const service = state.services.find((s) => s.id === booking.serviceId);
  const staff = state.staff.find((p) => p.id === booking.staffId);
  return (
    <div className={cx("rounded-xl border border-border bg-surface shadow-card", className)}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        {staff && <Avatar name={staff.name} size={36} />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{service?.name}</p>
          <p className="text-muted">
            with {staff?.name}
            {booking.anyStaff && <span className="text-faint"> · assigned for you</span>}
          </p>
        </div>
        <p className="font-mono text-xs text-muted">{booking.ref}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5">
        <div className="col-span-2">
          <dt className="text-xs text-muted">When</dt>
          <dd className="font-medium">
            {formatDayLong(booking.date)}, {formatTime(booking.start)} – {formatTime(booking.end)} {zoneAbbr(state.salon.timeZone)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Duration</dt>
          <dd className="font-medium">{formatDuration(booking.end - booking.start)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Price</dt>
          <dd className="font-medium tabular-nums">{money(booking.price)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted">Where</dt>
          <dd className="font-medium">
            {state.salon.name}, {state.salon.address}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function Confirmation({ state, booking, onAgain }: { state: DemoState; booking: Booking; onAgain: () => void }) {
  const { toast } = useToast();
  const client = state.clients.find((c) => c.id === booking.clientId);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(manageUrl(booking));
      toast("Booking link copied.");
    } catch {
      toast("Couldn't copy the link.", "error");
    }
  };
  return (
    <main id="main" className="mx-auto max-w-xl animate-rise px-4 py-10 sm:py-14">
      <div className="mb-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-9 text-success" strokeWidth={1.75} aria-hidden />
        <h1 className="text-xl font-semibold tracking-[-0.015em]">You&apos;re booked{client ? `, ${firstName(client.name)}` : ""}</h1>
        <p className="mt-1 text-muted">A confirmation would go to {client?.email ?? "your email"}. In this demo nothing is sent.</p>
      </div>

      <BookingCard state={state} booking={booking} />

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button className="h-9" onClick={() => downloadIcs(state, booking)}>
          <CalendarPlus /> Add to calendar
        </Button>
        <Link href={`/manage/?b=${booking.token}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-surface font-medium shadow-card hover:bg-surface-2 [&_svg]:size-3.5">
          <Settings2 /> Reschedule or cancel
        </Link>
      </div>
      <button onClick={copy} className="mx-auto mt-3 flex items-center gap-1.5 text-xs text-muted hover:text-text">
        <Copy className="size-3.5" aria-hidden /> Copy booking link
      </button>

      <div className="mt-8 rounded-lg border border-dashed border-border px-4 py-3 text-muted">
        <p className="font-medium text-text">See it from the salon side</p>
        <p className="mt-0.5">The booking is already in the staff calendar, and it arrives live if the calendar is open in another tab.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/admin/?date=${booking.date}&focus=${booking.id}`} target="_blank" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 font-medium text-accent-fg hover:bg-accent/90 [&_svg]:size-3.5">
            Open salon calendar <ArrowUpRight />
          </Link>
          <Button size="sm" variant="ghost" onClick={onAgain}>
            Book another appointment
          </Button>
        </div>
      </div>
    </main>
  );
}
