"use client";

import { CalendarOff, Clock, Plus, X } from "lucide-react";
import { useState } from "react";
import { bookingWindow, workingMinutes } from "@/lib/availability";
import { addDays, formatDate, formatTime, parseTime, toTimeInput, weekday } from "@/lib/dates";
import { firstName, pct } from "@/lib/format";
import { utilisation } from "@/lib/stats";
import { update, useStore } from "@/lib/store";
import type { DayHours, DemoState, ISODate, Staff, TimeOff } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Avatar, Button, Card, Field, Meter, Modal, PageHeader, Spinner, cx, inputClass } from "../ui";
import { useT } from "@/lib/i18n";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const short = (m: number) => formatTime(m).replace(":00", "").replace(" ", "").toLowerCase();

function HoursForm({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [rows, setRows] = useState(() =>
    staff.hours.map((h) => ({ on: !!h, start: toTimeInput(h?.start ?? 540), end: toTimeInput(h?.end ?? 1020), bStart: toTimeInput(h?.breaks[0]?.start ?? 780), bEnd: toTimeInput(h?.breaks[0]?.end ?? 810), hasBreak: h ? h.breaks.length > 0 : true })),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const state = useStore();
  const now = useNow();
  // Upcoming appointments the new hours would leave outside working time (or on a break).
  const outside = (() => {
    if (!state) return 0;
    const { today } = bookingWindow(state, now);
    return state.bookings.filter((b) => {
      if (b.staffId !== staff.id || b.status !== "confirmed" || b.date < today) return false;
      const r = rows[weekday(b.date)];
      if (!r.on) return true;
      const start = parseTime(r.start);
      const end = parseTime(r.end);
      const onBreak = r.hasBreak && b.start < parseTime(r.bEnd) && parseTime(r.bStart) < b.end;
      return b.start < start || b.end > end || onBreak;
    }).length;
  })();

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
      if (!(end > start)) return setError(`${t(DAYS[i])}: ${t("the day has to end after it starts.")}`);
      const breaks = r.hasBreak ? [{ start: parseTime(r.bStart), end: parseTime(r.bEnd) }] : [];
      if (breaks[0] && !(breaks[0].start >= start && breaks[0].end <= end && breaks[0].end > breaks[0].start)) return setError(`${t(DAYS[i])}: ${t("the break has to sit inside working hours.")}`);
      hours.push({ start, end, breaks });
    }
    update((d) => {
      const p = d.staff.find((x) => x.id === staff.id);
      if (p) p.hours = hours;
    });
    toast(t("Hours saved for {name}. Online availability updated.", { name: firstName(staff.name) }));
    onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={t("{name}: working hours", { name: staff.name })}
      footer={
        <>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" type="submit" form="hours-form">
            {t("Save hours")}
          </Button>
        </>
      }
    >
      <form id="hours-form" onSubmit={save} noValidate>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">{t("Day")}</th>
                <th className="py-1.5 font-medium">{t("Starts")}</th>
                <th className="py-1.5 font-medium">{t("Ends")}</th>
                <th className="py-1.5 font-medium">{t("Break")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={DAYS[i]} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" className="accent-[var(--accent)]" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} />
                      {t(DAYS[i])}
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
                      {t("Day off")}
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
        {outside > 0 && (
          <p className="mt-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-warning">
            {t(outside === 1 ? "{n} upcoming appointment falls outside these hours. It stays booked: move it from the calendar." : "{n} upcoming appointments fall outside these hours. They stay booked: move them from the calendar.", { n: outside })}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">{t("Existing appointments stay where they are. Only new online times follow the new hours.")}</p>
      </form>
    </Modal>
  );
}

function TimeOffForm({ s, staff, today, onClose }: { s: DemoState; staff: Staff; today: ISODate; onClose: () => void }) {
  const t = useT();
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
    if (!part && to < from) return setError(t("The last day has to be on or after the first."));
    if (part && !(parseTime(end) > parseTime(start))) return setError(t("The time off has to end after it starts."));
    const entry: TimeOff = { id: `off-${Date.now().toString(36)}`, staffId: staff.id, from, to: lastDay, reason: reason.trim() || t("Time off"), ...(part ? { start: parseTime(start), end: parseTime(end) } : {}) };
    update((d) => {
      d.timeOff.push(entry);
    });
    toast(t("Time off added for {name}. Those times are no longer bookable.", { name: firstName(staff.name) }));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("Time off for {name}", { name: firstName(staff.name) })}
      footer={
        <>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" type="submit" form="off-form">
            {t("Add time off")}
          </Button>
        </>
      }
    >
      <form id="off-form" onSubmit={save} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={part ? "Date" : "First day"}>{(id) => <input id={id} type="date" min={today} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputClass} />}</Field>
        {!part && <Field label={t("Last day")}>{(id) => <input id={id} type="date" min={from} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputClass} />}</Field>}
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" className="accent-[var(--accent)]" checked={part} onChange={(e) => setPart(e.target.checked)} />
          {t("Only part of the day")}
        </label>
        {part && (
          <>
            <Field label={t("From")}>{(id) => <input id={id} type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />}</Field>
            <Field label={t("Until")}>{(id) => <input id={id} type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />}</Field>
          </>
        )}
        <div className="sm:col-span-2">
          <Field label={t("Reason")}>{(id) => <input id={id} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />}</Field>
        </div>
        {clash > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-warning sm:col-span-2">
            {t(clash === 1 ? "{n} booked appointment falls in this time. It stays booked: move it from the calendar." : "{n} booked appointments fall in this time. They stay booked: move them from the calendar.", { n: clash })}
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
  const t = useT();
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
      <PageHeader title={t("Team")} description={t("Working hours and time off decide what clients can book online.")} />
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
                    <span className="text-muted">{t("Booked, next 7 days")}</span>
                    <span className="tabular-nums">
                      {t("{pct} of {n} h", { pct: pct(load), n: Math.round(weekHours / 60) })}
                    </span>
                  </div>
                  <Meter value={Math.round(load * 100)} max={100} label={t("{name} booked next 7 days", { name: p.name })} warn={false} />
                </div>
                {upcoming.length > 0 && (
                  <ul className="space-y-1">
                    {upcoming.map((off) => (
                      <li key={off.id} className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5">
                        <CalendarOff className="size-3.5 shrink-0 text-faint" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{off.reason}</span>{" "}
                          <span className="text-muted">
                            {formatDate(off.from)}
                            {off.to !== off.from && ` – ${formatDate(off.to)}`}
                            {off.start != null && off.end != null && `, ${formatTime(off.start)}–${formatTime(off.end)}`}
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            update((d) => {
                              d.timeOff = d.timeOff.filter((x) => x.id !== off.id);
                            });
                            toast(t("Time off removed."));
                          }}
                          className="rounded p-0.5 text-muted hover:bg-surface-3 hover:text-text"
                          aria-label={t("Remove {reason} for {name}", { reason: off.reason, name: p.name })}
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
                  <Clock /> {t("Edit hours")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOff(p)}>
                  <Plus /> {t("Time off")}
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
