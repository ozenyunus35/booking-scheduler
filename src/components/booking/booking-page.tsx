"use client";

import { ArrowRight, Check, ChevronLeft, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { getSlots, nextAvailable, staffFor } from "@/lib/availability";
import { createBooking, validateClient, type ClientInput } from "@/lib/api";
import { formatDuration, formatTime, relativeDay } from "@/lib/dates";
import { money } from "@/lib/format";
import { bookingWindow } from "@/lib/availability";
import { update, useStore } from "@/lib/store";
import type { Booking, Category, DemoState, Service } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Avatar, Button, Field, Spinner, cx, inputClass } from "../ui";
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

function StaffList({ state, serviceId, now, value, onPick }: { state: DemoState; serviceId: string; now: number; value: string | null; onPick: (id: string) => void }) {
  const team = staffFor(state, serviceId);
  const { today } = bookingWindow(state, now);
  const options = [{ id: "any", name: "Any professional", role: "Whoever is free first", bio: "" }, ...team];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((p) => {
        const next = nextAvailable(state, { serviceId, staffId: p.id, now });
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
          {(fid, d) => <input id={fid} autoComplete="name" value={value.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={d} className={cx(inputClass, "h-9")} />}
        </Field>
      </div>
      <Field label="Email" error={errors.email} hint="For your confirmation and booking link.">
        {(fid, d) => <input id={fid} type="email" autoComplete="email" value={value.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={d} className={cx(inputClass, "h-9")} />}
      </Field>
      <Field label="Mobile phone" error={errors.phone} hint="We text a reminder the day before.">
        {(fid, d) => <input id={fid} type="tel" autoComplete="tel" value={value.phone} onChange={set("phone")} aria-invalid={!!errors.phone} aria-describedby={d} className={cx(inputClass, "h-9")} />}
      </Field>
      <div className="sm:col-span-2">
        <Field label="Anything we should know? (optional)">
          {(fid) => <textarea id={fid} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={cx(inputClass, "h-auto py-2")} placeholder="Allergies, reference photos, accessibility needs" />}
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
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [time, setTime] = useState<TimeChoice | null>(null);
  const [client, setClient] = useState<ClientInput>({ name: "", email: "", phone: "" });
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof ClientInput, string>>>({});
  const [done, setDone] = useState<Booking | null>(null);

  // A time chosen here can be taken in another tab (or by the salon) at any moment.
  const slot = useMemo(() => {
    if (!state || !serviceId || !staffId || !time) return null;
    return getSlots(state, { serviceId, staffId, date: time.date, now }).find((s) => s.start === time.start) ?? null;
  }, [state, serviceId, staffId, time, now]);
  const lost = !!time && !slot && !done;

  if (!state || !now) return <Spinner label="Loading booking page" />;

  const service = state.services.find((s) => s.id === serviceId) ?? null;
  const person = state.staff.find((p) => p.id === staffId) ?? null;
  const { today } = bookingWindow(state, now);

  const pickService = (id: string) => {
    setServiceId(id);
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
      result = createBooking(d, { serviceId, staffId, date: time.date, start: time.start, client, notes, source: "online", online: true }, Date.now());
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
          onAgain={() => {
            setDone(null);
            setStep(0);
            setServiceId(null);
            setStaffId(null);
            setTime(null);
            setNotes("");
          }}
        />
      </>
    );
  }

  const whenText = time && service ? `${relativeDay(time.date, today)}, ${formatTime(time.start)} – ${formatTime(time.start + service.duration)}` : null;
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
            <Step n={0} title="Choose a service" current={step} onEdit={() => setStep(0)} summary={service && `${service.name} · ${formatDuration(service.duration)} · ${money(service.price)}`}>
              <ServiceList services={state.services} value={serviceId} onPick={pickService} />
            </Step>
            <Step n={1} title="Choose a professional" current={step} onEdit={() => setStep(1)} summary={staffText}>
              {serviceId && (
                <StaffList
                  state={state}
                  serviceId={serviceId}
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
            <Step n={2} title="Pick a time" current={step} onEdit={() => setStep(2)} summary={whenText}>
              {lost && <p className="mb-4 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-warning">That time was just booked by someone else. Please pick another.</p>}
              {serviceId && staffId && (
                <TimePicker
                  state={state}
                  serviceId={serviceId}
                  staffId={staffId}
                  now={now}
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
            <Summary state={state} service={service} staffText={staffText} whenText={whenText} />
            <div className="mt-3">{primary}</div>
            <p className="mt-3 text-center text-xs text-muted">Free cancellation up to {state.rules.cancelHours} hours before.</p>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{service ? service.name : "No service yet"}</p>
            <p className="truncate text-xs text-muted">{whenText ?? (service ? `${formatDuration(service.duration)} · ${money(service.price)}` : "Choose a service to start")}</p>
          </div>
          <div className="w-40 shrink-0">{primary}</div>
        </div>
      </div>
    </>
  );
}

function Summary({ state, service, staffText, whenText }: { state: DemoState; service: Service | null; staffText?: string; whenText: string | null }) {
  const rows: [string, React.ReactNode][] = [
    ["Service", service?.name],
    ["Professional", staffText],
    ["When", whenText],
    ["Duration", service && formatDuration(service.duration)],
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
        <span className="text-[17px] font-semibold tabular-nums">{service ? money(service.price) : "—"}</span>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted">Pay at the salon. No card needed to book.</p>
    </div>
  );
}
