"use client";

import { ChevronLeft, ChevronRight, Download, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { bookingTitle, bookingWindow } from "@/lib/availability";
import { formatDate, formatTime, relativeDay } from "@/lib/dates";
import { clientsCsv, download } from "@/lib/csv";
import { money } from "@/lib/format";
import { clientSummary } from "@/lib/stats";
import { update, useStore } from "@/lib/store";
import type { Client, DemoState } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Avatar, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, cx, inputClass } from "../ui";
import { NewBooking, STATUS_TONE, inlineSelectClass } from "./booking-dialogs";

const PAGE = 20;
type Sort = "recent" | "spent" | "visits" | "name";

function ClientModal({ s, client, now, onClose, onBook }: { s: DemoState; client: Client; now: number; onClose: () => void; onBook: () => void }) {
  const { toast } = useToast();
  const { today } = bookingWindow(s, now);
  const sum = clientSummary(s, client.id, today);
  const [notes, setNotes] = useState(client.notes);
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={client.name}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={onBook}>
            <Plus /> New booking
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={client.name} size={40} />
            <div className="min-w-0">
              <p className="truncate font-medium">{client.email}</p>
              <p className="text-muted">{client.phone}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Visits", String(sum.completed)],
              ["Spent", money(sum.spent)],
              ["No-shows", String(sum.noShows)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border px-2 py-2">
                <dd className="font-semibold tabular-nums">{v}</dd>
                <dt className="text-[11px] text-muted">{k}</dt>
              </div>
            ))}
          </dl>
          <Field label="Notes" hint="Visible to the team on every booking.">
            {(id, d) => <textarea id={id} aria-describedby={d} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={cx(inputClass, "h-auto py-2")} />}
          </Field>
          <Button
            size="sm"
            disabled={notes === client.notes}
            onClick={() => {
              update((d) => {
                const c = d.clients.find((x) => x.id === client.id);
                if (c) c.notes = notes.trim();
              });
              toast("Notes saved.");
            }}
          >
            Save notes
          </Button>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">History</p>
          {sum.visits.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sum.visits.slice(0, 30).map((b) => {
                const staff = s.staff.find((p) => p.id === b.staffId);
                return (
                  <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-28 shrink-0 text-xs text-muted tabular-nums">
                      {b.date >= today ? relativeDay(b.date, today) : formatDate(b.date)}
                      <span className="block text-faint">{formatTime(b.start)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{bookingTitle(s, b)}</span>
                      <span className="block truncate text-xs text-muted">with {staff?.name}</span>
                    </span>
                    <span className="hidden text-xs tabular-nums sm:block">{money(b.price)}</span>
                    <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted">No visits yet.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function Clients() {
  const s = useStore();
  const now = useNow();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);

  const today = s && now ? bookingWindow(s, now).today : "";
  const rows = useMemo(() => {
    if (!s) return [];
    return s.clients.map((c) => ({ c, ...clientSummary(s, c.id, today) }));
  }, [s, today]);

  if (!s || !now) return <Spinner />;

  const needle = q.trim().toLowerCase();
  const filtered = rows
    .filter(({ c }) => !needle || c.name.toLowerCase().includes(needle) || c.email.includes(needle) || c.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, "") || "\u0000"))
    .sort((a, b) =>
      sort === "name" ? a.c.name.localeCompare(b.c.name) : sort === "spent" ? b.spent - a.spent : sort === "visits" ? b.completed - a.completed : (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const recent = rows.filter((r) => r.lastVisit && r.lastVisit >= today.slice(0, 8) + "01").length;
  const openClient = open ? s.clients.find((c) => c.id === open) : undefined;

  return (
    <div>
      <PageHeader title="Clients" description={`${s.clients.length} clients · ${recent} visited this month`} actions={
          <>
            <Button onClick={() => download(`halden-clients-${today}.csv`, clientsCsv(s))}>
              <Download /> Export CSV
            </Button>
            <Button variant="primary" onClick={() => setBooking("")}>
              <Plus /> New booking
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, email or phone"
              aria-label="Search clients"
              className={cx(inputClass, "pl-8")}
            />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={inlineSelectClass} aria-label="Sort by">
            <option value="recent">Last visit</option>
            <option value="spent">Most spent</option>
            <option value="visits">Most visits</option>
            <option value="name">Name</option>
          </select>
          <span className="ml-auto text-xs text-muted">{filtered.length} shown</span>
        </div>
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Phone</th>
                  <th className="px-4 py-2 text-right font-medium">Visits</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Last visit</th>
                  <th className="hidden px-4 py-2 font-medium lg:table-cell">Next</th>
                  <th className="px-4 py-2 text-right font-medium">Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map(({ c, completed, spent, lastVisit, next, noShows }) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(c.id)}>
                    <td className="px-4 py-2.5">
                      <button className="flex items-center gap-2.5 text-left" onClick={() => setOpen(c.id)}>
                        <Avatar name={c.name} size={26} />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {c.name}
                            {noShows > 1 && <span className="ml-1.5 text-xs font-normal text-danger">{noShows} no-shows</span>}
                          </span>
                          <span className="block truncate text-xs text-muted">{c.email}</span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted tabular-nums md:table-cell">{c.phone}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{completed}</td>
                    <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{lastVisit ? formatDate(lastVisit) : "—"}</td>
                    <td className="hidden px-4 py-2.5 text-muted lg:table-cell">{next ? `${relativeDay(next.date, today)}, ${formatTime(next.start)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No clients found" text="Try another name, email or phone number." />
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted">
            <span>
              Page {current + 1} of {pages}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button size="sm" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {openClient && (
        <ClientModal
          key={openClient.id}
          s={s}
          client={openClient}
          now={now}
          onClose={() => setOpen(null)}
          onBook={() => {
            setOpen(null);
            setBooking(openClient.id);
          }}
        />
      )}
      {booking !== null && <NewBooking state={s} now={now} draft={{ date: today, clientId: booking || undefined }} onClose={() => setBooking(null)} />}
    </div>
  );
}
