"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
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
    opts?.length ? JSON.stringify([...opts].sort((a, b) => a.groupName.localeCompare(b.groupName) || a.choiceName.localeCompare(b.choiceName) || String((a.quantity ?? 1) - (b.quantity ?? 1)))) : "";

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
        message: "We’ve received your order. The kitchen is confirming it, this usually takes less than a minute.",
      };
    }
    if (status === "preparing") {
      return {
        title: "Your food is being prepared",
        message: "The kitchen has started preparing your order. We’ll bring it to your table as soon as it’s ready.",
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

  return (
    <div className="min-h-screen bg-stone-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-stone-900">{displayTableName}</span>
            <span className="text-xs text-stone-500">
              {orderType === "takeaway" ? "Takeaway" : orderType === "dine_in" ? "Dine in" : ""}
            </span>
          </div>
          {step === "menu" && cartCount > 0 && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="px-3 py-2 rounded-xl bg-stone-900 text-white text-sm font-semibold"
            >
              Cart · {cartCount}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Step: Confirm table */}
        {step === "confirm_table" && (
          <div className="py-8">
            {tableParam ? (
              <div className="text-center">
                <p className="text-stone-600 mb-6">
                  Are you at <strong>{tableName}</strong>?
                </p>
                <button
                  type="button"
                  onClick={confirmTable}
                  className="w-full max-w-xs mx-auto py-3 px-6 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700"
                >
                  Yes, start ordering
                </button>
              </div>
            ) : (
              <div>
                <p className="text-stone-600 mb-4 text-center">
                  Choose your table to start ordering.
                </p>
                {tablesLoading ? (
                  <div className="py-8 flex justify-center">
                    <div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                  </div>
                ) : availableTables.length === 0 ? (
                  <p className="text-sm text-stone-500 text-center">
                    No tables are configured yet. Please ask a staff member to help.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
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
                        className="py-3 rounded-xl border-2 border-stone-200 bg-white text-sm font-medium text-stone-800 hover:border-amber-500 hover:bg-amber-50"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step: Dine in / Takeaway */}
        {step === "order_type" && (
          <div className="py-6">
            <p className="text-stone-600 mb-4">How would you like to order?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setOrderType("dine_in"); setStep("menu"); }}
                className="py-4 px-4 rounded-xl border-2 border-stone-200 hover:border-amber-500 hover:bg-amber-50 font-medium text-stone-800"
              >
                Dine in
              </button>
              <button
                type="button"
                onClick={() => { setOrderType("takeaway"); setStep("menu"); }}
                className="py-4 px-4 rounded-xl border-2 border-stone-200 hover:border-amber-500 hover:bg-amber-50 font-medium text-stone-800"
              >
                Take away
              </button>
            </div>
          </div>
        )}

        {/* Step: Menu */}
        {step === "menu" && (
          <div className="space-y-6">
            {menuLoading ? (
              <div className="py-12 flex justify-center"><div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" /></div>
            ) : menu.length === 0 ? (
              <p className="text-stone-500 py-8 text-center">No menu items available.</p>
            ) : (
            <>
            {["Mains", "Starters", "Sides", "Salads", "Drinks", "Add-ons"].map((cat) => {
              const items = menu.filter((m) => m.category === cat);
              if (items.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">{cat}</h2>
                  <ul className="space-y-3">
                    {items.map((item) => {
                      const isUnavailable = item.unavailable === true;
                      return (
                        <li
                          key={item.id}
                          className={`flex items-stretch rounded-2xl border overflow-hidden transition ${
                            isUnavailable
                              ? "bg-stone-100 border-stone-200 opacity-60"
                              : "bg-white border-stone-200 hover:border-amber-300 hover:bg-amber-50/40"
                          }`}
                        >
                          {item.image_url ? (
                            <div className="w-28 min-h-[84px] shrink-0 self-stretch bg-stone-100">
                              <img src={item.image_url} alt="" className="w-full h-full min-h-[84px] object-cover rounded-l-2xl" />
                            </div>
                          ) : null}
                          <div className="min-w-0 flex-1 py-3.5 pr-3.5 pl-3.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-stone-900 text-base">{item.name}</p>
                              {isUnavailable && (
                                <span className="text-xs font-medium text-stone-500 bg-stone-200 px-2 py-0.5 rounded">
                                  Unavailable
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-sm text-stone-500 truncate">{item.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 py-3 pr-3.5">
                            <span className="text-amber-700 font-semibold">${item.price.toFixed(2)}</span>
                            {isUnavailable ? (
                              <span className="w-10 h-10 rounded-xl bg-stone-200 text-stone-400 text-xl leading-none flex items-center justify-center cursor-not-allowed">
                                +
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addToCart(item)}
                                className="w-10 h-10 rounded-xl bg-amber-600 text-white text-xl leading-none hover:bg-amber-700 active:scale-[0.98]"
                              >
                                +
                              </button>
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

        {/* Options modal */}
        {optionModalItem && (
          <div className="fixed inset-0 z-20 flex items-end sm:items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
              <div className="shrink-0 p-4 border-b border-stone-200 bg-white">
                <h3 className="font-semibold text-stone-800">{optionModalItem.name}</h3>
                <p className="text-sm text-stone-500">Base: ${optionModalItem.price.toFixed(2)} — select options below</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
                {(optionModalItem.option_groups ?? []).map((g) => {
                  const isSingle = g.max_selections === 1;
                  const byId = optionSelections[String(g.id)] ?? {};
                  return (
                    <div key={g.id}>
                      <p className="text-sm font-medium text-stone-700 mb-0.5">
                        {g.name}
                        {g.required ? <span className="text-amber-600 ml-1">*</span> : null}
                      </p>
                      <p className="text-xs text-stone-500 mb-2">
                        {isSingle ? "Choose one" : "Add as many as you want (use + / −)"}
                      </p>
                      <ul className="space-y-1.5">
                        {g.options?.map((o) => {
                          const qty = byId[o.id] ?? 0;
                          const selected = qty > 0;
                          const isUnavailable = o.unavailable === true;
                          if (isUnavailable) {
                            return (
                              <li key={o.id} className="opacity-60">
                                <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-stone-200 bg-stone-100 cursor-not-allowed">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-stone-500">{o.name}</span>
                                    <span className="text-xs font-medium text-stone-500 bg-stone-200 px-2 py-0.5 rounded">
                                      Temporarily unavailable
                                    </span>
                                  </div>
                                  {o.price_modifier > 0 && (
                                    <span className="text-stone-400 text-sm">+${o.price_modifier.toFixed(2)}</span>
                                  )}
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
                                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-left text-sm transition ${
                                    selected ? "border-amber-500 bg-amber-50" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                                  }`}
                                >
                                  <span className="font-medium text-stone-800">{o.name}</span>
                                  {o.price_modifier > 0 ? (
                                    <span className="text-amber-700 font-medium">+${o.price_modifier.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-stone-400 text-xs">No extra charge</span>
                                  )}
                                </button>
                              ) : (
                                <div className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 ${selected ? "border-amber-500 bg-amber-50" : "border-stone-200"}`}>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-stone-800">{o.name}</span>
                                    {o.price_modifier > 0 && (
                                      <span className="text-amber-700 text-sm ml-1">+${o.price_modifier.toFixed(2)} each</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => changeOptionQuantity(g.id, o.id, -1)}
                                      className="h-8 w-8 rounded-lg border border-stone-300 bg-white text-stone-700 font-medium"
                                    >
                                      −
                                    </button>
                                    <span className="w-6 text-center text-sm font-medium">{qty}</span>
                                    <button
                                      type="button"
                                      onClick={() => changeOptionQuantity(g.id, o.id, 1)}
                                      className="h-8 w-8 rounded-lg border border-stone-300 bg-white text-stone-700 font-medium"
                                    >
                                      +
                                    </button>
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
                <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                  <span className="text-sm font-medium text-stone-700">Quantity</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOptionModalQty((q) => Math.max(1, q - 1))}
                      className="h-9 w-9 rounded-lg border border-stone-300 bg-white text-stone-700"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-medium">{optionModalQty}</span>
                    <button
                      type="button"
                      onClick={() => setOptionModalQty((q) => Math.min(9, q + 1))}
                      className="h-9 w-9 rounded-lg border border-stone-300 bg-white text-stone-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              {!optionModalValid && (
                <p className="shrink-0 px-4 pb-1 text-xs text-amber-600">
                  Please select required options before adding to cart.
                </p>
              )}
              <div className="shrink-0 p-4 border-t border-stone-200 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-stone-600">Total</span>
                  <span className="text-lg font-semibold text-stone-900">${optionModalTotal.toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOptionModalItem(null)}
                    className="flex-1 py-3 rounded-xl border border-stone-300 text-stone-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmOptionModal}
                    disabled={!optionModalValid}
                    className="flex-1 py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add to cart — ${optionModalTotal.toFixed(2)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Cart */}
        {step === "cart" && (
          <div className="space-y-4">
            <ul className="space-y-2">
              {cart.map((item, index) => (
                <li
                  key={index}
                  className="flex flex-col gap-1 p-3 rounded-xl bg-white border border-stone-100"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-stone-800">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateCartQty(index, -1)}
                        className="w-8 h-8 rounded-lg border border-stone-300 text-stone-600"
                      >
                        −
                      </button>
                      <span className="w-6 text-center">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(index, 1)}
                        className="w-8 h-8 rounded-lg border border-stone-300 text-stone-600"
                      >
                        +
                      </button>
                      <span className="w-14 text-right font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                  {item.options && item.options.length > 0 && (
                    <p className="text-xs text-stone-500">
                      {item.options.map((o) => {
                        const q = o.quantity ?? 1;
                        const label = q > 1 ? `${o.choiceName} x${q}` : o.choiceName;
                        const extra = o.priceModifier > 0 ? ` (+$${(o.priceModifier * q).toFixed(2)})` : "";
                        return label + extra;
                      }).join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-right font-semibold text-stone-800">Total: ${total.toFixed(2)}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("menu")}
                className="flex-1 py-3 rounded-xl border border-stone-300 text-stone-700"
              >
                Back to menu
              </button>
              <button
                type="button"
                onClick={() => setStep("payment")}
                className="flex-1 py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700"
              >
                Proceed to pay
              </button>
            </div>
          </div>
        )}

        {/* Step: Payment */}
        {step === "payment" && (
          <div className="py-6 space-y-4">
            <p className="text-stone-600">Total: <strong>${total.toFixed(2)}</strong></p>
            <p className="text-sm text-stone-500">Choose how you’d like to pay.</p>
            <div className="space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => submitOrder("online")}
                className="w-full py-4 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                Pay now (card / online)
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => submitOrder("cash")}
                className="w-full py-4 rounded-xl border-2 border-stone-300 text-stone-700 font-medium hover:bg-stone-50 disabled:opacity-50"
              >
                Pay cash to server / waiter
              </button>
            </div>
          </div>
        )}

        {/* Step: Done -> waiting / status view + receipt link */}
        {step === "done" && orderId && (
          <div className="py-8 text-center">
            {(() => {
              const { title, message } = guestStatusTitleAndMessage();
              return (
                <>
                  <p className="text-lg font-semibold text-stone-900 mb-2">{title}</p>
                  <p className="text-stone-600 mb-4">{message}</p>
                </>
              );
            })()}
            <p className="text-xs text-stone-400 mb-6">
              This page will update automatically as the kitchen starts preparing and serves your order.
            </p>
            <Link
              href={`/receipt/${orderId}`}
              className="inline-block py-3 px-6 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700"
            >
              View & download receipt
            </Link>
          </div>
        )}
      </main>

      {/* Bottom cart bar (mobile-first) */}
      {step === "menu" && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 pb-safe">
          <div className="max-w-2xl mx-auto px-4 pb-4">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="w-full rounded-2xl bg-stone-900 text-white px-4 py-4 shadow-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">Cart</span>
                <span className="text-sm font-semibold bg-white/15 rounded-full px-2 py-0.5">
                  {cartCount}
                </span>
              </div>
              <div className="text-base font-black">${total.toFixed(2)}</div>
            </button>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <p className="text-base font-black text-stone-900">Your cart</p>
                <p className="text-sm text-stone-500">{cartCount} items</p>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700"
              >
                Close
              </button>
            </div>

            <div className="p-5 overflow-auto max-h-[55vh]">
              <ul className="space-y-3">
                {cart.map((item, index) => (
                  <li key={index} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 text-base">{item.name}</p>
                        {item.options && item.options.length > 0 && (
                          <p className="text-xs text-stone-500 mt-1">
                            {item.options
                              .map((o) => {
                                const q = o.quantity ?? 1;
                                const label = q > 1 ? `${o.choiceName} x${q}` : o.choiceName;
                                return label;
                              })
                              .join(" · ")}
                          </p>
                        )}
                        <p className="text-xs text-stone-500 mt-1">${(item.price).toFixed(2)} each</p>
                      </div>
                      <div className="text-base font-black text-stone-900">
                        ${(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCartQty(index, -1)}
                          className="h-10 w-10 rounded-xl border border-stone-300 text-stone-700 text-xl"
                        >
                          −
                        </button>
                        <span className="w-10 text-center font-black text-base">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(index, 1)}
                          className="h-10 w-10 rounded-xl border border-stone-300 text-stone-700 text-xl"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateCartQty(index, -item.quantity)}
                        className="text-sm font-semibold text-stone-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-5 border-t border-stone-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-black text-stone-900">Total</span>
                <span className="text-base font-black text-stone-900">${total.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    setStep("menu");
                  }}
                  className="py-3 rounded-2xl border border-stone-300 text-stone-700 font-semibold"
                >
                  Add more
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    setStep("payment");
                  }}
                  className="py-3 rounded-2xl bg-amber-600 text-white font-black hover:bg-amber-700"
                >
                  Checkout
                </button>
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
