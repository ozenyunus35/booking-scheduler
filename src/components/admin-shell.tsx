"use client";

import { ArrowUpRight, CalendarDays, ChevronRight, Code2, Languages, LayoutDashboard, ListTodo, Menu, MessagesSquare, Moon, RotateCcw, Scissors, Search, Settings, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { bookingTitle, bookingWindow } from "@/lib/availability";
import { waitlistOpenings } from "@/lib/api";
import { formatTime, relativeDay } from "@/lib/dates";
import { firstName } from "@/lib/format";
import { resetDemo, useStore } from "@/lib/store";
import type { DemoState } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { CadenceMark } from "./brand";
import { markArrived } from "./admin/arrivals";
import { ThemeToggle, toggleTheme } from "./theme-toggle";
import { Palette, usePaletteShortcut, type Command } from "./palette";
import { LangToggle, useLang } from "@/lib/i18n";
import { useToast } from "./toast";
import { Avatar, Button, Modal, Spinner, cx } from "./ui";
import { useT } from "@/lib/i18n";

export const NAV = [
  { href: "/admin", label: "Calendar", icon: CalendarDays },
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/waitlist", label: "Waitlist", icon: ListTodo },
  { href: "/admin/messages", label: "Messages", icon: MessagesSquare },
  { href: "/admin/services", label: "Services", icon: Scissors },
  { href: "/admin/team", label: "Team", icon: UserRound },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const OWNER = { name: "Maya Lindqvist", title: "Owner" };

function Sidebar({ state, path, now, onNavigate }: { state: DemoState; path: string; now: number; onNavigate?: () => void }) {
  const t = useT();
  const { today, nowMinutes } = bookingWindow(state, now);
  const left = state.bookings.filter((b) => b.date === today && b.status === "confirmed" && b.end > nowMinutes).length;
  const ready = state.waitlist.filter((e) => e.date >= today && waitlistOpenings(state, e, now).length > 0).length;
  return (
    <nav aria-label={t("Main")} className="flex flex-1 flex-col gap-px overflow-y-auto px-2 py-2">
      {NAV.map((n) => {
        const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={`${n.href}/`}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx("flex h-7 items-center gap-2.5 rounded-md px-2 font-medium transition-colors duration-100", active ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text")}
          >
            <n.icon className={cx("size-4", active ? "text-text" : "text-faint")} aria-hidden />
            {t(n.label)}
            {n.href === "/admin" && left > 0 && (
              <span className="ml-auto rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent tabular-nums" aria-label={t("{n} appointments left today", { n: left })}>
                {left}
              </span>
            )}
            {n.href === "/admin/waitlist" && ready > 0 && (
              <span className="ml-auto rounded bg-success/15 px-1.5 text-[11px] font-medium text-success tabular-nums" aria-label={t("{n} can be booked now", { n: ready })}>
                {ready}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-auto pt-4">
        <Link href="/" target="_blank" className="flex h-7 items-center gap-2.5 rounded-md px-2 text-muted hover:bg-surface-2 hover:text-text">
          <ArrowUpRight className="size-4 text-faint" aria-hidden />
          {t("Public booking page")}
        </Link>
      </div>
    </nav>
  );
}

/** Toasts each online booking that arrives from another tab and marks it for a brief highlight. */
function useArrivals(state: DemoState | null) {
  const { toast } = useToast();
  const t = useT();
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!state) return;
    if (!known.current) {
      known.current = new Set(state.bookings.map((b) => b.id));
      return;
    }
    for (const b of state.bookings) {
      if (known.current.has(b.id)) continue;
      known.current.add(b.id);
      if (b.source !== "online") continue;
      markArrived(b.id);
      const client = state.clients.find((c) => c.id === b.clientId);
      const staff = state.staff.find((p) => p.id === b.staffId);
      const { today } = bookingWindow(state, Date.now());
      toast(t("New online booking: {client}, {service} with {staff}, {day} {time}.", { client: client?.name ?? t("A client"), service: bookingTitle(state, b), staff: firstName(staff?.name ?? ""), day: relativeDay(b.date, today), time: formatTime(b.start) }));
    }
  }, [state, toast, t]);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useLang();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  usePaletteShortcut(openPalette);
  const state = useStore();
  const now = useNow();
  const path = (usePathname() || "/admin").replace(/\/$/, "") || "/admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast } = useToast();
  useArrivals(state);

  if (!state || !now) return <Spinner />;
  const navItem = [...NAV].reverse().find((n) => (n.href === "/admin" ? path === "/admin" : path.startsWith(n.href)));

  const go = t("Go to");
  const act = t("Actions");
  const commands: Command[] = [
    ...NAV.map((n) => ({ id: `nav:${n.href}`, label: t(n.label), group: go, icon: n.icon, run: () => router.push(`${n.href}/`) })),
    { id: "nav:site", label: t("Booking site"), group: go, icon: ArrowUpRight, run: () => router.push("/") },
    { id: "theme", label: t("Switch light or dark theme"), group: act, icon: Moon, run: toggleTheme },
    { id: "lang", label: lang === "tr" ? "Switch to English" : "Türkçeye geç", group: act, icon: Languages, run: () => setLang(lang === "tr" ? "en" : "tr") },
    { id: "reset", label: t("Reset demo data"), group: act, icon: RotateCcw, run: () => setConfirmReset(true) },
    { id: "source", label: t("Source code on GitHub"), group: act, icon: Code2, run: () => window.open("https://github.com/ozenyunus35/booking-scheduler", "_blank", "noopener") },
    ...state.staff.map((p) => ({ id: `staff:${p.id}`, label: p.name, group: t("Team"), icon: UserRound, hint: p.role, run: () => router.push("/admin/team/") })),
    ...state.services.map((v) => ({ id: `svc:${v.id}`, label: v.name, group: t("Services"), icon: Scissors, run: () => router.push("/admin/services/") })),
    ...state.clients.map((c) => ({ id: `client:${c.id}`, label: c.name, group: t("Clients"), icon: Users, hint: c.phone, keywords: `${c.email} ${c.phone}`, run: () => router.push(`/admin/clients/?c=${c.id}`) })),
  ];

  const workspace = (
    <div className="flex h-12 items-center gap-2 px-4">
      <CadenceMark />
      <p className="truncate text-[13px] font-semibold">{t("Cadence")}</p>
      <span className="truncate text-muted">{t("· Halden")}</span>
    </div>
  );
  const userCard = (
    <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
      <Avatar name={OWNER.name} size={26} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-medium">{OWNER.name}</p>
        <p className="truncate text-xs text-muted">{t(OWNER.title)}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-bg lg:flex">
        {workspace}
        <Sidebar state={state} path={path} now={now} />
        {userCard}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("Navigation menu")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85%] animate-drawer flex-col border-r border-border bg-bg">
            <div className="flex items-center justify-between pr-2">
              {workspace}
              <button onClick={() => setMenuOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label={t("Close menu")}>
                <X className="size-4" />
              </button>
            </div>
            <Sidebar state={state} path={path} now={now} onNavigate={() => setMenuOpen(false)} />
            {userCard}
          </div>
        </div>
      )}

      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur sm:px-5">
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label={t("Open menu")}>
            <Menu className="size-4" />
          </button>
          <nav aria-label={t("Breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-muted">
            <span className="hidden truncate sm:inline">{state.salon.name}</span>
            <ChevronRight className="hidden size-3.5 text-faint sm:block" aria-hidden />
            <span className="truncate font-medium text-text">{t(navItem?.label ?? "Calendar")}</span>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={openPalette} className="mr-1 inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-muted hover:bg-surface-2 hover:text-text lg:min-w-48" aria-label={t("Search and commands")} aria-keyshortcuts="Meta+K Control+K">
              <Search className="size-3.5" aria-hidden />
              <span className="hidden flex-1 text-left lg:inline">{t("Search clients, services…")}</span>
              <kbd className="hidden rounded border border-border px-1 text-[10.5px] text-faint lg:inline">⌘K</kbd>
            </button>
            <span className="mr-1 hidden items-center gap-2 text-xs text-muted md:flex">
              {t("Demo · synthetic data")}
              <button onClick={() => setConfirmReset(true)} className="rounded-md border border-border px-2 py-0.5 text-text hover:bg-surface-2">
                {t("Reset demo data")}
              </button>
            </span>
            <button onClick={() => setConfirmReset(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text md:hidden" aria-label={t("Reset demo data")}>
              <RotateCcw className="size-4" />
            </button>
            <LangToggle />
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("Reset demo data?")}
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>{t("Cancel")}</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
                toast(t("Demo data was reset."));
              }}
            >
              <RotateCcw /> {t("Reset")}
            </Button>
          </>
        }
      >
        <p className="text-muted">{t("Your bookings, edits to services, hours and rules are removed and the original synthetic salon is restored.")}</p>
      </Modal>
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
