import { NextResponse } from "next/server";
import { getMenuItemById, updateMenuItem, deleteMenuItem } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const { id } = await params;
    const numId = Number(id);
    if (!numId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const item = await getMenuItemById(restaurantId, numId);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json(item);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load item" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const { id } = await params;
    const numId = Number(id);
    if (!numId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await request.json();
    await updateMenuItem(restaurantId, numId, {
      name: body.name,
      description: body.description,
      image_url: body.image_url,
      price: body.price,
      cost: body.cost,
      category: body.category,
      available: body.available,
      sort_order: body.sort_order,
    });
    const item = await getMenuItemById(restaurantId, numId);
    return NextResponse.json(item);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const { id } = await params;
    const numId = Number(id);
    if (!numId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await deleteMenuItem(restaurantId, numId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
