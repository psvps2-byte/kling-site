import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

async function urlToBase64(url: string): Promise<string> {
    try {
        const res = await fetch("/api/url-to-base64", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data?.base64) {
            throw new Error("No base64 in response");
        }

        return String(data.base64);
    } catch (e: any) {
        throw new Error(`Failed to convert URL to base64: ${e?.message || e}`);
    }
}

export async function POST(req: Request) {
    try {
        const { image_url } = await req.json();

        if (!image_url || typeof image_url !== "string") {
            return NextResponse.json({ error: "Missing image_url" }, { status: 400 });
        }

        // Convert image URL to base64
        const base64 = await urlToBase64(image_url);
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
            return NextResponse.json({ error: "No prompt generated" }, { status: 500 });
        }

        return NextResponse.json({ prompt: text });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
    }
}
