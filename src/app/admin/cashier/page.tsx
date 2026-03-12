"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import ShiftGate from "@/components/ShiftGate";

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

type CartLine = {
  key: string;
  menu_item_id: number;
  name: string;
  unit_price: number;
  quantity: number;
  options_json: string | null;
  options_label: string | null;
};

type Table = { id: number; name: string; created_at: string };

type OrderType = "dine_in" | "takeaway" | "delivery";
type PaymentMethod = "cash" | "card";

type OrderItem = { name: string; price: number; quantity: number; options_json?: string | null };
type Order = {
  id: number;
  table_id: number;
  table_name?: string;
  order_type: string;
  status: string;
  payment_method: string | null;
  payment_status: string;
  total: number;
  created_at: string;
  items?: OrderItem[];
};

type CustomerDisplayItem = {
  name: string;
  quantity: number;
  unit_price: number;
  options_label?: string | null;
};

type CustomerDisplayPayload =
  | { mode: "idle" }
  | {
      mode: "summary" | "processing" | "result";
      total: number;
      orderId?: number | null;
      paymentMethod?: PaymentMethod;
      success?: boolean;
      message?: string | null;
      items?: CustomerDisplayItem[];
    };

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function optionsLabelFromJson(json: string | null): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json) as SelectedOption[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr
      .map((o) => {
        const q = o.quantity ?? 1;
        return q > 1 ? `${o.choiceName} x${q}` : o.choiceName;
      })
      .join(" · ");
  } catch {
    return null;
  }
}

function cartKey(menuItemId: number, optionsJson: string | null): string {
  return `${menuItemId}:${optionsJson ?? ""}`;
}

function groupByCategory(items: MenuItem[]): { category: string; items: MenuItem[] }[] {
  const map = new Map<string, MenuItem[]>();
  for (const it of items) {
    const list = map.get(it.category) ?? [];
    list.push(it);
    map.set(it.category, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, items]) => ({ category, items }));
}

function orderCode(order: Pick<Order, "id" | "order_type">): string {
  const prefix =
    order.order_type === "takeaway"
      ? "YTA"
      : order.order_type === "delivery"
        ? "DLY"
        : "WDN";
  return `${prefix}${String(order.id).padStart(4, "0")}`;
}

