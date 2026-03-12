"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import Loader from "@/components/Loader";
import ShiftGate from "@/components/ShiftGate";
import { formatDuration } from "@/lib/order-status";

type OrderItem = { name: string; price: number; quantity: number; options_json?: string | null };

function parseOrderOptions(json: unknown): { choiceName: string; priceModifier?: number; quantity?: number }[] {
  if (json == null || typeof json !== "string") return [];
  const s = String(json).trim();
  if (!s || s[0] !== "[") return [];
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is { choiceName: string; priceModifier?: number; quantity?: number } =>
        o && typeof o === "object" && typeof (o as { choiceName?: unknown }).choiceName === "string"
    );
  } catch {
    return [];
  }
}

/** Kitchen display: option name and quantity only (no price). */
function formatOptionForKitchen(o: { choiceName: string; quantity?: number }): string {
  const q = o.quantity ?? 1;
  return q > 1 ? `${o.choiceName} x${q}` : o.choiceName;
}

/** Order code like McDonald's/KFC: YTA2086, WDN0009, DLY0001 */
function orderCode(order: Order): string {
  const prefix =
    order.order_type === "takeaway"
      ? "YTA"
      : order.order_type === "delivery"
        ? "DLY"
        : "WDN";
  const num = String(order.id).padStart(4, "0");
  return `${prefix}${num}`;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
}

type Order = {
  id: number;
  table_id: number;
  table_name?: string;
  order_type: string;
  status: "pending" | "preparing" | "served" | "cancelled" | string;
  payment_method: string | null;
  payment_status: string;
  total: number;
  created_at: string;
  preparing_started_at?: string | null;
  served_at?: string | null;
  preparing_duration_seconds?: number | null;
  items?: OrderItem[];
};

function usePreparingTimer(startIso?: string | null, active?: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || !startIso) {
      setElapsed(0);
      return;
    }
    const start = new Date(startIso).getTime();
    if (!start) {
      setElapsed(0);
      return;
    }
    const update = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.round((now - start) / 1000));
      setElapsed(diff);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startIso, active]);

  return elapsed;
}

