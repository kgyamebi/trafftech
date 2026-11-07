"use client";

import clsx from "clsx";
import {
  Bell,
  CarFront,
  Command,
  Gauge,
  House,
  Search,
  Shield,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { commandSearch } from "@/domain/command";
import type { Workspace } from "@/domain/types";
import { exitDemoAction, logoutAction } from "@/server/actions";

const MOBILE = [
  { href: "/home", label: "Home", icon: House },
  { href: "/drive", label: "Drive", icon: Gauge },
  { href: "/vehicle", label: "Vehicle", icon: CarFront },
  { href: "/traffic", label: "Traffic", icon: Shield },
  { href: "/profile", label: "Profile", icon: UserRound },
];

const DESK = [
  { href: "/home", label: "Home" },
  { href: "/drive", label: "Drive" },
  { href: "/roads", label: "Roads" },
  { href: "/vehicle", label: "Vehicle" },
  { href: "/traffic", label: "Traffic" },
  { href: "/score", label: "Driver score" },
  { href: "/documents", label: "Documents" },
  { href: "/notifications", label: "Notifications" },
  { href: "/ask", label: "Intelligence" },
  { href: "/fleet", label: "Fleet" },
  { href: "/brief", label: "Daily brief" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ workspace, children }: { workspace: Workspace; children: React.ReactNode }) {
  const path = usePathname();
  const reduce = useReducedMotion();
  const drive = path === "/home" || path === "/now" || path.startsWith("/drive");
  const [open, setOpen] = useState(false);
  const unread = workspace.notifications.filter((n) => !n.read && !n.archived).length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      const snapshot = {
        userId: workspace.viewer.id,
        mode: workspace.mode,
        savedAt: workspace.generatedAt,
        vehicle: workspace.activeVehicle,
        hero: workspace.hero,
        score: workspace.score.overall,
      };
      localStorage.setItem("nokware:last-status", JSON.stringify(snapshot));
    } catch {
      /* private mode */
    }
  }, [workspace]);

  if (drive) {
    return (
      <div className="min-h-screen bg-drive text-drive-fg">
        <div id="content">{children}</div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/home" className="px-3">
          <Wordmark />
        </Link>
        <nav className="mt-8 grid gap-1" aria-label="Primary">
          {DESK.map((item) => {
            const active = path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active}
                className={clsx(
                  "relative flex min-h-11 items-center justify-between rounded-[10px] px-3 text-[15px]",
                  active ? "text-ink" : "text-muted hover:bg-sunken/60 hover:text-ink",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="desk-pill"
                    className="pointer-events-none absolute inset-0 rounded-[10px] bg-sunken"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 34 }}
                  />
                ) : null}
                <span className="relative">{item.label}</span>
                {item.href === "/notifications" && unread > 0 ? (
                  <span className="relative text-xs text-ink">{unread}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3 pt-6">
          <p className="text-sm text-ink">{workspace.viewer.firstName}</p>
          <p className="text-xs capitalize text-muted">{workspace.viewer.plan} plan</p>
          {workspace.viewer.role === "admin" ? (
            <Link href="/admin" className="mt-3 block text-sm text-ink underline-offset-4 hover:underline">
              Admin
            </Link>
          ) : null}
        </div>
      </aside>
      <div>
        {workspace.mode === "demo" ? <DemoBanner /> : null}
        <header className="flex items-center justify-between px-4 pt-4 lg:px-10 lg:pt-6">
          <Link href="/home" className="lg:hidden">
            <Wordmark />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-ghost btn px-3" onClick={() => setOpen(true)} aria-label="Search and commands">
              <Search size={16} />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden text-[11px] text-muted sm:inline">Ctrl K</kbd>
            </button>
            <Link href="/notifications" className="btn-ghost btn px-3" aria-label={`Notifications, ${unread} unread`}>
              <Bell size={16} />
              {unread > 0 ? <span>{unread}</span> : null}
            </Link>
          </div>
        </header>
        <main id="content" className="app-main">
          <div key={path} className="enter-up">
            {children}
          </div>
        </main>
        <nav className="mobile-nav" aria-label="Primary">
          {MOBILE.map((item) => {
            const Icon = item.icon;
            const active = path === item.href || (item.href !== "/home" && path.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="nav-btn relative" data-active={active}>
                {active ? (
                  <motion.span
                    layoutId="phone-pill"
                    className="pointer-events-none absolute inset-1 rounded-[12px] bg-sunken"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 32 }}
                  />
                ) : null}
                <Icon className="relative" size={18} strokeWidth={1.75} />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      {open ? <CommandPalette workspace={workspace} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function Wordmark() {
  return (
    <span className="flex items-baseline gap-2">
      <span className="display text-[1.55rem] italic">Nokware</span>
      <span className="eyebrow">Driver OS</span>
    </span>
  );
}

function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-warn-soft px-4 py-3 text-sm lg:px-10">
      <p>
        <strong className="font-semibold">Demo data.</strong> Ama Mensah’s car and notice are a sample. They are not your records, and they are not official.
      </p>
      <form action={exitDemoAction}>
        <button className="btn px-3" type="submit">
          Exit demo
        </button>
      </form>
    </div>
  );
}

function CommandPalette({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const reduce = useReducedMotion();
  const hits = useMemo(() => commandSearch(workspace, query), [workspace, query]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-ink/40 px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command search">
      <button className="absolute inset-0 cursor-default" aria-label="Close search" onClick={onClose} />
      <motion.div
        className="card relative z-10 w-full max-w-xl overflow-hidden shadow-soft"
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 30 }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Command size={16} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Fines, insurance, score, documents"
            className="h-14 w-full bg-transparent text-[16px] outline-none"
            aria-label="Search Nokware"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center">
            <X size={16} />
          </button>
        </div>
        <ul className="max-h-80 overflow-auto py-2">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left hover:bg-sunken"
                onClick={() => {
                  router.push(hit.href);
                  onClose();
                }}
              >
                <span>{hit.label}</span>
                <span className="text-sm text-muted">{hit.detail}</span>
              </button>
            </li>
          ))}
          {hits.length === 0 ? <li className="px-4 py-6 text-sm text-muted">Nothing in your records matches that.</li> : null}
        </ul>
      </motion.div>
    </div>
  );
}

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn-ghost btn" type="submit">
        Sign out
      </button>
    </form>
  );
}
