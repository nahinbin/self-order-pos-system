"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type DailyPoint = { date: string; revenue: number; orders: number };
type HourlyPoint = { hour: number; revenue: number; orders: number };
type DowPoint = { day: number; name: string; revenue: number; orders: number };
type Dish = { name: string; qty: number; revenue: number; cost?: number; profit?: number };
type CategoryPerf = { category: string; qty: number; revenue: number; orders: number };
type TablePerf = { id: number; name: string; revenue: number; orders: number };
type ShiftEntry = { id: number; started_at: string; ended_at: string | null; duration_minutes: number; revenue: number; orders: number };
type OrderHistoryEntry = {
  id: number; table_name: string; order_type: string; status: string;
  payment_method: string | null; payment_status: string; total: number;
  created_at: string; preparing_duration_seconds: number | null;
  items: { name: string; qty: number; price: number }[];
};

type Analytics = {
  revenue: { today: number; yesterday: number; week: number; lastWeek: number; month: number; lastMonth: number; year: number };
  orders: { today: number; week: number; month: number; year: number };
  averageOrder: { today: number; week: number; month: number };
  avgItemsPerOrder: number;
  cancellationRate: number;
  orderTypeSplit: { dineIn: number; takeaway: number };
  orderTypeRevenue: { dineIn: number; takeaway: number };
  paymentSplit: { cash: number; card: number };
  dailyRevenue: DailyPoint[];
   monthlyRevenue: { month: number; revenue: number; orders: number }[];
  hourlyPerformance: HourlyPoint[];
  dayOfWeekPerformance: DowPoint[];
  topDishes: Dish[];
  worstDishes: Dish[];
  categoryPerformance: CategoryPerf[];
  avgPrepTimeSeconds: number | null;
  tablePerformance: TablePerf[];
  shiftAnalytics: ShiftEntry[];
  orderHistory: OrderHistoryEntry[];
  peakHour: { hour: number; revenue: number };
  bestDay: { name: string; revenue: number };
  profitSummary: { totalProfit: number; marginPct: number };
  range: string;
  generatedAt: string;
};

const $ = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

function pct(a: number, b: number): string {
  if (b === 0) return a > 0 ? "+∞%" : "—";
  const c = ((a - b) / b) * 100;
  return `${c >= 0 ? "+" : ""}${c.toFixed(1)}%`;
}
function pctCls(a: number, b: number): string {
  if (b === 0) return a > 0 ? "text-emerald-600" : "text-stone-400";
  return a >= b ? "text-emerald-600" : "text-red-500";
}
function fmtHour(h: number) { return h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`; }
function fmtDur(s: number) { const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; }
function fmtMins(m: number) { const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; }

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  preparing: "bg-orange-100 text-orange-800",
  served: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

// ── Reusable components ──────────────────────────────────────────

function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-[2px] p-4 pt-12 overflow-auto">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-4xl" : "max-w-2xl"} max-h-[85vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
          <h3 className="font-black text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 text-lg">×</button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, subCls }: { label: string; value: string; sub?: string; subCls?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      <p className="text-xl font-black text-stone-900 mt-0.5 tabular-nums">{value}</p>
      {sub && <p className={`text-[11px] font-semibold mt-0.5 ${subCls ?? "text-stone-500"}`}>{sub}</p>}
    </div>
  );
}

function SeeMoreBtn({ onClick, label = "See all" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] font-bold text-amber-600 hover:text-amber-800 transition">
      {label} →
    </button>
  );
}

function MiniBar({ values, labels, color = "bg-amber-500", h = 80, onBarClick }: { values: number[]; labels: string[]; color?: string; h?: number; onBarClick?: (index: number) => void }) {
  const mx = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: h }}>
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 flex flex-col items-center justify-end ${onBarClick ? "cursor-pointer" : ""}`}
          title={`${labels[i]}: ${$(v)}`}
          onClick={onBarClick ? () => onBarClick(i) : undefined}
        >
          <div
            className={`w-full ${color} rounded-t-sm opacity-80 hover:opacity-100 transition`}
            style={{ height: Math.max(2, (v / mx) * h) }}
          />
        </div>
      ))}
    </div>
  );
}

