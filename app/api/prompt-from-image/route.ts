import { NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import heicConvert from "heic-convert";

export const runtime = "nodejs";

// ✅ Helper: sleep for ms
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ✅ Helper: check if error is retryable
function isRetryableError(err: any): boolean {
    if (!err) return false;
    
    const message = String(err?.message || "").toLowerCase();
    const status = err?.status || err?.response?.status;
    
    // Network errors
    if (message.includes("econnrefused") || message.includes("enotfound") || message.includes("timeout")) {
        return true;
    }
    
    // Rate limit or server errors
    if (status === 429 || (status >= 500 && status < 600)) {
        return true;
    }
    
    return false;
}

// ✅ Helper: retry with exponential backoff
async function createWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    const delays = [500, 1000, 2000];
    let lastErr: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[prompt-from-image] Attempt ${attempt}/${maxRetries}`);
            return await fn();
        } catch (e: any) {
            lastErr = e;
            if (attempt < maxRetries && isRetryableError(e)) {
                const delay = delays[attempt - 1];
                console.warn(`[prompt-from-image] Retrying in ${delay}ms:`, e?.message);
                await sleep(delay);
            } else {
                throw e;
            }
        }
    }
    
    throw lastErr;
}

// ✅ Helper: timeout wrapper using AbortController or Promise.race
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    if (typeof AbortController !== "undefined") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        
        try {
            return await Promise.race([
                promise,
                new Promise<T>((_, reject) => {
                    controller.signal.addEventListener("abort", () => {
                        reject(new Error(`Timeout after ${ms}ms`));
                    });
                }),
            ]);
        } finally {
            clearTimeout(timeout);
        }
    } else {
        // Fallback: Promise.race with timeout
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => 
                setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
            ),
        ]);
    }
}

// ✅ Helper: fetch with retry
async function fetchWithRetry(url: string, attempts = 5): Promise<Response> {
    let lastErr: any;
    
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const res = await fetch(url);
            return res;
        } catch (e: any) {
            lastErr = e;
            if (attempt < attempts) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.warn(`[prompt-from-image] Fetch retry ${attempt}/${attempts} after ${delay}ms:`, e?.message);
                await sleep(delay);
            }
        }
    }
    
    throw lastErr;
}

async function downloadImageAsDataUrl(url: string): Promise<string> {
    try {
        console.log(`[prompt-from-image] Downloading: ${url}`);
        const res = await fetchWithRetry(url);

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

        console.log(`[prompt-from-image] Calling OpenAI vision API with retry`);

        // ✅ Wrap in createWithRetry + withTimeout
        const r = await createWithRetry(async () => {
            const response = await withTimeout(
                client.responses.create({
                    model: "gpt-4o",
                    input: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "input_text",
                                    text:
                                        "Напиши детальний промт українською мовою для генерації максимально схожого фото.",
                                },
                                {
                                    type: "input_image",
                                    image_url: dataUrl,
                                    detail: "auto",
                                },
                            ],
                        },
                    ],
                }),
                25000 // 25 second timeout
            );

            // Treat empty response as retryable
            const text = response.output_text?.trim() || "";
            if (!text) {
                throw new Error("Empty response from OpenAI");
            }

            return response;
        });

        const text = r.output_text?.trim() || "";
        console.log(`[prompt-from-image] Success, prompt length: ${text.length}`);
        return NextResponse.json({ prompt: text });
    } catch (e: any) {
        console.error(`[prompt-from-image] Error:`, e?.message || e);
        
        // Return 502 for retryable errors, 500 for others
        const isRetryable = isRetryableError(e) || String(e?.message || "").includes("Empty response") || String(e?.message || "").includes("Timeout");
        const status = isRetryable ? 502 : 500;
        
        return NextResponse.json(
            { error: status === 502 ? "Temporary OpenAI error. Please try again." : e?.message || "Server error" },
            { status }
        );
    }
}
