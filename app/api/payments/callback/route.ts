import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function readPayload(req: NextRequest) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // 1) JSON
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }

  // 2) multipart/form-data  (ДУЖЕ ЧАСТО у WayForPay)
  if (ct.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      const obj: any = {};
      fd.forEach((v, k) => {
        obj[k] = typeof v === "string" ? v : "[file]";
      });

      // інколи вони кладуть все в "response" як JSON-рядок
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

  // 3) x-www-form-urlencoded або текст
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const obj: any = {};
    for (const [k, v] of params.entries()) obj[k] = v;

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
  const data = await readPayload(req);

  // 🔥 ЛОГ — щоб ти точно бачив у Railway logs, що прилетіло
  console.log("WFP_CALLBACK_HIT", {
    ct: req.headers.get("content-type"),
    keys: Object.keys(data || {}),
    sample: data,
  });

  const orderReference = String(data?.orderReference || "").trim();
  const transactionStatus = String(data?.transactionStatus || "").trim();
  const reason = String(data?.reason || data?.reasonCode || "").trim();

  if (!orderReference) {
    console.log("WFP_CALLBACK_NO_ORDERREFERENCE", { data });
    return new NextResponse("OK", { status: 200 });
  }

  // ✅ шукаємо по order_id (у тебе в Supabase саме так)
  const { data: payRow, error: payErr } = await supabase
    .from("payments")
    .select("id, user_id, points, status")
    .eq("order_id", orderReference)
    .single();

  if (payErr || !payRow?.id) {
    console.log("WFP_PAYMENT_NOT_FOUND", { orderReference, payErr });
    return new NextResponse("OK", { status: 200 });
  }

  // idempotent
  if (payRow.status === "PAID") {
    console.log("WFP_ALREADY_PAID", { orderReference });
    return new NextResponse("OK", { status: 200 });
  }

  const approved = transactionStatus.toLowerCase() === "approved";

  if (!approved) {
    await supabase
      .from("payments")
      .update({ status: "FAILED" })
      .eq("id", payRow.id);

    console.log("WFP_MARK_FAILED", { orderReference, transactionStatus, reason });
    return new NextResponse("OK", { status: 200 });
  }

  // ✅ ставимо PAID
  await supabase
    .from("payments")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", payRow.id);

  // ✅ додаємо бали
  const { data: userRow } = await supabase
    .from("users")
    .select("points")
    .eq("id", payRow.user_id)
    .single();

  const current = Number(userRow?.points || 0);
  const add = Number(payRow.points || 0);

  await supabase
    .from("users")
    .update({ points: current + add })
    .eq("id", payRow.user_id);

  console.log("WFP_MARK_PAID_AND_ADD_POINTS", { orderReference, add });

  return new NextResponse("OK", { status: 200 });
}

export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
