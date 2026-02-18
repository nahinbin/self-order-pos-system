import { NextResponse } from "next/server";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(): Date {
  const d = startOfToday();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d;
}

function startOfMonth(): Date {
  const d = startOfToday();
  d.setDate(1);
  return d;
}

function startOfYear(): Date {
  const d = startOfToday();
  d.setMonth(0, 1);
  return d;
}

async function sumRevenue(restaurantId: number, from: Date): Promise<number> {
  const res = await prisma.order.aggregate({
    where: {
      restaurantId,
      paymentStatus: "paid",
      createdAt: { gte: from },
      status: { not: "cancelled" },
    },
    _sum: { total: true },
  });
  return Number(res._sum.total ?? 0);
}

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const today = startOfToday();
    const week = startOfWeekMonday();
    const month = startOfMonth();
    const year = startOfYear();

    const [todayRevenue, weekRevenue, monthRevenue, yearRevenue] = await Promise.all([
      sumRevenue(restaurantId, today),
      sumRevenue(restaurantId, week),
      sumRevenue(restaurantId, month),
      sumRevenue(restaurantId, year),
    ]);

    // Top dishes for a time range (default: today)
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "today") as "today" | "week" | "month" | "year";
    const from =
      range === "week" ? week : range === "month" ? month : range === "year" ? year : today;

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          paymentStatus: "paid",
          createdAt: { gte: from },
          status: { not: "cancelled" },
        },
      },
      select: { name: true, quantity: true, price: true },
      take: 5000,
    });

    const byName = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items) {
      const name = it.name;
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      const revenue = qty * price;
      const prev = byName.get(name) ?? { name, qty: 0, revenue: 0 };
      prev.qty += qty;
      prev.revenue += revenue;
      byName.set(name, prev);
    }

    const topDishes = Array.from(byName.values())
      .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name))
      .slice(0, 20);

    return NextResponse.json({
      revenue: {
        today: todayRevenue,
        week: weekRevenue,
        month: monthRevenue,
        year: yearRevenue,
      },
      topDishes,
      range,
    });
  } catch (e) {
    console.error(e);
    if (isDbUnreachableError(e)) {
      return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}

