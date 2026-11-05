"use client";

import { ArrowUpRight, CalendarDays, ChevronRight, LayoutDashboard, ListTodo, Menu, MessagesSquare, RotateCcw, Scissors, Settings, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bookingTitle, bookingWindow } from "@/lib/availability";
import { waitlistOpenings } from "@/lib/api";
import { formatTime, relativeDay } from "@/lib/dates";
import { firstName } from "@/lib/format";
import { resetDemo, useStore } from "@/lib/store";
import type { DemoState } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { CadenceMark } from "./brand";
import { markArrived } from "./admin/arrivals";
import { ThemeToggle } from "./theme-toggle";
import { useToast } from "./toast";
import { Avatar, Button, Modal, Spinner, cx } from "./ui";

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
  const { today, nowMinutes } = bookingWindow(state, now);
  const left = state.bookings.filter((b) => b.date === today && b.status === "confirmed" && b.end > nowMinutes).length;
  const ready = state.waitlist.filter((e) => e.date >= today && waitlistOpenings(state, e, now).length > 0).length;
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-px overflow-y-auto px-2 py-2">
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
            {n.label}
            {n.href === "/admin" && left > 0 && (
              <span className="ml-auto rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent tabular-nums" aria-label={`${left} appointments left today`}>
                {left}
              </span>
            )}
            {n.href === "/admin/waitlist" && ready > 0 && (
              <span className="ml-auto rounded bg-success/15 px-1.5 text-[11px] font-medium text-success tabular-nums" aria-label={`${ready} can be booked now`}>
                {ready}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-auto pt-4">
        <Link href="/" target="_blank" className="flex h-7 items-center gap-2.5 rounded-md px-2 text-muted hover:bg-surface-2 hover:text-text">
          <ArrowUpRight className="size-4 text-faint" aria-hidden />
          Public booking page
        </Link>
      </div>
    </nav>
  );
}

/** Toasts each online booking that arrives from another tab and marks it for a brief highlight. */
function useArrivals(state: DemoState | null) {
  const { toast } = useToast();
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
      toast(`New online booking: ${client?.name ?? "A client"}, ${bookingTitle(state, b)} with ${firstName(staff?.name ?? "")}, ${relativeDay(b.date, today)} ${formatTime(b.start)}.`);
    }
  }, [state, toast]);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const state = useStore();
  const now = useNow();
  const path = (usePathname() || "/admin").replace(/\/$/, "") || "/admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast } = useToast();
  useArrivals(state);

  if (!state || !now) return <Spinner />;
  const navItem = [...NAV].reverse().find((n) => (n.href === "/admin" ? path === "/admin" : path.startsWith(n.href)));

  const workspace = (
    <div className="flex h-12 items-center gap-2 px-4">
      <CadenceMark />
      <p className="truncate text-[13px] font-semibold">Cadence</p>
      <span className="truncate text-muted">· Halden</span>
    </div>
  );
  const userCard = (
    <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
      <Avatar name={OWNER.name} size={26} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-medium">{OWNER.name}</p>
        <p className="truncate text-xs text-muted">{OWNER.title}</p>
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
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85%] animate-drawer flex-col border-r border-border bg-bg">
            <div className="flex items-center justify-between pr-2">
              {workspace}
              <button onClick={() => setMenuOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Close menu">
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
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-4" />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-muted">
            <span className="hidden truncate sm:inline">{state.salon.name}</span>
            <ChevronRight className="hidden size-3.5 text-faint sm:block" aria-hidden />
            <span className="truncate font-medium text-text">{navItem?.label ?? "Calendar"}</span>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 hidden items-center gap-2 text-xs text-muted md:flex">
              Demo · synthetic data
              <button onClick={() => setConfirmReset(true)} className="rounded-md border border-border px-2 py-0.5 text-text hover:bg-surface-2">
                Reset demo data
              </button>
            </span>
            <button onClick={() => setConfirmReset(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text md:hidden" aria-label="Reset demo data">
              <RotateCcw className="size-4" />
            </button>
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
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
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
