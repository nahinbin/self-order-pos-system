"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import { isOrderStatus, type OrderStatus } from "@/lib/order-status";

type ItemOption = { id: number; name: string; price_modifier: number; is_default: number; unavailable?: boolean };
type OptionGroup = { id: number; name: string; required: number; min_selections: number; max_selections: number; options?: ItemOption[] };
type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  image_url?: string | null;
  price: number;
  category: string;
  option_groups?: OptionGroup[];
  unavailable?: boolean;
};
type SelectedOption = { groupName: string; choiceName: string; priceModifier: number; quantity?: number };
type CartItem = {
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
  options?: SelectedOption[];
};

const STEPS = ["confirm_table", "order_type", "menu", "cart", "payment", "done"] as const;

function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableParam = searchParams.get("table");
  const tableId = tableParam ? parseInt(tableParam, 10) : null;
  const tableName = tableId ? `Table ${tableId}` : null;

  const [step, setStep] = useState<(typeof STEPS)[number]>("confirm_table");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | null>(null);
  const [confirmedTableId, setConfirmedTableId] = useState<number | null>(null);
  const [confirmedTableName, setConfirmedTableName] = useState<string | null>(tableName);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [optionModalItem, setOptionModalItem] = useState<MenuItem | null>(null);
  /** For each option group: map of optionId -> quantity (0 = not selected). Single-select: at most one option has 1. Multi-select: any counts. */
  const [optionSelections, setOptionSelections] = useState<Record<string, Record<number, number>>>({});
  const [optionModalQty, setOptionModalQty] = useState(1);
  const [availableTables, setAvailableTables] = useState<{ id: number; name: string }[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [liveOrder, setLiveOrder] = useState<{
    status: OrderStatus;
    preparing_started_at?: string | null;
    served_at?: string | null;
    preparing_duration_seconds?: number | null;
  } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    let mounted = true;
    const check = () =>
      fetch("/api/shift/status")
        .then((r) => r.json())
        .then((d) => { if (mounted) setIsOpen(d.open !== false); })
        .catch(() => {});
    check();
    const id = setInterval(check, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const MENU_LOAD_TIMEOUT_MS = 10000;
  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    const timeoutId = setTimeout(() => setMenuLoading(false), MENU_LOAD_TIMEOUT_MS);
    try {
      const res = await fetch("/api/menu");
      if (res.ok) {
        const data = await res.json().catch(() => []);
        setMenu(Array.isArray(data) ? data : []);
      } else {
        setMenu([]);
      }
    } catch {
      setMenu([]);
    } finally {
      clearTimeout(timeoutId);
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // When no table is specified in the URL (/order), let the guest pick a table.
  useEffect(() => {
    if (tableParam) return;
    if (step !== "confirm_table") return;

    let cancelled = false;
    const load = async () => {
      setTablesLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/tables");
        if (!res.ok) throw new Error("Failed to load tables");
        const data = await res.json().catch(() => []);
        if (cancelled) return;
        setAvailableTables(Array.isArray(data) ? data : []);
      } catch {
        if (cancelled) return;
        setAvailableTables([]);
        setError("Could not load tables. Please ask a staff member to help.");
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [step, tableParam]);

  const confirmTable = () => {
    if (tableId) {
      setConfirmedTableId(tableId);
      setConfirmedTableName(tableName ?? `Table ${tableId}`);
      setStep("order_type");
      setError(null);
    }
  };

  const hasOptions = (item: MenuItem) => item.option_groups && item.option_groups.length > 0;

  const openOptionModal = (item: MenuItem) => {
    setOptionModalItem(item);
    setOptionModalQty(1);
    const initial: Record<string, Record<number, number>> = {};
    item.option_groups?.forEach((g) => {
      const opts = g.options ?? [];
      const availableOpts = opts.filter((o) => !o.unavailable);
      const byId: Record<number, number> = {};
      opts.forEach((o) => { byId[o.id] = 0; });
      const defaultOpts = opts.filter((o) => o.is_default === 1 && !o.unavailable);
      const toSelect = defaultOpts.length >= g.min_selections
        ? defaultOpts
        : availableOpts.slice(0, Math.max(g.min_selections, 1));
      const isSingle = g.max_selections === 1;
      if (isSingle && toSelect.length > 0) {
        byId[toSelect[0].id] = 1;
      } else {
        toSelect.forEach((o) => { byId[o.id] = 1; });
      }
      initial[String(g.id)] = byId;
    });
    setOptionSelections(initial);
  };

  const optionsKey = (opts: SelectedOption[] | undefined) =>
    opts?.length ? JSON.stringify([...opts].sort((a, b) => a.groupName.localeCompare(b.groupName) || a.choiceName.localeCompare(b.choiceName) || (a.quantity ?? 1) - (b.quantity ?? 1))) : "";

  const addToCartWithOptions = (item: MenuItem, selected: SelectedOption[], qty: number) => {
    const unitPrice = item.price + selected.reduce((s, o) => s + o.priceModifier * (o.quantity ?? 1), 0);
    const key = optionsKey(selected);
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.menu_item_id === item.id && optionsKey(c.options) === key
      );
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id && optionsKey(c.options) === key ? { ...c, quantity: c.quantity + qty } : c
        );
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: unitPrice, quantity: qty, options: selected }];
    });
    setOptionModalItem(null);
  };

  const addToCart = (item: MenuItem, qty = 1) => {
    if (item.unavailable) return;
    if (hasOptions(item)) {
      openOptionModal(item);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id && !optionsKey(c.options));
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id && !optionsKey(c.options) ? { ...c, quantity: c.quantity + qty } : c
        );
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: qty }];
    });
  };

  const confirmOptionModal = () => {
    if (!optionModalItem) return;
    const groups = optionModalItem.option_groups ?? [];
    const selected: SelectedOption[] = [];
    for (const g of groups) {
      const byId = optionSelections[String(g.id)] ?? {};
      const totalQty = Object.values(byId).reduce((a, b) => a + b, 0);
      if (g.required && totalQty < g.min_selections) return;
      const opts = g.options ?? [];
      for (const o of opts) {
        if (o.unavailable) continue;
        const q = byId[o.id] ?? 0;
        if (q > 0) selected.push({ groupName: g.name, choiceName: o.name, priceModifier: o.price_modifier, quantity: q });
      }
    }
    addToCartWithOptions(optionModalItem, selected, optionModalQty);
  };

  const optionModalTotal = optionModalItem
    ? (optionModalItem.price +
        (optionModalItem.option_groups ?? []).reduce((sum, g) => {
          const byId = optionSelections[String(g.id)] ?? {};
          const opts = g.options ?? [];
          return sum + opts.reduce((s, o) => s + (o.price_modifier * (byId[o.id] ?? 0)), 0);
        }, 0)) *
      optionModalQty
    : 0;

  const optionModalValid =
    optionModalItem &&
    (optionModalItem.option_groups ?? []).every((g) => {
      const byId = optionSelections[String(g.id)] ?? {};
      const totalQty = Object.values(byId).reduce((a, b) => a + b, 0);
      if (!g.required) return true;
      return totalQty >= g.min_selections;
    });

  const setOptionQuantity = (groupId: number, optionId: number, group: OptionGroup, quantity: number) => {
    const isSingle = group.max_selections === 1;
    setOptionSelections((s) => {
      const prev = s[String(groupId)] ?? {};
      const next = { ...prev };
      if (isSingle) {
        if (quantity >= 1) {
          Object.keys(next).forEach((id) => { next[Number(id)] = 0; });
          next[optionId] = 1;
        } else {
          next[optionId] = 0;
        }
      } else {
        next[optionId] = Math.max(0, quantity);
      }
      return { ...s, [String(groupId)]: next };
    });
  };

  const changeOptionQuantity = (groupId: number, optionId: number, delta: number) => {
    setOptionSelections((s) => {
      const prev = s[String(groupId)] ?? {};
      const current = prev[optionId] ?? 0;
      return { ...s, [String(groupId)]: { ...prev, [optionId]: Math.max(0, current + delta) } };
    });
  };

  const updateCartQty = (index: number, delta: number) => {
    setCart((prev) => {
      const next = prev.map((c, i) => (i === index ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c));
      return next.filter((c) => c.quantity > 0);
    });
  };

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const displayTableName = confirmedTableName ?? tableName ?? "Select table";

  const submitOrder = async (paymentMethod: "online" | "cash") => {
    if (!confirmedTableId || !orderType || cart.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_id: confirmedTableId,
          order_type: orderType,
          items: cart.map((c) => ({
            menu_item_id: c.menu_item_id,
            name: c.name,
            price: c.price,
            quantity: c.quantity,
            options_json: c.options?.length ? JSON.stringify(c.options) : null,
          })),
          total: Math.round(total * 100) / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      setOrderId(data.orderId);
      // Immediately show waiting screen after order creation (don't block on payment PATCH).
      setLiveOrder({ status: "pending" });
      setStep("done");

      // Patch payment in the background (do not block UI).
      fetch(`/api/orders/${data.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method: paymentMethod,
          payment_status: paymentMethod === "cash" ? "pending" : "paid",
        }),
      })
        .then((r) => r.json().catch(() => null).then((j) => ({ ok: r.ok, data: j })))
        .then(({ ok, data }) => {
          if (!ok || !data || !isOrderStatus(data.status)) return;
          setLiveOrder({
            status: data.status,
            preparing_started_at: data.preparing_started_at ?? null,
            served_at: data.served_at ?? null,
            preparing_duration_seconds: data.preparing_duration_seconds ?? null,
          });
        })
        .catch(() => {
          // keep waiting UI; polling/socket will correct state
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // Live updates via socket.io (fast), with polling fallback.
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    // socket
    if (!socketRef.current) {
      socketRef.current = io({
        path: "/socket.io",
        auth: { restaurantId: "1" },
        query: { restaurantId: "1" },
      });
    }
    const socket = socketRef.current;
    const onUpdate = (order: { id?: unknown; status?: unknown; preparing_started_at?: unknown; served_at?: unknown; preparing_duration_seconds?: unknown }) => {
      if (cancelled) return;
      if (order == null || typeof order !== "object") return;
      if (Number(order.id) !== orderId) return;
      if (!isOrderStatus(order.status)) return;
      setLiveOrder({
        status: order.status,
        preparing_started_at: typeof order.preparing_started_at === "string" ? order.preparing_started_at : null,
        served_at: typeof order.served_at === "string" ? order.served_at : null,
        preparing_duration_seconds:
          typeof order.preparing_duration_seconds === "number" ? order.preparing_duration_seconds : null,
      });
    };
    socket.on("order:update", onUpdate);

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !isOrderStatus(data.status)) return;
        if (cancelled) return;
        setLiveOrder({
          status: data.status,
          preparing_started_at: data.preparing_started_at ?? null,
          served_at: data.served_at ?? null,
          preparing_duration_seconds: data.preparing_duration_seconds ?? null,
        });
      } catch {
        // ignore transient errors
      }
    };

    fetchStatus();
    const id = setInterval(fetchStatus, 8000);
    return () => {
      cancelled = true;
      socket.off("order:update", onUpdate);
      clearInterval(id);
    };
  }, [orderId]);

  const guestStatusTitleAndMessage = () => {
    const status = liveOrder?.status ?? "pending";
    if (status === "pending") {
      return {
        title: "Waiting for the kitchen",
        message: "We've received your order. The kitchen is confirming it, this usually takes less than a minute.",
      };
    }
    if (status === "preparing") {
      return {
        title: "Your food is being prepared",
        message: "The kitchen has started preparing your order. We'll bring it to your table as soon as it's ready.",
      };
    }
    if (status === "served") {
      return {
        title: "Enjoy your meal",
        message: "Your order has been served. If you need anything else, please call a staff member.",
      };
    }
    if (status === "cancelled") {
      return {
        title: "Order cancelled",
        message: "Your order was cancelled. Please speak to a staff member if this was unexpected.",
      };
    }
    return {
      title: "Your order is in progress",
      message: "The kitchen is handling your order.",
    };
  };

  const categories = useMemo(
    () => [...new Set(menu.map((m) => m.category).filter(Boolean))],
    [menu]
  );
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const catRefs = useRef<Record<string, HTMLElement | null>>({});

  const scrollToCat = (cat: string) => {
    setActiveCat(cat);
    catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (step !== "menu" || categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCat(entry.target.getAttribute("data-cat"));
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );
    Object.values(catRefs.current).forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [step, categories]);

  const statusIcon = (() => {
    const s = liveOrder?.status ?? "pending";
    if (s === "pending") return { emoji: "🕐", color: "text-amber-500", pulse: true };
    if (s === "preparing") return { emoji: "🍳", color: "text-orange-500", pulse: true };
    if (s === "served") return { emoji: "✅", color: "text-emerald-500", pulse: false };
    if (s === "cancelled") return { emoji: "✕", color: "text-red-500", pulse: false };
    return { emoji: "⏳", color: "text-stone-500", pulse: true };
  })();

  return (
    <div className="min-h-screen bg-stone-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            {(step === "menu" || step === "cart" || step === "payment") && (
              <button
                type="button"
                onClick={() => {
                  if (step === "payment") setStep("menu");
                  else if (step === "cart") setStep("menu");
                  else if (step === "menu") setStep("order_type");
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-bold text-stone-900">{displayTableName}</span>
              <span className="text-[11px] text-stone-500 leading-tight">
                {orderType === "takeaway" ? "Takeaway" : orderType === "dine_in" ? "Dine in" : ""}
              </span>
            </div>
          </div>
          {step === "menu" && cartCount > 0 && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative px-3.5 py-2 rounded-xl bg-stone-900 text-white text-sm font-bold"
            >
              Cart · {cartCount}
            </button>
          )}
        </div>
      </header>

      {!isOpen && (
        <div className="bg-red-600 text-white text-center py-2 px-4">
          <p className="text-sm font-semibold">Restaurant is currently closed</p>
        </div>
      )}

      {step === "menu" && categories.length > 1 && (
        <div className="sticky top-[53px] z-10 bg-white/95 backdrop-blur-md border-b border-stone-100">
          <div className="max-w-2xl mx-auto overflow-x-auto hide-scrollbar">
            <div className="flex gap-1 px-4 py-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => scrollToCat(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                    activeCat === cat
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        {step === "confirm_table" && (
          <div className="py-12">
            {tableParam ? (
              <div className="text-center max-w-xs mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
                  <span className="text-3xl">🪑</span>
                </div>
                <h2 className="text-2xl font-black text-stone-900 mb-1">{tableName}</h2>
                <p className="text-stone-500 text-sm mb-8">Confirm your table to start ordering.</p>
                <button
                  type="button"
                  onClick={confirmTable}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 text-stone-900 font-bold text-base hover:bg-amber-400 transition shadow-md shadow-amber-500/20"
                >
                  Start ordering
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-black text-stone-900 text-center mb-1">Select your table</h2>
                <p className="text-stone-500 text-sm text-center mb-6">Tap your table number to begin.</p>
                {tablesLoading ? (
                  <div className="py-8 flex justify-center">
                    <div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                  </div>
                ) : availableTables.length === 0 ? (
                  <p className="text-sm text-stone-500 text-center">No tables configured. Please ask staff.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {availableTables.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setConfirmedTableId(t.id);
                          setConfirmedTableName(t.name || `Table ${t.id}`);
                          setStep("order_type");
                          setError(null);
                        }}
                        className="aspect-square rounded-2xl border-2 border-stone-200 bg-white font-bold text-stone-800 hover:border-amber-400 hover:bg-amber-50 transition flex items-center justify-center text-lg"
                      >
                        {t.name.replace("Table ", "")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === "order_type" && (
          <div className="py-10 max-w-sm mx-auto">
            <h2 className="text-xl font-black text-stone-900 text-center mb-6">How are you ordering?</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { setOrderType("dine_in"); setStep("menu"); }}
                className="flex flex-col items-center gap-3 py-8 rounded-2xl border-2 border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50 transition"
              >
                <span className="text-4xl">🍽</span>
                <span className="font-bold text-stone-900">Dine in</span>
              </button>
              <button
                type="button"
                onClick={() => { setOrderType("takeaway"); setStep("menu"); }}
                className="flex flex-col items-center gap-3 py-8 rounded-2xl border-2 border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50 transition"
              >
                <span className="text-4xl">🥡</span>
                <span className="font-bold text-stone-900">Take away</span>
              </button>
            </div>
          </div>
        )}

        {step === "menu" && (
          <div className="space-y-8">
            {menuLoading ? (
              <div className="py-16 flex justify-center">
                <div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              </div>
            ) : menu.length === 0 ? (
              <p className="text-stone-500 py-12 text-center">No menu items available.</p>
            ) : (
              <>
                {categories.map((cat) => {
                  const items = menu.filter((m) => m.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <section
                      key={cat}
                      ref={(el) => { catRefs.current[cat] = el; }}
                      data-cat={cat}
                    >
                      <h2 className="text-sm font-black text-stone-800 uppercase tracking-wider mb-3 scroll-mt-28">{cat}</h2>
                      <ul className="space-y-2.5">
                        {items.map((item) => {
                          const isUnavailable = item.unavailable === true;
                          const inCart = cart.find((c) => c.menu_item_id === item.id);
                          return (
                            <li
                              key={item.id}
                              className={`flex items-stretch rounded-2xl border overflow-hidden transition ${
                                isUnavailable
                                  ? "bg-stone-100 border-stone-200 opacity-50"
                                  : "bg-white border-stone-200 active:scale-[0.99]"
                              }`}
                            >
                              {item.image_url && (
                                <div className="w-24 sm:w-28 shrink-0 self-stretch bg-stone-100 relative">
                                  <Image
                                    src={item.image_url}
                                    alt=""
                                    fill
                                    sizes="112px"
                                    className="object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1 py-3 px-3.5 flex flex-col justify-center">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-stone-900 text-[15px] leading-tight">{item.name}</p>
                                  {isUnavailable && (
                                    <span className="text-[10px] font-bold text-stone-500 bg-stone-200 px-1.5 py-0.5 rounded uppercase">Sold out</span>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{item.description}</p>
                                )}
                                <p className="text-amber-700 font-bold text-sm mt-1">${item.price.toFixed(2)}</p>
                              </div>
                              <div className="flex items-center shrink-0 pr-3">
                                {isUnavailable ? (
                                  <span className="w-10 h-10 rounded-xl bg-stone-200 text-stone-400 text-lg flex items-center justify-center">+</span>
                                ) : inCart && !hasOptions(item) ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const idx = cart.findIndex((c) => c.menu_item_id === item.id && !optionsKey(c.options));
                                        if (idx !== -1) updateCartQty(idx, -1);
                                      }}
                                      className="w-8 h-8 rounded-lg border border-stone-300 text-stone-600 text-sm flex items-center justify-center"
                                    >−</button>
                                    <span className="w-6 text-center text-sm font-bold">{inCart.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => addToCart(item)}
                                      className="w-8 h-8 rounded-lg bg-amber-500 text-white text-sm flex items-center justify-center"
                                    >+</button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => addToCart(item)}
                                    className="w-10 h-10 rounded-xl bg-amber-500 text-white text-lg flex items-center justify-center hover:bg-amber-600 active:scale-95 transition"
                                  >+</button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </>
            )}
          </div>
        )}

        {optionModalItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
            <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">
              <div className="shrink-0 px-5 pt-5 pb-3 border-b border-stone-100">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-stone-900 text-lg">{optionModalItem.name}</h3>
                    <p className="text-sm text-stone-500 mt-0.5">${optionModalItem.price.toFixed(2)}</p>
                  </div>
                  <button type="button" onClick={() => setOptionModalItem(null)} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 text-lg">×</button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {(optionModalItem.option_groups ?? []).map((g) => {
                  const isSingle = g.max_selections === 1;
                  const byId = optionSelections[String(g.id)] ?? {};
                  return (
                    <div key={g.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm font-bold text-stone-800">{g.name}</p>
                        {g.required ? (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">Required</span>
                        ) : (
                          <span className="text-[10px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">Optional</span>
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {g.options?.map((o) => {
                          const qty = byId[o.id] ?? 0;
                          const selected = qty > 0;
                          const isUnavailable = o.unavailable === true;
                          if (isUnavailable) {
                            return (
                              <li key={o.id} className="opacity-50">
                                <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50">
                                  <span className="text-sm text-stone-500">{o.name}</span>
                                  <span className="text-[10px] font-bold text-stone-400 bg-stone-200 px-1.5 py-0.5 rounded">SOLD OUT</span>
                                </div>
                              </li>
                            );
                          }
                          return (
                            <li key={o.id}>
                              {isSingle ? (
                                <button
                                  type="button"
                                  onClick={() => setOptionQuantity(g.id, o.id, g, selected ? 0 : 1)}
                                  className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border-2 text-left transition ${
                                    selected ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-stone-300"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? "border-amber-500 bg-amber-500" : "border-stone-300"}`}>
                                      {selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                    </span>
                                    <span className="font-medium text-stone-800 text-sm">{o.name}</span>
                                  </div>
                                  {o.price_modifier > 0 && (
                                    <span className="text-amber-700 font-semibold text-sm">+${o.price_modifier.toFixed(2)}</span>
                                  )}
                                </button>
                              ) : (
                                <div className={`flex items-center justify-between gap-2 px-3 py-3 rounded-xl border-2 transition ${selected ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-stone-800 text-sm">{o.name}</span>
                                    {o.price_modifier > 0 && <span className="text-amber-700 text-xs ml-1.5">+${o.price_modifier.toFixed(2)}</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button type="button" onClick={() => changeOptionQuantity(g.id, o.id, -1)} className="h-8 w-8 rounded-lg border border-stone-300 bg-white text-stone-700 font-medium text-sm">−</button>
                                    <span className="w-6 text-center text-sm font-bold">{qty}</span>
                                    <button type="button" onClick={() => changeOptionQuantity(g.id, o.id, 1)} className="h-8 w-8 rounded-lg border border-stone-300 bg-white text-stone-700 font-medium text-sm">+</button>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                  <span className="text-sm font-bold text-stone-800">Quantity</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setOptionModalQty((q) => Math.max(1, q - 1))} className="h-9 w-9 rounded-xl border border-stone-300 bg-white text-stone-700">−</button>
                    <span className="w-8 text-center font-bold">{optionModalQty}</span>
                    <button type="button" onClick={() => setOptionModalQty((q) => Math.min(20, q + 1))} className="h-9 w-9 rounded-xl border border-stone-300 bg-white text-stone-700">+</button>
                  </div>
                </div>
              </div>
              {!optionModalValid && (
                <p className="shrink-0 px-5 pb-1 text-xs text-amber-600">Select required options to continue.</p>
              )}
              <div className="shrink-0 p-5 border-t border-stone-100">
                <button
                  type="button"
                  onClick={confirmOptionModal}
                  disabled={!optionModalValid}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 text-stone-900 font-bold hover:bg-amber-400 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>Add to cart</span>
                  <span className="font-black">${optionModalTotal.toFixed(2)}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "cart" && (
          <div className="py-4 space-y-4">
            <h2 className="text-lg font-black text-stone-900">Review your order</h2>
            <ul className="space-y-2">
              {cart.map((item, index) => (
                <li key={index} className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-stone-200">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-stone-900 text-sm">{item.name}</p>
                    {item.options && item.options.length > 0 && (
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {item.options.map((o) => { const q = o.quantity ?? 1; return q > 1 ? `${o.choiceName} x${q}` : o.choiceName; }).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => updateCartQty(index, -1)} className="w-7 h-7 rounded-lg border border-stone-300 text-stone-600 text-sm flex items-center justify-center">−</button>
                    <span className="w-5 text-center text-sm font-bold">{item.quantity}</span>
                    <button type="button" onClick={() => updateCartQty(index, 1)} className="w-7 h-7 rounded-lg border border-stone-300 text-stone-600 text-sm flex items-center justify-center">+</button>
                  </div>
                  <span className="font-bold text-stone-900 text-sm tabular-nums w-16 text-right">${(item.price * item.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between px-1 pt-2">
              <span className="font-black text-stone-900">Total</span>
              <span className="font-black text-stone-900 text-lg">${total.toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button type="button" onClick={() => setStep("menu")} className="py-3 rounded-2xl border-2 border-stone-200 text-stone-700 font-semibold hover:bg-stone-50 transition">Add more</button>
              <button type="button" onClick={() => setStep("payment")} disabled={!isOpen} className="py-3 rounded-2xl bg-amber-500 text-stone-900 font-bold hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed">{isOpen ? "Checkout" : "Closed"}</button>
            </div>
          </div>
        )}

        {step === "payment" && (
          <div className="py-6 space-y-5">
            {!isOpen && (
              <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
                Restaurant is closed — ordering is unavailable.
              </div>
            )}
            <div className="rounded-2xl bg-white border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Order summary</p>
              </div>
              <ul className="divide-y divide-stone-100">
                {cart.map((item, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-stone-800">{item.quantity}× {item.name}</span>
                      {item.options && item.options.length > 0 && (
                        <p className="text-[11px] text-stone-500">{item.options.map((o) => { const q = o.quantity ?? 1; return q > 1 ? `${o.choiceName} x${q}` : o.choiceName; }).join(", ")}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-stone-800 tabular-nums">${(item.price * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
                <span className="font-black text-stone-900">Total</span>
                <span className="font-black text-stone-900 text-lg">${total.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-3">
              <button type="button" disabled={loading || !isOpen} onClick={() => submitOrder("online")} className="w-full py-4 rounded-2xl bg-amber-500 text-stone-900 font-bold text-base hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <span>💳</span> Pay now (card)
              </button>
              <button type="button" disabled={loading || !isOpen} onClick={() => submitOrder("cash")} className="w-full py-4 rounded-2xl border-2 border-stone-200 text-stone-700 font-bold text-base hover:bg-stone-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <span>💵</span> Pay cash to waiter
              </button>
            </div>
            <button type="button" onClick={() => setStep("menu")} className="w-full text-center text-sm text-stone-500 hover:text-stone-700 py-2">← Back to menu</button>
          </div>
        )}

        {step === "done" && orderId && (
          <div className="py-10 text-center max-w-sm mx-auto">
            <div className={`text-5xl mb-4 ${statusIcon.pulse ? "animate-pulse" : ""}`}>{statusIcon.emoji}</div>
            {(() => {
              const { title, message } = guestStatusTitleAndMessage();
              return (
                <>
                  <h2 className="text-xl font-black text-stone-900 mb-2">{title}</h2>
                  <p className="text-stone-600 text-sm mb-6 leading-relaxed">{message}</p>
                </>
              );
            })()}
            <div className="flex items-center justify-center gap-2 mb-8">
              {(["pending", "preparing", "served"] as const).map((s, i) => {
                const current = liveOrder?.status ?? "pending";
                const order = ["pending", "preparing", "served"];
                const done = order.indexOf(current) >= order.indexOf(s);
                const active = current === s;
                return (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <div className={`w-8 h-0.5 rounded ${done ? "bg-amber-400" : "bg-stone-200"}`} />}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-amber-500 text-white" : "bg-stone-200 text-stone-400"} ${active ? "ring-2 ring-amber-300 ring-offset-2" : ""}`}>
                      {i + 1}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-2 text-[11px] font-semibold text-stone-500 mb-8 -mt-2">
              <span className="w-8 text-center">Sent</span>
              <span className="w-8" />
              <span className="w-10 text-center">Cooking</span>
              <span className="w-8" />
              <span className="w-8 text-center">Done</span>
            </div>
            <p className="text-xs text-stone-400 mb-6">This page updates automatically.</p>
            <div className="space-y-3">
              <Link href={`/receipt/${orderId}`} className="block py-3 px-6 rounded-2xl bg-stone-900 text-white font-bold hover:bg-stone-950 transition">View receipt</Link>
              <button
                type="button"
                onClick={() => { setCart([]); setOrderId(null); setLiveOrder(null); setStep("menu"); setError(null); }}
                className="block w-full py-3 px-6 rounded-2xl border-2 border-stone-200 text-stone-700 font-semibold hover:bg-stone-50 transition"
              >Order more</button>
            </div>
          </div>
        )}
      </main>

      {step === "menu" && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 pb-safe">
          <div className="max-w-2xl mx-auto px-4 pb-4">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="w-full rounded-2xl bg-amber-500 text-stone-900 px-5 py-4 shadow-lg shadow-amber-500/20 flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-stone-900 text-white text-xs font-black flex items-center justify-center">{cartCount}</span>
                <span className="font-bold">View cart</span>
              </div>
              <span className="font-black text-lg">${total.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between shrink-0">
              <div>
                <p className="font-black text-stone-900">Your cart</p>
                <p className="text-xs text-stone-500">{cartCount} {cartCount === 1 ? "item" : "items"}</p>
              </div>
              <button type="button" onClick={() => setCartOpen(false)} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 text-lg">×</button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              <ul className="space-y-3">
                {cart.map((item, index) => (
                  <li key={index} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-stone-900">{item.name}</p>
                        {item.options && item.options.length > 0 && (
                          <p className="text-[11px] text-stone-500 mt-0.5">{item.options.map((o) => { const q = o.quantity ?? 1; return q > 1 ? `${o.choiceName} x${q}` : o.choiceName; }).join(" · ")}</p>
                        )}
                        <p className="text-xs text-stone-500 mt-1">${item.price.toFixed(2)} each</p>
                      </div>
                      <span className="font-black text-stone-900">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => updateCartQty(index, -1)} className="h-9 w-9 rounded-xl border border-stone-300 text-stone-700 text-lg flex items-center justify-center">−</button>
                        <span className="w-8 text-center font-black">{item.quantity}</span>
                        <button type="button" onClick={() => updateCartQty(index, 1)} className="h-9 w-9 rounded-xl border border-stone-300 text-stone-700 text-lg flex items-center justify-center">+</button>
                      </div>
                      <button type="button" onClick={() => updateCartQty(index, -item.quantity)} className="text-xs font-bold text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-5 py-4 border-t border-stone-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-stone-900">Total</span>
                <span className="font-black text-stone-900 text-lg">${total.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setCartOpen(false); setStep("menu"); }} className="py-3.5 rounded-2xl border-2 border-stone-200 text-stone-700 font-semibold hover:bg-stone-50 transition">Add more</button>
                <button type="button" onClick={() => { setCartOpen(false); setStep("payment"); }} disabled={!isOpen} className="py-3.5 rounded-2xl bg-amber-500 text-stone-900 font-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed">{isOpen ? "Checkout" : "Closed"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex justify-center py-8"><div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" /></div>
      </div>
    }>
      <OrderPageContent />
    </Suspense>
  );
}
