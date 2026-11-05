"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Globe, Keyboard, Plus, Repeat } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { bookingServiceIds, bookingTitle, bookingWindow, checkSlot, isLive, offReason, workingMinutes } from "@/lib/availability";
import { moveBooking, reasonText } from "@/lib/api";
import { addDays, formatDayLong, formatHour, formatTime, startOfWeek, weekday, weekdayShort } from "@/lib/dates";
import { firstName, money, pct } from "@/lib/format";
import { update, useStore } from "@/lib/store";
import type { Booking, DemoState, ISODate, Staff } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Avatar, Button, Modal, Spinner, cx } from "../ui";
import { isFresh } from "./arrivals";
import { BookingDetails, NewBooking, inlineSelectClass, type NewBookingDraft } from "./booking-dialogs";

const PX = 1.5; // pixels per minute
const SNAP = 15;

const STATUS_CLASS: Record<Booking["status"], string> = {
  confirmed: "bg-accent-soft border-accent text-text",
  completed: "bg-surface-2 border-border-strong text-muted",
  "no-show": "bg-danger-soft border-danger text-muted",
  cancelled: "bg-transparent border-border text-faint border-dashed",
};

/** ?date=…&focus=… from the confirmation page's "Open salon calendar" link. */
function useParams() {
  const p = useSearchParams();
  const date = p.get("date");
  return { date: date && /^\d{4}-\d\d-\d\d$/.test(date) ? date : null, focus: p.get("focus") };
}

/** The hours the grid shows for a set of dates: the team's earliest start to latest finish, on whole hours. */
function gridRange(s: DemoState, dates: ISODate[]) {
  let start = 24 * 60;
  let end = 0;
  for (const d of dates)
    for (const p of s.staff) {
      const h = p.hours[weekday(d)];
      if (h) {
        start = Math.min(start, h.start);
        end = Math.max(end, h.end);
      }
    }
  if (end <= start) return { start: 9 * 60, end: 18 * 60 };
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}

function Gutter({ range }: { range: { start: number; end: number } }) {
  const hours = [];
  for (let t = range.start; t < range.end; t += 60) hours.push(t);
  return (
    <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-border bg-surface" aria-hidden>
      {hours.map((t) => (
        <div key={t} className="relative text-right" style={{ height: 60 * PX }}>
          <span className="absolute -top-2 right-2 text-[11px] text-faint tabular-nums">{t === range.start ? "" : formatHour(t)}</span>
        </div>
      ))}
    </div>
  );
}

function HourLines({ range }: { range: { start: number; end: number } }) {
  const rows = [];
  for (let t = range.start; t < range.end; t += 30) rows.push(t);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {rows.map((t) => (
        <div key={t} className={cx("border-t", t % 60 ? "border-dashed border-border/60" : "border-border")} style={{ height: 30 * PX }} />
      ))}
    </div>
  );
}

/** Greyed-out time when someone isn't available: outside hours, breaks, part-day time off. */
function Unavailable({ s, staff, date, range, compact }: { s: DemoState; staff: Staff; date: ISODate; range: { start: number; end: number }; compact?: boolean }) {
  const off = offReason(s, staff, date);
  if (off) {
    const t = s.timeOff.find((x) => x.staffId === staff.id && date >= x.from && date <= x.to && x.start == null);
    return (
      <div className="hatch absolute inset-0 bg-surface-2/60">
        {!compact && <p className="sticky top-2 mx-2 mt-2 rounded-md bg-surface px-2 py-1 text-center text-xs text-muted shadow-card">{t ? t.reason : "Day off"}</p>}
      </div>
    );
  }
  const h = staff.hours[weekday(date)]!;
  const blocks: { start: number; end: number; label?: string }[] = [];
  if (h.start > range.start) blocks.push({ start: range.start, end: h.start });
  if (h.end < range.end) blocks.push({ start: h.end, end: range.end });
  for (const b of h.breaks) blocks.push({ ...b, label: "Break" });
  for (const t of s.timeOff) if (t.staffId === staff.id && date >= t.from && date <= t.to && t.start != null && t.end != null) blocks.push({ start: t.start, end: t.end, label: t.reason });
  return (
    <>
      {blocks.map((b, i) => (
        <div key={i} className="hatch absolute inset-x-0 bg-surface-2/60" style={{ top: (b.start - range.start) * PX, height: (b.end - b.start) * PX }}>
          {b.label && !compact && <span className="absolute top-1 left-2 text-[11px] text-faint">{b.label}</span>}
        </div>
      ))}
    </>
  );
}

