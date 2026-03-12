"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

type ShiftData = { id: number; started_at: string; ended_at: string | null } | null;

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const quickActions = [
  {
    href: "/admin/cashier",
    label: "Open Cashier",
    desc: "Take orders and process payments",
    accent: "bg-amber-500 text-white hover:bg-amber-600",
  },
  {
    href: "/admin/orders",
    label: "Kitchen Screen",
    desc: "View and manage live orders",
    accent: "bg-stone-900 text-white hover:bg-stone-950",
  },
  {
    href: "/customer-display",
    label: "Customer Display",
    desc: "Show order total to guests",
    accent: "bg-sky-600 text-white hover:bg-sky-700",
  },
];

const tools = [
  { href: "/admin/menu", label: "Menu items", desc: "Add, edit, or remove products" },
  { href: "/admin/menu/organize", label: "Organize", desc: "Reorder categories and products" },
  { href: "/admin/dictionary", label: "Dictionary", desc: "Manage food names and categories" },
  { href: "/admin/unavailable", label: "Unavailable", desc: "Mark items out of stock" },
  { href: "/admin/analytics", label: "Analytics", desc: "Sales and order insights" },
  { href: "/admin/qr", label: "Tables", desc: "View table status and QR codes" },
];

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<
    { id: number; status: string; payment_status: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<ShiftData | undefined>(undefined);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [, setTick] = useState(0);

  const fetchShift = useCallback(() => {
    fetch("/api/admin/shift")
      .then((r) => r.json())
      .then((d) => setShift(d.shift ?? null))
      .catch(() => setShift(null));
  }, []);

  useEffect(() => {
    fetchShift();
  }, [fetchShift]);

  useEffect(() => {
    if (!shift) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [shift]);

  const shiftAction = async (action: "start" | "end") => {
    setShiftBusy(true);
    try {
      const r = await fetch("/api/admin/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      setShift(d.shift ?? null);
    } catch {
      /* ignore */
    } finally {
      setShiftBusy(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!mounted) return;
        setOrders(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const socket: Socket = io({
      path: "/socket.io",
      auth: { restaurantId: "1" },
      query: { restaurantId: "1" },
    });
    const upsert = (order: { id: number; status: string; payment_status: string }) => {
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === order.id);
        if (idx === -1) return [order, ...prev];
        const next = [...prev];
        next[idx] = order;
        return next;
      });
    };
    socket.on("order:new", upsert);
    socket.on("order:update", upsert);
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const pendingPayment = useMemo(
    () => orders.filter((o) => o.payment_status !== "paid" && o.status !== "cancelled").length,
    [orders]
  );
  const kitchenQueue = useMemo(
    () => orders.filter((o) => o.status === "pending" || o.status === "preparing").length,
    [orders]
  );

  return (
    <div className="space-y-8">
      {/* Shift card */}
      {shift === undefined ? null : shift ? (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <div>
              <p className="text-sm font-bold text-emerald-900">Shift active</p>
              <p className="text-xs text-emerald-700">Running for {elapsed(shift.started_at)}</p>
            </div>
          </div>
          <button
            onClick={() => shiftAction("end")}
            disabled={shiftBusy}
            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
          >
            {shiftBusy ? "Ending…" : "End shift"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-stone-50 border border-stone-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-stone-900">No active shift</p>
            <p className="text-xs text-stone-500">Start a shift to use Cashier and Kitchen</p>
          </div>
          <button
            onClick={() => shiftAction("start")}
            disabled={shiftBusy}
            className="px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-950 transition disabled:opacity-50"
          >
            {shiftBusy ? "Starting…" : "Start shift"}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/admin/cashier"
          className="rounded-2xl bg-white border border-stone-200 p-5 hover:border-amber-300 transition group"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Pending payment</p>
          <p className="text-4xl font-black text-stone-900 mt-1">
            {loading ? "–" : pendingPayment}
          </p>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-2xl bg-white border border-stone-200 p-5 hover:border-amber-300 transition group"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Kitchen queue</p>
          <p className="text-4xl font-black text-stone-900 mt-1">
            {loading ? "–" : kitchenQueue}
          </p>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        {quickActions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`rounded-2xl px-5 py-4 transition ${a.accent}`}
          >
            <p className="text-base font-bold">{a.label}</p>
            <p className="text-sm mt-0.5 opacity-80">{a.desc}</p>
          </Link>
        ))}
      </div>

      {/* Tools grid */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Manage</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group flex items-center gap-4 rounded-2xl bg-white border border-stone-200 px-5 py-4 transition hover:border-stone-300 hover:shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-900 group-hover:text-stone-950">{t.label}</p>
                <p className="text-sm text-stone-500 truncate">{t.desc}</p>
              </div>
              <span className="text-stone-300 group-hover:text-stone-500 transition text-lg">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
