import { NextResponse } from "next/server";
import { uploadToR2, presignGet } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const contentType = file.type || "image/jpeg";

    // завантажуємо у R2
    const { key } = await uploadToR2({
      buffer,
      contentType,
      prefix: "refs/",
    });

    // робимо signed URL (щоб Kling мав доступ)
    const url = await presignGet(key, 60 * 60); // 1 година

    return NextResponse.json({ key, url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload error" },
      { status: 500 }
    );
  }
}
