"use client";

import { AlertTriangle, Ban, CalendarClock, Check, Globe, ListTodo, Mail, Phone, Repeat, UserX } from "lucide-react";
import { useState } from "react";
import { assignStaff, bookingTitle, bookingWindow, getSlots, staffFor, visitFor } from "@/lib/availability";
import { cancelBooking, cancelSeries, createBooking, createSeries, LIMITS, moveBooking, planSeries, SERIES_WEEKS, setStatus, validateClient } from "@/lib/api";
import { formatDay, formatDayLong, formatDuration, formatTime } from "@/lib/dates";
import { firstName, money } from "@/lib/format";
import { update } from "@/lib/store";
import type { Booking, BookingSource, BookingStatus, Category, DemoState, ISODate } from "@/lib/types";
import { useToast } from "../toast";
import { Avatar, Badge, Button, Field, Modal, cx, inputClass, type Tone } from "../ui";
import { useT } from "@/lib/i18n";

export const STATUS_TONE: Record<BookingStatus, Tone> = { confirmed: "accent", completed: "success", cancelled: "neutral", "no-show": "danger" };
export const SOURCE_LABEL: Record<BookingSource, string> = { online: "Online", phone: "Phone", "walk-in": "Walk-in", waitlist: "Waitlist" };
const CATEGORIES: Category[] = ["Cuts", "Color", "Styling", "Barbering", "Treatments"];

export const selectClass = cx(inputClass, "pr-7");
/** A select that sizes to its content, for toolbars. */
export const inlineSelectClass = selectClass.replace("w-full", "w-auto");

/** Free start times for the salon's own calendar (no online notice rules), always including `keep`. */
function timeOptions(state: DemoState, serviceId: string, staffId: string, date: ISODate, now: number, ignoreBookingId?: string, keep?: number, addOnIds?: string[]) {
  const starts = getSlots(state, { serviceId, addOnIds, staffId, date, now, ignoreBookingId, enforceRules: false }).map((s) => s.start);
  if (keep != null && !starts.includes(keep)) starts.push(keep);
  return starts.sort((a, b) => a - b);
}

