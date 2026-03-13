import { NextResponse } from "next/server";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const toNum = (d: unknown): number => (d == null ? 0 : Number(d));

function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(date: Date = new Date()): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function startOfMonth(date: Date = new Date()): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function startOfYear(date: Date = new Date()): Date {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return d;
}

const PAID_NOT_CANCELLED = { paymentStatus: "paid", status: { not: "cancelled" } };

async function sumRevenue(restaurantId: number, from: Date, to?: Date): Promise<number> {
  const where: Record<string, unknown> = {
    restaurantId,
    ...PAID_NOT_CANCELLED,
    createdAt: to ? { gte: from, lt: to } : { gte: from },
  };
  const res = await prisma.order.aggregate({ where: where as never, _sum: { total: true } });
  return toNum(res._sum.total);
}

async function countOrders(restaurantId: number, from: Date, to?: Date, extra?: Record<string, unknown>): Promise<number> {
  const where: Record<string, unknown> = {
    restaurantId,
    ...PAID_NOT_CANCELLED,
    createdAt: to ? { gte: from, lt: to } : { gte: from },
    ...extra,
  };
  return prisma.order.count({ where: where as never });
}

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const now = new Date();
    const today = startOfDay();
    const yesterday = daysAgo(1);
    const week = startOfWeekMonday();
    const lastWeekStart = new Date(week); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const month = startOfMonth();
    const lastMonthStart = new Date(month); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const year = startOfYear();

    // ── 1. Revenue summary + comparisons ──
    const [todayRev, yesterdayRev, weekRev, lastWeekRev, monthRev, lastMonthRev, yearRev] =
      await Promise.all([
        sumRevenue(restaurantId, today),
        sumRevenue(restaurantId, yesterday, today),
        sumRevenue(restaurantId, week),
        sumRevenue(restaurantId, lastWeekStart, week),
        sumRevenue(restaurantId, month),
        sumRevenue(restaurantId, lastMonthStart, month),
        sumRevenue(restaurantId, year),
      ]);

    // ── 2. Order counts + average order value ──
    const [todayCount, weekCount, monthCount, yearCount] = await Promise.all([
      countOrders(restaurantId, today),
      countOrders(restaurantId, week),
      countOrders(restaurantId, month),
      countOrders(restaurantId, year),
    ]);

    const avgOrderToday = todayCount > 0 ? todayRev / todayCount : 0;
    const avgOrderWeek = weekCount > 0 ? weekRev / weekCount : 0;
    const avgOrderMonth = monthCount > 0 ? monthRev / monthCount : 0;

    // ── 3. Cancellation rate ──
    const [totalOrdersMonth, cancelledMonth] = await Promise.all([
      prisma.order.count({ where: { restaurantId, createdAt: { gte: month } } }),
      prisma.order.count({ where: { restaurantId, createdAt: { gte: month }, status: "cancelled" } }),
    ]);
    const cancellationRate = totalOrdersMonth > 0 ? cancelledMonth / totalOrdersMonth : 0;

    // ── 4. Dine-in vs Takeaway split ──
    const [dineInCount, takeawayCount] = await Promise.all([
      countOrders(restaurantId, month, undefined, { orderType: "dine_in" }),
      countOrders(restaurantId, month, undefined, { orderType: "takeaway" }),
    ]);

    // ── 5. Payment method split ──
    const [cashCount, cardCount] = await Promise.all([
      countOrders(restaurantId, month, undefined, { paymentMethod: "cash" }),
      countOrders(restaurantId, month, undefined, { paymentMethod: "online" }),
    ]);

    // ── 6. Daily revenue for last 30 days ──
    const thirtyDaysAgo = daysAgo(30);
    const dailyOrders = await prisma.order.findMany({
      where: { restaurantId, ...PAID_NOT_CANCELLED, createdAt: { gte: thirtyDaysAgo } } as never,
      select: { createdAt: true, total: true },
    });
    const dailyMap = new Map<string, { revenue: number; orders: number }>();
    for (let i = 0; i < 30; i++) {
      const d = daysAgo(29 - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { revenue: 0, orders: 0 });
    }
    for (const o of dailyOrders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (entry) { entry.revenue += toNum(o.total); entry.orders += 1; }
    }
    const dailyRevenue = Array.from(dailyMap.entries()).map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders,
    }));

    // ── 7. Revenue by month (current year) ──
    const yearOrders = await prisma.order.findMany({
      where: { restaurantId, ...PAID_NOT_CANCELLED, createdAt: { gte: year } } as never,
      select: { createdAt: true, total: true },
    });
    const monthlyBuckets = Array.from({ length: 12 }, (_, m) => ({
      month: m + 1,
      revenue: 0,
      orders: 0,
    }));
    for (const o of yearOrders) {
      const m = o.createdAt.getMonth(); // 0-11
      monthlyBuckets[m].revenue += toNum(o.total);
      monthlyBuckets[m].orders += 1;
    }
    monthlyBuckets.forEach((b) => {
      b.revenue = Math.round(b.revenue * 100) / 100;
    });

    // ── 8. Revenue by hour ──
    const hourlyBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
    for (const o of dailyOrders) {
      const h = o.createdAt.getHours();
      hourlyBuckets[h].revenue += toNum(o.total);
      hourlyBuckets[h].orders += 1;
    }
    hourlyBuckets.forEach((b) => { b.revenue = Math.round(b.revenue * 100) / 100; });

    // ── 9. Revenue by day of week ──
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dowBuckets = DAY_NAMES.map((name, i) => ({ day: i, name, revenue: 0, orders: 0 }));
    for (const o of dailyOrders) {
      const d = o.createdAt.getDay();
      dowBuckets[d].revenue += toNum(o.total);
      dowBuckets[d].orders += 1;
    }
    const reordered = [...dowBuckets.slice(1), dowBuckets[0]];
    reordered.forEach((b) => { b.revenue = Math.round(b.revenue * 100) / 100; });

    // ── 10. Top / worst dishes + profit ──
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "month") as "today" | "week" | "month" | "year";
    const rangeFrom = range === "today" ? today : range === "week" ? week : range === "year" ? year : month;

    const items = await prisma.orderItem.findMany({
      where: { order: { restaurantId, ...PAID_NOT_CANCELLED, createdAt: { gte: rangeFrom } } as never },
      select: {
        name: true,
        quantity: true,
        price: true,
        cost: true,
        menuItem: { select: { cost: true } },
      },
      take: 10000,
    });

    const byName = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
    for (const it of items) {
      const qty = toNum(it.quantity);
      const price = toNum(it.price);
      const unitCost =
        it.cost != null
          ? toNum(it.cost as never)
          : it.menuItem?.cost != null
          ? toNum(it.menuItem.cost as never)
          : 0;
      const prev = byName.get(it.name) ?? { name: it.name, qty: 0, revenue: 0, cost: 0 };
      prev.qty += qty;
      prev.revenue += qty * price;
      prev.cost += qty * unitCost;
      byName.set(it.name, prev);
    }
    const allDishes = Array.from(byName.values()).sort(
      (a, b) => b.revenue - a.revenue || b.qty - a.qty
    );
    const topDishes = allDishes.slice(0, 50);
    const worstDishes =
      allDishes.length > 5
        ? [...allDishes]
            .sort((a, b) => a.revenue - b.revenue || a.qty - b.qty)
            .slice(0, 20)
        : [];

    const totalRevenueRange = allDishes.reduce((s, d) => s + d.revenue, 0);
    const totalCostRange = allDishes.reduce((s, d) => s + d.cost, 0);
    const totalProfit = Math.round((totalRevenueRange - totalCostRange) * 100) / 100;
    const marginPct =
      totalRevenueRange > 0
        ? Math.round(((totalProfit / totalRevenueRange) * 100 + Number.EPSILON) * 10) / 10
        : 0;

    // ── 11. Category performance ──
    const catItems = await prisma.orderItem.findMany({
      where: { order: { restaurantId, ...PAID_NOT_CANCELLED, createdAt: { gte: rangeFrom } } as never, menuItem: { isNot: null } },
      select: { quantity: true, price: true, menuItem: { select: { category: true } } },
      take: 10000,
    });
    const byCat = new Map<string, { category: string; qty: number; revenue: number; orders: number }>();
    for (const it of catItems) {
      const cat = it.menuItem?.category ?? "Uncategorized";
      const qty = toNum(it.quantity); const price = toNum(it.price);
      const prev = byCat.get(cat) ?? { category: cat, qty: 0, revenue: 0, orders: 0 };
      prev.qty += qty; prev.revenue += qty * price; prev.orders += 1;
      byCat.set(cat, prev);
    }
    const categoryPerformance = Array.from(byCat.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((c) => ({ ...c, revenue: Math.round(c.revenue * 100) / 100 }));

    // ── 12. Average prep time ──
    const prepTimes = await prisma.order.findMany({
      where: { restaurantId, status: "served", preparingDurationSeconds: { not: null }, createdAt: { gte: month } },
      select: { preparingDurationSeconds: true },
    });
    const avgPrepTime = prepTimes.length > 0
      ? Math.round(prepTimes.reduce((s, o) => s + (o.preparingDurationSeconds ?? 0), 0) / prepTimes.length)
      : null;

    // ── 13. Table performance ──
    const tableOrders = await prisma.order.findMany({
      where: { restaurantId, ...PAID_NOT_CANCELLED, createdAt: { gte: month } } as never,
      select: { tableId: true, total: true, table: { select: { name: true } } },
    });
    const byTable = new Map<number, { id: number; name: string; revenue: number; orders: number }>();
    for (const o of tableOrders) {
      const prev = byTable.get(o.tableId) ?? { id: o.tableId, name: o.table.name, revenue: 0, orders: 0 };
      prev.revenue += toNum(o.total); prev.orders += 1;
      byTable.set(o.tableId, prev);
    }
    const tablePerformance = Array.from(byTable.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((t) => ({ ...t, revenue: Math.round(t.revenue * 100) / 100 }));

    // ── 14. Shift analytics ──
    const recentShifts = await prisma.shift.findMany({
      where: { restaurantId, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 50,
      select: { id: true, startedAt: true, endedAt: true },
    });
    const shiftIds = recentShifts.map((s) => s.id);
    const shiftOrderData = shiftIds.length > 0
      ? await prisma.order.groupBy({
          by: ["shiftId"],
          where: { restaurantId, shiftId: { in: shiftIds }, ...PAID_NOT_CANCELLED } as never,
          _sum: { total: true },
          _count: true,
        })
      : [];
    const shiftMap = new Map(shiftOrderData.map((s) => [s.shiftId, { revenue: toNum(s._sum.total), orders: s._count }]));
    const shiftAnalytics = recentShifts.map((s) => {
      const data = shiftMap.get(s.id) ?? { revenue: 0, orders: 0 };
      const durationMs = s.endedAt ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() : 0;
      return {
        id: s.id, started_at: s.startedAt.toISOString(), ended_at: s.endedAt?.toISOString() ?? null,
        duration_minutes: Math.round(durationMs / 60000),
        revenue: Math.round(data.revenue * 100) / 100, orders: data.orders,
      };
    });

    // ── 15. Peak ──
    const peakHour = hourlyBuckets.reduce((best, b) => (b.revenue > best.revenue ? b : best), hourlyBuckets[0]);
    const bestDay = reordered.reduce((best, b) => (b.revenue > best.revenue ? b : best), reordered[0]);

    // ── 16. Order history (last 100 orders for the range) ──
    const orderHistory = await prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: rangeFrom } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { table: { select: { name: true } }, items: { select: { name: true, quantity: true, price: true } } },
    });
    const orderHistoryData = orderHistory.map((o) => ({
      id: o.id,
      table_name: o.table.name,
      order_type: o.orderType,
      status: o.status,
      payment_method: o.paymentMethod,
      payment_status: o.paymentStatus,
      total: toNum(o.total),
      created_at: o.createdAt.toISOString(),
      preparing_duration_seconds: o.preparingDurationSeconds ?? null,
      items: o.items.map((it) => ({ name: it.name, qty: toNum(it.quantity), price: toNum(it.price) })),
    }));

    // ── 16. Items per order average ──
    const totalItems = items.reduce((s, it) => s + toNum(it.quantity), 0);
    const totalPaidOrders = await countOrders(restaurantId, rangeFrom);
    const avgItemsPerOrder = totalPaidOrders > 0 ? Math.round((totalItems / totalPaidOrders) * 10) / 10 : 0;

    // ── 17. Revenue per order type ──
    const [dineInRev, takeawayRev] = await Promise.all([
      sumRevenue(restaurantId, month).then(() =>
        prisma.order.aggregate({
          where: { restaurantId, ...PAID_NOT_CANCELLED, createdAt: { gte: month }, orderType: "dine_in" } as never,
          _sum: { total: true },
        }).then((r) => toNum(r._sum.total))
      ),
      prisma.order.aggregate({
        where: { restaurantId, ...PAID_NOT_CANCELLED, createdAt: { gte: month }, orderType: "takeaway" } as never,
        _sum: { total: true },
      }).then((r) => toNum(r._sum.total)),
    ]);

    return NextResponse.json({
      revenue: {
        today: Math.round(todayRev * 100) / 100,
        yesterday: Math.round(yesterdayRev * 100) / 100,
        week: Math.round(weekRev * 100) / 100,
        lastWeek: Math.round(lastWeekRev * 100) / 100,
        month: Math.round(monthRev * 100) / 100,
        lastMonth: Math.round(lastMonthRev * 100) / 100,
        year: Math.round(yearRev * 100) / 100,
      },
      orders: { today: todayCount, week: weekCount, month: monthCount, year: yearCount },
      averageOrder: {
        today: Math.round(avgOrderToday * 100) / 100,
        week: Math.round(avgOrderWeek * 100) / 100,
        month: Math.round(avgOrderMonth * 100) / 100,
      },
      avgItemsPerOrder,
      cancellationRate: Math.round(cancellationRate * 10000) / 100,
      orderTypeSplit: { dineIn: dineInCount, takeaway: takeawayCount },
      orderTypeRevenue: { dineIn: Math.round(dineInRev * 100) / 100, takeaway: Math.round(takeawayRev * 100) / 100 },
      paymentSplit: { cash: cashCount, card: cardCount },
      dailyRevenue,
      monthlyRevenue: monthlyBuckets,
      hourlyPerformance: hourlyBuckets,
      dayOfWeekPerformance: reordered,
      topDishes,
      worstDishes,
      categoryPerformance,
      avgPrepTimeSeconds: avgPrepTime,
      tablePerformance,
      shiftAnalytics,
      orderHistory: orderHistoryData,
      peakHour: { hour: peakHour.hour, revenue: peakHour.revenue },
      bestDay: { name: bestDay.name, revenue: bestDay.revenue },
      profitSummary: { totalProfit, marginPct },
      range,
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    console.error(e);
    if (isDbUnreachableError(e)) {
      return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
