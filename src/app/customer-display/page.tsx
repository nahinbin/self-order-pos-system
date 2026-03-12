"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type DisplayItem = {
  name: string;
  quantity: number;
  unit_price: number;
  options_label?: string | null;
};

type DisplayPayload =
  | { mode: "idle" }
  | {
      mode: "summary" | "processing" | "result";
      total: number;
      orderId?: number | null;
      paymentMethod?: "cash" | "card";
      success?: boolean;
      message?: string | null;
      items?: DisplayItem[];
    };

function fmt(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

export default function CustomerDisplayPage() {
  const [payload, setPayload] = useState<DisplayPayload>({ mode: "idle" });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (socketRef.current) return;
    const socket: Socket = io({
      path: "/socket.io",
      auth: { restaurantId: "1" },
      query: { restaurantId: "1" },
    });
    socketRef.current = socket;

    const onUpdate = (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Partial<DisplayPayload> & { mode?: string };
      if (d.mode === "idle") {
        setPayload({ mode: "idle" });
        return;
      }
      if (d.mode === "summary" || d.mode === "processing" || d.mode === "result") {
        setPayload({
          mode: d.mode,
          total: typeof d.total === "number" ? d.total : 0,
          orderId: typeof d.orderId === "number" ? d.orderId : undefined,
          paymentMethod: d.paymentMethod === "cash" || d.paymentMethod === "card" ? d.paymentMethod : undefined,
          success: typeof d.success === "boolean" ? d.success : undefined,
          message: typeof d.message === "string" ? d.message : null,
          items: Array.isArray(d.items)
            ? d.items
                .map((it) => ({
                  name: typeof it.name === "string" ? it.name : "",
                  quantity: Number(it.quantity) || 0,
                  unit_price: Number(it.unit_price) || 0,
                  options_label:
                    it.options_label == null || typeof it.options_label === "string" ? it.options_label : null,
                }))
                .filter((it) => it.name && it.quantity > 0)
            : undefined,
        });
      }
    };

    socket.on("customer-display:update", onUpdate);
    return () => {
      socket.off("customer-display:update", onUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const total = payload.mode === "idle" ? 0 : payload.total ?? 0;
  const items: DisplayItem[] = payload.mode === "idle" ? [] : payload.items ?? [];
  const itemCount = items.reduce((s, it) => s + it.quantity, 0);

  const state = useMemo(() => {
    if (payload.mode === "idle") return "idle" as const;
    if (payload.mode === "processing") return "processing" as const;
    if (payload.mode === "result" && payload.success === false) return "failed" as const;
    if (payload.mode === "result") return "paid" as const;
    return "active" as const;
  }, [payload]);

  const bgClass = {
    idle: "bg-stone-950",
    active: "bg-stone-950",
    processing: "bg-[#0a1628]",
    paid: "bg-[#071a12]",
    failed: "bg-[#1a0a0a]",
  }[state];

  return (
    <div
      className={`min-h-screen ${bgClass} text-white transition-colors duration-700 select-none`}
      onDoubleClick={() => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }}
    >
      {state === "idle" ? (
        /* ── Idle: centered welcome ── */
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-3xl font-light text-stone-600">Welcome</p>
        </div>
      ) : (
        /* ── Active: split layout ── */
        <div className="min-h-screen flex">

          {/* LEFT — total */}
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            {state === "processing" && (
              <div className="flex items-center gap-2 mb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-sky-400 text-sm font-medium">
                  {payload.mode !== "idle" && payload.paymentMethod === "card" ? "Tap or insert card" : "Awaiting payment"}
                </span>
              </div>
            )}
            {state === "paid" && (
              <p className="text-emerald-400 text-sm font-medium mb-4">Payment complete</p>
            )}
            {state === "failed" && (
              <p className="text-red-400 text-sm font-medium mb-4">Payment failed</p>
            )}

            <p className="text-[6rem] sm:text-[8rem] lg:text-[10rem] leading-none font-black tracking-tighter">
              {fmt(total)}
            </p>

            {itemCount > 0 && (
              <p className="mt-4 text-stone-500 text-sm">
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* RIGHT — item list */}
          {items.length > 0 && (
            <div className="w-[340px] lg:w-[400px] border-l border-white/[0.06] flex flex-col">
              <div className="flex-1 overflow-y-auto py-8 px-6">
                <div className="space-y-3">
                  {items.map((it, i) => (
                    <div key={`${it.name}-${i}`} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white font-medium leading-tight">
                          <span className="text-stone-500 mr-1.5">{it.quantity}×</span>
                          {it.name}
                        </p>
                        {it.options_label && (
                          <p className="text-stone-600 text-sm mt-0.5 truncate">{it.options_label}</p>
                        )}
                      </div>
                      <p className="text-stone-400 font-medium shrink-0 tabular-nums">
                        {fmt(it.unit_price * it.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider + total at bottom of right panel */}
              <div className="border-t border-white/[0.06] px-6 py-5 flex items-center justify-between">
                <span className="text-stone-500 text-sm">Total</span>
                <span className="text-white text-xl font-bold tabular-nums">{fmt(total)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
