"use client";

import { ArrowRight, CalendarDays, Download, Globe, ListTodo, Phone, Scissors, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bookingTitle, bookingWindow } from "@/lib/availability";
import { bookingsCsv, download } from "@/lib/csv";
import { addDays, formatDay, formatTime, relativeDay } from "@/lib/dates";
import { firstName, money, pct, timeAgo, uiLang } from "@/lib/format";
import { overview, type DayPoint } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { DemoState } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Meter, PageHeader, Sparkline, Spinner, cx } from "../ui";
import { BookingDetails, SOURCE_LABEL, STATUS_TONE } from "./booking-dialogs";
import { useT } from "@/lib/i18n";

function Change({ current, previous, invert, format = "pct" }: { current: number; previous: number; invert?: boolean; format?: "pct" | "pts" }) {
  const t = useT();
  const diff = format === "pts" ? Math.round((current - previous) * 100) : previous === 0 ? 0 : Math.round(((current - previous) / previous) * 100);
  const good = invert ? diff < 0 : diff > 0;
  return (
    <span className="text-xs text-muted">
      <span className={cx("font-medium tabular-nums", diff === 0 ? "text-muted" : good ? "text-success" : "text-danger")}>
        {diff > 0 ? "+" : ""}
        {diff}
        {format === "pts" ? " pts" : "%"}
      </span>{" "}
      <span className="hidden xl:inline">{t("vs prior period")}</span>
    </span>
  );
}

function Kpi({ label, value, change, spark, hint }: { label: string; value: string; change: React.ReactNode; spark?: number[]; hint: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted" title={hint}>
        {label}
      </p>
      <p className="mt-1.5 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        {change}
        {spark && (
          <div className="w-16 shrink-0 sm:w-20">
            <Sparkline data={spark} />
          </div>
        )}
      </div>
    </Card>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DayPoint }> }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="min-w-36 rounded-md bg-surface px-2.5 py-2 text-xs shadow-pop">
      <p className="mb-1 text-faint">{formatDay(d.date)}</p>
      <p className="flex justify-between gap-4">
        <span className="text-muted">{t("Revenue")}</span>
        <span className="font-medium tabular-nums">{money(d.revenue)}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-muted">{t("Appointments")}</span>
        <span className="font-medium tabular-nums">{d.appointments}</span>
      </p>
    </div>
  );
}

