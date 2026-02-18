"use client";

import { useEffect, useMemo, useState } from "react";

type Analytics = {
  revenue: { today: number; week: number; month: number; year: number };
  topDishes: { name: string; qty: number; revenue: number }[];
  range: "today" | "week" | "month" | "year";
};

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Analytics["range"]>("today");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/analytics?range=${range}`)
      .then((r) => r.json().catch(() => null).then((j) => ({ ok: r.ok, data: j })))
      .then(({ ok, data }) => {
        if (!mounted) return;
        if (!ok) {
          setError(data?.error || "Failed to load analytics");
          setData(null);
          return;
        }
        setData(data as Analytics);
      })
      .catch(() => {
        if (!mounted) return;
        setError("Network error");
        setData(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [range]);

  const rev = data?.revenue;
  const top = data?.topDishes ?? [];
  const topTotalRevenue = useMemo(() => top.reduce((s, d) => s + d.revenue, 0), [top]);

  return (
    <div className="min-h-[60vh]">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Analytics</h1>
          <p className="text-stone-500">Revenue and best-selling dishes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "year"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={`px-4 py-2 rounded-2xl text-sm font-semibold border ${
                range === k
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-800 border-stone-200 hover:bg-stone-50"
              }`}
            >
              {k === "today" ? "Today" : k === "week" ? "This week" : k === "month" ? "This month" : "This year"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-stone-500">Today</p>
          <p className="text-2xl font-black text-stone-900 mt-2">{loading ? "…" : money(rev?.today ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-stone-500">This week</p>
          <p className="text-2xl font-black text-stone-900 mt-2">{loading ? "…" : money(rev?.week ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-stone-500">This month</p>
          <p className="text-2xl font-black text-stone-900 mt-2">{loading ? "…" : money(rev?.month ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-stone-500">This year</p>
          <p className="text-2xl font-black text-stone-900 mt-2">{loading ? "…" : money(rev?.year ?? 0)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="p-5 border-b border-stone-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-900">Top dishes</p>
              <p className="text-xs text-stone-500">By revenue ({range})</p>
            </div>
            <div className="text-xs text-stone-500">
              {top.length} items
            </div>
          </div>
          <div className="p-5">
            {loading ? (
              <p className="text-stone-500">Loading…</p>
            ) : top.length === 0 ? (
              <p className="text-stone-500">No sales yet for this range.</p>
            ) : (
              <div className="space-y-3">
                {top.map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{d.name}</p>
                      <p className="text-xs text-stone-500">{d.qty} sold</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-stone-900">{money(d.revenue)}</p>
                      <div className="h-2 w-32 bg-stone-100 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-amber-500"
                          style={{
                            width: `${Math.min(100, (d.revenue / Math.max(1, topTotalRevenue)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm font-semibold text-stone-900">What’s included</p>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li>- Only orders with payment marked as <span className="font-semibold">paid</span></li>
            <li>- Cancelled orders are excluded</li>
            <li>- Top dishes are computed from sold quantities and line totals</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

