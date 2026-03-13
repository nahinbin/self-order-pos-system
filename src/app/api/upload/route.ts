import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = "public/uploads";
const MAX_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function cloudinaryEnabled(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

async function uploadToCloudinary(buf: Buffer): Promise<{ url: string; originalUrl: string }> {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
    secure: true,
  });

  const folder = process.env.CLOUDINARY_FOLDER || "restaurant-self-order";

  const res = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "webp",
        quality: "auto",
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buf);
  });

  // Return an optimized delivery URL for fast customer loading.
  // Cloudinary auto format/quality + resize; safe for thumbnails/listing pages.
  const optimizedUrl = cloudinary.url(res.public_id, {
    secure: true,
    fetch_format: "auto",
    quality: "auto",
    width: 480,
    crop: "limit",
  });

  return { url: optimizedUrl, originalUrl: res.secure_url };
}

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
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    // Prefer Cloudinary (CDN + compression). Fallback to local upload for dev.
    if (cloudinaryEnabled()) {
      const uploaded = await uploadToCloudinary(buf);
      return NextResponse.json(uploaded);
    }

    const base = path.join(process.cwd(), UPLOAD_DIR);
    await mkdir(base, { recursive: true });
    const filePath = path.join(base, name);
    await writeFile(filePath, buf);
    return NextResponse.json({ url: `/uploads/${name}` });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
