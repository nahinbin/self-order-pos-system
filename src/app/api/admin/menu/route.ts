import { NextResponse } from "next/server";
import { getMenuItemsAdmin, createMenuItem } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function handleDbError(e: unknown, fallback = "Failed to load menu") {
  console.error(e);
  if (isDbUnreachableError(e)) {
    return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const items = await getMenuItemsAdmin(restaurantId);
    return NextResponse.json(items);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const body = await request.json();
    const { name, description, image_url, price, category, available, sort_order } = body;
    if (!name || price == null || !category) {
      return NextResponse.json({ error: "Missing name, price, or category" }, { status: 400 });
    }
    const item = await createMenuItem(restaurantId, {
      name: String(name).trim(),
      description: description != null ? String(description) : null,
      image_url: image_url != null ? String(image_url) : null,
      price: Number(price),
      category: String(category).trim(),
      available: available != null ? (Number(available) ? 1 : 0) : 1,
      sort_order: sort_order != null ? Number(sort_order) : 0,
    });
    return NextResponse.json(item);
  } catch (e) {
    return handleDbError(e, "Failed to create item");
  }
}