function RevenueChart({ data }: { data: DayPoint[] }) {
  return (
    <div className="h-56 px-2 pt-4 pb-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={6} tick={{ fill: "var(--faint)", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--faint)", fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? (uiLang() === "tr" ? `$${(v / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B` : `$${(v / 1000).toFixed(1)}k`) : `$${v}`)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="revenue" fill="var(--accent)" radius={[3, 3, 0, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Agenda({ s, now, onOpen }: { s: DemoState; now: number; onOpen: (id: string) => void }) {
  const t = useT();
  const { today, nowMinutes } = bookingWindow(s, now);
  const list = s.bookings.filter((b) => b.date === today && b.status !== "cancelled").sort((a, b) => a.start - b.start);
  if (!list.length) return <EmptyState icon={CalendarDays} title={t("No appointments today")} text={t("The salon is closed or nothing is booked yet.")} />;
  return (
    <ul className="divide-y divide-border">
      {list.map((b) => {
        const client = s.clients.find((c) => c.id === b.clientId);
        const staff = s.staff.find((p) => p.id === b.staffId);
        const nowOn = b.status === "confirmed" && b.start <= nowMinutes && b.end > nowMinutes;
        return (
          <li key={b.id}>
            <button onClick={() => onOpen(b.id)} className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2", b.end <= nowMinutes && "opacity-60")}>
              <span className="w-[68px] shrink-0 text-xs text-muted tabular-nums">{formatTime(b.start)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{client?.name}</span>
                <span className="block truncate text-xs text-muted">
                  {bookingTitle(s, b)} · {firstName(staff?.name ?? "")}
                </span>
              </span>
              {nowOn ? <Badge tone="warning">{t("In the chair")}</Badge> : <Badge tone={STATUS_TONE[b.status]}>{t(b.status)}</Badge>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RecentOnline({ s, now, onOpen }: { s: DemoState; now: number; onOpen: (id: string) => void }) {
  const t = useT();
  const { today } = bookingWindow(s, now);
  const list = s.bookings
    .filter((b) => b.source === "online" && b.status !== "cancelled")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  return (
    <ul className="divide-y divide-border">
      {list.map((b) => {
        const client = s.clients.find((c) => c.id === b.clientId);
        return (
          <li key={b.id}>
            <button onClick={() => onOpen(b.id)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
              <Avatar name={client?.name ?? ""} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <span className="font-medium">{client?.name}</span> <span className="text-muted">{t("booked {service}", { service: bookingTitle(s, b) })}</span>
                </span>
                <span className="block text-xs text-muted">
                  {t("For {day}, {time}", { day: relativeDay(b.date, today), time: formatTime(b.start) })}
                </span>
              </span>
              <span className="shrink-0 text-xs text-faint">{timeAgo(b.createdAt, now)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Dashboard() {
  const t = useT();
  const s = useStore();
  const now = useNow();
  const [open, setOpen] = useState<string | null>(null);
  const o = useMemo(() => (s && now ? overview(s, now) : null), [s, now]);
  if (!s || !now || !o) return <Spinner />;
  const openBooking = open ? s.bookings.find((b) => b.id === open) : undefined;
  const totalSources = o.sources.reduce((n, x) => n + x.count, 0) || 1;
  const SOURCE_ICON = { online: Globe, phone: Phone, "walk-in": Users, waitlist: ListTodo };

  return (
    <div>
      <PageHeader
        title={t("Dashboard")}
        description={`${formatDay(o.today)} · ${t("last 7 days compared with the 7 before")}`}
        actions={
          <>
            <Button onClick={() => download(`halden-bookings-${addDays(o.today, -29)}-to-${addDays(o.today, 30)}.csv`, bookingsCsv(s, addDays(o.today, -29), addDays(o.today, 30)))}>
              <Download /> {t("Export bookings")}
            </Button>
            <Link href="/admin/" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 font-medium shadow-card hover:bg-surface-2">
              {t("Open calendar")} <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Revenue")} hint={t("Completed appointments, last 7 days")} value={money(o.revenue.current)} change={<Change current={o.revenue.current} previous={o.revenue.previous} />} spark={o.revenue.spark} />
        <Kpi label={t("Appointments")} hint={t("Completed and upcoming, last 7 days")} value={String(o.appointments.current)} change={<Change current={o.appointments.current} previous={o.appointments.previous} />} spark={o.appointments.spark} />
        <Kpi label={t("Booked, next 7 days")} hint={t("Booked minutes over the team's working minutes, next 7 days")} value={pct(o.booked.current)} change={<span className="text-xs text-muted">{t("{n} h still bookable", { n: o.booked.freeHours })}</span>} />
        <Kpi label={t("No-show rate")} hint={t("No-shows over finished appointments, last 30 days")} value={pct(o.noShow.current)} change={<Change current={o.noShow.current} previous={o.noShow.previous} format="pts" invert />} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("Revenue per day")} meta={t("Last 28 days")} />
          <RevenueChart data={o.daily} />
        </Card>
        <Card>
          <CardHeader title={t("Team load")} meta={t("Next 7 days")} />
          <ul className="space-y-3.5 px-4 py-4">
            {o.staffLoad.map(({ staff, week }) => (
              <li key={staff.id}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar name={staff.name} size={20} />
                  <span className="min-w-0 flex-1 truncate font-medium">{staff.name}</span>
                  <span className="text-xs text-muted tabular-nums">{pct(week)}</span>
                </div>
                <Meter value={Math.round(week * 100)} max={100} label={t("{name} booked", { name: staff.name })} warn={false} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("Today")} icon={CalendarDays} meta={t("{n} appointments", { n: s.bookings.filter((b) => b.date === o.today && b.status !== "cancelled").length })} />
          <div className="max-h-[420px] overflow-y-auto">
            <Agenda s={s} now={now} onOpen={setOpen} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("Latest online bookings")} icon={Globe} />
          <RecentOnline s={s} now={now} onOpen={setOpen} />
        </Card>
        <div className="space-y-3">
          <Card>
            <CardHeader title={t("Top services")} icon={Scissors} meta={t("Last 30 days")} />
            <ul className="divide-y divide-border">
              {o.topServices.map((x) => (
                <li key={x.service!.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate">{x.service!.name}</span>
                  <span className="text-xs text-muted tabular-nums">{x.count}×</span>
                  <span className="w-16 text-right font-medium tabular-nums">{money(x.revenue)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t("How clients book")} meta={t("Last 30 days")} />
            <div className="px-4 py-4">
              <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                {o.sources.map((x, i) => (
                  <div key={x.source} className={cx(i === 0 ? "bg-accent" : i === 1 ? "bg-border-strong" : i === 2 ? "bg-faint" : "bg-success")} style={{ width: `${(x.count / totalSources) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {o.sources.map((x, i) => {
                  const Icon = SOURCE_ICON[x.source];
                  return (
                    <li key={x.source} className="flex items-center gap-2">
                      <span className={cx("size-2 rounded-[2px]", i === 0 ? "bg-accent" : i === 1 ? "bg-border-strong" : i === 2 ? "bg-faint" : "bg-success")} aria-hidden />
                      <Icon className="size-3.5 text-faint" aria-hidden />
                      <span className="flex-1">{SOURCE_LABEL[x.source]}</span>
                      <span className="text-muted tabular-nums">{pct(x.count / totalSources)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </div>
      </div>

      {openBooking && <BookingDetails key={openBooking.id} state={s} booking={openBooking} now={now} onClose={() => setOpen(null)} />}
    </div>
  );
}