export default function CashierPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [tableId, setTableId] = useState<number | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<{ id: number; total: number } | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<number | null>(null);
  const [ticketsOpen, setTicketsOpen] = useState(true);
  const [checkout, setCheckout] = useState<
    | { state: "idle" }
    | { state: "processing" }
    | { state: "paid"; orderId: number; method: PaymentMethod }
    | { state: "failed"; message: string; orderId?: number; method?: PaymentMethod }
  >({ state: "idle" });
  const [cardConfirmOpen, setCardConfirmOpen] = useState(false);
  const [pendingCardContext, setPendingCardContext] = useState<{ orderId: number; isTicket: boolean } | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [optionModalItem, setOptionModalItem] = useState<MenuItem | null>(null);
  /** For each option group: map of optionId -> quantity (0 = not selected). */
  const [optionSelections, setOptionSelections] = useState<Record<string, Record<number, number>>>({});
  const [optionModalQty, setOptionModalQty] = useState(1);

  const searchRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await fetch("/api/tables");
      const data = await res.json().catch(() => []);
      setTables(res.ok && Array.isArray(data) ? data : []);
    } catch {
      setTables([]);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  const ensureSocket = useCallback(() => {
    if (!socketRef.current) {
      socketRef.current = io({
        path: "/socket.io",
        auth: { restaurantId: "1" },
        query: { restaurantId: "1" },
      });
    }
    return socketRef.current;
  }, []);

  const emitCustomerDisplay = useCallback(
    (payload: CustomerDisplayPayload) => {
      const socket = ensureSocket();
      socket?.emit("customer-display:update", payload);
    },
    [ensureSocket]
  );

  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const res = await fetch("/api/menu");
      const data = await res.json().catch(() => []);
      setMenu(res.ok && Array.isArray(data) ? data : []);
    } catch {
      setMenu([]);
    } finally {
      setMenuLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/orders");
      const data = await res.json().catch(() => []);
      setOrders(res.ok && Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
    fetchMenu();
    fetchOrders();
  }, [fetchTables, fetchMenu, fetchOrders]);

  useEffect(() => {
    // Default to first table for dine-in for speed.
    if (orderType === "dine_in" && tableId == null && tables.length > 0) {
      setTableId(tables[0].id);
    }
  }, [orderType, tableId, tables]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(menu.map((m) => m.category))).sort((a, b) => a.localeCompare(b));
    return ["All", ...cats];
  }, [menu]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((m) => {
      if (activeCategory !== "All" && m.category !== activeCategory) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    });
  }, [menu, search, activeCategory]);

  const menuByCategory = useMemo(() => groupByCategory(filtered), [filtered]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.quantity, 0), [cart]);
  const totalItems = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  const selectedTableName = useMemo(
    () => (tableId ? tables.find((t) => t.id === tableId)?.name ?? `Table ${tableId}` : "No table selected"),
    [tableId, tables]
  );

  const hasOptions = (item: MenuItem) => (item.option_groups?.length ?? 0) > 0;

  const openOptionModal = useCallback((item: MenuItem) => {
    setOptionModalItem(item);
    setOptionModalQty(1);
    const initial: Record<string, Record<number, number>> = {};
    (item.option_groups ?? []).forEach((g) => {
      const opts = g.options ?? [];
      const availableOpts = opts.filter((o) => !o.unavailable);
      const byId: Record<number, number> = {};
      opts.forEach((o) => {
        byId[o.id] = 0;
      });
      const defaultOpts = opts.filter((o) => o.is_default === 1 && !o.unavailable);
      const toSelect =
        defaultOpts.length >= g.min_selections
          ? defaultOpts
          : availableOpts.slice(0, Math.max(g.min_selections, 1));
      const isSingle = g.max_selections === 1;
      if (isSingle && toSelect.length > 0) {
        byId[toSelect[0].id] = 1;
      } else {
        toSelect.forEach((o) => {
          byId[o.id] = 1;
        });
      }
      initial[String(g.id)] = byId;
    });
    setOptionSelections(initial);
  }, []);

  const unpaidOrders = useMemo(() => {
    return orders
      .filter((o) => o.payment_status !== "paid")
      .filter((o) => o.status !== "cancelled");
  }, [orders]);

  const unpaidCountByTableId = useMemo(() => {
    const map = new Map<number, number>();
    for (const o of unpaidOrders) {
      const n = map.get(o.table_id) ?? 0;
      map.set(o.table_id, n + 1);
    }
    return map;
  }, [unpaidOrders]);

  const unpaidForSelectedTable = useMemo(() => {
    if (!tableId) return [];
    return unpaidOrders
      .filter((o) => o.table_id === tableId)
      .sort((a, b) => b.id - a.id);
  }, [unpaidOrders, tableId]);

  // Hide tickets section once everything is paid.
  useEffect(() => {
    if (unpaidOrders.length === 0) setTicketsOpen(false);
  }, [unpaidOrders.length]);

  const optionsKey = (opts: SelectedOption[] | undefined) =>
    opts?.length
      ? JSON.stringify(
          [...opts].sort(
            (a, b) =>
              a.groupName.localeCompare(b.groupName) ||
              a.choiceName.localeCompare(b.choiceName) ||
              (a.quantity ?? 1) - (b.quantity ?? 1)
          )
        )
      : "";

  const addLineWithOptions = useCallback(
    (item: MenuItem, selected: SelectedOption[], qty: number) => {
      const unitPrice = item.price + selected.reduce((s, o) => s + o.priceModifier * (o.quantity ?? 1), 0);
      const optionsJson = selected.length ? JSON.stringify(selected) : null;
      const key = cartKey(item.id, optionsJson);
      setCart((prev) => {
        const existing = prev.find((l) => l.key === key);
        if (existing) {
          return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + qty } : l));
        }
        return [
          ...prev,
          {
            key,
            menu_item_id: item.id,
            name: item.name,
            unit_price: unitPrice,
            quantity: qty,
            options_json: optionsJson,
            options_label: optionsLabelFromJson(optionsJson),
          },
        ];
      });
      setCartOpen(true);
      setOptionModalItem(null);
    },
    []
  );

  const addLine = useCallback(
    (item: MenuItem) => {
    if (item.unavailable) return;

    if (hasOptions(item)) {
      openOptionModal(item);
      return;
    }
    addLineWithOptions(item, [], 1);
    },
    [addLineWithOptions, hasOptions, openOptionModal]
  );

  const optionModalTotal = useMemo(() => {
    if (!optionModalItem) return 0;
    const base =
      optionModalItem.price +
      (optionModalItem.option_groups ?? []).reduce((sum, g) => {
        const byId = optionSelections[String(g.id)] ?? {};
        const opts = g.options ?? [];
        return sum + opts.reduce((s, o) => s + o.price_modifier * (byId[o.id] ?? 0), 0);
      }, 0);
    return base * optionModalQty;
  }, [optionModalItem, optionSelections, optionModalQty]);

  const optionModalValid = useMemo(() => {
    if (!optionModalItem) return false;
    return (optionModalItem.option_groups ?? []).every((g) => {
      const byId = optionSelections[String(g.id)] ?? {};
      const totalQty = Object.values(byId).reduce((a, b) => a + b, 0);
      if (!g.required) return true;
      return totalQty >= g.min_selections;
    });
  }, [optionModalItem, optionSelections]);

  const setOptionQuantity = useCallback((groupId: number, optionId: number, group: OptionGroup, quantity: number) => {
    const isSingle = group.max_selections === 1;
    setOptionSelections((s) => {
      const prev = s[String(groupId)] ?? {};
      const next = { ...prev };
      if (isSingle) {
        if (quantity >= 1) {
          Object.keys(next).forEach((id) => {
            next[Number(id)] = 0;
          });
          next[optionId] = 1;
        } else {
          next[optionId] = 0;
        }
      } else {
        next[optionId] = Math.max(0, quantity);
      }
      return { ...s, [String(groupId)]: next };
    });
  }, []);

  const changeOptionQuantity = useCallback((groupId: number, optionId: number, delta: number) => {
    setOptionSelections((s) => {
      const prev = s[String(groupId)] ?? {};
      const current = prev[optionId] ?? 0;
      return { ...s, [String(groupId)]: { ...prev, [optionId]: Math.max(0, current + delta) } };
    });
  }, []);

  useEffect(() => {
    if (cart.length === 0) {
      emitCustomerDisplay({ mode: "idle" });
      return;
    }
    emitCustomerDisplay({
      mode: "summary",
      total: subtotal,
      items: cart.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        options_label: l.options_label,
      })),
    });
  }, [cart, subtotal, emitCustomerDisplay]);

  const updateQty = useCallback((key: string, delta: number) => {
    setCart((prev) => {
      const next = prev
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerNotes("");
    setDeliveryNotes("");
    setChargeError(null);
    setActiveTicketId(null);
    setCartOpen(false);
    setCheckout({ state: "idle" });
    setCardConfirmOpen(false);
    setPendingCardContext(null);
    setEmailOpen(false);
    setEmail("");
    setEmailMsg(null);
    searchRef.current?.focus();
    emitCustomerDisplay({ mode: "idle" });
  }, [emitCustomerDisplay]);

  const buildReceiptHtml = useCallback((order: Order) => {
    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const parseOrderOptions = (json: unknown): { choiceName: string; priceModifier?: number; quantity?: number }[] => {
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
    };
    const formatOptionLine = (o: { choiceName: string; priceModifier?: number; quantity?: number }) => {
      const q = o.quantity ?? 1;
      const label = q > 1 ? `${o.choiceName} x${q}` : o.choiceName;
      const extra = o.priceModifier && o.priceModifier > 0 ? ` (+$${(o.priceModifier * q).toFixed(2)})` : "";
      return label + extra;
    };
    const table = order.table_name ?? `Table ${order.table_id}`;
    const typeLabel = order.order_type === "dine_in" ? "Dine in" : order.order_type === "takeaway" ? "Take away" : order.order_type;
    const when = new Date(order.created_at).toLocaleString();
    const lines =
      (order.items ?? [])
        .map((it) => {
          const opts = parseOrderOptions(it.options_json);
          const optsHtml = opts.length
            ? `<div style="color:#6b7280; font-size:12px; margin-top:4px; padding-left:8px;">${escapeHtml(
                opts.map(formatOptionLine).join(", ")
              )}</div>`
            : "";
          return `
            <div style="margin: 10px 0;">
              <div style="display:flex; justify-content:space-between; gap:12px;">
                <div style="color:#111827;">${escapeHtml(it.name)} × ${Number(it.quantity) || 1}</div>
                <div style="color:#111827;">$${(Number(it.price) * (Number(it.quantity) || 1)).toFixed(2)}</div>
              </div>
              ${optsHtml}
            </div>
          `;
        })
        .join("") || `<div style="color:#6b7280; font-size:13px;">No items</div>`;
    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Receipt #${order.id}</title>
        </head>
        <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; padding: 18px; max-width: 320px;">
          <div style="font-size:18px; font-weight:800; color:#111827; padding-bottom:10px; border-bottom:1px solid #e5e7eb;">
            Receipt #${order.id}
          </div>
          <div style="margin-top:10px; color:#6b7280; font-size:13px;">
            ${escapeHtml(table)} · ${escapeHtml(typeLabel)}
          </div>
          <div style="color:#6b7280; font-size:13px; margin-top:2px;">${escapeHtml(when)}</div>
          <div style="margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9;">
            ${lines}
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:800; color:#111827; margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9;">
            <div>Total</div>
            <div>$${Number(order.total).toFixed(2)}</div>
          </div>
        </body>
      </html>
    `;
  }, []);

  const printThermal = useCallback(
    async (orderId: number) => {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setChargeError("Failed to load receipt for printing.");
        return;
      }
      const html = buildReceiptHtml(data as Order);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        setChargeError("Print not supported in this browser.");
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 1000);
      };
    },
    [buildReceiptHtml]
  );

  const sendReceiptEmail = useCallback(async (orderId: number) => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailMsg("Please enter an email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailMsg("Please enter a valid email address.");
      return;
    }
    setEmailSending(true);
    setEmailMsg(null);
    try {
      const res = await fetch(`/api/receipts/${orderId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEmailMsg((data && data.error) || "Failed to send email.");
        return;
      }
      setEmailMsg("Receipt sent.");
      setEmail("");
    } catch {
      setEmailMsg("Network error. Please try again.");
    } finally {
      setEmailSending(false);
    }
  }, [email]);

  const loadTicketToCounter = useCallback((order: Order) => {
    // Replace current cart with the ticket lines and switch to "charging existing ticket" mode.
    setActiveTicketId(order.id);
    setOrderType((order.order_type as OrderType) === "takeaway" ? "takeaway" : "dine_in");
    setTableId(order.table_id);
    setCustomerNotes(order.payment_method ? `Payment method: ${order.payment_method}` : "");
    setDeliveryNotes("");
    setCart(
      (order.items ?? []).map((it, idx) => {
        const opts = it.options_json ?? null;
        const key = cartKey(it.name.length ? order.id * 100000 + idx : idx, opts); // stable unique-ish per ticket line
        return {
          key,
          menu_item_id: 0,
          name: it.name,
          unit_price: Number(it.price),
          quantity: Number(it.quantity) || 1,
          options_json: opts,
          options_label: optionsLabelFromJson(opts),
        };
      })
    );
    setChargeError(null);
    setCartOpen(true);
  }, []);

  const createOrder = useCallback(
    async (paymentMethod: PaymentMethod) => {
      setChargeError(null);
      setCreating(true);
      setCheckout({ state: "processing" });
      try {
        if (cart.length === 0) {
          setChargeError("Cart is empty.");
          setCheckout({ state: "idle" });
          return;
        }

        emitCustomerDisplay({
          mode: "processing",
          total: subtotal,
          paymentMethod,
          items: cart.map((l) => ({
            name: l.name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            options_label: l.options_label,
          })),
        });

        // If we loaded an unpaid ticket, don't create a new order — just charge that ticket.
        if (activeTicketId) {
          if (paymentMethod === "card") {
            // Cashier uses physical terminal first, then confirms success/failure here.
            setPendingCardContext({ orderId: activeTicketId, isTicket: true });
            setCardConfirmOpen(true);
            setCheckout({ state: "idle" });
            return;
          }
          const payRes = await fetch(`/api/orders/${activeTicketId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_method: "cash", payment_status: "paid" }),
          }).catch(() => null);
          if (!payRes || !payRes.ok) {
            setChargeError("Failed to finalize payment. Please try again.");
            setCheckout({ state: "idle" });
            return;
          }
          setLastOrder({ id: activeTicketId, total: subtotal });
          setCheckout({ state: "paid", orderId: activeTicketId, method: "cash" });
          emitCustomerDisplay({
            mode: "result",
            total: subtotal,
            orderId: activeTicketId,
            paymentMethod: "cash",
            success: true,
            message: "Payment received. Thank you!",
            items: cart.map((l) => ({
              name: l.name,
              quantity: l.quantity,
              unit_price: l.unit_price,
              options_label: l.options_label,
            })),
          });
          return;
        }

        const resolvedTableId =
          orderType === "dine_in"
            ? tableId
            : // For takeaway/delivery, reuse a valid table id (system requires it). Prefer table 1.
              (tables[0]?.id ?? 1);

        if (!resolvedTableId) {
          setChargeError("No table is available. Please create tables first.");
          setCheckout({ state: "idle" });
          emitCustomerDisplay({
            mode: "result",
            total: subtotal,
            paymentMethod,
            success: false,
            message: "Something went wrong. Please wait a moment.",
          });
          return;
        }

        const notes = [
          orderType === "delivery" ? `Delivery: ${deliveryNotes.trim()}` : null,
          customerNotes.trim() ? `Notes: ${customerNotes.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table_id: resolvedTableId,
            order_type: orderType === "delivery" ? "takeaway" : orderType, // backend currently expects dine_in|takeaway
            items: cart.map((l) => ({
              menu_item_id: l.menu_item_id,
              name: l.name,
              price: l.unit_price,
              quantity: l.quantity,
              options_json: l.options_json,
            })),
            total: Math.round(subtotal * 100) / 100,
            customer_notes: notes || undefined,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || typeof data.orderId !== "number") {
          setChargeError(data?.error || "Failed to create order.");
          setCheckout({ state: "idle" });
          emitCustomerDisplay({
            mode: "result",
            total: subtotal,
            paymentMethod,
            success: false,
            message: "We couldn't create this order. Please try again.",
          });
          return;
        }

        const orderId = data.orderId as number;
        setLastOrder({ id: orderId, total: Math.round(subtotal * 100) / 100 });

        // "Charge"
        if (paymentMethod === "card") {
          setPendingCardContext({ orderId, isTicket: false });
          setCardConfirmOpen(true);
          setCheckout({ state: "idle" });
          return;
        }
        const payRes = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_method: "cash", payment_status: "paid" }),
        }).catch(() => null);
        if (!payRes || !payRes.ok) {
          setChargeError("Failed to finalize payment. Please try again.");
          setCheckout({ state: "idle" });
          emitCustomerDisplay({
            mode: "result",
            total: subtotal,
            orderId,
            paymentMethod: "cash",
            success: false,
            message: "We couldn't confirm your payment. Please wait a moment.",
            items: cart.map((l) => ({
              name: l.name,
              quantity: l.quantity,
              unit_price: l.unit_price,
              options_label: l.options_label,
            })),
          });
          return;
        }
        setCheckout({ state: "paid", orderId, method: "cash" });
        emitCustomerDisplay({
          mode: "result",
          total: subtotal,
          orderId,
          paymentMethod: "cash",
          success: true,
          message: "Payment received. Thank you!",
          items: cart.map((l) => ({
            name: l.name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            options_label: l.options_label,
          })),
        });
      } finally {
        setCreating(false);
      }
    },
    [activeTicketId, cart, clearCart, customerNotes, deliveryNotes, emitCustomerDisplay, fetchOrders, orderType, subtotal, tableId, tables]
  );

  const finalizeCardPayment = useCallback(async (success: boolean) => {
    const ctx = pendingCardContext;
    setCardConfirmOpen(false);
    setPendingCardContext(null);
    if (!ctx) return;
    if (!success) {
      setCheckout({
        state: "failed",
        message: "Card payment failed. Ticket remains pending payment.",
        orderId: ctx.orderId,
        method: "card",
      });
      emitCustomerDisplay({
        mode: "result",
        total: subtotal,
        orderId: ctx.orderId,
        paymentMethod: "card",
        success: false,
        message: "Card payment was not completed. Please try again or use another method.",
      });
      return;
    }
    const payRes = await fetch(`/api/orders/${ctx.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_method: "online", payment_status: "paid" }),
    }).catch(() => null);
    if (!payRes || !payRes.ok) {
      setCheckout({
        state: "failed",
        message: "Failed to finalize card payment. Please try again.",
        orderId: ctx.orderId,
        method: "card",
      });
      emitCustomerDisplay({
        mode: "result",
        total: subtotal,
        orderId: ctx.orderId,
        paymentMethod: "card",
        success: false,
        message: "We couldn't confirm your card payment. Please wait a moment.",
      });
      return;
    }
    setCheckout({ state: "paid", orderId: ctx.orderId, method: "card" });
    emitCustomerDisplay({
      mode: "result",
      total: subtotal,
      orderId: ctx.orderId,
      paymentMethod: "card",
      success: true,
      message: "Payment approved. Thank you!",
    });
  }, [emitCustomerDisplay, pendingCardContext, subtotal]);

  useEffect(() => {
    // Tickets update via websockets only (no polling).
    const socket = ensureSocket();

    const upsert = (order: Order) => {
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === order.id);
        if (idx === -1) return [order, ...prev];
        const next = [...prev];
        next[idx] = order;
        return next;
      });
    };

    const onNew = (order: Order) => upsert(order);
    const onUpdate = (order: Order) => upsert(order);
    socket.on("order:new", onNew);
    socket.on("order:update", onUpdate);
    return () => {
      socket.off("order:new", onNew);
      socket.off("order:update", onUpdate);
    };
  }, [ensureSocket]);

  const topRight = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleFullscreen}
        className="text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-50"
        title={isFullscreen ? "Exit full screen" : "Full screen"}
      >
        {isFullscreen ? "Exit full screen" : "Full screen"}
      </button>
      <Link href="/admin/orders" className="text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-50">
        Kitchen
      </Link>
    </div>
  );

  const controls = (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["dine_in", "takeaway", "delivery"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`px-4 py-2.5 rounded-2xl text-base font-semibold border ${
                orderType === t
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-800 border-stone-200 hover:bg-stone-50"
              }`}
            >
              {t === "dine_in" ? "Dine in" : t === "takeaway" ? "Takeaway" : "Delivery"}
            </button>
          ))}
          {unpaidOrders.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTicketsOpen(true);
                setCartOpen(true);
              }}
              className="px-4 py-2.5 rounded-2xl text-base font-semibold border bg-white text-stone-800 border-red-200 hover:bg-red-50"
              title="View tickets pending payment"
            >
              Pending <span className="ml-1 font-black text-red-600">({unpaidOrders.length})</span>
            </button>
          )}
        </div>
        {topRight}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
        <div>
          <label className="text-sm font-semibold text-stone-700">Table (optional)</label>
          <select
            disabled={tablesLoading}
            value={tableId ?? ""}
            onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base disabled:bg-stone-100"
          >
            <option value="">No table</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {tables.length === 0 && !tablesLoading && (
            <p className="text-sm text-red-600 mt-2">No tables found. Create tables in “Tables & QR codes”.</p>
          )}
        </div>
        <div>
          <label className="text-sm font-semibold text-stone-700">Search</label>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="mt-1 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base"
          />
        </div>
      </div>

      {orderType === "delivery" && (
        <div className="mt-3">
          <label className="text-sm font-semibold text-stone-700">Delivery details</label>
          <input
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            placeholder="Name, phone, address…"
            className="mt-1 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base"
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 overflow-auto">
        <span className="text-sm font-semibold text-stone-700 shrink-0 mr-1">Category</span>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCategory(c)}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold border whitespace-nowrap ${
              activeCategory === c
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white text-stone-800 border-stone-200 hover:bg-stone-50"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );

  const menuPanel = (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className="p-4">
        {menuLoading ? (
          <div className="py-16 text-center text-stone-500 text-base">Loading menu…</div>
        ) : menu.length === 0 ? (
          <div className="py-16 text-center text-stone-500 text-base">No menu items available.</div>
        ) : (
          <div className="space-y-8">
            {menuByCategory.map(({ category, items }) => (
              <section key={category}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-black text-stone-600 uppercase tracking-wide">{category}</h2>
                  <span className="text-sm text-stone-400">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {items.map((item) => {
                    const isUnavailable = item.unavailable === true;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addLine(item)}
                        disabled={isUnavailable}
                        className={`text-left rounded-2xl border p-3 transition ${
                          isUnavailable
                            ? "bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed"
                            : "bg-white border-stone-200 hover:border-amber-400 hover:bg-amber-50"
                        }`}
                      >
                        {item.image_url ? (
                          <div className="w-full h-28 rounded-xl bg-stone-100 overflow-hidden mb-2">
                            <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-full h-28 rounded-xl bg-stone-100 mb-2" />
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-900 truncate text-base">{item.name}</p>
                            {item.description && (
                              <p className="text-sm text-stone-500 truncate">{item.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-base font-black text-amber-700">{money(item.price)}</div>
                        </div>
                        {item.option_groups?.length ? (
                          <p className="text-xs text-stone-500 mt-1">Options available</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const optionModal =
    optionModalItem && (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4">
        <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">
          <div className="shrink-0 p-5 border-b border-stone-200 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-black text-stone-900 text-lg truncate">{optionModalItem.name}</h3>
                <p className="text-sm text-stone-500">Base {money(optionModalItem.price)} — choose options</p>
              </div>
              <button
                type="button"
                onClick={() => setOptionModalItem(null)}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
            {(optionModalItem.option_groups ?? []).map((g) => {
              const isSingle = g.max_selections === 1;
              const byId = optionSelections[String(g.id)] ?? {};
              return (
                <div key={g.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-base font-black text-stone-800">
                      {g.name}
                      {g.required ? <span className="text-amber-600 ml-1">*</span> : null}
                    </p>
                    <p className="text-xs text-stone-500">
                      {isSingle ? "Choose 1" : "Add quantities"}
                    </p>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(g.options ?? []).map((o) => {
                      const qty = byId[o.id] ?? 0;
                      const selected = qty > 0;
                      const isUnavailable = o.unavailable === true;
                      if (isUnavailable) {
                        return (
                          <div
                            key={o.id}
                            className="rounded-2xl border border-stone-200 bg-stone-100 px-4 py-3 opacity-60"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-stone-600">{o.name}</span>
                              {o.price_modifier > 0 && (
                                <span className="text-sm text-stone-500">+{money(o.price_modifier)}</span>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={o.id} className={`rounded-2xl border px-4 py-3 ${selected ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-stone-900">{o.name}</p>
                              {o.price_modifier > 0 ? (
                                <p className="text-sm text-amber-700 font-semibold">+{money(o.price_modifier)} each</p>
                              ) : (
                                <p className="text-sm text-stone-500">No extra charge</p>
                              )}
                            </div>
                            {isSingle ? (
                              <button
                                type="button"
                                onClick={() => setOptionQuantity(g.id, o.id, g, selected ? 0 : 1)}
                                className={`px-4 py-2 rounded-xl text-sm font-black border ${
                                  selected ? "bg-amber-600 text-white border-amber-600" : "bg-white text-stone-800 border-stone-300"
                                }`}
                              >
                                {selected ? "Selected" : "Select"}
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => changeOptionQuantity(g.id, o.id, -1)}
                                  className="h-10 w-10 rounded-xl border border-stone-300 bg-white text-stone-800 text-xl"
                                >
                                  −
                                </button>
                                <span className="w-8 text-center font-black text-base">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => changeOptionQuantity(g.id, o.id, 1)}
                                  className="h-10 w-10 rounded-xl border border-stone-300 bg-white text-stone-800 text-xl"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-black text-stone-800">Quantity</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOptionModalQty((q) => Math.max(1, q - 1))}
                    className="h-10 w-10 rounded-xl border border-stone-300 bg-white text-stone-800 text-xl"
                  >
                    −
                  </button>
                  <span className="w-10 text-center font-black text-base">{optionModalQty}</span>
                  <button
                    type="button"
                    onClick={() => setOptionModalQty((q) => Math.min(9, q + 1))}
                    className="h-10 w-10 rounded-xl border border-stone-300 bg-white text-stone-800 text-xl"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 p-5 border-t border-stone-200 bg-white">
            {!optionModalValid && (
              <p className="text-sm font-semibold text-amber-700 mb-2">
                Please select required options before adding.
              </p>
            )}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-stone-600">Total</span>
              <span className="text-xl font-black text-stone-900">{money(optionModalTotal)}</span>
            </div>
            <button
              type="button"
              disabled={!optionModalValid}
              onClick={() => {
                if (!optionModalItem) return;
                const groups = optionModalItem.option_groups ?? [];
                const selected: SelectedOption[] = [];
                for (const g of groups) {
                  const byId = optionSelections[String(g.id)] ?? {};
                  const opts = g.options ?? [];
                  for (const o of opts) {
                    if (o.unavailable) continue;
                    const q = byId[o.id] ?? 0;
                    if (q > 0) selected.push({ groupName: g.name, choiceName: o.name, priceModifier: o.price_modifier, quantity: q });
                  }
                }
                addLineWithOptions(optionModalItem, selected, optionModalQty);
              }}
              className="w-full py-4 rounded-2xl bg-amber-600 text-white font-black text-base hover:bg-amber-700 disabled:opacity-50"
            >
              Add to cart
            </button>
          </div>
        </div>
      </div>
    );

  const cartFab = cart.length > 0 && (
    <button
      type="button"
      onClick={() => setCartOpen(true)}
      className="fixed bottom-6 right-6 z-40 rounded-2xl bg-stone-900 text-white px-5 py-4 shadow-lg hover:bg-stone-950"
    >
      <div className="flex items-center gap-3">
        <span className="text-base font-black">Cart</span>
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-sm font-semibold">{totalItems}</span>
        <span className="text-base font-black">{money(subtotal)}</span>
      </div>
    </button>
  );

  const cartDrawer =
    cartOpen && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
        <div className="absolute right-0 top-0 h-full w-full sm:w-[460px] bg-white shadow-2xl flex flex-col">
          <div className="p-4 border-b border-stone-200 flex items-center justify-between">
            <div>
              <p className="text-base font-black text-stone-900">
                {activeTicketId ? `Ticket #${activeTicketId}` : "Cart"}
              </p>
              <p className="text-sm text-stone-500">
                {orderType === "dine_in"
                  ? `Dine-in · ${tables.find((t) => t.id === tableId)?.name ?? "No table selected"}`
                  : orderType === "takeaway"
                    ? "Takeaway"
                    : "Delivery"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unpaidOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTicketsOpen((s) => !s)}
                  className="px-3 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  {ticketsOpen ? "Hide pending" : `Pending (${unpaidOrders.length})`}
                </button>
              )}
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 mb-4">
              <p className="text-xs font-semibold text-stone-600">Amount due</p>
              <p className="text-4xl font-black tracking-tight text-stone-900 mt-1">{money(subtotal)}</p>
              <p className="text-xs text-stone-500 mt-1">
                {totalItems} items · {orderType === "dine_in" ? selectedTableName : orderType === "takeaway" ? "Takeaway" : "Delivery"}
              </p>
            </div>
            {checkout.state === "paid" && (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">Payment confirmed</p>
                    <p className="text-2xl font-black text-emerald-900 mt-1">PAID</p>
                    <p className="text-xs text-emerald-800 mt-1">
                      Method: {checkout.method === "cash" ? "Cash" : "Card"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCart}
                    className="px-3 py-2 rounded-xl border border-emerald-200 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Done
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => printThermal(checkout.orderId)}
                    className="py-3 rounded-2xl bg-emerald-600 text-white font-black text-base hover:bg-emerald-700"
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailOpen(true);
                      setEmailMsg(null);
                    }}
                    className="py-3 rounded-2xl border border-emerald-300 text-emerald-800 font-black text-base hover:bg-emerald-100"
                  >
                    Email
                  </button>
                </div>
                {emailOpen && (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-white p-3">
                    <label className="text-xs font-semibold text-stone-700">Customer email</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={emailSending}
                        onClick={() => sendReceiptEmail(checkout.orderId)}
                        className="px-4 py-2 rounded-xl bg-amber-600 text-white font-black text-sm hover:bg-amber-700 disabled:opacity-50"
                      >
                        {emailSending ? "Sending…" : "Send"}
                      </button>
                    </div>
                    {emailMsg && (
                      <p className="text-xs text-stone-600 mt-2">{emailMsg}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {checkout.state === "failed" && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-xs font-semibold text-red-700">Payment failed</p>
                <p className="text-sm font-semibold text-red-800 mt-1">{checkout.message}</p>
              </div>
            )}
            {ticketsOpen && unpaidOrders.length > 0 && (
              <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-black text-stone-700">Pending payment</p>
                  <span className="text-xs text-stone-500">{ordersLoading ? "Loading…" : `${unpaidOrders.length} pending`}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {tables.slice(0, 25).map((t) => {
                    const count = unpaidCountByTableId.get(t.id) ?? 0;
                    const active = tableId === t.id && orderType === "dine_in";
                    if (count === 0) return null;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setOrderType("dine_in");
                          setTableId(t.id);
                        }}
                        className={`relative rounded-xl border px-2 py-2 text-xs font-semibold ${
                          active ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-200"
                        }`}
                        title={t.name}
                      >
                        <span className="block truncate">{t.name.replace(/^Table\s*/i, "")}</span>
                        <span className={`absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full text-[11px] flex items-center justify-center ${active ? "bg-amber-500 text-stone-900" : "bg-red-600 text-white"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {orderType === "dine_in" && tableId && unpaidForSelectedTable.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {unpaidForSelectedTable.slice(0, 3).map((o) => (
                      <div key={o.id} className="rounded-xl border border-stone-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-stone-900">{orderCode(o)}</p>
                            <p className="text-xs text-stone-500">
                              {o.items?.reduce((s, it) => s + (Number(it.quantity) || 0), 0) ?? 0} items · {money(Number(o.total))}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => loadTicketToCounter(o)}
                            className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700"
                          >
                            Load
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chargeError && (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {chargeError}
              </div>
            )}

            {cart.length === 0 ? (
              <div className="py-10 text-center text-stone-500">
                <p className="font-semibold text-stone-700 text-base">Cart is empty</p>
                <p className="text-sm mt-1">Add items from the menu.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((l) => (
                  <div key={l.key} className="rounded-2xl border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 truncate text-base">{l.name}</p>
                        {l.options_label ? <p className="text-sm text-stone-500 mt-0.5">{l.options_label}</p> : null}
                        <p className="text-sm text-stone-500 mt-0.5">{money(l.unit_price)} each</p>
                      </div>
                      <div className="text-base font-black text-stone-900">{money(l.unit_price * l.quantity)}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQty(l.key, -1)}
                          className="h-10 w-10 rounded-xl border border-stone-300 bg-white text-stone-800 text-xl"
                        >
                          −
                        </button>
                        <span className="w-10 text-center font-black text-base">{l.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(l.key, 1)}
                          className="h-10 w-10 rounded-xl border border-stone-300 bg-white text-stone-800 text-xl"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQty(l.key, -l.quantity)}
                        className="text-sm font-semibold text-stone-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-stone-200 p-4">
            <label className="text-sm font-semibold text-stone-700">Notes (optional)</label>
            <textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              rows={2}
              placeholder="E.g. no onions, extra spicy…"
              className="mt-1 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base"
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => createOrder("cash")}
                disabled={creating || cart.length === 0}
                className="py-4 rounded-2xl bg-emerald-600 text-white font-black text-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {activeTicketId ? "Charge ticket (Cash)" : "Charge (Cash)"}
              </button>
              <button
                type="button"
                onClick={() => createOrder("card")}
                disabled={creating || cart.length === 0}
                className="py-4 rounded-2xl bg-stone-900 text-white font-black text-lg hover:bg-stone-950 disabled:opacity-50"
                title="Card terminal integration is a placeholder for now"
              >
                {activeTicketId ? "Charge ticket (Card)" : "Charge (Card)"}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={clearCart}
                disabled={creating}
                className="py-2.5 rounded-2xl border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50 text-base font-semibold"
              >
                Clear
              </button>
              {lastOrder ? (
                <Link
                  href={`/receipt/${lastOrder.id}`}
                  target="_blank"
                  className="py-2.5 rounded-2xl border border-amber-300 text-amber-700 hover:bg-amber-50 text-center text-base font-semibold"
                >
                  Reprint #{lastOrder.id}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    searchRef.current?.focus();
                  }}
                  className="py-2.5 rounded-2xl border border-stone-300 text-stone-700 hover:bg-stone-50 text-base font-semibold"
                >
                  Back to menu
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );

  const body = (
    <div className="min-h-[70vh] flex flex-col gap-4">
      {controls}
      {menuPanel}
      {cartFab}
      {cartDrawer}
      {optionModal}
      {cardConfirmOpen && pendingCardContext && (
        <div className="fixed inset-0 z-[70] bg-black/50 p-4 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md rounded-3xl bg-white border border-stone-200 shadow-2xl">
            <div className="p-5 border-b border-stone-200">
              <p className="text-xs font-semibold text-stone-500">Card terminal</p>
              <p className="text-lg font-black text-stone-900 mt-1">Confirm card payment</p>
              <p className="text-sm text-stone-600 mt-2">
                Process the payment on the terminal, then confirm the result here.
              </p>
              <p className="text-4xl font-black tracking-tight text-stone-900 mt-4">{money(subtotal)}</p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => finalizeCardPayment(false)}
                className="py-3 rounded-2xl border border-red-200 bg-white text-red-700 font-black text-base hover:bg-red-50"
              >
                Failed
              </button>
              <button
                type="button"
                onClick={() => finalizeCardPayment(true)}
                className="py-3 rounded-2xl bg-emerald-600 text-white font-black text-base hover:bg-emerald-700"
              >
                Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const gatedBody = <ShiftGate>{body}</ShiftGate>;

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-stone-100 overflow-auto p-4">
        {gatedBody}
      </div>
    );
  }

  return gatedBody;
}