function ServiceSelect({ state, id, value, onChange }: { state: DemoState; id: string; value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      {CATEGORIES.map((c) => (
        <optgroup key={c} label={t(c)}>
          {state.services
            .filter((s) => s.category === c && s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatDuration(s.duration)} · {money(s.price)}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function BookingDetails({ state, booking, now, onClose }: { state: DemoState; booking: Booking; now: number; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const client = state.clients.find((c) => c.id === booking.clientId);
  const service = state.services.find((s) => s.id === booking.serviceId);
  const staff = state.staff.find((p) => p.id === booking.staffId);
  const title = bookingTitle(state, booking);
  const length = booking.end - booking.start;
  const series = booking.seriesId ? state.bookings.filter((b) => b.seriesId === booking.seriesId).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start) : [];
  const noShows = state.bookings.filter((b) => b.clientId === booking.clientId && b.status === "no-show").length;
  const [edit, setEdit] = useState(false);
  const [to, setTo] = useState({ staffId: booking.staffId, date: booking.date, start: booking.start });
  const { today, nowMinutes } = bookingWindow(state, now);
  const started = booking.date < today || (booking.date === today && booking.start <= nowMinutes);
  const live = booking.status === "confirmed";

  const act = (fn: (d: DemoState) => { ok: boolean; error?: string } | void, done: string) => {
    let r: { ok: boolean; error?: string } | void = undefined;
    update((d) => {
      r = fn(d);
    });
    const res = r as { ok: boolean; error?: string } | undefined;
    if (res && !res.ok) toast(t(res.error ?? "That didn't work."), "error");
    else {
      toast(done);
      onClose();
    }
  };

  const options = edit && service ? timeOptions(state, service.id, to.staffId, to.date, now, booking.id, to.date === booking.date && to.staffId === booking.staffId ? booking.start : undefined, booking.addOnIds) : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={client?.name ?? t("Booking")}
      footer={
        edit ? (
          <>
            <Button onClick={() => setEdit(false)}>{t("Back")}</Button>
            <Button
              variant="primary"
              disabled={!options.includes(to.start)}
              onClick={() => act((d) => moveBooking(d, booking.id, to, Date.now(), false), t("Moved to {time} with {staff}.", { time: formatTime(to.start), staff: firstName(state.staff.find((p) => p.id === to.staffId)?.name ?? "") }))}
            >
              {t("Save new time")}
            </Button>
          </>
        ) : (
          <>
            {live && (
              <Button variant="ghost" className={cx("text-danger hover:text-danger", !booking.seriesId && "mr-auto")} onClick={() => act((d) => cancelBooking(d, booking.id, Date.now(), false), t("Booking cancelled."))}>
                <Ban /> {t("Cancel booking")}
              </Button>
            )}
            {live && booking.seriesId && (
              <Button
                variant="ghost"
                className="mr-auto text-danger hover:text-danger"
                onClick={() =>
                  act((d) => {
                    const r = cancelSeries(d, booking.id, Date.now());
                    return r.ok ? { ok: true } : r;
                  }, t("This and the later appointments in the series are cancelled."))
                }
              >
                <Repeat /> {t("Cancel this and later")}
              </Button>
            )}
            {live && started && (
              <Button onClick={() => act((d) => setStatus(d, booking.id, "no-show"), t("Marked as no-show."))}>
                <UserX /> {t("No-show")}
              </Button>
            )}
            {live && started && (
              <Button variant="primary" onClick={() => act((d) => setStatus(d, booking.id, "completed"), t("Marked as completed."))}>
                <Check /> {t("Completed")}
              </Button>
            )}
            {live && !started && (
              <Button variant="primary" onClick={() => setEdit(true)}>
                <CalendarClock /> {t("Reschedule")}
              </Button>
            )}
            {!live && <Button onClick={onClose}>{t("Close")}</Button>}
          </>
        )
      }
    >
      {edit && service ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("Staff")}>
            {(id) => (
              <select id={id} value={to.staffId} onChange={(e) => setTo({ ...to, staffId: e.target.value })} className={selectClass}>
                {staffFor(state, service.id, booking.addOnIds).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("Date")}>{(id) => <input id={id} type="date" min={today} value={to.date} onChange={(e) => e.target.value && setTo({ ...to, date: e.target.value })} className={inputClass} />}</Field>
          <div className="sm:col-span-2">
            <Field label={t("Start time")} hint={options.length ? `${options.length} free start times` : "Nothing free that day. Try another date or person."}>
              {(id, d) => (
                <select id={id} aria-describedby={d} value={options.includes(to.start) ? to.start : ""} onChange={(e) => setTo({ ...to, start: Number(e.target.value) })} className={selectClass}>
                  <option value="" disabled>
                    {t("Choose a time")}
                  </option>
                  {options.map((t) => (
                    <option key={t} value={t}>
                      {formatTime(t)} – {formatTime(t + length)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[booking.status]}>{t(booking.status)}</Badge>
            <span className="inline-flex h-5 items-center gap-1 rounded-md border border-border px-1.5 text-xs text-muted">
              {booking.source === "online" ? <Globe className="size-3" aria-hidden /> : booking.source === "phone" ? <Phone className="size-3" aria-hidden /> : booking.source === "waitlist" ? <ListTodo className="size-3" aria-hidden /> : null}
              {t(SOURCE_LABEL[booking.source])}
            </span>
            {noShows > 0 && (
              <Badge tone="danger">
                <AlertTriangle className="size-3" aria-hidden /> {t(noShows === 1 ? "{n} no-show" : "{n} no-shows", { n: noShows })}
              </Badge>
            )}
            {booking.anyStaff && <span className="text-xs text-muted">{booking.source === "online" ? t("Client chose any professional") : t("Given to whoever was free")}</span>}
            <span className="ml-auto font-mono text-xs text-muted">{booking.ref}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2">
              <dt className="text-xs text-muted">{t("Service")}</dt>
              <dd className="font-medium">
                {title} <span className="font-normal text-muted">· {formatDuration(length)} · {money(booking.price)}</span>
              </dd>
            </div>
            {series.length > 1 && (
              <div className="col-span-2">
                <dt className="text-xs text-muted">{t("Repeats")}</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  <Repeat className="size-3.5 text-faint" aria-hidden />
                  <span className="font-medium">
                    {t("{n} of {total}", { n: series.findIndex((b) => b.id === booking.id) + 1, total: series.length })}
                  </span>
                  {series.map((b) => (
                    <span key={b.id} className={cx("rounded border px-1.5 text-xs tabular-nums", b.id === booking.id ? "border-accent text-accent" : b.status === "cancelled" ? "border-border text-faint line-through" : "border-border text-muted")}>
                      {formatDay(b.date)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-xs text-muted">{t("When")}</dt>
              <dd className="font-medium">
                {formatDayLong(booking.date)}, {formatTime(booking.start)} – {formatTime(booking.end)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">{t("With")}</dt>
              <dd className="flex items-center gap-2 font-medium">
                {staff && <Avatar name={staff.name} size={20} />}
                {staff?.name}
              </dd>
            </div>
            {client && (
              <>
                <div>
                  <dt className="text-xs text-muted">{t("Phone")}</dt>
                  <dd>
                    <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                      <Phone className="size-3 text-faint" aria-hidden />
                      {client.phone}
                    </a>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted">{t("Email")}</dt>
                  <dd className="truncate">
                    <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                      <Mail className="size-3 text-faint" aria-hidden />
                      {client.email}
                    </a>
                  </dd>
                </div>
              </>
            )}
            {(booking.notes || client?.notes) && (
              <div className="col-span-2 rounded-md bg-surface-2 px-3 py-2">
                <dt className="text-xs text-muted">{t("Notes")}</dt>
                {booking.notes && <dd className="whitespace-pre-line">{booking.notes}</dd>}
                {client?.notes && <dd className="text-muted">{t("Client:")} {client.notes}</dd>}
              </div>
            )}
          </dl>
          {live && !started && <p className="text-xs text-muted">{t("Tip: drag the appointment on the day view to move it.")}</p>}
        </div>
      )}
    </Modal>
  );
}

export interface NewBookingDraft {
  date: ISODate;
  start?: number;
  staffId?: string;
  clientId?: string;
}

export function NewBooking({ state, now, draft, onClose, onCreated }: { state: DemoState; now: number; draft: NewBookingDraft; onClose: () => void; onCreated?: (b: Booking) => void }) {
  const t = useT();
  const { toast } = useToast();
  const firstService = state.services.find((s) => s.active && (!draft.staffId || s.staffIds.includes(draft.staffId)))?.id ?? state.services[0].id;
  const [serviceId, setServiceId] = useState(firstService);
  const [staffId, setStaffId] = useState(draft.staffId ?? "any");
  const [date, setDate] = useState(draft.date);
  const [start, setStart] = useState<number | null>(draft.start ?? null);
  const preset = state.clients.find((c) => c.id === draft.clientId);
  const [name, setName] = useState(preset?.name ?? "");
  const [email, setEmail] = useState(preset?.email ?? "");
  const [phone, setPhone] = useState(preset?.phone ?? "");
  const [source, setSource] = useState<BookingSource>("phone");
  const [notes, setNotes] = useState("");
  const [addOn, setAddOn] = useState("");
  const [weeks, setWeeks] = useState(0);
  const [count, setCount] = useState(6);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const match = state.clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const category = state.services.find((x) => x.id === serviceId)?.category;
  const addOnOptions = state.services.filter((x) => x.active && x.id !== serviceId && x.category !== category && (visitFor(state, serviceId, [x.id])?.staffIds.length ?? 0) > 0);
  const addOnIds = addOn && addOnOptions.some((x) => x.id === addOn) ? [addOn] : [];
  const team = staffFor(state, serviceId, addOnIds);
  const validStaff = staffId === "any" || team.some((p) => p.id === staffId) ? staffId : "any";
  const options = timeOptions(state, serviceId, validStaff, date, now, undefined, undefined, addOnIds);
  const visit = visitFor(state, serviceId, addOnIds)!;
  // Who would take the first appointment, so the series can be checked against their calendar.
  const firstStaff = start == null || !options.includes(start) ? null : validStaff !== "any" ? validStaff : assignStaff(state, date, getSlots(state, { serviceId, addOnIds, staffId: "any", date, now, enforceRules: false }).find((x) => x.start === start)?.staffIds ?? []);
  const plan = weeks && firstStaff && start != null ? planSeries(state, { serviceId, addOnIds, staffId: firstStaff, date, start }, weeks, count, now) : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = match ? {} : { ...validateClient({ name, email, phone }) };
    if (!name.trim()) errs.name = t("Enter the client's name.");
    if (start == null || !options.includes(start)) errs.start = t("Choose a free time.");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const input = { serviceId, addOnIds, staffId: validStaff, date, start: start!, client: match ? { id: match.id } : { name, email, phone }, notes, source, online: false };
    if (weeks) {
      let r: ReturnType<typeof createSeries> | undefined;
      update((d) => {
        r = createSeries(d, input, weeks, count, Date.now());
      });
      if (!r) return;
      if (!r.ok) return toast(t(r.error), "error");
      const skipped = r.value.skipped.length;
      toast(
        t("Booked {n} appointments for {name}, every {weeks} weeks.", { n: r.value.booked.length, name: firstName(name), weeks }) +
          (skipped ? ` ${t(skipped === 1 ? "{n} date didn't fit." : "{n} dates didn't fit.", { n: skipped })}` : ""),
      );
      onCreated?.(r.value.booked[0]);
      onClose();
      return;
    }
    let r: ReturnType<typeof createBooking> | undefined;
    update((d) => {
      r = createBooking(d, input, Date.now());
    });
    if (!r) return;
    if (!r.ok) return toast(t(r.error), "error");
    toast(t("Booked {service} for {name} at {time}.", { service: visit.name, name: firstName(name), time: formatTime(start!) }));
    onCreated?.(r.value);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("New booking")}
      footer={
        <>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" type="submit" form="new-booking">
            {t("Create booking")}
          </Button>
        </>
      }
    >
      <form id="new-booking" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("Client")} error={errors.name} hint={name.trim() ? (match ? `Existing client · ${match.phone}` : "New client: add their contact details below.") : "Start typing to find a client."}>
            {(id, d) => (
              <>
                <input id={id} list="client-names" maxLength={LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={d} autoComplete="off" className={inputClass} />
                <datalist id="client-names">
                  {state.clients.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
        {!match && name.trim() && (
          <>
            <Field label={t("Email")} error={errors.email}>
              {(id, d) => <input id={id} type="email" maxLength={LIMITS.email} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={d} className={inputClass} />}
            </Field>
            <Field label={t("Phone")} error={errors.phone}>
              {(id, d) => <input id={id} type="tel" maxLength={LIMITS.phone} value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} aria-describedby={d} className={inputClass} />}
            </Field>
          </>
        )}
        <Field label={t("Service")}>{(id) => <ServiceSelect state={state} id={id} value={serviceId} onChange={setServiceId} />}</Field>
        <Field label={t("Then (same visit)")} hint={addOnIds.length ? `${formatDuration(visit.duration)} · ${money(visit.price)} in all` : undefined}>
          {(id, d) => (
            <select id={id} aria-describedby={d} value={addOnIds[0] ?? ""} onChange={(e) => setAddOn(e.target.value)} className={selectClass}>
              <option value="">{t("Nothing else")}</option>
              {addOnOptions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {formatDuration(x.duration)} · {money(x.price)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("Staff")}>
          {(id) => (
            <select id={id} value={validStaff} onChange={(e) => setStaffId(e.target.value)} className={selectClass}>
              <option value="any">{t("First available")}</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("Date")}>{(id) => <input id={id} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />}</Field>
        <Field label={t("Start time")} error={errors.start} hint={options.length ? undefined : "Nothing free. Try another date or person."}>
          {(id, d) => (
            <select id={id} aria-describedby={d} aria-invalid={!!errors.start} value={start != null && options.includes(start) ? start : ""} onChange={(e) => setStart(Number(e.target.value))} className={selectClass}>
              <option value="" disabled>
                {t("Choose a time")}
              </option>
              {options.map((t) => (
                <option key={t} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("Booked by")}>
          {(id) => (
            <select id={id} value={source} onChange={(e) => setSource(e.target.value as BookingSource)} className={selectClass}>
              <option value="phone">{t("Phone")}</option>
              <option value="walk-in">{t("Walk-in")}</option>
            </select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("Notes")}>{(id) => <input id={id} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder={t("Optional")} />}</Field>
        </div>
        <Field label={t("Repeat")}>
          {(id) => (
            <select id={id} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={selectClass}>
              <option value={0}>{t("Doesn't repeat")}</option>
              {SERIES_WEEKS.map((w) => (
                <option key={w} value={w}>
                  {t("Every {n} weeks", { n: w })}
                </option>
              ))}
            </select>
          )}
        </Field>
        {weeks > 0 && (
          <Field label={t("Appointments in all")}>
            {(id) => (
              <select id={id} value={count} onChange={(e) => setCount(Number(e.target.value))} className={selectClass}>
                {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {weeks > 0 && (
          <div className="sm:col-span-2" aria-live="polite">
            {plan.length ? (
              <ul className="divide-y divide-border rounded-md border border-border text-xs" aria-label={t("Series preview")}>
                <li className="flex items-center gap-2 px-3 py-1.5">
                  <Check className="size-3.5 text-success" aria-hidden />
                  <span className="w-28 shrink-0 font-medium">{formatDay(date)}</span>
                  {formatTime(start!)}
                </li>
                {plan.map((p) => (
                  <li key={p.date} className="flex items-center gap-2 px-3 py-1.5">
                    {p.status === "ok" ? <Check className="size-3.5 text-success" aria-hidden /> : p.status === "moved" ? <CalendarClock className="size-3.5 text-warning" aria-hidden /> : <Ban className="size-3.5 text-danger" aria-hidden />}
                    <span className="w-28 shrink-0 font-medium">{formatDay(p.date)}</span>
                    <span className={cx(p.status === "skipped" && "text-faint line-through")}>{formatTime(p.start)}</span>
                    {p.status !== "ok" && <span className="truncate text-muted">{p.status === "moved" ? `moved: ${p.reason}` : `skipped: ${p.reason}`}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">{t("Choose a start time to see every date in the series.")}</p>
            )}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