function Appointment({ s, b, top, compact, onOpen, onPointerDown, dragging }: { s: DemoState; b: Booking; top: number; compact?: boolean; onOpen: () => void; onPointerDown?: (e: React.PointerEvent) => void; dragging?: boolean }) {
  const ids = bookingServiceIds(b);
  const lastService = s.services.find((x) => x.id === ids[ids.length - 1]);
  const title = bookingTitle(s, b);
  const client = s.clients.find((c) => c.id === b.clientId);
  // Two or more no-shows: worth a confirmation call.
  const noShows = s.bookings.filter((x) => x.clientId === b.clientId && x.status === "no-show").length;
  const h = (b.end - b.start) * PX;
  const buffer = b.status === "cancelled" ? 0 : (lastService?.buffer ?? 0) * PX;
  return (
    <>
      <button
        type="button"
        data-booking={b.id}
        onClick={onOpen}
        onPointerDown={onPointerDown}
        title={`${formatTime(b.start)}–${formatTime(b.end)} · ${client?.name} · ${title}`}
        className={cx(
          "absolute z-[1] overflow-hidden rounded-md border-l-2 text-left text-xs leading-4 transition-[opacity,box-shadow] duration-150 hover:z-[2] hover:shadow-pop",
          compact ? "inset-x-0.5" : "inset-x-1 px-2 py-1",
          STATUS_CLASS[b.status],
          b.status === "cancelled" && "border",
          dragging && "opacity-30",
          isFresh(b.id) && "arrived",
          b.status === "confirmed" && onPointerDown && "cursor-grab touch-none active:cursor-grabbing",
        )}
        style={{ top, height: Math.max(h - 2, 14) }}
      >
        {compact ? (
          <span className="sr-only">
            {client?.name}, {title}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1 truncate font-medium text-text">
              {b.source === "online" && <Globe className="size-3 shrink-0 text-accent" aria-label="Booked online" />}
              {b.seriesId && <Repeat className="size-3 shrink-0 text-muted" aria-label="Repeating appointment" />}
              {noShows >= 2 && b.status === "confirmed" && <AlertTriangle className="size-3 shrink-0 text-danger" aria-label={`${noShows} no-shows before`} />}
              <span className="truncate">{client?.name}</span>
            </span>
            {h >= 34 && <span className="block truncate">{title}</span>}
            {h >= 50 && (
              <span className="block truncate text-faint tabular-nums">
                {formatTime(b.start)} – {formatTime(b.end)}
              </span>
            )}
          </>
        )}
      </button>
      {buffer > 0 && !compact && <div className="hatch pointer-events-none absolute inset-x-1 rounded-b-md opacity-70" style={{ top: top + h - 2, height: buffer }} aria-hidden />}
    </>
  );
}

function NowLine({ s, now, date, range }: { s: DemoState; now: number; date: ISODate; range: { start: number; end: number } }) {
  const { today, nowMinutes } = bookingWindow(s, now);
  if (date !== today || nowMinutes < range.start || nowMinutes > range.end) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-[3] border-t border-danger" style={{ top: (nowMinutes - range.start) * PX }} aria-hidden>
      <span className="absolute -top-[3px] -left-[3px] size-[5px] rounded-full bg-danger" />
    </div>
  );
}

interface Drag {
  id: string;
  pointerId: number;
  x0: number;
  y0: number;
  moved: boolean;
  staffId: string;
  start: number;
}

