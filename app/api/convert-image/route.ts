import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const img = sharp(input, { failOnError: false });
    const meta = await img.metadata();
    const hasAlpha = !!meta.hasAlpha;

    let outBuf: Buffer;
    let outType: "image/jpeg" | "image/png";
    let ext: "jpg" | "png";

    if (hasAlpha) {
      outBuf = await img.png({ compressionLevel: 9 }).toBuffer();
      outType = "image/png";
      ext = "png";
    } else {
      outBuf = await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      outType = "image/jpeg";
      ext = "jpg";
    }

    return new NextResponse(outBuf, {
      status: 200,
      headers: {
        "Content-Type": outType,
        "Content-Disposition": `inline; filename="converted.${ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Convert failed" }, { status: 500 });
  }
}
