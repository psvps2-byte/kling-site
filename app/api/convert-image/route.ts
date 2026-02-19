import { NextResponse } from "next/server";
import heicConvert from "heic-convert";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    console.log(`[convert-image] Input: ${file.name}, type: ${file.type}, size: ${file.size}`);

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const isHeic = ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";
    
    // Convert HEIC/HEIF to JPEG using heic-convert
    if (isHeic) {
      console.log(`[convert-image] Converting HEIC/HEIF to JPEG`);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const inputBuffer = Buffer.from(new Uint8Array(arrayBuffer));
        
        const jpegBuffer = await heicConvert({
          buffer: inputBuffer,
          format: "JPEG",
          quality: 0.9,
        });

        const outBuf = Buffer.from(jpegBuffer instanceof ArrayBuffer ? new Uint8Array(jpegBuffer) : jpegBuffer);
        console.log(`[convert-image] ✅ Converted HEIC to JPEG, size: ${outBuf.length} bytes`);

        return new NextResponse(outBuf, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Disposition": `inline; filename="converted.jpg"`,
            "Cache-Control": "no-store",
          },
        });
      } catch (e: any) {
        console.error(`[convert-image] HEIC conversion failed:`, e?.message);
        return NextResponse.json(
          { error: "HEIC conversion failed", details: e?.message },
          { status: 500 }
        );
      }
    }

    // For JPEG/PNG/WEBP - return as is
    const isStandard = 
      file.type === "image/jpeg" || 
      file.type === "image/png" || 
      file.type === "image/webp" ||
      ["jpg", "jpeg", "png", "webp"].includes(ext);

    if (isStandard) {
      console.log(`[convert-image] Standard format, returning as is`);
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = file.type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
      
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${file.name}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Other formats - unsupported
    console.error(`[convert-image] Unsupported format: ${file.type || ext}`);
    return NextResponse.json(
      { error: "Unsupported image format. Only JPEG, PNG, WEBP, HEIC, HEIF are supported." },
      { status: 415 }
    );
  } catch (e: any) {
    console.error(`[convert-image] Error:`, e?.message || e);
    return NextResponse.json({ error: e?.message || "Convert failed" }, { status: 500 });
  }
}