function DayView({ s, now, date, range, showCancelled, onOpen, onCreate }: { s: DemoState; now: number; date: ISODate; range: { start: number; end: number }; showCancelled: boolean; onOpen: (id: string) => void; onCreate: (d: NewBookingDraft) => void }) {
  const { toast } = useToast();
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // A drag ends with a click on the appointment; swallow that one so it doesn't open the details.
  const suppressClick = useRef(false);
  const bookings = s.bookings.filter((b) => b.date === date && (showCancelled || b.status !== "cancelled"));

  const target = (e: React.PointerEvent, d: Drag) => {
    const rect = cols.current!.getBoundingClientRect();
    const i = Math.max(0, Math.min(s.staff.length - 1, Math.floor(((e.clientX - rect.left) / rect.width) * s.staff.length)));
    const b = s.bookings.find((x) => x.id === d.id)!;
    const start = Math.round((b.start + (e.clientY - d.y0) / PX) / SNAP) * SNAP;
    return { staffId: s.staff[i].id, start: Math.max(range.start, Math.min(range.end - (b.end - b.start), start)) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4;
    if (!moved) return;
    setDrag({ ...drag, moved, ...target(e, drag) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (!drag.moved) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const b = s.bookings.find((x) => x.id === drag.id)!;
    if (b.staffId === drag.staffId && b.start === drag.start) return;
    let r: ReturnType<typeof moveBooking> | undefined;
    update((d) => {
      r = moveBooking(d, drag.id, { date, start: drag.start, staffId: drag.staffId }, Date.now(), false);
    });
    if (r?.ok) toast(`Moved to ${formatTime(drag.start)} with ${firstName(s.staff.find((p) => p.id === drag.staffId)!.name)}.`);
    else if (r) toast(r.error, "error");
  };

  const dragged = drag?.moved ? s.bookings.find((x) => x.id === drag.id) : undefined;
  const dragReason = dragged && drag ? checkSlot(s, { serviceId: dragged.serviceId, staffId: drag.staffId, date, start: drag.start, now, ignoreBookingId: dragged.id, enforceRules: false }) : null;

  const create = (e: React.MouseEvent<HTMLDivElement>, staff: Staff) => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const start = range.start + Math.floor(y / PX / SNAP) * SNAP;
    onCreate({ date, start, staffId: staff.id });
  };

  return (
    <div className="flex min-w-max" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
      <Gutter range={range} />
      <div ref={cols} className="relative flex flex-1">
        {s.staff.map((p) => (
          <div key={p.id} className="relative min-w-[150px] flex-1 border-r border-border last:border-r-0" style={{ height: (range.end - range.start) * PX }}>
            <HourLines range={range} />
            <Unavailable s={s} staff={p} date={date} range={range} />
            <div className="absolute inset-0" onClick={(e) => create(e, p)} role="presentation" />
            {bookings
              .filter((b) => b.staffId === p.id)
              .map((b) => (
                <Appointment
                  key={b.id}
                  s={s}
                  b={b}
                  top={(b.start - range.start) * PX}
                  dragging={drag?.moved && drag.id === b.id}
                  onOpen={() => !suppressClick.current && onOpen(b.id)}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (b.status !== "confirmed") return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDrag({ id: b.id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, staffId: b.staffId, start: b.start });
                  }}
                />
              ))}
            {dragged && drag?.staffId === p.id && (
              <div
                className={cx("pointer-events-none absolute inset-x-1 z-[4] rounded-md border-2 border-dashed px-2 py-1 text-xs font-medium", dragReason ? "border-danger bg-danger-soft text-danger" : "border-accent bg-accent-soft text-accent")}
                style={{ top: (drag.start - range.start) * PX, height: (dragged.end - dragged.start) * PX - 2 }}
              >
                {formatTime(drag.start)}
                {dragReason && <span className="block font-normal">{reasonText(s, dragReason, p.id)}</span>}
              </div>
            )}
          </div>
        ))}
        <NowLine s={s} now={now} date={date} range={range} />
      </div>
    </div>
  );
}

