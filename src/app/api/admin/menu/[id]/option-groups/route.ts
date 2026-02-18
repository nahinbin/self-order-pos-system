import { NextResponse } from "next/server";
import { createOptionGroup } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const { id } = await params;
    const menuItemId = Number(id);
    if (!menuItemId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await request.json();
    const { name, required, min_selections, max_selections, sort_order } = body;
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Option group name required" }, { status: 400 });
    }
    const group = await createOptionGroup(restaurantId, {
      menu_item_id: menuItemId,
      name: String(name).trim(),
      required: required != null ? (Number(required) ? 1 : 0) : 1,
      min_selections: min_selections != null ? Math.max(0, Number(min_selections) || 0) : 1,
      max_selections: max_selections != null ? Math.max(1, Number(max_selections) || 1) : 1,
      sort_order: sort_order != null ? Number(sort_order) : 0,
    });
    return NextResponse.json(group);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create option group" }, { status: 500 });
  }
}
