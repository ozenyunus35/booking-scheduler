"use client";

import { CalendarOff, Clock, Plus, X } from "lucide-react";
import { useState } from "react";
import { bookingWindow, workingMinutes } from "@/lib/availability";
import { addDays, formatDate, formatTime, parseTime, toTimeInput } from "@/lib/dates";
import { firstName, pct } from "@/lib/format";
import { utilisation } from "@/lib/stats";
import { update, useStore } from "@/lib/store";
import type { DayHours, DemoState, ISODate, Staff, TimeOff } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Avatar, Button, Card, Field, Meter, Modal, PageHeader, Spinner, cx, inputClass } from "../ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const short = (m: number) => formatTime(m).replace(":00", "").replace(" ", "").toLowerCase();

function HoursForm({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(() =>
    staff.hours.map((h) => ({ on: !!h, start: toTimeInput(h?.start ?? 540), end: toTimeInput(h?.end ?? 1020), bStart: toTimeInput(h?.breaks[0]?.start ?? 780), bEnd: toTimeInput(h?.breaks[0]?.end ?? 810), hasBreak: h ? h.breaks.length > 0 : true })),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const hours: (DayHours | null)[] = [];
    for (const [i, r] of rows.entries()) {
      if (!r.on) {
        hours.push(null);
        continue;
      }
      const start = parseTime(r.start);
      const end = parseTime(r.end);
      if (!(end > start)) return setError(`${DAYS[i]}: the day has to end after it starts.`);
      const breaks = r.hasBreak ? [{ start: parseTime(r.bStart), end: parseTime(r.bEnd) }] : [];
      if (breaks[0] && !(breaks[0].start >= start && breaks[0].end <= end && breaks[0].end > breaks[0].start)) return setError(`${DAYS[i]}: the break has to sit inside working hours.`);
      hours.push({ start, end, breaks });
    }
    update((d) => {
      const p = d.staff.find((x) => x.id === staff.id);
      if (p) p.hours = hours;
    });
    toast(`${firstName(staff.name)}'s hours saved. Online availability updated.`);
    onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`${staff.name}: working hours`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="hours-form">
            Save hours
          </Button>
        </>
      }
    >
      <form id="hours-form" onSubmit={save} noValidate>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Day</th>
                <th className="py-1.5 font-medium">Starts</th>
                <th className="py-1.5 font-medium">Ends</th>
                <th className="py-1.5 font-medium">Break</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={DAYS[i]} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" className="accent-[var(--accent)]" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} />
                      {DAYS[i]}
                    </label>
                  </td>
                  {r.on ? (
                    <>
                      <td className="py-2 pr-3">
                        <input type="time" step={900} value={r.start} onChange={(e) => set(i, { start: e.target.value })} className={cx(inputClass, "w-28")} aria-label={`${DAYS[i]} start`} />
                      </td>
                      <td className="py-2 pr-3">
                        <input type="time" step={900} value={r.end} onChange={(e) => set(i, { end: e.target.value })} className={cx(inputClass, "w-28")} aria-label={`${DAYS[i]} end`} />
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <input type="checkbox" className="accent-[var(--accent)]" checked={r.hasBreak} onChange={(e) => set(i, { hasBreak: e.target.checked })} aria-label={`${DAYS[i]} has a break`} />
                          <input type="time" step={900} disabled={!r.hasBreak} value={r.bStart} onChange={(e) => set(i, { bStart: e.target.value })} className={cx(inputClass, "w-28")} aria-label={`${DAYS[i]} break start`} />
                          <span className="text-faint">–</span>
                          <input type="time" step={900} disabled={!r.hasBreak} value={r.bEnd} onChange={(e) => set(i, { bEnd: e.target.value })} className={cx(inputClass, "w-28")} aria-label={`${DAYS[i]} break end`} />
                        </div>
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="py-2 text-muted">
                      Day off
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <p className="mt-3 text-danger" role="alert">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">Existing appointments stay where they are. Only new online times follow the new hours.</p>
      </form>
    </Modal>
  );
}

function TimeOffForm({ s, staff, today, onClose }: { s: DemoState; staff: Staff; today: ISODate; onClose: () => void }) {
  const { toast } = useToast();
  const [from, setFrom] = useState(addDays(today, 1));
  const [to, setTo] = useState(addDays(today, 1));
  const [part, setPart] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [reason, setReason] = useState("Holiday");
  const [error, setError] = useState<string | null>(null);
  const lastDay = part ? from : to;
  const clash = s.bookings.filter(
    (b) => b.staffId === staff.id && b.status === "confirmed" && b.date >= from && b.date <= lastDay && (!part || (b.start < parseTime(end) && b.end > parseTime(start))),
  ).length;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!part && to < from) return setError("The last day has to be on or after the first.");
    if (part && !(parseTime(end) > parseTime(start))) return setError("The time off has to end after it starts.");
    const entry: TimeOff = { id: `off-${Date.now().toString(36)}`, staffId: staff.id, from, to: lastDay, reason: reason.trim() || "Time off", ...(part ? { start: parseTime(start), end: parseTime(end) } : {}) };
    update((d) => {
      d.timeOff.push(entry);
    });
    toast(`Time off added for ${firstName(staff.name)}. Those times are no longer bookable.`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Time off for ${firstName(staff.name)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="off-form">
            Add time off
          </Button>
        </>
      }
    >
      <form id="off-form" onSubmit={save} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={part ? "Date" : "First day"}>{(id) => <input id={id} type="date" min={today} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputClass} />}</Field>
        {!part && <Field label="Last day">{(id) => <input id={id} type="date" min={from} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputClass} />}</Field>}
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" className="accent-[var(--accent)]" checked={part} onChange={(e) => setPart(e.target.checked)} />
          Only part of the day
        </label>
        {part && (
          <>
            <Field label="From">{(id) => <input id={id} type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />}</Field>
            <Field label="Until">{(id) => <input id={id} type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />}</Field>
          </>
        )}
        <div className="sm:col-span-2">
          <Field label="Reason">{(id) => <input id={id} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />}</Field>
        </div>
        {clash > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-warning sm:col-span-2">
            {clash} booked appointment{clash === 1 ? "" : "s"} fall in this time. They stay booked: move them from the calendar.
          </p>
        )}
        {error && (
          <p className="text-danger sm:col-span-2" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function hoursSummary(staff: Staff) {
  return staff.hours.map((h, i) => ({ day: DAYS[i], text: h ? `${short(h.start)}–${short(h.end)}` : "Off" }));
}

export function Team() {
  const s = useStore();
  const now = useNow();
  const { toast } = useToast();
  const [hours, setHours] = useState<Staff | null>(null);
  const [off, setOff] = useState<Staff | null>(null);
  if (!s || !now) return <Spinner />;
  const { today } = bookingWindow(s, now);
  const next7 = addDays(today, 6);

  return (
    <div>
      <PageHeader title="Team" description="Working hours and time off decide what clients can book online." />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {s.staff.map((p) => {
          const upcoming = s.timeOff.filter((t) => t.staffId === p.id && t.to >= today).sort((a, b) => a.from.localeCompare(b.from));
          const load = utilisation(s, today, next7, p.id);
          let weekHours = 0;
          for (let d = today; d <= next7; d = addDays(d, 1)) weekHours += workingMinutes(s, p, d);
          return (
            <Card key={p.id} className="flex flex-col">
              <div className="flex items-start gap-3 p-4">
                <Avatar name={p.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">{p.role}</p>
                  <p className="mt-1 text-muted">{p.bio}</p>
                </div>
              </div>
              <div className="grid grid-cols-7 border-y border-border text-center">
                {hoursSummary(p).map((d) => (
                  <div key={d.day} className="border-r border-border px-1 py-2 last:border-r-0">
                    <p className="text-[11px] text-faint">{d.day}</p>
                    <p className={cx("text-[11px] leading-4 tabular-nums", d.text === "Off" ? "text-faint" : "font-medium")}>{d.text}</p>
                  </div>
                ))}
              </div>
              <div className="flex-1 space-y-3 p-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-muted">Booked, next 7 days</span>
                    <span className="tabular-nums">
                      {pct(load)} of {Math.round(weekHours / 60)} h
                    </span>
                  </div>
                  <Meter value={Math.round(load * 100)} max={100} label={`${p.name} booked next 7 days`} warn={false} />
                </div>
                {upcoming.length > 0 && (
                  <ul className="space-y-1">
                    {upcoming.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5">
                        <CalendarOff className="size-3.5 shrink-0 text-faint" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{t.reason}</span>{" "}
                          <span className="text-muted">
                            {formatDate(t.from)}
                            {t.to !== t.from && ` – ${formatDate(t.to)}`}
                            {t.start != null && t.end != null && `, ${formatTime(t.start)}–${formatTime(t.end)}`}
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            update((d) => {
                              d.timeOff = d.timeOff.filter((x) => x.id !== t.id);
                            });
                            toast("Time off removed.");
                          }}
                          className="rounded p-0.5 text-muted hover:bg-surface-3 hover:text-text"
                          aria-label={`Remove ${t.reason} for ${p.name}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2 border-t border-border px-4 py-3">
                <Button size="sm" onClick={() => setHours(p)}>
                  <Clock /> Edit hours
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOff(p)}>
                  <Plus /> Time off
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      {hours && <HoursForm key={hours.id} staff={hours} onClose={() => setHours(null)} />}
      {off && <TimeOffForm key={off.id} s={s} staff={off} today={today} onClose={() => setOff(null)} />}
    </div>
  );
}
