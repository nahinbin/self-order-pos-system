import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { getOrderById } from "@/lib/db";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function formatOptionLine(o: { choiceName: string; priceModifier?: number; quantity?: number }): string {
  const q = o.quantity ?? 1;
  const label = q > 1 ? `${o.choiceName} x${q}` : o.choiceName;
  const extra = o.priceModifier && o.priceModifier > 0 ? ` (+$${(o.priceModifier * q).toFixed(2)})` : "";
  return label + extra;
}

function buildReceiptHtml(order: {
  id: number;
  table_name?: string;
  order_type: string;
  total: number;
  created_at: string;
  items?: { name: string; price: number; quantity: number; options_json?: string | null }[];
}): string {
  const table = order.table_name ?? `Table ${order.id}`;
  const typeLabel = order.order_type === "dine_in" ? "Dine in" : order.order_type === "takeaway" ? "Take away" : order.order_type;
  const when = new Date(order.created_at).toLocaleString();
  const items = order.items ?? [];

  const lines = items
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
    .join("");

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Receipt #${order.id}</title>
    </head>
    <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; background:#f8fafc; padding:24px;">
      <div style="max-width:360px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; padding:18px;">
        <div style="font-size:18px; font-weight:800; color:#111827; padding-bottom:10px; border-bottom:1px solid #e5e7eb;">
          Receipt #${order.id}
        </div>
        <div style="margin-top:10px; color:#6b7280; font-size:13px;">
          ${escapeHtml(table)} · ${escapeHtml(typeLabel)}
        </div>
        <div style="color:#6b7280; font-size:13px; margin-top:2px;">${escapeHtml(when)}</div>

        <div style="margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9;">
          ${lines || `<div style="color:#6b7280; font-size:13px;">No items</div>`}
        </div>

        <div style="display:flex; justify-content:space-between; font-weight:800; color:#111827; margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9;">
          <div>Total</div>
          <div>$${Number(order.total).toFixed(2)}</div>
        </div>
      </div>
      <div style="max-width:360px; margin:10px auto 0; color:#9ca3af; font-size:11px; text-align:center;">
        Thank you.
      </div>
    </body>
  </html>
  `;
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  if (!host || !from) return null;
  return { host, port, user, pass, from, secure };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cfg = smtpConfig();
    if (!cfg) {
      return NextResponse.json(
        {
          error:
            "Email sending is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (and optionally SMTP_SECURE=true).",
        },
        { status: 501 }
      );
    }

    const restaurantId = getRestaurantIdFromRequest(request);
    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const order = await getOrderById(restaurantId, orderId);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    });

    const html = buildReceiptHtml(order);
    await transporter.sendMail({
      from: cfg.from,
      to: email,
      subject: `Receipt #${order.id}`,
      html,
      text: `Receipt #${order.id} — Total $${Number(order.total).toFixed(2)}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    if (isDbUnreachableError(e)) {
      return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to send receipt email" }, { status: 500 });
  }
}

