"use client";

import { ArrowUpRight, Copy, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { resetDemo, update, useStore } from "@/lib/store";
import type { Rules } from "@/lib/types";
import { useToast } from "../toast";
import { Button, Card, CardHeader, Field, Modal, PageHeader, Spinner } from "../ui";
import { selectClass } from "./booking-dialogs";

const OPTIONS: Record<keyof Rules, { value: number; label: string }[]> = {
  slotStep: [10, 15, 20, 30, 60].map((v) => ({ value: v, label: `Every ${v} min` })),
  minNotice: [
    { value: 0, label: "No notice" },
    { value: 60, label: "1 hour" },
    { value: 120, label: "2 hours" },
    { value: 240, label: "4 hours" },
    { value: 720, label: "12 hours" },
    { value: 1440, label: "1 day" },
  ],
  maxDaysAhead: [7, 14, 30, 60, 90].map((v) => ({ value: v, label: `${v} days` })),
  cancelHours: [
    { value: 0, label: "Any time" },
    { value: 12, label: "12 hours before" },
    { value: 24, label: "24 hours before" },
    { value: 48, label: "48 hours before" },
  ],
};

const LABELS: Record<keyof Rules, { label: string; hint: string }> = {
  slotStep: { label: "Start times", hint: "How often a new appointment can start." },
  minNotice: { label: "Minimum notice", hint: "How soon clients can book online." },
  maxDaysAhead: { label: "Booking window", hint: "How far ahead the calendar is open." },
  cancelHours: { label: "Online changes", hint: "Until when clients can reschedule or cancel themselves." },
};

export function Settings() {
  const s = useStore();
  const { toast } = useToast();
  const [rules, setRules] = useState<Rules | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!s) return <Spinner />;
  const v = rules ?? s.rules;
  const dirty = JSON.stringify(v) !== JSON.stringify(s.rules);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Rules for online booking and details shown to clients." />
      <div className="space-y-3">
        <Card>
          <CardHeader title="Booking rules" />
          <form
            className="p-4"
            onSubmit={(e) => {
              e.preventDefault();
              update((d) => {
                d.rules = v;
              });
              setRules(null);
              toast("Booking rules saved. The booking page uses them straight away.");
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(Object.keys(OPTIONS) as (keyof Rules)[]).map((k) => (
                <Field key={k} label={LABELS[k].label} hint={LABELS[k].hint}>
                  {(id, d) => (
                    <select id={id} aria-describedby={d} value={v[k]} onChange={(e) => setRules({ ...v, [k]: Number(e.target.value) })} className={selectClass}>
                      {OPTIONS[k].map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {dirty && (
                <Button type="button" variant="ghost" onClick={() => setRules(null)}>
                  Discard
                </Button>
              )}
              <Button type="submit" variant="primary" disabled={!dirty}>
                Save rules
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Salon" />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
            {[
              ["Name", s.salon.name],
              ["Address", s.salon.address],
              ["Phone", s.salon.phone],
              ["Time zone", `${s.salon.timeZone.replace("_", " ")} (all times are salon time)`],
            ].map(([k, val]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium">{val}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Booking page" />
          <div className="flex flex-wrap items-center gap-2 p-4">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-xs">{link}</code>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  toast("Link copied.");
                } catch {
                  toast("Couldn't copy the link.", "error");
                }
              }}
            >
              <Copy /> Copy
            </Button>
            <Link href="/" target="_blank" className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-medium hover:bg-surface-2 [&_svg]:size-3.5">
              Open <ArrowUpRight />
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Demo data" />
          <div className="flex flex-wrap items-center gap-3 p-4">
            <p className="min-w-0 flex-1 text-muted">Everything here is synthetic and lives in this browser. The demo also refreshes itself each new day so the calendar stays current.</p>
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw /> Reset demo data
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
                setRules(null);
                toast("Demo data was reset.");
              }}
            >
              <RotateCcw /> Reset
            </Button>
          </>
        }
      >
        <p className="text-muted">Your bookings, edits to services, hours and rules are removed and the original synthetic salon is restored.</p>
      </Modal>
    </div>
  );
}