function HBar({ data, lk, vk, color = "bg-amber-500", max: maxProp, onRowClick }: { data: Record<string, unknown>[]; lk: string; vk: string; color?: string; max?: number; onRowClick?: (row: Record<string, unknown>, index: number) => void }) {
  const mx = maxProp ?? Math.max(...data.map((d) => Number(d[vk]) || 0), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const v = Number(d[vk]) || 0;
        return (
          <div
            key={i}
            className={`flex items-center gap-2 ${onRowClick ? "cursor-pointer hover:bg-stone-50 rounded-lg px-1 -mx-1" : ""}`}
            onClick={onRowClick ? () => onRowClick(d, i) : undefined}
          >
            <span className="text-[11px] text-stone-500 w-14 shrink-0 text-right truncate">{String(d[lk])}</span>
            <div className="flex-1 h-5 bg-stone-100 rounded overflow-hidden">
              <div className={`h-full ${color} rounded`} style={{ width: `${Math.max(1, (v / mx) * 100)}%` }} />
            </div>
            <span className="text-[11px] font-bold text-stone-700 w-16 text-right tabular-nums">{$(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ items, size = 110 }: { items: { label: string; value: number; color: string; extra?: string }[]; size?: number }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <p className="text-stone-400 text-sm">No data</p>;
  const r = size / 2 - 8, cx = size / 2, cy = size / 2;
  let cum = -Math.PI / 2;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        {items.map((item, i) => {
          const frac = item.value / total;
          const angle = frac * Math.PI * 2;
          const x1 = cx + r * Math.cos(cum), y1 = cy + r * Math.sin(cum);
          cum += angle;
          const x2 = cx + r * Math.cos(cum), y2 = cy + r * Math.sin(cum);
          if (frac === 1) return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={item.color} strokeWidth={12} />;
          return <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={item.color} strokeWidth={12} strokeLinecap="round" />;
        })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="text-xs font-black fill-stone-900">{total}</text>
      </svg>
      <div className="space-y-1.5 min-w-0">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-stone-700 truncate">{item.label}</span>
            <span className="font-bold text-stone-900 ml-auto shrink-0">{item.value}</span>
            <span className="text-stone-400 shrink-0">({Math.round((item.value / total) * 100)}%)</span>
            {item.extra && <span className="text-stone-400 shrink-0">{item.extra}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"today" | "week" | "month" | "year">("month");
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);

  useEffect(() => {
    let m = true;
    setLoading(true); setError(null);
    fetch(`/api/admin/analytics?range=${range}`)
      .then((r) => r.json().catch(() => null).then((j) => ({ ok: r.ok, d: j })))
      .then(({ ok, d }) => { if (!m) return; if (!ok) { setError(d?.error || "Failed"); setData(null); return; } setData(d); })
      .catch(() => { if (m) { setError("Network error"); setData(null); } })
      .finally(() => { if (m) setLoading(false); });
    return () => { m = false; };
  }, [range]);

  const rev = data?.revenue;
  const ord = data?.orders;
  const avg = data?.averageOrder;
  const daily = data?.dailyRevenue ?? [];
  const monthly = data?.monthlyRevenue ?? [];
  const hourly = data?.hourlyPerformance ?? [];
  const dow = data?.dayOfWeekPerformance ?? [];
  const top = data?.topDishes ?? [];
  const worst = data?.worstDishes ?? [];
  const cats = data?.categoryPerformance ?? [];
  const tables = data?.tablePerformance ?? [];
  const shifts = data?.shiftAnalytics ?? [];
  const history = data?.orderHistory ?? [];
  const topTotal = useMemo(() => top.reduce((s, d) => s + d.revenue, 0), [top]);
  const profit = data?.profitSummary;

  const rangeLabel = range === "today" ? "Today" : range === "week" ? "This week" : range === "month" ? "This month" : "This year";

  const currentRevenue =
    range === "today" ? rev?.today : range === "week" ? rev?.week : range === "month" ? rev?.month : rev?.year;
  const prevRevenue =
    range === "today"
      ? rev?.yesterday
      : range === "week"
      ? rev?.lastWeek
      : range === "month"
      ? rev?.lastMonth
      : undefined;
  const currentOrders =
    range === "today" ? ord?.today : range === "week" ? ord?.week : range === "month" ? ord?.month : ord?.year;
  const currentAvgOrder =
    range === "today" ? avg?.today : range === "week" ? avg?.week : avg?.month;

  if (loading && !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Screen header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-stone-900">Analytics</h1>
          <p className="text-xs text-stone-500">Business intelligence dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["today", "week", "month", "year"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRange(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  range === k
                    ? "bg-stone-900 text-white"
                    : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                }`}
              >
                {k === "today" ? "Today" : k === "week" ? "Week" : k === "month" ? "Month" : "Year"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50 transition"
          >
            Print report
          </button>
        </div>
      </div>

      {/* Print-only header with logo placeholder */}
      <div className="hidden print:flex flex-col items-center gap-1 pb-4 border-b border-stone-200">
        <div className="w-28 h-12 border border-dashed border-stone-400 rounded-md flex items-center justify-center text-[10px] text-stone-400">
          LOGO
        </div>
        <h1 className="mt-1 text-lg font-black text-stone-900">Restaurant Analytics Report</h1>
        {data?.generatedAt && (
          <p className="text-[10px] text-stone-500">
            Generated: {new Date(data.generatedAt).toLocaleString()}
          </p>
        )}
        <p className="text-[10px] text-stone-400">
          Range: {rangeLabel}
        </p>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}

      {/* ── Range summary ── */}
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-3">
        <Stat
          label={`Revenue — ${rangeLabel}`}
          value={$(currentRevenue ?? 0)}
          sub={
            prevRevenue != null
              ? `vs previous ${range === "today" ? "day" : range === "week" ? "week" : "month"} ${pct(
                  currentRevenue ?? 0,
                  prevRevenue ?? 0
                )}`
              : undefined
          }
          subCls={prevRevenue != null ? pctCls(currentRevenue ?? 0, prevRevenue ?? 0) : undefined}
        />
        <Stat
          label={`Orders — ${rangeLabel}`}
          value={String(currentOrders ?? 0)}
        />
        <Stat
          label={`Avg / order — ${rangeLabel}`}
          value={$(currentAvgOrder ?? 0)}
        />
      </div>

      {/* ── Extra metrics ── */}
      <div className="grid gap-2.5 grid-cols-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label={`Profit — ${rangeLabel}`} value={$(profit?.totalProfit ?? 0)} />
        <Stat
          label={`Margin — ${rangeLabel}`}
          value={`${profit?.marginPct ?? 0}%`}
          subCls={profit && profit.marginPct < 0 ? "text-red-500" : "text-emerald-600"}
        />
        <Stat label="Items/order" value={String(data?.avgItemsPerOrder ?? 0)} sub="Avg" />
        <Stat
          label="Cancel rate"
          value={`${data?.cancellationRate ?? 0}%`}
          subCls={(data?.cancellationRate ?? 0) > 5 ? "text-red-500" : "text-emerald-600"}
        />
        <Stat
          label="Prep time"
          value={data?.avgPrepTimeSeconds != null ? fmtDur(data.avgPrepTimeSeconds) : "—"}
          sub="Avg (month)"
        />
        <Stat
          label="Peak hour"
          value={data?.peakHour ? fmtHour(data.peakHour.hour) : "—"}
          sub={data?.peakHour ? $(data.peakHour.revenue) : ""}
        />
        <Stat
          label="Best day"
          value={data?.bestDay ? data.bestDay.name : "—"}
          sub={data?.bestDay ? $(data.bestDay.revenue) : ""}
        />
      </div>

      {/* ── 30-day trend ── */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-black text-stone-900">Revenue Trend</h2>
            <p className="text-[10px] text-stone-400">Last 30 days</p>
          </div>
          <SeeMoreBtn onClick={() => setModal("daily")} label="Details" />
        </div>
        {daily.length > 0 ? (
          <>
            <MiniBar
              values={daily.map((d) => d.revenue)}
              labels={daily.map((d) => d.date)}
              h={90}
              onBarClick={() => setModal("daily")}
            />
            <div className="flex justify-between mt-1 text-[10px] text-stone-400">
              <span>{daily[0]?.date}</span><span>{daily[daily.length - 1]?.date}</span>
            </div>
          </>
        ) : <p className="text-stone-400 text-sm">No data yet</p>}
      </section>

      {/* ── Year view: by month ── */}
      {monthly.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-black text-stone-900">This year by month</h2>
              <p className="text-[10px] text-stone-400">Revenue by calendar month</p>
            </div>
            <SeeMoreBtn onClick={() => setModal("monthly")} />
          </div>
          <MiniBar
            values={monthly.map((m) => m.revenue)}
            labels={monthly.map((m) => String(m.month))}
            color="bg-emerald-500"
            h={80}
            onBarClick={() => setModal("monthly")}
          />
          <div className="flex justify-between mt-1 text-[10px] text-stone-400">
            <span>Jan</span>
            <span>Jun</span>
            <span>Dec</span>
          </div>
        </section>
      )}

      {/* ── Hourly + Day of week ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-stone-900">By Hour</h2>
            <SeeMoreBtn onClick={() => setModal("hourly")} />
          </div>
          <MiniBar
            values={hourly.map((h) => h.revenue)}
            labels={hourly.map((h) => fmtHour(h.hour))}
            color="bg-blue-500"
            h={70}
            onBarClick={() => setModal("hourly")}
          />
          <div className="flex justify-between mt-1 text-[10px] text-stone-400">
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-stone-900">By Weekday</h2>
            <SeeMoreBtn onClick={() => setModal("dow")} />
          </div>
          <HBar
            data={dow.map((d) => ({ label: d.name, value: d.revenue }))}
            lk="label"
            vk="value"
            color="bg-violet-500"
            onRowClick={() => setModal("dow")}
          />
        </section>
      </div>

      {/* ── Splits ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-black text-stone-900 mb-3">Order Type</h2>
          <Donut items={[
            { label: "Dine in", value: data?.orderTypeSplit?.dineIn ?? 0, color: "#f59e0b", extra: $(data?.orderTypeRevenue?.dineIn ?? 0) },
            { label: "Takeaway", value: data?.orderTypeSplit?.takeaway ?? 0, color: "#6366f1", extra: $(data?.orderTypeRevenue?.takeaway ?? 0) },
          ]} />
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-black text-stone-900 mb-3">Payment Method</h2>
          <Donut items={[
            { label: "Cash", value: data?.paymentSplit?.cash ?? 0, color: "#22c55e" },
            { label: "Card", value: data?.paymentSplit?.card ?? 0, color: "#3b82f6" },
          ]} />
        </section>
      </div>

      {/* ── Top dishes (compact preview + see more) ── */}
      <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
          <div>
            <h2 className="text-sm font-black text-stone-900">Top Items</h2>
            <p className="text-[10px] text-stone-400">{rangeLabel} · by revenue</p>
          </div>
          {top.length > 5 && <SeeMoreBtn onClick={() => setModal("topDishes")} />}
        </div>
        {top.length === 0 ? <p className="p-5 text-stone-400 text-sm">No data.</p> : (
          <div className="divide-y divide-stone-50">
            {top.slice(0, 5).map((d, i) => (
              <div key={d.name} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-xs font-bold text-stone-400 w-5">{i + 1}</span>
                <span className="flex-1 font-semibold text-stone-900 text-sm truncate">{d.name}</span>
                <span className="text-xs text-stone-500 tabular-nums">{d.qty} sold</span>
                <span className="text-sm font-bold text-stone-900 tabular-nums w-20 text-right">{$(d.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Category + Table compact row ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {cats.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
              <h2 className="text-sm font-black text-stone-900">Categories</h2>
              <SeeMoreBtn onClick={() => setModal("categories")} />
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {cats.slice(0, 4).map((c) => (
                <div key={c.category} className="rounded-xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-stone-400 truncate">{c.category}</p>
                  <p className="text-base font-black text-stone-900">{$(c.revenue)}</p>
                  <p className="text-[10px] text-stone-500">{c.qty} sold</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {tables.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
              <h2 className="text-sm font-black text-stone-900">Tables</h2>
              <SeeMoreBtn onClick={() => setModal("tables")} />
            </div>
            <div className="p-4">
              <HBar
                data={tables.slice(0, 5).map((t) => ({ label: t.name, value: t.revenue }))}
                lk="label"
                vk="value"
                color="bg-sky-500"
                onRowClick={() => setModal("tables")}
              />
            </div>
          </section>
        )}
      </div>

      {/* ── Shift + Order history compact ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {shifts.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
              <h2 className="text-sm font-black text-stone-900">Shifts</h2>
              <SeeMoreBtn onClick={() => setModal("shifts")} />
            </div>
            <div className="divide-y divide-stone-50">
              {shifts.slice(0, 4).map((s) => {
                const dt = new Date(s.started_at);
                return (
                  <div key={s.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
                    <span className="text-stone-700">{dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span className="text-stone-500">{fmtMins(s.duration_minutes)}</span>
                    <span className="text-stone-500">{s.orders} orders</span>
                    <span className="font-bold text-stone-900">{$(s.revenue)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-black text-stone-900">Order History</h2>
              <p className="text-[10px] text-stone-400">{rangeLabel} · {history.length} orders</p>
            </div>
            {history.length > 5 && <SeeMoreBtn onClick={() => setModal("orderHistory")} />}
          </div>
          {history.length === 0 ? <p className="p-5 text-stone-400 text-sm">No orders yet.</p> : (
            <div className="divide-y divide-stone-50">
              {history.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                  <span className="font-bold text-stone-900">#{o.id}</span>
                  <span className="text-stone-500">{o.table_name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_COLORS[o.status] ?? "bg-stone-100 text-stone-600"}`}>{o.status}</span>
                  <span className="ml-auto font-bold text-stone-900 tabular-nums">{$(o.total)}</span>
                  <span className="text-stone-400">{new Date(o.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Low performers compact ── */}
      {worst.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-black text-stone-900">Low Performers</h2>
              <p className="text-[10px] text-stone-400">Consider promoting or removing</p>
            </div>
            {worst.length > 5 && <SeeMoreBtn onClick={() => setModal("worstDishes")} />}
          </div>
          <div className="divide-y divide-stone-50">
            {worst.slice(0, 5).map((d) => (
              <div key={d.name} className="flex items-center gap-3 px-5 py-2.5">
                <span className="flex-1 text-sm text-stone-700 truncate">{d.name}</span>
                <span className="text-xs text-stone-500 tabular-nums">{d.qty} sold</span>
                <span className="text-sm font-bold text-stone-700 tabular-nums w-20 text-right">{$(d.revenue)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-400">
        <span>Revenue = paid non-cancelled orders only</span>
        <span>Hourly & weekday = last 30 days</span>
        {data?.generatedAt && <span>Generated: {new Date(data.generatedAt).toLocaleString()}</span>}
      </div>

      {/* ════════════════════════════════════════════════════════════
           MODALS
         ════════════════════════════════════════════════════════════ */}

      {/* Daily details */}
      <Modal open={modal === "daily"} onClose={() => setModal(null)} title="Daily Revenue (30 days)" wide>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-100">
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Date</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Day</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Orders</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
              <th className="px-3 py-2 w-32" />
            </tr></thead>
            <tbody>{daily.map((d) => {
              const dt = new Date(d.date + "T00:00:00");
              const mx = Math.max(...daily.map((x) => x.revenue), 1);
              return (
                <tr key={d.date} className="border-b border-stone-50 hover:bg-stone-50/50">
                  <td className="px-3 py-2 text-stone-700">{d.date}</td>
                  <td className="px-3 py-2 text-stone-500">{dt.toLocaleDateString(undefined, { weekday: "short" })}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-700">{d.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(d.revenue)}</td>
                  <td className="px-3 py-2"><div className="h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${(d.revenue / mx) * 100}%` }} /></div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Modal>

      {/* Monthly details */}
      <Modal open={modal === "monthly"} onClose={() => setModal(null)} title="Revenue by Month (this year)" wide>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">
                  Month
                </th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">
                  Orders
                </th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-b border-stone-50">
                  <td className="px-3 py-2 text-stone-700">
                    {new Date(2000, m.month - 1, 1).toLocaleString(undefined, { month: "short" })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-700">{m.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">
                    {$(m.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Hourly details */}
      <Modal open={modal === "hourly"} onClose={() => setModal(null)} title="Revenue by Hour (last 30 days)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-100">
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Hour</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Orders</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
            </tr></thead>
            <tbody>{hourly.filter((h) => h.orders > 0).map((h) => (
              <tr key={h.hour} className="border-b border-stone-50">
                <td className="px-3 py-2 text-stone-700 font-medium">{fmtHour(h.hour)} – {fmtHour(h.hour + 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-700">{h.orders}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(h.revenue)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Modal>

      {/* Day of week details */}
      <Modal open={modal === "dow"} onClose={() => setModal(null)} title="Revenue by Day of Week (last 30 days)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-100">
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Day</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Orders</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Avg/order</th>
            </tr></thead>
            <tbody>{dow.map((d) => (
              <tr key={d.name} className="border-b border-stone-50">
                <td className="px-3 py-2 text-stone-700 font-medium">{d.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-700">{d.orders}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(d.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500">{d.orders > 0 ? $(d.revenue / d.orders) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Modal>

      {/* Top dishes full list */}
      <Modal open={modal === "topDishes"} onClose={() => setModal(null)} title={`Top Items — ${rangeLabel}`} wide>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-100">
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">#</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Item</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Qty</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Share</th>
              <th className="px-3 py-2 w-28" />
            </tr></thead>
            <tbody>{top.map((d, i) => (
              <tr key={d.name} className="border-b border-stone-50 hover:bg-stone-50/50">
                <td className="px-3 py-2 text-stone-400 font-bold">{i + 1}</td>
                <td className="px-3 py-2 font-semibold text-stone-900">{d.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-700">{d.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(d.revenue)}</td>
                <td className="px-3 py-2 text-right text-stone-500">{topTotal > 0 ? `${Math.round((d.revenue / topTotal) * 100)}%` : "—"}</td>
                <td className="px-3 py-2"><div className="h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${(d.revenue / Math.max(1, topTotal)) * 100}%` }} /></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Modal>

      {/* Worst dishes full list */}
      <Modal open={modal === "worstDishes"} onClose={() => setModal(null)} title={`Low Performers — ${rangeLabel}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-100">
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Item</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Qty</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
            </tr></thead>
            <tbody>{worst.map((d) => (
              <tr key={d.name} className="border-b border-stone-50">
                <td className="px-3 py-2 text-stone-700">{d.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500">{d.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-700">{$(d.revenue)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Modal>

      {/* Categories full */}
      <Modal open={modal === "categories"} onClose={() => setModal(null)} title={`Category Performance — ${rangeLabel}`}>
        <div className="space-y-4">
          <HBar data={cats.map((c) => ({ label: c.category, value: c.revenue }))} lk="label" vk="value" color="bg-emerald-500" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-stone-100">
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Category</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Items sold</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Avg/item</th>
              </tr></thead>
              <tbody>{cats.map((c) => (
                <tr key={c.category} className="border-b border-stone-50">
                  <td className="px-3 py-2 font-semibold text-stone-900">{c.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-700">{c.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(c.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-500">{c.qty > 0 ? $(c.revenue / c.qty) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Tables full */}
      <Modal open={modal === "tables"} onClose={() => setModal(null)} title="Table Performance (this month)">
        <div className="space-y-4">
          <HBar data={tables.map((t) => ({ label: t.name, value: t.revenue }))} lk="label" vk="value" color="bg-sky-500" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-stone-100">
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Table</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Orders</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Avg/order</th>
              </tr></thead>
              <tbody>{tables.map((t) => (
                <tr key={t.id} className="border-b border-stone-50">
                  <td className="px-3 py-2 font-medium text-stone-900">{t.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-700">{t.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(t.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-500">{t.orders > 0 ? $(t.revenue / t.orders) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Shifts full */}
      <Modal open={modal === "shifts"} onClose={() => setModal(null)} title="Shift History" wide>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-100">
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Date</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Time</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Duration</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Orders</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Revenue</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Rev/hr</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Avg order</th>
            </tr></thead>
            <tbody>{shifts.map((s) => {
              const dt = new Date(s.started_at);
              const rph = s.duration_minutes > 0 ? (s.revenue / s.duration_minutes) * 60 : 0;
              const ao = s.orders > 0 ? s.revenue / s.orders : 0;
              return (
                <tr key={s.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                  <td className="px-3 py-2 text-stone-700">{dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td className="px-3 py-2 text-stone-500">
                    {dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    {s.ended_at && <> — {new Date(s.ended_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</>}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-500">{fmtMins(s.duration_minutes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-700">{s.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(s.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-500">{$(Math.round(rph * 100) / 100)}/hr</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-500">{$(Math.round(ao * 100) / 100)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Modal>

      {/* Order history full */}
      <Modal open={modal === "orderHistory"} onClose={() => setModal(null)} title={`Order History — ${rangeLabel}`} wide>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-100">
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">ID</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Time</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Table</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Type</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Status</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Payment</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Items</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Total</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-stone-400">Prep</th>
            </tr></thead>
            <tbody>{history.map((o) => (
              <tr key={o.id} className="border-b border-stone-50 hover:bg-stone-50/50 align-top">
                <td className="px-3 py-2 font-bold text-stone-900">#{o.id}</td>
                <td className="px-3 py-2 text-stone-500 whitespace-nowrap">
                  {new Date(o.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
                  {new Date(o.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2 text-stone-700">{o.table_name}</td>
                <td className="px-3 py-2 text-stone-500 capitalize">{o.order_type.replace("_", " ")}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_COLORS[o.status] ?? "bg-stone-100 text-stone-600"}`}>{o.status}</span>
                </td>
                <td className="px-3 py-2 text-stone-500">
                  {o.payment_method ?? "—"} · <span className={o.payment_status === "paid" ? "text-emerald-600" : "text-amber-600"}>{o.payment_status}</span>
                </td>
                <td className="px-3 py-2 text-stone-600 text-xs max-w-[200px]">
                  {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-stone-900">{$(o.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500">
                  {o.preparing_duration_seconds != null ? fmtDur(o.preparing_duration_seconds) : "—"}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
