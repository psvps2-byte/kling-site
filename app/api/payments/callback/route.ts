import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function readPayload(req: NextRequest) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // JSON
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }

  // multipart/form-data
  if (ct.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      const obj: any = {};
      fd.forEach((v, k) => (obj[k] = typeof v === "string" ? v : "[file]"));

      if (obj.response) {
        try {
          return JSON.parse(obj.response);
        } catch {}
      }
      return obj;
    } catch {
      // fallback нижче
    }
  }

  // x-www-form-urlencoded / text
  try {
    const text = await req.text();

    // 🔥 ВАЖЛИВО: WayForPay інколи шле тіло як чистий JSON-рядок
    // але з content-type x-www-form-urlencoded (або просто text)
    // Тоді URLSearchParams дає 1 "ключ" = весь JSON
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return JSON.parse(trimmed);
      } catch {}
    }

    const params = new URLSearchParams(text);
    const obj: any = {};
    for (const [k, v] of params.entries()) obj[k] = v;

    // якщо це 1 ключ який виглядає як JSON — теж парсимо
    if (Object.keys(obj).length === 1) {
      const onlyKey = Object.keys(obj)[0];
      const maybeJson = onlyKey.trim();
      if (maybeJson.startsWith("{") && maybeJson.endsWith("}")) {
        try {
          return JSON.parse(maybeJson);
        } catch {}
      }
    }

    if (obj.response) {
      try {
        return JSON.parse(obj.response);
      } catch {}
    }

    return obj;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const supabase = getAdminSupabase();
  let data: any = await readPayload(req);

  // ✅ якщо раптом data все ще рядок — пробуємо JSON.parse
  if (typeof data === "string") {
    const t = data.trim();
    if (t.startsWith("{") && t.endsWith("}")) {
      try {
        data = JSON.parse(t);
      } catch {}
    }
  }

  console.log("WFP_CALLBACK_HIT", {
    ct: req.headers.get("content-type"),
    keys: Object.keys(data || {}),
    sample: data,
  });

  const orderReference = String(data?.orderReference || "").trim();
  const transactionStatus = String(data?.transactionStatus || "").trim();

  if (!orderReference) {
    console.log("WFP_CALLBACK_NO_ORDERREFERENCE", { data });
    return new NextResponse("OK", { status: 200 });
  }

  // ✅ у тебе в БД колонка order_id
  const { data: payRow, error: payErr } = await supabase
    .from("payments")
    .select("id, user_id, points, status")
    .eq("order_id", orderReference)
    .single();

  if (payErr || !payRow?.id) {
    console.log("WFP_PAYMENT_NOT_FOUND", { orderReference, payErr });
    return new NextResponse("OK", { status: 200 });
  }

  if (payRow.status === "PAID") {
    console.log("WFP_ALREADY_PAID", { orderReference });
    return new NextResponse("OK", { status: 200 });
  }

  const approved = transactionStatus.toLowerCase() === "approved";

  if (!approved) {
    await supabase.from("payments").update({ status: "FAILED" }).eq("id", payRow.id);
    console.log("WFP_MARK_FAILED", { orderReference, transactionStatus });
    return new NextResponse("OK", { status: 200 });
  }

  await supabase
    .from("payments")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", payRow.id);

  const { data: userRow } = await supabase
    .from("users")
    .select("points")
    .eq("id", payRow.user_id)
    .single();

  const current = Number(userRow?.points || 0);
  const add = Number(payRow.points || 0);

  await supabase.from("users").update({ points: current + add }).eq("id", payRow.user_id);

  console.log("WFP_MARK_PAID_AND_ADD_POINTS", { orderReference, add });

  return new NextResponse("OK", { status: 200 });
}

export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
