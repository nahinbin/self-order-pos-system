import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultRestaurantId } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizePayload(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const toStr = (v: unknown) =>
    typeof v === "string" ? v.trim() : v == null ? null : String(v).trim();
  return {
    name: toStr(b.name) || null,
    displayName: toStr(b.displayName) || null,
    logoUrl: toStr(b.logoUrl) || null,
    address: toStr(b.address) || null,
    phone: toStr(b.phone) || null,
    receiptNote: toStr(b.receiptNote) || null,
  };
}

export async function GET() {
  try {
    const restaurantId = getDefaultRestaurantId();
    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      return NextResponse.json(
        {
          error: "Restaurant not found",
        },
        { status: 404 }
      );
    }
    const payload = {
      id: restaurant.id,
      name: restaurant.name,
      displayName: restaurant.displayName ?? restaurant.name,
      logoUrl: restaurant.logoUrl ?? null,
      address: restaurant.address ?? "",
      phone: restaurant.phone ?? "",
      receiptNote: restaurant.receiptNote ?? "",
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("Settings GET failed", e);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const restaurantId = getDefaultRestaurantId();
    const existing = await prisma.restaurant.findFirst({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        {
          error: "Restaurant not found",
        },
        { status: 404 }
      );
    }

    const json = await request.json().catch(() => ({}));
    const { name, displayName, logoUrl, address, phone, receiptNote } =
      normalizePayload(json);

    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (displayName !== null) data.displayName = displayName || null;
    if (logoUrl !== null) data.logoUrl = logoUrl || null;
    if (address !== null) data.address = address || null;
    if (phone !== null) data.phone = phone || null;
    if (receiptNote !== null) data.receiptNote = receiptNote || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data,
    });

    const payload = {
      id: updated.id,
      name: updated.name,
      displayName: updated.displayName ?? updated.name,
      logoUrl: updated.logoUrl ?? null,
      address: updated.address ?? "",
      phone: updated.phone ?? "",
      receiptNote: updated.receiptNote ?? "",
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("Settings POST failed", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

