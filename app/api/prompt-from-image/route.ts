import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { image_url } = await req.json();

        if (!image_url || typeof image_url !== "string") {
            return NextResponse.json({ error: "Missing image_url" }, { status: 400 });
        }

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
                                "Опиши: об’єкти, стиль, фон, освітлення, ракурс, композицію, кольори, матеріали, якість. " +
                                "Поверни тільки текст промта (без пояснень).",
                        },
                        {
                            type: "input_image",
                            image_url: image_url,
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