function WeekView({ s, now, week, range, staffId, showCancelled, onOpen, onCreate }: { s: DemoState; now: number; week: ISODate[]; range: { start: number; end: number }; staffId: string; showCancelled: boolean; onOpen: (id: string) => void; onCreate: (d: NewBookingDraft) => void }) {
  const team = staffId === "all" ? s.staff : s.staff.filter((p) => p.id === staffId);
  return (
    <div className="flex min-w-max">
      <Gutter range={range} />
      <div className="flex flex-1">
        {week.map((date) => (
          <div key={date} className="relative flex min-w-[120px] flex-1 border-r border-border last:border-r-0" style={{ height: (range.end - range.start) * PX }}>
            <HourLines range={range} />
            {team.map((p) => (
              <div key={p.id} className="relative flex-1 border-r border-border/40 last:border-r-0">
                <Unavailable s={s} staff={p} date={date} range={range} compact={team.length > 1} />
                {team.length === 1 && (
                  <div
                    className="absolute inset-0"
                    role="presentation"
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      onCreate({ date, start: range.start + Math.floor(y / PX / SNAP) * SNAP, staffId: p.id });
                    }}
                  />
                )}
                {s.bookings
                  .filter((b) => b.date === date && b.staffId === p.id && (showCancelled || b.status !== "cancelled"))
                  .map((b) => (
                    <Appointment key={b.id} s={s} b={b} top={(b.start - range.start) * PX} compact={team.length > 1} onOpen={() => onOpen(b.id)} />
                  ))}
              </div>
            ))}
            <NowLine s={s} now={now} date={date} range={range} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnHeader({ title, sub, avatar, active, onClick }: { title: string; sub: string; avatar?: string; active?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cx("flex min-w-0 flex-1 items-center gap-2 border-r border-border px-3 py-2 text-left last:border-r-0", onClick && "hover:bg-surface-2")}>
      {avatar && <Avatar name={avatar} size={26} />}
      <span className="min-w-0">
        <span className={cx("block truncate font-medium", active && "text-accent")}>{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
    </Tag>
  );
}

export function Calendar() {
  const s = useStore();
  const now = useNow();
  const params = useParams();
  const [view, setView] = useState<"day" | "week">("day");
  const [picked, setPicked] = useState<ISODate | null>(params.date);
  const [staffId, setStaffId] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [open, setOpen] = useState<string | null>(params.focus);
  const [draft, setDraft] = useState<NewBookingDraft | null>(null);
  const [help, setHelp] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ready = !!s && !!now;

  const today = s && now ? bookingWindow(s, now).today : "";
  const date = picked ?? today;
  const week = useMemo(() => (date ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : []), [date]);

  // Open on the current time (or the first appointment of another day) rather than the top of the grid.
  useEffect(() => {
    if (!ready || !scroller.current) return;
    const st = s!;
    const r = gridRange(st, [date]);
    const first = st.bookings.filter((b) => b.date === date && b.status !== "cancelled").reduce((m, b) => Math.min(m, b.start), r.end);
    const focus = st.bookings.find((b) => b.id === params.focus);
    const at = focus ? focus.start : date === today ? bookingWindow(st, now).nowMinutes : first;
    scroller.current.scrollTop = Math.max(0, (at - r.start) * PX - 140);
    // Only when the day or view changes, not on every data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, date, view]);

  // Keyboard: T today, ← → previous and next, D and W for the view, N for a new booking, ? for help.
  // Ignored while typing or with a dialog open.
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      const by = view === "day" ? 1 : 7;
      if (k === "t") setPicked(null);
      else if (e.key === "ArrowLeft") setPicked(addDays(date, -by));
      else if (e.key === "ArrowRight") setPicked(addDays(date, by));
      else if (k === "d") setView("day");
      else if (k === "w") setView("week");
      else if (k === "n") setDraft({ date: date < today ? today : date });
      else if (e.key === "?") setHelp(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, date, today, view]);

  if (!s || !now) return <Spinner label="Loading calendar" />;

  const range = gridRange(s, view === "day" ? [date] : week);
  const dayBookings = s.bookings.filter((b) => b.date === date && isLive(b));
  const revenue = dayBookings.reduce((n, b) => n + b.price, 0);
  const booked = dayBookings.reduce((n, b) => n + b.end - b.start, 0);
  const worked = s.staff.reduce((n, p) => n + workingMinutes(s, p, date), 0);
  const step = view === "day" ? 1 : 7;
  const openBooking = open ? s.bookings.find((b) => b.id === open) : undefined;
  const label = view === "day" ? formatDayLong(date) : `${formatDayLong(week[0]).replace(/^\w+, /, "")} – ${formatDayLong(week[6]).replace(/^\w+, /, "")}`;

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold tracking-[-0.01em]" aria-live="polite">
          {label}
        </h1>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setPicked(null)} disabled={date === today}>
            Today
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(addDays(date, -step))} aria-label={view === "day" ? "Previous day" : "Previous week"}>
            <ChevronLeft />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(addDays(date, step))} aria-label={view === "day" ? "Next day" : "Next week"}>
            <ChevronRight />
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="accent-[var(--accent)]" />
            Show cancelled
          </label>
          {view === "week" && (
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={cx(inlineSelectClass, "h-7")} aria-label="Staff">
              <option value="all">Whole team</option>
              {s.staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="View">
            {(["day", "week"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={cx("h-6 rounded px-2.5 text-xs font-medium capitalize", view === v ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" variant="primary" onClick={() => setDraft({ date: date < today ? today : date })}>
            <Plus /> New booking
          </Button>
        </div>
      </div>

      {view === "day" && (
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-muted sm:flex sm:flex-wrap">
          {[
            ["Appointments", String(dayBookings.length)],
            ["Booked", worked ? pct(booked / worked) : "Closed"],
            ["Expected revenue", money(revenue)],
            ["Online", String(dayBookings.filter((b) => b.source === "online").length)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1.5">
              <dt>{k}</dt>
              <dd className="font-semibold text-text tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div ref={scroller} className="relative max-h-[calc(100dvh-200px)] min-h-[420px] overflow-auto rounded-lg border border-border bg-surface shadow-card">
        <div className="sticky top-0 z-[12] flex min-w-max border-b border-border bg-surface">
          <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-border bg-surface" />
          <div className="flex flex-1">
            {view === "day"
              ? s.staff.map((p) => {
                  const mins = workingMinutes(s, p, date);
                  const mine = dayBookings.filter((b) => b.staffId === p.id);
                  const used = mine.reduce((n, b) => n + b.end - b.start, 0);
                  return (
                    <div key={p.id} className="flex min-w-[150px] flex-1">
                      <ColumnHeader title={firstName(p.name)} sub={mins ? `${mine.length} appts · ${pct(used / mins)}` : "Off"} avatar={p.name} />
                    </div>
                  );
                })
              : week.map((d) => {
                  const n = s.bookings.filter((b) => b.date === d && isLive(b) && (staffId === "all" || b.staffId === staffId)).length;
                  return (
                    <div key={d} className="flex min-w-[120px] flex-1">
                      <ColumnHeader
                        title={`${weekdayShort(d)} ${Number(d.slice(8))}`}
                        sub={`${n} appts`}
                        active={d === today}
                        onClick={() => {
                          setPicked(d);
                          setView("day");
                        }}
                      />
                    </div>
                  );
                })}
          </div>
        </div>
        {view === "day" ? (
          <DayView s={s} now={now} date={date} range={range} showCancelled={showCancelled} onOpen={setOpen} onCreate={setDraft} />
        ) : (
          <WeekView s={s} now={now} week={week} range={range} staffId={staffId} showCancelled={showCancelled} onOpen={setOpen} onCreate={setDraft} />
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        <span className="hidden sm:inline">Click an empty slot to add a booking, drag an appointment to move it. </span>
        <Globe className="inline size-3 text-accent" aria-hidden /> booked online · <Repeat className="inline size-3" aria-hidden /> repeating · <AlertTriangle className="inline size-3 text-danger" aria-hidden /> 2+ no-shows · hatched time is a break, time off or clean-up buffer.
        <button onClick={() => setHelp(true)} className="ml-2 hidden items-center gap-1 align-middle font-medium text-accent hover:underline sm:inline-flex">
          <Keyboard className="size-3.5" aria-hidden /> Shortcuts
        </button>
      </p>

      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {[
            ["T", "Go to today"],
            ["← →", view === "day" ? "Previous or next day" : "Previous or next week"],
            ["D / W", "Day or week view"],
            ["N", "New booking"],
            ["?", "Show this list"],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
              </dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Modal>

      {openBooking && <BookingDetails key={openBooking.id} state={s} booking={openBooking} now={now} onClose={() => setOpen(null)} />}
      {draft && <NewBooking state={s} now={now} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}
