import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabaseAdmin = getSupabaseAdmin();

    const { data: gen, error } = await supabaseAdmin
      .from("generations")
      .select("id,status,result_urls,result_url")
      .eq("id", id)
      .single();

    if (error || !gen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const urls: string[] = Array.isArray(gen.result_urls)
      ? gen.result_urls.filter(Boolean)
      : gen.result_url
        ? [String(gen.result_url)]
        : [];

    if (gen.status === "DONE" && urls.length) {
      return NextResponse.json(
        {
          code: 0,
          data: {
            task_status: "succeed",
            task_result: { images: urls.map((url) => ({ url })) },
          },
        },
        { status: 200 }
      );
    }

    if (gen.status === "ERROR" || gen.status === "FAILED") {
      return NextResponse.json(
        { code: 0, data: { task_status: "failed", task_status_msg: "failed" } },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { code: 0, data: { task_status: "processing" } },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
