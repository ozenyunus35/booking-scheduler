"use client";

import { CalendarPlus, CalendarX2, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { cancelBooking, canChangeOnline, findBooking, findByToken, moveBooking } from "@/lib/api";
import { formatDayLong, formatTime, zoneAbbr, zoneCity } from "@/lib/dates";
import { update, useStore } from "@/lib/store";
import type { DemoState } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Badge, Button, Field, Modal, Spinner, cx, inputClass } from "../ui";
import { BookingCard, downloadIcs } from "./confirmation";
import { DemoBar, SalonHeader } from "./site-header";
import { TimePicker, type TimeChoice } from "./time-picker";

const STATUS_TEXT = { confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", "no-show": "Missed" } as const;

export function ManagePage() {
  const s = useStore();
  const now = useNow();
  const { toast } = useToast();
  const token = useSearchParams().get("b");
  const [foundId, setFoundId] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [pick, setPick] = useState<TimeChoice | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!s || !now) return <Spinner label="Loading your booking" />;

  const booking = foundId ? s.bookings.find((b) => b.id === foundId) : token ? findByToken(s, token) : null;
  const changeable = booking ? canChangeOnline(s, booking, now) : false;

  const run = (fn: (d: DemoState) => { ok: boolean; error?: string }, done: string) => {
    let r: { ok: boolean; error?: string } | undefined;
    update((d) => {
      r = fn(d);
    });
    if (r?.ok) {
      toast(done);
      setMode("view");
      setPick(null);
    } else if (r) toast(r.error ?? "That didn't work.", "error");
  };

  return (
    <>
      <DemoBar />
      <SalonHeader state={s} now={now} compact />
      <main id="main" className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        {!booking ? (
          <div className="animate-enter">
            <h1 className="text-xl font-semibold tracking-[-0.015em]">Manage a booking</h1>
            <p className="mt-1 text-muted">{token ? "That booking link isn't valid any more. Look the booking up instead." : "Enter the reference from your confirmation and the email you booked with."}</p>
            <form
              className="mt-5 space-y-4 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5"
              onSubmit={(e) => {
                e.preventDefault();
                const b = findBooking(s, ref, email);
                setLookupError(b ? null : "We couldn't find a booking with that reference and email.");
                if (b) setFoundId(b.id);
              }}
            >
              <Field label="Booking reference" hint="Looks like HD-7K3Q.">
                {(id, d) => <input id={id} aria-describedby={d} value={ref} onChange={(e) => setRef(e.target.value)} className={cx(inputClass, "h-9 font-mono uppercase")} autoComplete="off" />}
              </Field>
              <Field label="Email" error={lookupError ?? undefined}>
                {(id, d) => <input id={id} type="email" aria-describedby={d} aria-invalid={!!lookupError} value={email} onChange={(e) => setEmail(e.target.value)} className={cx(inputClass, "h-9")} autoComplete="email" />}
              </Field>
              <Button type="submit" variant="primary" className="h-9 w-full">
                <Search /> Find booking
              </Button>
            </form>
            <p className="mt-4 text-center text-muted">
              Want a new appointment instead?{" "}
              <Link href="/" className="font-medium text-accent hover:underline">
                Book online
              </Link>
            </p>
          </div>
        ) : mode === "reschedule" ? (
          <div className="animate-enter">
            <h1 className="text-xl font-semibold tracking-[-0.015em]">Pick a new time</h1>
            <p className="mt-1 text-muted">
              Now: {formatDayLong(booking.date)}, {formatTime(booking.start)} {zoneAbbr(s.salon.timeZone)}. Same service, same professional. Times are in salon time ({zoneCity(s.salon.timeZone)}).
            </p>
            <div className="mt-5 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
              <TimePicker state={s} serviceId={booking.serviceId} staffId={booking.anyStaff ? "any" : booking.staffId} now={now} value={pick} onChange={setPick} ignoreBookingId={booking.id} />
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="h-9 flex-1" onClick={() => setMode("view")}>
                Back
              </Button>
              <Button
                variant="primary"
                className="h-9 flex-1"
                disabled={!pick}
                onClick={() => pick && run((d) => moveBooking(d, booking.id, { date: pick.date, start: pick.start, staffId: booking.anyStaff ? "any" : booking.staffId }, Date.now(), true), `Moved to ${formatDayLong(pick.date)}, ${formatTime(pick.start)}.`)}
              >
                {pick ? `Move to ${formatTime(pick.start)}` : "Choose a time"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="animate-enter">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold tracking-[-0.015em]">Your booking</h1>
              <Badge tone={booking.status === "confirmed" ? "accent" : booking.status === "completed" ? "success" : booking.status === "no-show" ? "danger" : "neutral"}>{STATUS_TEXT[booking.status]}</Badge>
            </div>
            <BookingCard state={s} booking={booking} className={cx(booking.status === "cancelled" && "opacity-60")} />
            {booking.status === "confirmed" && (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Button className="h-9" onClick={() => downloadIcs(s, booking)}>
                    <CalendarPlus /> Add to calendar
                  </Button>
                  <Button className="h-9" disabled={!changeable} onClick={() => setMode("reschedule")}>
                    Reschedule
                  </Button>
                  <Button className="h-9 text-danger" disabled={!changeable} onClick={() => setConfirmCancel(true)}>
                    <CalendarX2 /> Cancel
                  </Button>
                </div>
                <p className="mt-3 text-center text-xs text-muted">
                  {changeable
                    ? `You can change or cancel online until ${s.rules.cancelHours} hours before.`
                    : `Online changes close ${s.rules.cancelHours} hours before the appointment. Please call ${s.salon.phone}.`}
                </p>
              </>
            )}
            {booking.status === "cancelled" && (
              <p className="mt-4 text-center text-muted">
                This booking was cancelled.{" "}
                <Link href="/" className="font-medium text-accent hover:underline">
                  Book a new time
                </Link>
              </p>
            )}
          </div>
        )}
      </main>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this booking?"
        footer={
          <>
            <Button onClick={() => setConfirmCancel(false)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmCancel(false);
                if (booking) run((d) => cancelBooking(d, booking.id, Date.now(), true), "Your booking was cancelled.");
              }}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <p className="text-muted">The time goes back on the booking page for other clients. There is no fee for cancelling online.</p>
      </Modal>
    </>
  );
}