function OrderCard({
  order,
  onStartPreparing,
  onCancel,
  onMarkServed,
}: {
  order: Order;
  onStartPreparing: (id: number) => void;
  onCancel: (id: number) => void;
  onMarkServed: (id: number) => void;
}) {
  const code = orderCode(order);
  const tableLabel = order.table_name ?? `Table ${order.table_id}`;
  const location =
    order.order_type === "takeaway"
      ? `Take away (${tableLabel})`
      : order.order_type === "delivery"
        ? "Delivery"
        : tableLabel;

  const isPending = order.status === "pending";
  const isPreparing = order.status === "preparing";
  const isServed = order.status === "served";
  const isCancelled = order.status === "cancelled";

  const liveElapsed = usePreparingTimer(order.preparing_started_at, isPreparing);
  const displayElapsed =
    (isServed && typeof order.preparing_duration_seconds === "number"
      ? order.preparing_duration_seconds
      : isPreparing
        ? liveElapsed
        : null) ?? null;

  return (
    <div className="bg-white rounded-xl border-2 border-stone-200 p-4 shadow-sm flex flex-col min-h-[140px]">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-2xl font-black text-stone-900 tracking-tight">{code}</span>
        <span className="text-sm font-medium text-stone-500 whitespace-nowrap">{timeAgo(order.created_at)}</span>
      </div>
      <p className="text-base font-semibold text-stone-700 mb-3">{location}</p>
      <ul className="space-y-2 flex-1 text-sm">
        {order.items?.map((item, i) => {
          const opts = parseOrderOptions(item.options_json);
          return (
            <li key={i}>
              <p className="font-semibold text-stone-800">
                {item.name} × {item.quantity}
              </p>
              {opts.length > 0 && (
                <p className="text-stone-600 mt-0.5 pl-2 text-xs leading-snug">
                  {opts.map(formatOptionForKitchen).join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between gap-3 text-sm">
        <div className="flex flex-col">
          {isPending && (
            <span className="font-medium text-amber-700">Kitchen confirming order…</span>
          )}
          {isPreparing && (
            <span className="font-medium text-amber-700">
              Preparing{displayElapsed != null && <> · {formatDuration(displayElapsed)}</>}
            </span>
          )}
          {isServed && (
            <span className="font-medium text-emerald-700">
              Served
              {displayElapsed != null && <> · {formatDuration(displayElapsed)}</>}
            </span>
          )}
          {isCancelled && (
            <span className="font-medium text-red-600">Cancelled</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {isPending && (
            <>
              <button
                type="button"
                onClick={() => onCancel(order.id)}
                className="px-3 py-1.5 rounded-lg border border-red-300 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onStartPreparing(order.id)}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-xs font-medium text-white hover:bg-amber-700"
              >
                Start preparing
              </button>
            </>
          )}
          {isPreparing && (
            <button
              type="button"
              onClick={() => onMarkServed(order.id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Served
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrdersGrid({
  orders,
  onStartPreparing,
  onCancel,
  onMarkServed,
}: {
  orders: Order[];
  onStartPreparing: (id: number) => void;
  onCancel: (id: number) => void;
  onMarkServed: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 auto-rows-fr">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onStartPreparing={onStartPreparing}
          onCancel={onCancel}
          onMarkServed={onMarkServed}
        />
      ))}
    </div>
  );
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "preparing" | "served" | "cancelled">("all");
  const socketRef = useRef<Socket | null>(null);
  const orderSoundRef = useRef<HTMLAudioElement | null>(null);
  const soundUnlockedRef = useRef(false);

  const ORDER_SOUND_URL = "/positive-notification-digital-beep-double-gamemaster-audio-1-00-02.mp3";

  const playNewOrderSound = useCallback(() => {
    if (!soundUnlockedRef.current) return;
    const audio = orderSoundRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const unlockSound = useCallback(() => {
    if (soundUnlockedRef.current) return;
    if (!orderSoundRef.current) {
      orderSoundRef.current = new Audio(ORDER_SOUND_URL);
    }
    const audio = orderSoundRef.current;
    audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        soundUnlockedRef.current = true;
        setSoundReady(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const LOAD_TIMEOUT_MS = 8000;
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const timeoutId = setTimeout(() => setLoading(false), LOAD_TIMEOUT_MS);
    try {
      const res = await fetch("/api/orders");
      const data = await res.json().catch(() => []);
      setOrders(res.ok && Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch orders", e);
      setOrders([]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const updateOrderInState = useCallback((updated: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }, []);

  const patchOrderStatus = useCallback(
    async (id: number, status: string) => {
      setStatusError(null);
      let prevOrder: Order | null = null;

      // Optimistic UI update so the kitchen sees the change instantly.
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          prevOrder = o;
          const nowIso = new Date().toISOString();

          if (status === "preparing") {
            return {
              ...o,
              status: "preparing",
              preparing_started_at: nowIso,
              served_at: null,
              preparing_duration_seconds: null,
            };
          }

          if (status === "served") {
            const startMs = o.preparing_started_at
              ? new Date(o.preparing_started_at).getTime()
              : new Date(o.created_at).getTime();
            const seconds = Math.max(0, Math.round((Date.now() - startMs) / 1000));
            return {
              ...o,
              status: "served",
              served_at: nowIso,
              preparing_duration_seconds: seconds,
            };
          }

          if (status === "cancelled") {
            return { ...o, status: "cancelled" };
          }

          return { ...o, status };
        })
      );

      // Fire the real update in the background and reconcile with server response.
      try {
        const res = await fetch(`/api/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || typeof data.id !== "number") {
          console.error("Failed to update order status", data);
          if (prevOrder) {
            setOrders((prev) => prev.map((o) => (o.id === id ? prevOrder! : o)));
          }
          setStatusError("Couldn’t update the order. Please try again.");
          return;
        }
        updateOrderInState(data as Order);
      } catch (e) {
        console.error("Failed to update order status", e);
        if (prevOrder) {
          setOrders((prev) => prev.map((o) => (o.id === id ? prevOrder! : o)));
        }
        setStatusError("Network error while updating the order. Please try again.");
      }
    },
    [updateOrderInState]
  );

  const handleStartPreparing = useCallback(
    (id: number) => {
      patchOrderStatus(id, "preparing");
    },
    [patchOrderStatus]
  );

  const handleCancel = useCallback(
    (id: number) => {
      patchOrderStatus(id, "cancelled");
    },
    [patchOrderStatus]
  );

  const handleMarkServed = useCallback(
    (id: number) => {
      patchOrderStatus(id, "served");
    },
    [patchOrderStatus]
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!orderSoundRef.current) {
      orderSoundRef.current = new Audio(ORDER_SOUND_URL);
    }
    const socket = io({
      path: "/socket.io",
      auth: { restaurantId: "1" },
      query: { restaurantId: "1" },
    });
    socketRef.current = socket;

    socket.on("order:new", (order: Order) => {
      playNewOrderSound();
      setOrders((prev) => {
        if (prev.some((o) => o.id === order.id)) return prev;
        return [order, ...prev];
      });
    });

    socket.on("order:update", (order: Order) => {
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === order.id);
        if (!exists) return prev;
        return prev.map((o) => (o.id === order.id ? order : o));
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [playNewOrderSound]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <Loader />
      </div>
    );
  }

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-stone-500 text-lg">No orders yet</p>
      <p className="text-stone-400 text-sm mt-1">New orders will appear here</p>
    </div>
  );

  const filteredOrders =
    statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  const fullscreenOverlay = (
    <div className="fixed inset-0 z-50 bg-stone-100 flex flex-col" onClick={unlockSound}>
      <div className="absolute top-3 right-3 z-10">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-3 rounded-xl bg-white/90 shadow-md text-stone-600 hover:bg-white hover:text-stone-800 border border-stone-200"
          title="Exit full screen"
          aria-label="Exit full screen"
        >
          <span className="text-xl">⎋</span>
        </button>
      </div>
      <main className="flex-1 overflow-auto p-4 pt-14 w-full h-full">
        {filteredOrders.length === 0 ? (
          emptyState
        ) : (
          <OrdersGrid
            orders={filteredOrders}
            onStartPreparing={handleStartPreparing}
            onCancel={handleCancel}
            onMarkServed={handleMarkServed}
          />
        )}
      </main>
    </div>
  );

  return (
    <ShiftGate>
      {/* Normal view (inside admin layout) */}
      <div className="flex flex-col -mx-4 -my-6 sm:mx-0 sm:my-0" onClick={unlockSound}>
        <div className="flex justify-end items-center gap-2 p-2 pb-0">
          {!soundReady && (
            <span className="text-xs text-stone-500 mr-1">Click anywhere to enable order sound</span>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-lg text-stone-600 hover:bg-stone-200 hover:text-stone-800"
            title="Full screen"
            aria-label="Full screen"
          >
            <span className="text-xl">⛶</span>
          </button>
        </div>
        <main className="flex-1 p-4 min-h-[60vh]">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "pending", "preparing", "served", "cancelled"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    statusFilter === k
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            {statusError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {statusError}
              </div>
            )}
          </div>
          {filteredOrders.length === 0 ? (
            emptyState
          ) : (
            <OrdersGrid
              orders={filteredOrders}
              onStartPreparing={handleStartPreparing}
              onCancel={handleCancel}
              onMarkServed={handleMarkServed}
            />
          )}
        </main>
      </div>

      {/* Fullscreen: overlay covers entire viewport (hides nav) */}
      {isFullscreen && fullscreenOverlay}
    </ShiftGate>
  );
}
