"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { formatDuration } from "@/lib/dates";
import { money } from "@/lib/format";
import { update, useStore } from "@/lib/store";
import type { Category, DemoState, Service } from "@/lib/types";
import { useToast } from "../toast";
import { Avatar, Badge, Button, Card, CardHeader, Field, Modal, PageHeader, Spinner, cx, inputClass } from "../ui";
import { selectClass } from "./booking-dialogs";

const CATEGORIES: Category[] = ["Cuts", "Color", "Styling", "Barbering", "Treatments"];
const DURATIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15);
const BUFFERS = [0, 5, 10, 15, 20, 30];

function blank(s: DemoState): Service {
  return { id: "", name: "", category: "Cuts", description: "", duration: 30, buffer: 5, price: 40, staffIds: s.staff.map((p) => p.id), active: true };
}

function ServiceForm({ s, initial, onClose }: { s: DemoState; initial: Service; onClose: () => void }) {
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Service>(k: K, x: Service[K]) => setV((o) => ({ ...o, [k]: x }));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (v.name.trim().length < 2) return setError("Give the service a name.");
    if (!v.staffIds.length) return setError("Choose at least one person who offers it.");
    if (!(v.price >= 0)) return setError("Enter a price.");
    update((d) => {
      const next = { ...v, name: v.name.trim(), description: v.description.trim() };
      if (!next.id) {
        next.id = `svc-${Date.now().toString(36)}`;
        d.services.push(next);
      } else d.services = d.services.map((x) => (x.id === next.id ? next : x));
    });
    toast(initial.id ? "Service updated. The booking page uses it straight away." : "Service added to the booking page.");
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial.id ? `Edit ${initial.name}` : "New service"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="service-form">
            Save
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={save} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name">{(id) => <input id={id} value={v.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />}</Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" hint="Shown to clients on the booking page.">
            {(id, d) => <input id={id} aria-describedby={d} value={v.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />}
          </Field>
        </div>
        <Field label="Category">
          {(id) => (
            <select id={id} value={v.category} onChange={(e) => set("category", e.target.value as Category)} className={selectClass}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Price (USD)">{(id) => <input id={id} type="number" min={0} step={1} value={v.price} onChange={(e) => set("price", Number(e.target.value))} className={inputClass} />}</Field>
        <Field label="Duration">
          {(id) => (
            <select id={id} value={v.duration} onChange={(e) => set("duration", Number(e.target.value))} className={selectClass}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Clean-up buffer" hint="Blocked after each appointment.">
          {(id, d) => (
            <select id={id} aria-describedby={d} value={v.buffer} onChange={(e) => set("buffer", Number(e.target.value))} className={selectClass}>
              {BUFFERS.map((m) => (
                <option key={m} value={m}>
                  {m ? `${m} min` : "None"}
                </option>
              ))}
            </select>
          )}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium text-muted">Offered by</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {s.staff.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-surface-2">
                <input type="checkbox" className="accent-[var(--accent)]" checked={v.staffIds.includes(p.id)} onChange={(e) => set("staffIds", e.target.checked ? [...v.staffIds, p.id] : v.staffIds.filter((x) => x !== p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" className="accent-[var(--accent)]" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
          Bookable online
        </label>
        {error && (
          <p className="text-danger sm:col-span-2" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function Services() {
  const s = useStore();
  const [editing, setEditing] = useState<Service | null>(null);
  if (!s) return <Spinner />;
  return (
    <div>
      <PageHeader
        title="Services"
        description={`${s.services.filter((x) => x.active).length} services on the booking page`}
        actions={
          <Button variant="primary" onClick={() => setEditing(blank(s))}>
            <Plus /> New service
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {CATEGORIES.map((c) => {
          const list = s.services.filter((x) => x.category === c);
          if (!list.length) return null;
          return (
            <Card key={c}>
              <CardHeader title={c} meta={`${list.length} services`} />
              <ul className="divide-y divide-border">
                {list.map((x) => (
                  <li key={x.id} className={cx("flex items-center gap-3 px-4 py-3", !x.active && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        {x.name}
                        {!x.active && <Badge>Hidden</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {formatDuration(x.duration)}
                        {x.buffer ? ` + ${x.buffer} min buffer` : ""} · {x.description}
                      </p>
                    </div>
                    <div className="hidden -space-x-1.5 sm:flex" aria-label={`Offered by ${x.staffIds.length} people`}>
                      {x.staffIds.slice(0, 4).map((id) => {
                        const p = s.staff.find((y) => y.id === id);
                        return p ? <Avatar key={id} name={p.name} size={22} /> : null;
                      })}
                    </div>
                    <span className="w-14 text-right font-medium tabular-nums">{money(x.price)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(x)} aria-label={`Edit ${x.name}`}>
                      <Pencil />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {editing && <ServiceForm key={editing.id || "new"} s={s} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
