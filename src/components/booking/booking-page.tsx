"use client";

import { ArrowRight, BellRing, Check, ChevronLeft, Plus, Sparkles, Users } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { getSlots, nextAvailable, staffFor, visitFor, type Visit } from "@/lib/availability";
import { createBooking, joinWaitlist, LIMITS, validateClient, type ClientInput } from "@/lib/api";
import { formatDay, formatDuration, formatTime, relativeDay, visitorTime, zoneAbbr, zoneCity } from "@/lib/dates";
import { money } from "@/lib/format";
import { bookingWindow } from "@/lib/availability";
import { update, useStore } from "@/lib/store";
import type { Booking, Category, DayPart, DemoState, ISODate, Service, WaitlistEntry } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Avatar, Button, Field, Modal, Spinner, cx, inputClass } from "../ui";
import { Confirmation } from "./confirmation";
import { DemoBar, SalonHeader } from "./site-header";
import { TimePicker, type TimeChoice } from "./time-picker";

const CATEGORIES: Category[] = ["Cuts", "Color", "Styling", "Barbering", "Treatments"];

function Step({ n, title, current, summary, onEdit, children }: { n: number; title: string; current: number; summary?: React.ReactNode; onEdit: () => void; children: React.ReactNode }) {
  const open = n === current;
  const done = n < current;
  return (
    <section aria-labelledby={`step-${n}`} className={cx("rounded-xl border bg-surface shadow-card transition-colors duration-200", open ? "border-border-strong" : "border-border")}>
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-5">
        <span
          className={cx(
            "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-200",
            done ? "border-accent bg-accent text-accent-fg" : open ? "border-text text-text" : "border-border text-faint",
          )}
          aria-hidden
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : n + 1}
        </span>
        <div className="min-w-0 flex-1 py-3">
          <h2 id={`step-${n}`} className={cx("font-semibold", !open && !done && "text-faint")}>
            {title}
          </h2>
          {done && summary && <p className="truncate text-muted">{summary}</p>}
        </div>
        {done && (
          <button onClick={onEdit} className="rounded-md px-2 py-1 font-medium text-accent hover:bg-accent-soft">
            Change<span className="sr-only"> {title.toLowerCase()}</span>
          </button>
        )}
      </div>
      {open && <div className="animate-enter border-t border-border px-4 py-4 sm:px-5 sm:py-5">{children}</div>}
    </section>
  );
}

