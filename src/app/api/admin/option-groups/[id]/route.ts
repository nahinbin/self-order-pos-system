import { NextResponse } from "next/server";
import { updateOptionGroup, deleteOptionGroup } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await request.json();
    await updateOptionGroup(id, {
      name: body.name,
      required: body.required,
      min_selections: body.min_selections,
      max_selections: body.max_selections,
      sort_order: body.sort_order,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update option group" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await deleteOptionGroup(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete option group" }, { status: 500 });
  }
}
