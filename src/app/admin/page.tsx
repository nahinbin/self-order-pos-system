"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

const links = [
  {
    href: "/admin/cashier",
    title: "Cashier (POS)",
    icon: "POS",
  },
  {
    href: "/admin/analytics",
    title: "Analytics",
    icon: "ANA",
  },
  {
    href: "/admin/orders",
    title: "Orders",
    icon: "ORD",
  },
  {
    href: "/admin/menu",
    title: "Menu",
    icon: "MNU",
  },
  {
    href: "/admin/unavailable",
    title: "Unavailable items",
    icon: "OOS",
  },
  {
    href: "/admin/dictionary",
    title: "Food dictionary",
    icon: "DIC",
  },
  {
    href: "/admin/qr",
    title: "Tables & QR codes",
    icon: "QR",
  },
];

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<
    {
      id: number;
      status: string;
      payment_status: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

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
    // Keep counts live with websockets.
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

  const pendingPaymentCount = useMemo(
    () => orders.filter((o) => o.payment_status !== "paid" && o.status !== "cancelled").length,
    [orders]
  );
  const activeKitchenCount = useMemo(
    () => orders.filter((o) => o.status === "pending" || o.status === "preparing").length,
    [orders]
  );

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Dashboard</h1>
          <p className="text-stone-500">Quick actions and live status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/cashier"
            className="px-4 py-2 rounded-2xl bg-stone-900 text-white font-semibold hover:bg-stone-950"
          >
            Open Cashier
          </Link>
          <Link
            href="/admin/orders"
            className="px-4 py-2 rounded-2xl border border-stone-200 bg-white text-stone-800 font-semibold hover:bg-stone-50"
          >
            Kitchen screen
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-stone-500">Pending payment</p>
          <p className="text-3xl font-black text-stone-900 mt-2">
            {loading ? "…" : pendingPaymentCount}
          </p>
          <p className="text-sm text-stone-500 mt-1">Orders waiting for cashier.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-stone-500">Kitchen queue</p>
          <p className="text-3xl font-black text-stone-900 mt-2">
            {loading ? "…" : activeKitchenCount}
          </p>
          <p className="text-sm text-stone-500 mt-1">Pending + preparing.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-stone-500">Live updates</p>
          <p className="text-base font-semibold text-stone-900 mt-2">
            {loading ? "Connecting…" : "Connected"}
          </p>
          <p className="text-sm text-stone-500 mt-1">No refresh needed.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-stone-100 text-stone-700 text-xs font-black tracking-wider mb-3">
                  {item.icon}
                </span>
                <h2 className="font-semibold text-stone-900 group-hover:text-stone-950">{item.title}</h2>
              </div>
              <span className="mt-1 text-stone-300 group-hover:text-stone-400">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
