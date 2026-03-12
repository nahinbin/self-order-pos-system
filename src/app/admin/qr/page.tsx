"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import Loader from "@/components/Loader";
import { io, type Socket } from "socket.io-client";

const QR_PREVIEW = 220;
const QR_DOWNLOAD = 512;

type Table = { id: number; name: string };
type Order = {
  id: number;
  table_id: number;
  table_name?: string;
  status: string;
  payment_status: string;
};

// ── Color logic ─────────────────────────────────────────────────────

type TableStatus = "empty" | "unpaid" | "not_served" | "preparing" | "paid" | "cancelled";

function deriveTableStatus(orders: Order[], tableId: number): TableStatus {
  const active = orders.filter(
    (o) => o.table_id === tableId && o.status !== "cancelled"
  );
  if (active.length === 0) return "empty";

  const hasUnpaid = active.some((o) => o.payment_status !== "paid");
  const hasNotServed = active.some((o) => o.status === "pending" || o.status === "preparing");
  const hasPreparing = active.some((o) => o.status === "preparing");
  const allPaid = active.every((o) => o.payment_status === "paid");

  if (allPaid) return "paid";
  if (hasPreparing) return "preparing";
  if (hasNotServed) return "not_served";
  if (hasUnpaid) return "unpaid";
  return "empty";
}

const STATUS_CONFIG: Record<TableStatus, { bg: string; ring: string; text: string; label: string }> = {
  empty:      { bg: "bg-stone-100",  ring: "ring-stone-200",  text: "text-stone-400",  label: "Empty" },
  unpaid:     { bg: "bg-amber-50",   ring: "ring-amber-300",  text: "text-amber-700",  label: "Unpaid" },
  not_served: { bg: "bg-sky-50",     ring: "ring-sky-300",    text: "text-sky-700",    label: "Not served" },
  preparing:  { bg: "bg-violet-50",  ring: "ring-violet-300", text: "text-violet-700", label: "Preparing" },
  paid:       { bg: "bg-emerald-50", ring: "ring-emerald-300",text: "text-emerald-700",label: "Paid" },
  cancelled:  { bg: "bg-red-50",     ring: "ring-red-300",    text: "text-red-600",    label: "Cancelled" },
};

const LEGEND: { status: TableStatus; dot: string }[] = [
  { status: "empty",      dot: "bg-stone-300" },
  { status: "unpaid",     dot: "bg-amber-400" },
  { status: "not_served", dot: "bg-sky-400" },
  { status: "preparing",  dot: "bg-violet-400" },
  { status: "paid",       dot: "bg-emerald-400" },
  { status: "cancelled",  dot: "bg-red-400" },
];

const PRESET_COLORS = [
  "#000000", "#374151", "#1e3a5f", "#b45309", "#166534", "#7c3aed", "#dc2626",
];

// ── Component ───────────────────────────────────────────────────────

