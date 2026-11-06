"use client";

import { BellRing, CalendarPlus, ListTodo, Phone, X } from "lucide-react";
import { useState } from "react";
import { bookingTitle, bookingWindow } from "@/lib/availability";
import { bookFromWaitlist, removeFromWaitlist, waitlistOpenings } from "@/lib/api";
import { formatTime, relativeDay } from "@/lib/dates";
import { firstName, timeAgo } from "@/lib/format";
import { update, useStore } from "@/lib/store";
import type { DayPart, DemoState, WaitlistEntry } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useToast } from "../toast";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Spinner, cx } from "../ui";
import { useLang, useT } from "@/lib/i18n";

const PART: Record<DayPart, string> = { any: "Any time", morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

function Row({ s, e, now }: { s: DemoState; e: WaitlistEntry; now: number }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const client = s.clients.find((c) => c.id === e.clientId);
  const { today } = bookingWindow(s, now);
  const open = waitlistOpenings(s, e, now);
  const [choice, setChoice] = useState<string>("");
  const picked = open.find((o) => String(o.start) === choice) ?? open[0];
  const staffName = (id: string) => firstName(s.staff.find((p) => p.id === id)?.name ?? "");

  const book = () => {
    if (!picked) return;
    let r: ReturnType<typeof bookFromWaitlist> | undefined;
    update((d) => {
      r = bookFromWaitlist(d, e.id, picked.start, picked.staffIds[0], Date.now());
    });
    if (r?.ok) toast(t("Booked {client} at {time} with {staff}. A confirmation is in Messages.", { client: client ? firstName(client.name) : t("the client"), time: formatTime(picked.start), staff: staffName(picked.staffIds[0]) }));
    else if (r) toast(r.error, "error");
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {client && <Avatar name={client.name} size={32} />}
        <div className="min-w-0">
          <p className="truncate font-medium">{client?.name ?? "Unknown client"}</p>
          <p className="truncate text-muted">
            {bookingTitle(s, e)} · {e.staffId === "any" ? t("anyone") : staffName(e.staffId)} · {relativeDay(e.date, today)}, {t(PART[e.part]).toLocaleLowerCase(lang)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-faint">
            <span>{t("Joined {time}", { time: timeAgo(e.createdAt, now) })}</span>
            {client && (
              <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-accent">
                <Phone className="size-3" aria-hidden /> {client.phone}
              </a>
            )}
            {e.notifiedAt && (
              <span className="inline-flex items-center gap-1 text-accent">
                <BellRing className="size-3" aria-hidden /> {t("Texted {time}", { time: timeAgo(e.notifiedAt, now) })}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {open.length ? (
          <>
            <Badge tone="success">{t(open.length === 1 ? "{n} time free" : "{n} times free", { n: open.length })}</Badge>
            <label className="sr-only" htmlFor={`slot-${e.id}`}>
              {t("Time for {name}", { name: client?.name ?? "" })}
            </label>
            <select id={`slot-${e.id}`} value={picked ? String(picked.start) : ""} onChange={(x) => setChoice(x.target.value)} className="h-7 rounded-md border border-border bg-surface px-2 text-xs">
              {open.map((o) => (
                <option key={o.start} value={o.start}>
                  {formatTime(o.start)} · {staffName(o.staffIds[0])}
                </option>
              ))}
            </select>
            <Button size="sm" variant="primary" onClick={book}>
              <CalendarPlus /> {t("Book")}
            </Button>
          </>
        ) : (
          <Badge>{t("Still full")}</Badge>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-label={t("Remove {name} from the waitlist", { name: client?.name ?? t("entry") })}
          onClick={() => {
            update((d) => removeFromWaitlist(d, e.id));
            toast(t("Removed from the waitlist."));
          }}
        >
          <X />
        </Button>
      </div>
    </li>
  );
}

/**
 * Clients waiting for a full day. When something frees up (a cancellation, a move, longer
 * hours), each entry shows the times that now suit it and can be booked in one click; the
 * client has already had a text about it, which is in Messages.
 */
export function Waitlist() {
  const t = useT();
  const s = useStore();
  const now = useNow();
  if (!s || !now) return <Spinner />;
  const { today } = bookingWindow(s, now);
  const waiting = s.waitlist.filter((e) => e.status === "waiting" && e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const ready = waiting.filter((e) => waitlistOpenings(s, e, now).length > 0);
  const booked = s.waitlist.filter((e) => e.status === "booked").length;

  return (
    <div>
      <PageHeader
        title={t("Waitlist")}
        description={t("Clients waiting for a day that was full. When a time frees up they get a text, and you can book them here.")}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-md border border-border px-2 py-1">
          <span className="font-semibold text-text tabular-nums">{waiting.length}</span> {t("waiting")}
        </span>
        <span className={cx("rounded-md border px-2 py-1", ready.length ? "border-success/40 text-success" : "border-border")}>
          <span className="font-semibold tabular-nums">{ready.length}</span> {t("with a free time now")}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          <span className="font-semibold text-text tabular-nums">{booked}</span> {t("booked from the waitlist")}
        </span>
      </div>
      <Card>
        {waiting.length ? (
          <ul className="divide-y divide-border">
            {waiting.map((e) => (
              <Row key={e.id} s={s} e={e} now={now} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={ListTodo} title={t("No one is waiting")} text={t("When a day is full, the booking page offers a waitlist. Entries show up here.")} />
        )}
      </Card>
    </div>
  );
}
