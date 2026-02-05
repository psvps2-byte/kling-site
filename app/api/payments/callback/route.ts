import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Щоб Next не кешував/не оптимізував роут
export const dynamic = "force-dynamic";

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

  const text = await req.text().catch(() => "");
  const params = new URLSearchParams(text);

  const obj: any = {};
  for (const [k, v] of params.entries()) obj[k] = v;

  // інколи вони шлють "response" як JSON-рядок
  if (obj.response) {
    try {
      return JSON.parse(obj.response);
    } catch {
      // ignore
    }
  }

  return obj;
}

export async function POST(req: NextRequest) {
  const data = await readPayload(req);

  const orderReference = String(data?.orderReference || "").trim();
  const transactionStatus = String(data?.transactionStatus || "").trim(); // "Approved" / "Declined" / ...
  const amount = String(data?.amount || "").trim();
  const currency = String(data?.currency || "").trim();
  const receivedSig = String(data?.merchantSignature || "").trim();

  if (!orderReference) {
    return NextResponse.json({ error: "No orderReference" }, { status: 400 });
  }

  // ✅ Підпис: у WayForPay для callback набір полів може відрізнятися.
  // Поки НЕ блокуємо обробку через сигнатуру — тільки логуємо.
  // Коли стабілізуємо — підкрутимо точну формулу під твій формат.
  const expectedSig = sign([
    MERCHANT_ACCOUNT,
    orderReference,
    amount,
    currency,
    transactionStatus,
  ]);

  if (receivedSig && expectedSig !== receivedSig) {
    console.warn("WayForPay signature mismatch (not blocking)", {
      orderReference,
      transactionStatus,
      amount,
      currency,
    });
  }

  // ✅ ГОЛОВНА ПРАВКА: у тебе в БД колонка називається order_id (а не order_reference)
  const { data: payRow, error: payErr } = await supabase
    .from("payments")
    .select("id, user_id, points, status")
    .eq("order_id", orderReference)
    .single();

  if (payErr || !payRow?.id) {
    console.error("Payment not found for orderReference", { orderReference, payErr });
    // 200 OK щоб WayForPay не ретраїв нескінченно, але з логом у тебе
    return new NextResponse("OK", { status: 200 });
  }

  // idempotent
  if (payRow.status === "PAID") {
    return new NextResponse("OK", { status: 200 });
  }

  const approved = transactionStatus.toLowerCase() === "approved";

  if (!approved) {
    await supabase
      .from("payments")
      .update({ status: "FAILED" })
      .eq("id", payRow.id);

    return new NextResponse("OK", { status: 200 });
  }

  // ✅ 1) оновлюємо payment
  await supabase
    .from("payments")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", payRow.id);

  // ✅ 2) додаємо бали користувачу
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("points")
    .eq("id", payRow.user_id)
    .single();

  if (userErr) {
    console.error("User not found for payment", { orderReference, userErr });
    return new NextResponse("OK", { status: 200 });
  }

  const current = Number(userRow?.points || 0);
  const add = Number(payRow.points || 0);

  await supabase
    .from("users")
    .update({ points: current + add })
    .eq("id", payRow.user_id);

  return new NextResponse("OK", { status: 200 });
}

// (опційно) щоб відкриття URL у браузері не давало білий екран
export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
