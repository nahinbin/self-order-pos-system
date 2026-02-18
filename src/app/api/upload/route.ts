import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = "public/uploads";
const MAX_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Only images (JPEG, PNG, WebP, GIF)" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Max 4MB" }, { status: 400 });
    }
    const ext = path.extname(file.name) || ".jpg";
    const base = path.join(process.cwd(), UPLOAD_DIR);
    await mkdir(base, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    const filePath = path.join(base, name);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buf);
    return NextResponse.json({ url: `/uploads/${name}` });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