function ServiceList({ services, value, onPick }: { services: Service[]; value: string | null; onPick: (id: string) => void }) {
  const [cat, setCat] = useState<Category | "All">("All");
  const shown = services.filter((s) => s.active && (cat === "All" || s.category === cat));
  return (
    <div>
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Categories">
        {(["All", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={cx("h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150", cat === c ? "border-text bg-text text-bg" : "border-border text-muted hover:border-border-strong hover:text-text")}
          >
            {c}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {shown.map((s) => {
          const on = value === s.id;
          return (
            <li key={s.id}>
              <button onClick={() => onPick(s.id)} aria-pressed={on} className={cx("flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-150", on ? "bg-accent-soft" : "hover:bg-surface-2")}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    {s.popular && <span className="rounded border border-border px-1 text-[11px] text-muted">Popular</span>}
                  </span>
                  <span className="mt-0.5 block text-muted">{s.description}</span>
                  <span className="mt-1 block text-xs text-faint">{formatDuration(s.duration)}</span>
                </span>
                <span className="shrink-0 pt-px font-medium tabular-nums">{money(s.price)}</span>
                <span className={cx("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors", on ? "border-accent bg-accent text-accent-fg" : "border-border-strong")} aria-hidden>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StaffList({ state, serviceId, addOnIds, now, value, onPick }: { state: DemoState; serviceId: string; addOnIds: string[]; now: number; value: string | null; onPick: (id: string) => void }) {
  const team = staffFor(state, serviceId, addOnIds);
  const { today } = bookingWindow(state, now);
  const options = [{ id: "any", name: "Any professional", role: "Whoever is free first", bio: "" }, ...team];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((p) => {
        const next = nextAvailable(state, { serviceId, addOnIds, staffId: p.id, now });
        const on = value === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            aria-pressed={on}
            className={cx("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors duration-150", on ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong hover:bg-surface-2")}
          >
            {p.id === "any" ? (
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-3 text-muted" aria-hidden>
                <Users className="size-4" />
              </span>
            ) : (
              <Avatar name={p.name} size={40} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted">{p.role}</span>
              <span className={cx("mt-1 block text-xs", next ? "text-success" : "text-faint")}>{next ? `Next: ${relativeDay(next.date, today)}, ${formatTime(next.slot.start)}` : "Fully booked"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuickPicks({ state, now, onPick }: { state: DemoState; now: number; onPick: (serviceId: string, t: TimeChoice) => void }) {
  const { today } = bookingWindow(state, now);
  const picks = state.services
    .filter((s) => s.active && s.popular)
    .map((s) => ({ service: s, next: nextAvailable(state, { serviceId: s.id, staffId: "any", now }) }))
    .filter((x) => x.next)
    .slice(0, 4);
  if (!picks.length) return null;
  return (
    <div className="mb-6">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Sparkles className="size-3.5 text-faint" aria-hidden />
        Soonest openings
      </p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {picks.map(({ service, next }) => (
          <button
            key={service.id}
            onClick={() => onPick(service.id, { date: next!.date, start: next!.slot.start })}
            className="group rounded-lg border border-border bg-surface p-3 text-left shadow-card transition-colors duration-150 hover:border-accent"
          >
            <span className="block truncate font-medium">{service.name}</span>
            <span className="block text-xs text-muted">
              {formatDuration(service.duration)} · {money(service.price)}
            </span>
            <span className="mt-2 flex items-center justify-between text-xs font-medium text-accent">
              {relativeDay(next!.date, today)}, {formatTime(next!.slot.start)}
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Services from other categories that can follow the chosen one in the same visit, with someone who does both. */
function AddOns({ state, serviceId, value, onChange }: { state: DemoState; serviceId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const category = state.services.find((x) => x.id === serviceId)?.category;
  const options = state.services.filter((x) => x.active && x.id !== serviceId && x.category !== category && (visitFor(state, serviceId, [...value.filter((id) => id !== x.id), x.id])?.staffIds.length ?? 0) > 0);
  if (!options.length) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium text-muted">Add to this visit (optional), done right after by the same person</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add a service to this visit">
        {options.map((x) => {
          const on = value.includes(x.id);
          const full = !on && value.length >= 2;
          return (
            <button
              key={x.id}
              type="button"
              disabled={full}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((id) => id !== x.id) : [...value, x.id])}
              className={cx(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-150 disabled:opacity-40",
                on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:border-border-strong hover:text-text",
              )}
            >
              {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
              {x.name}
              <span className="text-faint">
                {formatDuration(x.duration)} · {money(x.price)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PART_LABEL: Record<DayPart, string> = { any: "Any time", morning: "Morning (before 12)", afternoon: "Afternoon (12–5)", evening: "Evening (after 5)" };

/** A full day: leave contact details and the part of the day that works, and get a text if it opens up. */
function WaitlistDialog({ state, serviceId, addOnIds, staffId, date, client, setClient, onClose, onJoined }: { state: DemoState; serviceId: string; addOnIds: string[]; staffId: string; date: ISODate; client: ClientInput; setClient: (c: ClientInput) => void; onClose: () => void; onJoined: (e: WaitlistEntry) => void }) {
  const [part, setPart] = useState<DayPart>("any");
  const [errors, setErrors] = useState<Partial<Record<keyof ClientInput, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const visit = visitFor(state, serviceId, addOnIds);
  const set = (k: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement>) => setClient({ ...client, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateClient(client);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    let r: ReturnType<typeof joinWaitlist> | undefined;
    update((d) => {
      r = joinWaitlist(d, { serviceId, addOnIds, staffId, date, part, client }, Date.now());
    });
    if (r?.ok) onJoined(r.value);
    else if (r) setError(r.error);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Waitlist for ${formatDay(date)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="waitlist-form">
            Join the waitlist
          </Button>
        </>
      }
    >
      <form id="waitlist-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <p className="text-muted sm:col-span-2">
          {visit?.name} with {staffId === "any" ? "any professional" : state.staff.find((p) => p.id === staffId)?.name}. If someone cancels, we text everyone waiting for that time; the first to call gets it.
        </p>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-xs font-medium text-muted">When can you come in?</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {(Object.keys(PART_LABEL) as DayPart[]).map((p) => (
              <label key={p} className={cx("flex h-9 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-xs font-medium", part === p ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:border-border-strong")}>
                <input type="radio" name="part" value={p} checked={part === p} onChange={() => setPart(p)} className="sr-only" />
                {PART_LABEL[p]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <Field label="Full name" error={errors.name}>
            {(fid, d) => <input id={fid} autoComplete="name" value={client.name} maxLength={LIMITS.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={d} className={cx(inputClass, "h-9")} />}
          </Field>
        </div>
        <Field label="Email" error={errors.email}>
          {(fid, d) => <input id={fid} type="email" autoComplete="email" value={client.email} maxLength={LIMITS.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={d} className={cx(inputClass, "h-9")} />}
        </Field>
        <Field label="Mobile phone" error={errors.phone} hint="We text you when a time opens up.">
          {(fid, d) => <input id={fid} type="tel" autoComplete="tel" value={client.phone} maxLength={LIMITS.phone} onChange={set("phone")} aria-invalid={!!errors.phone} aria-describedby={d} className={cx(inputClass, "h-9")} />}
        </Field>
        {error && (
          <p className="text-danger sm:col-span-2" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function Intro({ state }: { state: DemoState }) {
  return (
    <section className="mb-7 animate-enter">
      <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] sm:text-[30px] sm:leading-9">Book an appointment</h1>
      <p className="mt-1.5 max-w-xl text-[14px] text-muted">Choose a service and see live availability across the whole team. It takes under a minute, and you pay at the salon.</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="flex -space-x-1" aria-hidden>
            {state.staff.map((p) => (
              <span key={p.id} className="rounded-full ring-2 ring-bg">
                <Avatar name={p.name} size={22} />
              </span>
            ))}
          </span>
          {state.staff.length} professionals
        </span>
        <span className="flex items-center gap-1.5">
          <Check className="size-3.5 text-success" aria-hidden /> Instant confirmation
        </span>
        <span className="flex items-center gap-1.5">
          <Check className="size-3.5 text-success" aria-hidden /> Free cancellation up to {state.rules.cancelHours} h before
        </span>
      </div>
    </section>
  );
}

function Details({ id, onSubmit, value, onChange, errors, notes, setNotes }: { id: string; onSubmit: (e: React.FormEvent) => void; value: ClientInput; onChange: (v: ClientInput) => void; errors: Partial<Record<keyof ClientInput, string>>; notes: string; setNotes: (s: string) => void }) {
  const set = (k: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <form id={id} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Full name" error={errors.name}>
          {(fid, d) => <input id={fid} autoComplete="name" value={value.name} maxLength={LIMITS.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={d} className={cx(inputClass, "h-9")} />}
        </Field>
      </div>
      <Field label="Email" error={errors.email} hint="For your confirmation and booking link.">
        {(fid, d) => <input id={fid} type="email" autoComplete="email" value={value.email} maxLength={LIMITS.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={d} className={cx(inputClass, "h-9")} />}
      </Field>
      <Field label="Mobile phone" error={errors.phone} hint="We text a reminder the day before.">
        {(fid, d) => <input id={fid} type="tel" autoComplete="tel" value={value.phone} maxLength={LIMITS.phone} onChange={set("phone")} aria-invalid={!!errors.phone} aria-describedby={d} className={cx(inputClass, "h-9")} />}
      </Field>
      <div className="sm:col-span-2">
        <Field label="Anything we should know? (optional)">
          {(fid) => <textarea id={fid} rows={2} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} className={cx(inputClass, "h-auto py-2")} placeholder="Allergies, reference photos, accessibility needs" />}
        </Field>
      </div>
      <p className="text-xs text-muted sm:col-span-2">Demo: nothing is sent. Use any name and an address like you@mail.example.</p>
    </form>
  );
}

export function BookingPage() {
  const state = useStore();
  const now = useNow();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  // The visitor's own time zone is only known in the browser, after the static page has loaded.
  const visitorZone = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [waitDate, setWaitDate] = useState<ISODate | null>(null);
  const [waiting, setWaiting] = useState<WaitlistEntry | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [time, setTime] = useState<TimeChoice | null>(null);
  const [client, setClient] = useState<ClientInput>({ name: "", email: "", phone: "" });
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof ClientInput, string>>>({});
  const [done, setDone] = useState<Booking | null>(null);

  // A time chosen here can be taken in another tab (or by the salon) at any moment.
  const slot = useMemo(() => {
    if (!state || !serviceId || !staffId || !time) return null;
    return getSlots(state, { serviceId, addOnIds, staffId, date: time.date, now }).find((s) => s.start === time.start) ?? null;
  }, [state, serviceId, addOnIds, staffId, time, now]);
  const lost = !!time && !slot && !done;

  if (!state || !now) return <Spinner label="Loading booking page" />;

  const service = state.services.find((s) => s.id === serviceId) ?? null;
  const visit = serviceId ? visitFor(state, serviceId, addOnIds) : null;
  const person = state.staff.find((p) => p.id === staffId) ?? null;
  const { today } = bookingWindow(state, now);

  const pickService = (id: string) => {
    setServiceId(id);
    setAddOnIds([]);
    if (staffId && staffId !== "any" && !state.services.find((s) => s.id === id)?.staffIds.includes(staffId)) setStaffId(null);
    setTime(null);
    setStep(staffId && (staffId === "any" || state.services.find((s) => s.id === id)?.staffIds.includes(staffId)) ? 2 : 1);
  };

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId || !staffId || !time) return;
    const errs = validateClient(client);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    let result: ReturnType<typeof createBooking> | undefined;
    update((d) => {
      result = createBooking(d, { serviceId, addOnIds, staffId, date: time.date, start: time.start, client, notes, source: "online", online: true }, Date.now());
    });
    if (result?.ok) {
      setDone(result.value);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (result) {
      toast(result.error, "error");
      setTime(null);
      setStep(2);
    }
  };

  if (done) {
    return (
      <>
        <DemoBar />
        <SalonHeader state={state} now={now} compact />
        <Confirmation
          state={state}
          booking={state.bookings.find((b) => b.id === done.id) ?? done}
          name={client.name}
          onAgain={() => {
            setDone(null);
            setStep(0);
            setServiceId(null);
            setAddOnIds([]);
            setStaffId(null);
            setTime(null);
            setNotes("");
          }}
        />
      </>
    );
  }

  if (waiting) {
    const v = visitFor(state, waiting.serviceId, waiting.addOnIds);
    return (
      <>
        <DemoBar />
        <SalonHeader state={state} now={now} compact />
        <main id="main" className="mx-auto max-w-xl animate-rise px-4 py-10 text-center sm:py-14">
          <BellRing className="mx-auto mb-3 size-9 text-accent" strokeWidth={1.75} aria-hidden />
          <h1 className="text-xl font-semibold tracking-[-0.015em]">You&apos;re on the waitlist</h1>
          <p className="mt-2 text-muted">
            {v?.name} on {formatDay(waiting.date)}
            {waiting.part !== "any" && `, ${waiting.part}`}. If a time opens up, we&apos;ll text {client.phone.trim()} straight away. In this demo the text shows in the salon&apos;s Messages page.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setWaiting(null);
                setStep(2);
              }}
            >
              Pick another day
            </Button>
            <Button onClick={() => window.open(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/admin/waitlist/`, "_blank")}>See the salon&apos;s waitlist</Button>
          </div>
        </main>
      </>
    );
  }

  const zone = state.salon.timeZone;
  const whenText = time && visit ? `${relativeDay(time.date, today)}, ${formatTime(time.start)} – ${formatTime(time.start + visit.duration)} ${zoneAbbr(zone)}` : null;
  const yourTime = time && visitorZone ? visitorTime(time.date, time.start, zone, visitorZone) : null;
  const staffText = staffId === "any" ? "Any professional" : person?.name;
  const canContinue = step === 0 ? !!service : step === 1 ? !!staffId : step === 2 ? !!slot : true;

  const primary =
    step === 3 ? (
      <Button type="submit" form="details" variant="primary" className="h-9 w-full">
        Confirm booking
      </Button>
    ) : (
      <Button variant="primary" className="h-9 w-full" disabled={!canContinue} onClick={() => setStep(step + 1)}>
        Continue <ArrowRight />
      </Button>
    );

  return (
    <>
      <DemoBar />
      <SalonHeader state={state} now={now} />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-6 pb-36 sm:px-6 lg:pt-8 lg:pb-16">
        {step === 0 && !service && <Intro state={state} />}
        {step === 0 && !service && <QuickPicks state={state} now={now} onPick={(id, t) => { setServiceId(id); setStaffId("any"); setTime(t); setStep(3); }} />}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <Step n={0} title="Choose a service" current={step} onEdit={() => setStep(0)} summary={visit && `${visit.name} · ${formatDuration(visit.duration)} · ${money(visit.price)}`}>
              <ServiceList services={state.services} value={serviceId} onPick={pickService} />
            </Step>
            <Step n={1} title="Choose a professional" current={step} onEdit={() => setStep(1)} summary={staffText}>
              {serviceId && (
                <AddOns
                  state={state}
                  serviceId={serviceId}
                  value={addOnIds}
                  onChange={(ids) => {
                    setAddOnIds(ids);
                    setTime(null);
                    const v = visitFor(state, serviceId, ids);
                    if (staffId && staffId !== "any" && !v?.staffIds.includes(staffId)) setStaffId(null);
                  }}
                />
              )}
              {serviceId && (
                <StaffList
                  state={state}
                  serviceId={serviceId}
                  addOnIds={addOnIds}
                  now={now}
                  value={staffId}
                  onPick={(id) => {
                    setStaffId(id);
                    setTime(null);
                    setStep(2);
                  }}
                />
              )}
            </Step>
            <Step n={2} title="Pick a time" current={step} onEdit={() => setStep(2)} summary={whenText && (yourTime ? `${whenText} (${yourTime})` : whenText)}>
              <p className="mb-3 text-xs text-muted" data-testid="zone-note">
                Times are in salon time ({zoneCity(zone)}, {zoneAbbr(zone)}).
                {visitorZone && visitorZone !== zone && ` You're in ${zoneCity(visitorZone)}: we show your local time once you pick a slot.`}
              </p>
              {lost && <p className="mb-4 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-warning">That time was just booked by someone else. Please pick another.</p>}
              {serviceId && staffId && (
                <TimePicker
                  state={state}
                  serviceId={serviceId}
                  addOnIds={addOnIds}
                  staffId={staffId}
                  now={now}
                  onWaitlist={setWaitDate}
                  value={time}
                  onChange={(t) => {
                    setTime(t);
                    setStep(3);
                  }}
                />
              )}
            </Step>
            <Step n={3} title="Your details" current={step} onEdit={() => setStep(3)}>
              {lost ? (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-warning">
                  That time was just booked by someone else.
                  <Button size="sm" onClick={() => setStep(2)}>
                    <ChevronLeft /> Pick another time
                  </Button>
                </div>
              ) : (
                <Details id="details" onSubmit={confirm} value={client} onChange={setClient} errors={errors} notes={notes} setNotes={setNotes} />
              )}
            </Step>
          </div>

          <aside className="sticky top-6 hidden lg:block" aria-label="Booking summary">
            <Summary state={state} visit={visit} staffText={staffText} whenText={whenText} />
            <div className="mt-3">{primary}</div>
            <p className="mt-3 text-center text-xs text-muted">Free cancellation up to {state.rules.cancelHours} hours before.</p>
          </aside>
        </div>
      </main>

      {waitDate && serviceId && staffId && (
        <WaitlistDialog
          state={state}
          serviceId={serviceId}
          addOnIds={addOnIds}
          staffId={staffId}
          date={waitDate}
          client={client}
          setClient={setClient}
          onClose={() => setWaitDate(null)}
          onJoined={(e) => {
            setWaitDate(null);
            setWaiting(e);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{visit ? visit.name : "No service yet"}</p>
            <p className="truncate text-xs text-muted">{whenText ?? (visit ? `${formatDuration(visit.duration)} · ${money(visit.price)}` : "Choose a service to start")}</p>
          </div>
          <div className="w-40 shrink-0">{primary}</div>
        </div>
      </div>
    </>
  );
}

function Summary({ state, visit, staffText, whenText }: { state: DemoState; visit: Visit | null; staffText?: string; whenText: string | null }) {
  const rows: [string, React.ReactNode][] = [
    ["Service", visit?.name],
    ["Professional", staffText],
    ["When", whenText],
    ["Duration", visit && formatDuration(visit.duration)],
  ];
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-semibold">{state.salon.name}</p>
        <p className="text-xs text-muted">{state.salon.address}</p>
      </div>
      <dl className="space-y-2.5 px-4 py-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className={cx("text-right", v ? "font-medium" : "text-faint")}>{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between border-t border-border px-4 py-3">
        <span className="text-muted">Total</span>
        <span className="text-[17px] font-semibold tabular-nums">{visit ? money(visit.price) : "—"}</span>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted">Pay at the salon. No card needed to book.</p>
    </div>
  );
}
