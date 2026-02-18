"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import Loader from "@/components/Loader";

const QR_SIZE = 280;
const DOWNLOAD_SIZE = 512;

type Table = { id: number; name: string };

const PRESET_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Dark gray", value: "#374151" },
  { name: "Navy", value: "#1e3a5f" },
  { name: "Amber", value: "#b45309" },
  { name: "Green", value: "#166534" },
];

const FETCH_TIMEOUT_MS = 8000;

export default function AdminQRPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [qrColor, setQrColor] = useState("#000000");
  const [qrDataUrls, setQrDataUrls] = useState<Record<number, string>>({});
  const [addCount, setAddCount] = useState(5);
  const [adding, setAdding] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);

  const SAVED_URL_KEY = "restaurant-order-base-url";

  const saveOrderUrl = useCallback(() => {
    if (!baseUrl) return;
    try {
      localStorage.setItem(SAVED_URL_KEY, baseUrl);
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 2000);
    } catch {
      setUrlSaved(false);
    }
  }, [baseUrl]);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/tables", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (Array.isArray(data?.tables) ? data.tables : []);
      setTables(res.ok ? list : []);
      if (!res.ok) setLoadError(typeof data?.error === "string" ? data.error : "Could not load tables. Use \"Add tables\" below.");
    } catch (e) {
      clearTimeout(timeoutId);
      setTables([]);
      setLoadError(
        e instanceof Error && e.name === "AbortError"
          ? "Request took too long. Use \"Add tables\" below to create tables."
          : "Could not load tables. Use \"Add tables\" below."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(SAVED_URL_KEY);
    setBaseUrl(saved && saved.trim() ? saved.trim() : window.location.origin);
  }, []);

  const getOrderUrl = useCallback(
    (tableId: number) => (baseUrl ? `${baseUrl}/order?table=${tableId}` : ""),
    [baseUrl]
  );

  // Display QRs: white background so they’re visible on the page
  useEffect(() => {
    if (!baseUrl) return;
    const urls: Record<number, string> = {};
    const generate = async () => {
      for (const t of tables) {
        const url = getOrderUrl(t.id);
        try {
          urls[t.id] = await QRCode.toDataURL(url, {
            width: QR_SIZE,
            margin: 2,
            color: { dark: qrColor, light: "#ffffff" },
          });
        } catch {
          urls[t.id] = "";
        }
      }
      setQrDataUrls(urls);
    };
    generate();
  }, [baseUrl, tables, getOrderUrl, qrColor]);

  const sortedTables = [...tables].sort((a, b) => a.id - b.id);

  const downloadPng = useCallback(
    async (table: Table) => {
      const url = getOrderUrl(table.id);
      if (!url) return;
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          width: DOWNLOAD_SIZE,
          margin: 2,
          color: { dark: qrColor, light: "#00000000" },
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `qr-${table.name.replace(/\s+/g, "-")}.png`;
        a.click();
      } catch (e) {
        console.error(e);
      }
    },
    [getOrderUrl, qrColor]
  );

  const addMoreTables = async () => {
    const n = Math.min(100, Math.max(1, addCount));
    setAdding(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: n }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.tables)) {
        setTables(data.tables);
      } else if (res.ok) {
        fetchTables();
      } else {
        setLoadError("Could not add tables. Check the server and try again.");
      }
    } catch (e) {
      clearTimeout(timeoutId);
      setLoadError(
        e instanceof Error && e.name === "AbortError"
          ? "Request timed out. Check your database connection."
          : "Could not add tables. Try again."
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Table QR codes</h1>
      <p className="text-sm text-stone-500 mb-4">
        Print this page or download each QR as PNG (transparent background). Customers on the same Wi‑Fi scan to order.
      </p>

      <div className="space-y-4 mb-6 print:mb-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Order URL (for QR links)</label>
          <div className="flex flex-wrap items-center gap-2 max-w-md">
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-stone-300 text-stone-800 text-sm"
            />
            <button
              type="button"
              onClick={saveOrderUrl}
              disabled={!baseUrl}
              className="shrink-0 py-2 px-4 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {urlSaved ? "Saved!" : "Save URL"}
            </button>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Use this device’s address (e.g. http://192.168.1.10:3000) so phones on the same network can open the link.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4 print:hidden">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">QR color (for display &amp; download)</label>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setQrColor(preset.value)}
                  className="w-8 h-8 rounded-lg border-2 border-stone-300 shrink-0 focus:ring-2 focus:ring-amber-500"
                  style={{ backgroundColor: preset.value }}
                  title={preset.name}
                />
              ))}
              <input
                type="color"
                value={qrColor}
                onChange={(e) => setQrColor(e.target.value)}
                className="w-9 h-9 rounded cursor-pointer border border-stone-300"
                title="Pick color"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-stone-700">Add tables</label>
            <input
              type="number"
              min={1}
              max={100}
              value={addCount}
              onChange={(e) => setAddCount(Number(e.target.value) || 1)}
              className="w-16 px-2 py-1.5 rounded-lg border border-stone-300 text-stone-800 text-sm"
            />
            <button
              type="button"
              onClick={addMoreTables}
              disabled={adding}
              className="py-2 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add tables"}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <Loader className="py-12" />
      ) : (
        <>
          {loadError && (
            <p className="mb-4 py-2 px-3 rounded-lg bg-amber-50 text-amber-800 text-sm">{loadError}</p>
          )}
          {sortedTables.length === 0 ? (
            <p className="text-stone-500 py-8">
              No tables yet. Enter a number above and click &quot;Add tables&quot; to create table QR codes.
            </p>
          ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 print:grid-cols-3">
        {sortedTables.map((table) => (
          <div
            key={table.id}
            className="bg-white rounded-xl border border-stone-200 p-4 flex flex-col items-center print:break-inside-avoid"
          >
            <p className="font-semibold text-stone-800 mb-2">{table.name}</p>
            <div className="w-[280px] h-[280px] flex items-center justify-center bg-stone-50 rounded-lg overflow-hidden shrink-0">
              {qrDataUrls[table.id] ? (
                <img
                  src={qrDataUrls[table.id]}
                  alt={`QR for ${table.name}`}
                  width={QR_SIZE}
                  height={QR_SIZE}
                  className="object-contain"
                />
              ) : (
                <span className="inline-block h-5 w-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              )}
            </div>
            <p className="text-xs text-stone-500 mt-2 text-center">Scan to order</p>
            <button
              type="button"
              onClick={() => downloadPng(table)}
              className="mt-2 py-1.5 px-3 rounded-lg border border-stone-300 text-stone-700 text-sm hover:bg-stone-50 print:hidden"
            >
              Download PNG
            </button>
          </div>
        ))}
      </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => window.print()}
        className="mt-6 py-2 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 print:hidden"
      >
        Print QR codes
      </button>
    </div>
  );
}