export default function AdminTablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Legend popup
  const [showLegend, setShowLegend] = useState(false);

  // QR modal
  const [showQR, setShowQR] = useState(false);
  const [qrTableId, setQrTableId] = useState<number | null>(null);
  const [qrColor, setQrColor] = useState("#000000");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Add tables
  const [addCount, setAddCount] = useState(5);
  const [adding, setAdding] = useState(false);

  const SAVED_URL_KEY = "restaurant-order-base-url";

  // ── Data fetching ───────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch("/api/tables");
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : Array.isArray(data?.tables) ? data.tables : [];
      setTables(res.ok ? list : []);
      if (!res.ok) setLoadError("Could not load tables.");
    } catch {
      setTables([]);
      setLoadError("Could not load tables.");
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTables(), fetchOrders()]).finally(() => setLoading(false));
  }, [fetchTables, fetchOrders]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SAVED_URL_KEY);
      setBaseUrl(saved?.trim() || window.location.origin);
    }
  }, []);

  // Live order updates
  useEffect(() => {
    const socket: Socket = io({
      path: "/socket.io",
      auth: { restaurantId: "1" },
      query: { restaurantId: "1" },
    });
    const upsert = (order: Order) => {
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

  // ── Derived ─────────────────────────────────────────────────────

  const sortedTables = useMemo(() => [...tables].sort((a, b) => a.id - b.id), [tables]);

  // ── QR generation ───────────────────────────────────────────────

  const orderUrl = useMemo(
    () => (qrTableId != null && baseUrl ? `${baseUrl}/order?table=${qrTableId}` : ""),
    [baseUrl, qrTableId]
  );

  useEffect(() => {
    if (!orderUrl) { setQrDataUrl(""); return; }
    QRCode.toDataURL(orderUrl, {
      width: QR_PREVIEW,
      margin: 2,
      color: { dark: qrColor, light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [orderUrl, qrColor]);

  const downloadQR = useCallback(async () => {
    if (!orderUrl || qrTableId == null) return;
    const table = sortedTables.find((t) => t.id === qrTableId);
    try {
      const url = await QRCode.toDataURL(orderUrl, {
        width: QR_DOWNLOAD,
        margin: 2,
        color: { dark: qrColor, light: "#00000000" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${(table?.name ?? String(qrTableId)).replace(/\s+/g, "-")}.png`;
      a.click();
    } catch { /* ignore */ }
  }, [orderUrl, qrColor, qrTableId, sortedTables]);

  const printQR = useCallback(() => {
    if (!qrDataUrl) return;
    const table = sortedTables.find((t) => t.id === qrTableId);
    const w = window.open("", "_blank", "width=400,height=500");
    if (!w) return;
    w.document.write(`
      <html><head><title>QR - ${table?.name ?? ""}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif}
      img{width:300px;height:300px}h2{margin-bottom:8px}</style></head>
      <body><h2>${table?.name ?? ""}</h2><img src="${qrDataUrl}"/><p style="font-size:12px;color:#888">Scan to order</p>
      <script>window.onafterprint=()=>window.close();window.print();</script></body></html>
    `);
    w.document.close();
  }, [qrDataUrl, qrTableId, sortedTables]);

  // ── Add tables ──────────────────────────────────────────────────

  const addMoreTables = async () => {
    const n = Math.min(100, Math.max(1, addCount));
    setAdding(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.tables)) setTables(data.tables);
      else if (res.ok) fetchTables();
      else setLoadError("Could not add tables.");
    } catch {
      setLoadError("Could not add tables.");
    } finally {
      setAdding(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Tables</h1>
        <div className="flex items-center gap-2">
          {/* Info button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLegend((v) => !v)}
              className="w-9 h-9 rounded-full border border-stone-200 bg-white flex items-center justify-center text-stone-500 hover:bg-stone-50 hover:text-stone-700 transition text-sm font-bold"
              title="Color legend"
            >
              i
            </button>
            {showLegend && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLegend(false)} />
                <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl bg-white border border-stone-200 shadow-xl p-4 space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Status colors</p>
                  {LEGEND.map((l) => (
                    <div key={l.status} className="flex items-center gap-2.5">
                      <span className={`w-3 h-3 rounded-full ${l.dot} shrink-0`} />
                      <span className="text-sm text-stone-700">{STATUS_CONFIG[l.status].label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Manage QR button */}
          <button
            type="button"
            onClick={() => {
              setQrTableId(sortedTables[0]?.id ?? null);
              setShowQR(true);
            }}
            className="px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-950 transition"
          >
            Manage QR
          </button>
        </div>
      </div>

      {/* Add tables row */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          type="number"
          min={1}
          max={100}
          value={addCount}
          onChange={(e) => setAddCount(Number(e.target.value) || 1)}
          className="w-16 px-2 py-2 rounded-xl border border-stone-200 text-stone-800 text-sm text-center"
        />
        <button
          type="button"
          onClick={addMoreTables}
          disabled={adding}
          className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add tables"}
        </button>
      </div>

      {loadError && (
        <p className="mb-4 py-2 px-3 rounded-xl bg-amber-50 text-amber-800 text-sm">{loadError}</p>
      )}

      {/* Table grid */}
      {loading ? (
        <Loader className="py-12" />
      ) : sortedTables.length === 0 ? (
        <p className="text-stone-500 py-12 text-center">No tables yet. Add some above.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {sortedTables.map((table) => {
            const status = deriveTableStatus(orders, table.id);
            const cfg = STATUS_CONFIG[status];
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => { setQrTableId(table.id); setShowQR(true); }}
                className={`aspect-square rounded-2xl ring-2 ${cfg.ring} ${cfg.bg} flex flex-col items-center justify-center gap-1 transition hover:shadow-md hover:scale-[1.03] active:scale-100`}
              >
                <span className="text-lg font-black text-stone-800">{table.name.replace("Table ", "")}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.text}`}>
                  {cfg.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── QR Modal ─────────────────────────────────────────────── */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-bold text-stone-900">QR Code</h2>
              <button
                type="button"
                onClick={() => setShowQR(false)}
                className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-600 transition text-lg"
              >
                ×
              </button>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {/* Table selector */}
              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5">Table</label>
                <select
                  value={qrTableId ?? ""}
                  onChange={(e) => setQrTableId(Number(e.target.value) || null)}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 text-sm bg-stone-50"
                >
                  {sortedTables.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Order URL */}
              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5">Order URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onBlur={() => { try { localStorage.setItem(SAVED_URL_KEY, baseUrl); } catch {} }}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 text-sm bg-stone-50"
                />
              </div>

              {/* QR color */}
              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5">QR Color</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setQrColor(c)}
                      className={`w-8 h-8 rounded-lg border-2 shrink-0 transition ${qrColor === c ? "border-amber-400 scale-110" : "border-stone-200"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <label className="relative w-9 h-9 rounded-lg border border-stone-200 overflow-hidden cursor-pointer shrink-0 hover:border-stone-400 transition" title="Pick any color">
                    <input
                      type="color"
                      value={qrColor}
                      onChange={(e) => setQrColor(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <span className="w-full h-full flex items-center justify-center text-stone-400 text-lg">🎨</span>
                  </label>
                </div>
              </div>

              {/* QR preview */}
              <div className="flex justify-center">
                {qrDataUrl ? (
                  <div className="rounded-2xl border border-stone-100 bg-white p-3">
                    <img src={qrDataUrl} alt="QR" width={QR_PREVIEW} height={QR_PREVIEW} />
                  </div>
                ) : (
                  <div className="w-[220px] h-[220px] rounded-2xl bg-stone-50 flex items-center justify-center">
                    <span className="text-sm text-stone-400">Select a table</span>
                  </div>
                )}
              </div>
              <canvas ref={qrCanvasRef} className="hidden" />

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={downloadQR}
                  disabled={!qrDataUrl}
                  className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-700 text-sm font-semibold hover:bg-stone-50 transition disabled:opacity-40"
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  onClick={printQR}
                  disabled={!qrDataUrl}
                  className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-950 transition disabled:opacity-40"
                >
                  Print QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
