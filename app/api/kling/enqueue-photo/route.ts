import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

function asStr(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNum(v: any, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: NextRequest) {
  // 0) AUTH
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) ENV
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Missing SUPABASE env vars" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key);

  // 2) BODY
  const body = await req.json().catch(() => ({}));

  const prompt = asStr(body?.prompt).trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  // Підлаштуй під твій фронт (ratio/output можуть називатись інакше)
  const aspect_ratio = asStr(body?.aspect_ratio || body?.ratio).trim() || "1:1";
  const output = asNum(body?.output ?? body?.n ?? 1, 1);
  const cost_points = Math.max(1, Math.floor(output));

  const image_1 = body?.image_1 ? asStr(body.image_1).trim() : null;
  const image_2 = body?.image_2 ? asStr(body.image_2).trim() : null;

  // 3) payload — ВСЕ, що треба воркеру/клінгу
  const payload = {
    prompt,          // БЕЗ <<<image_1>>>
    aspect_ratio,
    n: output,
    image_1,
    image_2,
  };

  // 4) user_id — беремо з таблиці users по email (безпечно)
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (userErr || !userRow?.id) {
    return NextResponse.json(
      { error: "User not found", details: userErr?.message ?? null },
      { status: 404 }
    );
  }

  const user_id = userRow.id;

  // 5) INSERT generation
  const { data, error } = await supabase
    .from("generations")
    .insert({
      user_id,
      kind: "PHOTO",
      tier: "STANDARD",
      cost_points,
      status: "QUEUED",
      payload,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to enqueue generation", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ generationId: data.id, status: "QUEUED" }, { status: 200 });
}
