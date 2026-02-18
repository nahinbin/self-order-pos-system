import { NextResponse } from "next/server";
import { getOrderById, updateOrderPayment, updateOrderStatusWithTiming } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { emitOrderUpdated } from "@/lib/socket-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const { id } = await params;
    const numId = Number(id);
    if (!numId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const order = await getOrderById(restaurantId, numId);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const { id } = await params;
    const numId = Number(id);
    if (!numId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await request.json();
    if (body.payment_method) {
      await updateOrderPayment(restaurantId, numId, body.payment_method, body.payment_status || "paid");
    }
    if (body.status) {
      await updateOrderStatusWithTiming(restaurantId, numId, body.status);
    }
    const order = await getOrderById(restaurantId, numId);
    if (order) emitOrderUpdated(restaurantId, order);
    return NextResponse.json(order);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}
