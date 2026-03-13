"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSearchParams } from "next/navigation";
import Loader from "@/components/Loader";

type OrderItem = { name: string; price: number; quantity: number; options_json?: string | null };

type ParsedOption = { groupName: string; choiceName: string; priceModifier?: number; quantity?: number };

function parseOrderOptions(json: unknown): ParsedOption[] {
  if (json == null || typeof json !== "string") return [];
  const s = String(json).trim();
  if (!s || s[0] !== "[") return [];
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is ParsedOption =>
        o &&
        typeof o === "object" &&
        typeof (o as { choiceName?: unknown }).choiceName === "string" &&
        typeof (o as { groupName?: unknown }).groupName === "string"
    );
  } catch {
    return [];
  }
}

function formatOptionLine(o: ParsedOption): string {
  const q = o.quantity ?? 1;
  const choice = q > 1 ? `${o.choiceName} x${q}` : o.choiceName;
  const label = `${o.groupName}: ${choice}`;
  const extra = o.priceModifier && o.priceModifier > 0 ? ` (+$${(o.priceModifier * q).toFixed(2)})` : "";
  return label + extra;
}
type Order = {
  id: number;
  table_name: string;
  order_type: string;
  total: number;
  payment_method: string;
  created_at: string;
  items: OrderItem[];
};

export default function ReceiptPage() {
  const params = useParams();
  const id = params?.id as string;
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [id]);

  const downloadReceipt = useCallback(() => {
    if (!receiptRef.current || !order) return;
    const el = receiptRef.current;
    const prevDisplay = el.style.display;
    el.style.display = "block";
    const html = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Receipt #${order.id}</title></head>
        <body style="font-family: system-ui; padding: 24px; max-width: 320px;">
          ${el.outerHTML}
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${order.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    el.style.display = prevDisplay;
  }, [order]);

  const printReceipt = useCallback(() => {
    // Uses browser print dialog (works for thermal printers too if configured in OS).
    window.print();
  }, []);

  const sendReceiptEmail = useCallback(async () => {
    if (!order) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setSendError("Please enter an email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setSendError("Please enter a valid email address.");
      return;
    }
    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await fetch(`/api/receipts/${order.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSendError((data && data.error) || "Failed to send receipt email.");
        return;
      }
      setSendSuccess("Receipt sent.");
      setEmail("");
    } catch {
      setSendError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }, [email, order]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4">
        <p className="text-stone-600 mb-4">Receipt not found.</p>
        <Link href="/" className="text-amber-700 underline">Back to home</Link>
      </div>
    );
  }

  const isTakeaway = order.order_type === "takeaway";
  const deliveryMessage = isTakeaway
    ? "Your order will be ready for pickup shortly."
    : `Your food will be delivered to ${order.table_name}.`;

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 print:px-0 print:py-0">
      <div className="max-w-md mx-auto">
        <div
          ref={receiptRef}
          className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm print:shadow-none print:border-0 print:rounded-none"
        >
          <h1 className="text-lg font-semibold text-stone-800 border-b border-stone-200 pb-2 mb-4">
            Receipt #{order.id}
          </h1>
          <p className="text-sm text-stone-500 mb-1">{order.table_name} · {order.order_type === "dine_in" ? "Dine in" : "Take away"}</p>
          <p className="text-sm text-stone-500 mb-4">{new Date(order.created_at).toLocaleString()}</p>
          <ul className="space-y-2 border-b border-stone-100 pb-4 mb-4">
            {order.items?.map((item, i) => {
              const options = parseOrderOptions(item.options_json);
              return (
                <li key={i} className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-stone-700">{item.name} × {item.quantity}</span>
                    <span className="text-stone-700">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                  {options.length > 0 && (
                    <p className="text-stone-500 text-xs mt-0.5 pl-2">
                      {options.map(formatOptionLine).join(", ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="flex justify-between font-semibold text-stone-800 mb-6">
            Total <span>${Number(order.total).toFixed(2)}</span>
          </p>
          <p className="text-sm text-stone-600 bg-amber-50 rounded-lg p-3">
            {deliveryMessage}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 print:hidden">
          <button
            type="button"
            onClick={printReceipt}
            className="w-full py-3 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-950"
          >
            Print receipt
          </button>
          <button
            type="button"
            onClick={downloadReceipt}
            className="w-full py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700"
          >
            Download receipt
          </button>
          <button
            type="button"
            onClick={() => {
              setEmailOpen(true);
              setSendError(null);
              setSendSuccess(null);
            }}
            className="w-full py-3 rounded-xl border border-stone-300 bg-white text-stone-800 font-medium hover:bg-stone-50"
          >
            Email receipt
          </button>
          <Link
            href={returnTo ? returnTo : "/"}
            className="block text-center py-2 text-stone-500 hover:text-stone-700 text-sm"
          >
            {returnTo ? "Back" : "Done"}
          </Link>
        </div>
      </div>

      {emailOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-end sm:items-center justify-center print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white border border-stone-200 shadow-xl">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-stone-900">Email receipt</p>
                <p className="text-xs text-stone-500">Receipt #{order.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setEmailOpen(false)}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Close
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-600">Customer email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              {sendError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {sendError}
                </div>
              )}
              {sendSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {sendSuccess}
                </div>
              )}
              <button
                type="button"
                onClick={sendReceiptEmail}
                disabled={sending}
                className="w-full py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send receipt"}
              </button>
              <p className="text-[11px] text-stone-400 leading-snug">
                Email sending requires SMTP configuration on the server.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
