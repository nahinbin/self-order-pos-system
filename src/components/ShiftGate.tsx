"use client";

import { useEffect, useState, useCallback } from "react";

type ShiftData = { id: number; started_at: string; ended_at: string | null } | null;

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function ShiftGate({ children }: { children: React.ReactNode }) {
  const [shift, setShift] = useState<ShiftData | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

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
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [shift]);

  const act = async (action: "start" | "end") => {
    setBusy(true);
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
      setBusy(false);
    }
  };

  if (shift === undefined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 backdrop-blur-sm">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-1">No active shift</h2>
          <p className="text-sm text-stone-500 mb-6">Start a shift to use this page.</p>
          <button
            onClick={() => act("start")}
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-stone-900 text-white font-semibold hover:bg-stone-950 transition disabled:opacity-50"
          >
            {busy ? "Starting…" : "Start shift"}
          </button>
        </div>
      </div>
    );
  }

  void now;

  return (
    <>
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-sm font-medium text-emerald-800">
            Shift active · {elapsed(shift.started_at)}
          </span>
        </div>
        <button
          onClick={() => act("end")}
          disabled={busy}
          className="text-sm font-semibold text-red-600 hover:text-red-700 transition disabled:opacity-50"
        >
          End shift
        </button>
      </div>
      {children}
    </>
  );
}
