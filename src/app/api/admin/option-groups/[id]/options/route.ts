import { NextResponse } from "next/server";
import { createItemOption } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const optionGroupId = Number(id);
    if (!optionGroupId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await request.json();
    const { name, price_modifier, is_default, sort_order } = body;
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Option name required" }, { status: 400 });
    }
    const option = await createItemOption({
      option_group_id: optionGroupId,
      name: String(name).trim(),
      price_modifier: price_modifier != null ? Number(price_modifier) : 0,
      is_default: is_default != null ? (Number(is_default) ? 1 : 0) : 0,
      sort_order: sort_order != null ? Number(sort_order) : 0,
    });
    return NextResponse.json(option);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create option" }, { status: 500 });
  }
}
