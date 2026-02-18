import { NextResponse } from "next/server";
import { updateItemOption, deleteItemOption } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await request.json();
    await updateItemOption(id, {
      name: body.name,
      price_modifier: body.price_modifier,
      is_default: body.is_default,
      sort_order: body.sort_order,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update option" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await deleteItemOption(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete option" }, { status: 500 });
  }
}
