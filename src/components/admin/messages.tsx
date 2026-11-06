"use client";

import { Mail, MessageSquare, Search, Send } from "lucide-react";
import { useState } from "react";
import { upcomingReminders } from "@/lib/messages";
import { formatTime, relativeDay, zonedNow } from "@/lib/dates";
import { timeAgo, uiLocale } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { DemoState, Message, MessageKind } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { Badge, Card, EmptyState, PageHeader, Spinner, cx, inputClass, type Tone } from "../ui";
import { useT } from "@/lib/i18n";

const KIND: Record<MessageKind, { label: string; tone: Tone }> = {
  confirmation: { label: "Confirmation", tone: "accent" },
  rescheduled: { label: "New time", tone: "info" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  series: { label: "Series", tone: "accent" },
  "waitlist-joined": { label: "Waitlist", tone: "warning" },
  "slot-open": { label: "Time opened", tone: "success" },
};

type Tab = "sent" | "scheduled";

function Channel({ channel }: { channel: Message["channel"] }) {
  const Icon = channel === "sms" ? MessageSquare : Mail;
  return <Icon className="size-3.5 shrink-0 text-faint" aria-label={channel === "sms" ? "Text message" : "Email"} />;
}

function Sent({ s, now, q, kind }: { s: DemoState; now: number; q: string; kind: MessageKind | "all" }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const list = [...s.outbox]
    .reverse()
    .filter((m) => kind === "all" || m.kind === kind)
    .filter((m) => {
      if (!needle) return true;
      const c = s.clients.find((x) => x.id === m.clientId);
      return m.subject.toLowerCase().includes(needle) || (c && (c.name.toLowerCase().includes(needle) || c.email.includes(needle)));
    })
    .slice(0, 100);
  if (!list.length) return <EmptyState icon={Send} title={t("Nothing here yet")} text={t("Bookings, changes, cancellations and waitlist texts show up as they happen.")} />;
  return (
    <ul className="divide-y divide-border">
      {list.map((m) => {
        const c = s.clients.find((x) => x.id === m.clientId);
        const on = open === m.id;
        return (
          <li key={m.id}>
            <button onClick={() => setOpen(on ? null : m.id)} aria-expanded={on} className={cx("flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-100", on ? "bg-surface-2" : "hover:bg-surface-2")}>
              <span className="pt-0.5">
                <Channel channel={m.channel} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{c?.name ?? "Client"}</span>
                  <span className="shrink-0 text-xs text-faint tabular-nums">{timeAgo(m.at, now)}</span>
                </span>
                <span className="block truncate text-muted">{m.subject}</span>
              </span>
              <span className="hidden pt-0.5 sm:block">
                <Badge tone={KIND[m.kind].tone}>{t(KIND[m.kind].label)}</Badge>
              </span>
            </button>
            {on && (
              <div className="animate-enter border-t border-border bg-surface-2/60 px-4 py-3">
                <p className="text-xs text-muted">
                  {t("To")} {m.channel === "sms" ? c?.phone : c?.email} · {new Date(m.at).toLocaleString(uiLocale(), { timeZone: s.salon.timeZone, dateStyle: "medium", timeStyle: "short" })}
                </p>
                <p className="mt-2 font-medium">{m.subject}</p>
                <p className="mt-1 max-w-2xl whitespace-pre-line text-muted">{m.body}</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Scheduled({ s, now }: { s: DemoState; now: number }) {
  const t = useT();
  const due = upcomingReminders(s, now);
  const { date: today } = zonedNow(s.salon.timeZone, now);
  if (!due.length) return <EmptyState icon={MessageSquare} title={t("No reminders due")} text={t("Each confirmed appointment gets a text 24 hours before. The next two days of them show up here.")} />;
  return (
    <ul className="divide-y divide-border">
      {due.map((r) => {
        const c = s.clients.find((x) => x.id === r.booking.clientId);
        const send = zonedNow(s.salon.timeZone, r.sendAt);
        return (
          <li key={r.booking.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex w-40 shrink-0 items-center gap-2 text-xs text-muted tabular-nums">
              <MessageSquare className="size-3.5 text-faint" aria-hidden />
              {relativeDay(send.date, today)}, {formatTime(send.minutes)}
            </span>
            <span className="w-40 shrink-0 truncate font-medium">{c?.name}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{r.body}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Every email and text the salon would send, in one place. Nothing leaves the browser:
 * this is the outbox a real deployment would hand to an email and SMS provider.
 */
export function Messages() {
  const t = useT();
  const s = useStore();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("sent");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MessageKind | "all">("all");
  if (!s || !now) return <Spinner />;
  const scheduled = upcomingReminders(s, now).length;

  return (
    <div>
      <PageHeader title={t("Messages")} description={t("What clients are sent and when. In this demo nothing leaves your browser; a real salon would pass these to its email and SMS provider.")} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label={t("Messages")}>
          {(["sent", "scheduled"] as Tab[]).map((tb) => (
            <button key={tb} role="tab" aria-selected={tab === tb} onClick={() => setTab(tb)} className={cx("h-7 rounded px-3 text-xs font-medium", tab === tb ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
              {tb === "sent" ? `${t("Sent")} · ${s.outbox.length}` : `${t("Scheduled reminders")} · ${scheduled}`}
            </button>
          ))}
        </div>
        {tab === "sent" && (
          <>
            <label className="relative w-full min-w-0 sm:ml-auto sm:w-auto sm:flex-1 sm:max-w-64">
              <span className="sr-only">{t("Search messages")}</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Client or subject")} className={cx(inputClass, "pl-8")} />
            </label>
            <label className="sr-only" htmlFor="kind">
              {t("Kind")}
            </label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as MessageKind | "all")} className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] sm:w-auto">
              <option value="all">{t("All kinds")}</option>
              {(Object.keys(KIND) as MessageKind[]).map((k) => (
                <option key={k} value={k}>
                  {t(KIND[k].label)}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <Card>{tab === "sent" ? <Sent s={s} now={now} q={q} kind={kind} /> : <Scheduled s={s} now={now} />}</Card>
    </div>
  );
}
