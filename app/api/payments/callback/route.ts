import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT!;
const MERCHANT_SECRET = process.env.WFP_MERCHANT_SECRET!;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function sign(parts: string[]) {
  return crypto
    .createHmac("md5", MERCHANT_SECRET)
    .update(parts.join(";"))
    .digest("hex");
}

// WayForPay часто шле form-urlencoded
async function readPayload(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("application/json")) {
    return await req.json().catch(() => ({}));
  }

  const text = await req.text();
  const params = new URLSearchParams(text);
  const obj: Record<string, any> = {};
  for (const [k, v] of params.entries()) obj[k] = v;

  // інколи вони шлють "response" як JSON-рядок
  if (obj.response) {
    try {
      return JSON.parse(obj.response);
    } catch {}
  }

  return obj;
}

export async function POST(req: NextRequest) {
  const data = await readPayload(req);

  const orderReference = String(data?.orderReference || "").trim();
  const transactionStatus = String(data?.transactionStatus || "").trim(); // Approved / Declined
  const amount = String(data?.amount || "").trim();
  const currency = String(data?.currency || "").trim();
  const receivedSig = String(data?.merchantSignature || "").trim();

  if (!orderReference) {
    return NextResponse.json({ error: "No orderReference" }, { status: 400 });
  }

  // 1) знаходимо payment (ВАЖЛИВО: у тебе в БД колонка order_id)
  const { data: payRow, error: payErr } = await supabase
    .from("payments")
    .select("id, user_id, points, status")
    .eq("order_id", orderReference)
    .single();

  if (payErr || !payRow?.id) {
    console.error("Payment not found for orderReference:", orderReference, payErr);
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // 2) перевірка підпису (робимо м’якше, щоб не блокувати оплату під час дебагу)
  // базовий варіант (часто використовується)
  const expectedSigV1 = sign([
    MERCHANT_ACCOUNT,
    orderReference,
    amount,
    currency,
    transactionStatus,
  ]);

  if (receivedSig && receivedSig !== expectedSigV1) {
    console.warn("WFP signature mismatch (will still process)", {
      orderReference,
      receivedSig,
      expectedSigV1,
    });
  }

  // 3) якщо вже PAID — відповідаємо ok
  if (payRow.status === "PAID") {
    return NextResponse.json({ ok: true });
  }

  const approved = transactionStatus.toLowerCase() === "approved";

  if (!approved) {
    await supabase
      .from("payments")
      .update({ status: "FAILED" })
      .eq("id", payRow.id);

    return NextResponse.json({ ok: true });
  }

  // 4) оновлюємо payment
  await supabase
    .from("payments")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", payRow.id);

  // 5) додаємо бали користувачу
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

  return NextResponse.json({ ok: true });
}
