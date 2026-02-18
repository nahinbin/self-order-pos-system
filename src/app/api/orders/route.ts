import { NextResponse } from "next/server";
import { getOrders, createOrder, getOrCreateCounterTable } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { emitNewOrder } from "@/lib/socket-server";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function handleDbError(e: unknown, fallback = "Failed to load orders") {
  console.error(e);
  if (isDbUnreachableError(e)) {
    return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const orders = await getOrders(restaurantId);
    return NextResponse.json(orders);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const body = await request.json();
    const { table_id, order_type, items, total, customer_notes } = body;
    if (!order_type || !Array.isArray(items) || items.length === 0 || total == null) {
      return NextResponse.json({ error: "Missing order_type, items, or total" }, { status: 400 });
    }
    if (order_type !== "dine_in" && order_type !== "takeaway") {
      return NextResponse.json({ error: "order_type must be dine_in or takeaway" }, { status: 400 });
    }
    const resolvedTableId =
      table_id != null && Number(table_id)
        ? Number(table_id)
        : (await getOrCreateCounterTable(restaurantId)).id;
    const { id: orderId, order } = await createOrder(restaurantId, {
      table_id: resolvedTableId,
      order_type,
      items: items.map(
        (i: {
          menu_item_id: number;
          name: string;
          price: number;
          quantity: number;
          notes?: string;
          options_json?: string | null;
        }) => ({
          menu_item_id: i.menu_item_id,
          name: i.name,
          price: Number(i.price),
          quantity: Number(i.quantity) || 1,
          notes: i.notes,
          options_json: i.options_json ?? null,
        })
      ),
      total: Number(total),
      customer_notes: customer_notes || undefined,
    });
    emitNewOrder(restaurantId, order);
    return NextResponse.json({ orderId });
  } catch (e) {
    return handleDbError(e, "Failed to create order");
  }
}
