import { NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import heicConvert from "heic-convert";

export const runtime = "nodejs";

async function downloadImageAsDataUrl(url: string): Promise<string> {
    try {
        console.log(`[prompt-from-image] Downloading: ${url}`);
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const contentType = res.headers.get("content-type") || "";
        console.log(`[prompt-from-image] Content-Type: ${contentType}`);
        
        if (!contentType.startsWith("image/")) {
            throw new Error("Invalid image type");
        }

        const arrayBuffer = await res.arrayBuffer();
        let buffer = Buffer.from(new Uint8Array(arrayBuffer));
        console.log(`[prompt-from-image] Downloaded buffer size: ${buffer.length} bytes`);
        let finalMime = contentType;

        // Detect HEIC/HEIF by content-type or URL extension
        const urlExt = (url.split(".").pop() || "").toLowerCase().split("?")[0];
        const isHeic = 
            contentType === "image/heic" ||
            contentType === "image/heif" ||
            urlExt === "heic" ||
            urlExt === "heif";

        if (isHeic) {
            console.log(`[prompt-from-image] HEIC/HEIF detected (${contentType || urlExt}), converting via heic-convert`);
            try {
                const jpegBuffer = await heicConvert({
                    buffer,
                    format: "JPEG",
                    quality: 0.9,
                });
                buffer = Buffer.from(jpegBuffer instanceof ArrayBuffer ? new Uint8Array(jpegBuffer) : jpegBuffer);
                finalMime = "image/jpeg";
                console.log(`[prompt-from-image] ✅ Converted HEIC to JPEG, new size: ${buffer.length} bytes`);
            } catch (e: any) {
                console.error(`[prompt-from-image] ❌ HEIC conversion failed:`, e?.message);
                throw new Error(`HEIC/HEIF not supported on server build. Convert to JPEG/PNG before calling prompt-from-image.`);
            }
        } else {
            // If format is not standard (jpeg/png/webp), convert via sharp
            const isStandardFormat = 
                contentType === "image/jpeg" ||
                contentType === "image/png" ||
                contentType === "image/webp";

            if (!isStandardFormat) {
                console.log(`[prompt-from-image] Non-standard format (${contentType}) detected, converting via sharp`);
                try {
                    const img = sharp(buffer, { failOnError: false });
                    const meta = await img.metadata();
                    const hasAlpha = !!meta.hasAlpha;
                    console.log(`[prompt-from-image] Sharp metadata: format=${meta.format}, hasAlpha=${hasAlpha}, width=${meta.width}, height=${meta.height}`);

                    if (hasAlpha) {
                        buffer = Buffer.from(await img.png({ compressionLevel: 9 }).toBuffer());
                        finalMime = "image/png";
                        console.log(`[prompt-from-image] ✅ Converted to PNG (alpha detected), new size: ${buffer.length} bytes`);
                    } else {
                        buffer = Buffer.from(await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer());
                        finalMime = "image/jpeg";
                        console.log(`[prompt-from-image] ✅ Converted to JPEG, new size: ${buffer.length} bytes`);
                    }
                } catch (e: any) {
                    console.error(`[prompt-from-image] ❌ Sharp conversion failed:`, e?.message);
                    throw new Error(`Unsupported image format. Sharp conversion failed: ${e?.message}`);
                }
            } else {
                console.log(`[prompt-from-image] Standard format (${contentType}), no conversion needed`);
            }
        }

        // Validate finalMime is one of the supported formats for OpenAI
        if (!["image/jpeg", "image/png", "image/webp"].includes(finalMime)) {
            throw new Error(`Invalid final MIME type: ${finalMime}. Only JPEG/PNG/WEBP are supported.`);
        }

        const base64 = buffer.toString("base64");
        const dataUrl = `data:${finalMime};base64,${base64}`;
        console.log(`[prompt-from-image] Data URL created with MIME: ${finalMime}, size: ${base64.length} chars`);

        return dataUrl;
    } catch (e: any) {
        console.error(`[prompt-from-image] Download/conversion error:`, e?.message || e);
        
        // Return 415 for unsupported formats, 500 for other errors
        const isFormatError = e?.message?.includes("HEIC") || 
                             e?.message?.includes("Unsupported") || 
                             e?.message?.includes("Invalid final MIME");
        
        const status = isFormatError ? 415 : 500;
        throw new Error(`Failed to process image: ${e?.message || e}`);
    }
}

export async function POST(req: Request) {
    try {
        const { image_url } = await req.json();

        if (!image_url || typeof image_url !== "string") {
            return NextResponse.json({ error: "Missing image_url" }, { status: 400 });
        }

        console.log(`[prompt-from-image] Request for: ${image_url}`);

        // Download image from URL and convert to data URL
        const dataUrl = await downloadImageAsDataUrl(image_url);

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        console.log(`[prompt-from-image] Calling OpenAI vision API`);

        const r = await client.responses.create({
            model: "gpt-4o",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text:
                                "Напиши ДУЖЕ детальний промт українською для генерації максимально схожого фото. " +
                                "Опиши: об'єкти, стиль, фон, освітлення, ракурс, композицію, кольори, матеріали, якість. " +
                                "Поверни тільки текст промта (без пояснень).",
                        },
                        {
                            type: "input_image",
                            image_url: dataUrl,
                            detail: "auto",
                        },
                    ],
                },
            ],
        });

        const text = r.output_text?.trim() || "";
        if (!text) {
            console.error(`[prompt-from-image] Empty response from OpenAI`);
            return NextResponse.json({ error: "No prompt generated" }, { status: 500 });
        }

        console.log(`[prompt-from-image] Success, prompt length: ${text.length}`);
        return NextResponse.json({ prompt: text });
    } catch (e: any) {
        console.error(`[prompt-from-image] Error:`, e?.message || e);
        return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
    }
}
