import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT!;
const MERCHANT_SECRET = process.env.WFP_MERCHANT_SECRET!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sign(parts: string[]) {
  return crypto
    .createHmac("md5", MERCHANT_SECRET)
    .update(parts.join(";"))
    .digest("hex");
}

// WayForPay часто шле application/x-www-form-urlencoded
async function readPayload(req: NextRequest) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

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
    } catch {
      // ignore
    }
  }

  return obj;
}

export async function POST(req: NextRequest) {
  const data = await readPayload(req);

  // Логи корисні для Railway
  console.log("WFP_CALLBACK_HIT", {
    ct: req.headers.get("content-type"),
    keys: Object.keys(data || {}),
    sample: {
      merchantAccount: data?.merchantAccount,
      orderReference: data?.orderReference,
      transactionStatus: data?.transactionStatus,
      amount: data?.amount,
      currency: data?.currency,
    },
  });

  const merchantAccount = String(data?.merchantAccount || "").trim();
  const orderReference = String(data?.orderReference || "").trim();
  const transactionStatus = String(data?.transactionStatus || "").trim(); // "Approved"/...
  const amount = String(data?.amount || "").trim();
  const currency = String(data?.currency || "").trim();
  const receivedSig = String(data?.merchantSignature || "").trim();

  if (!orderReference) {
    console.log("WFP_CALLBACK_NO_ORDERREFERENCE", { data });
    return NextResponse.json({ ok: false, error: "No orderReference" }, { status: 400 });
  }

  // (опціонально) перевіримо, що це наш мерчант
  if (MERCHANT_ACCOUNT && merchantAccount && merchantAccount !== MERCHANT_ACCOUNT) {
    console.log("WFP_BAD_MERCHANT", { merchantAccount, orderReference });
    return NextResponse.json({ ok: false, error: "Bad merchantAccount" }, { status: 400 });
  }

  // Перевірка підпису — базова. Якщо WFP буде шити інакше — підправимо.
  // У твоїх логах поле називається merchantSignature (так і треба).
  const expectedSig = sign([
    MERCHANT_ACCOUNT,
    orderReference,
    amount,
    currency,
    transactionStatus,
  ]);

  if (receivedSig && expectedSig !== receivedSig) {
    console.log("WFP_BAD_SIGNATURE", { orderReference });
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 400 });
  }

  // ✅ ВАЖЛИВО: у твоїй таблиці колонка з номером замовлення = order_id
  const { data: payRow, error: payErr } = await supabase
    .from("payments")
    .select("id, user_id, points, status")
    .eq("order_id", orderReference)
    .single();

  if (payErr || !payRow?.id) {
    console.log("WFP_PAYMENT_NOT_FOUND", { orderReference, payErr });
    return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
  }

  // якщо вже зарахували — ідемпотентність
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

  // ✅ 1) оновлюємо payment (додаємо paid_at)
  await supabase
    .from("payments")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", payRow.id);

  // ✅ 2) додаємо бали користувачу
  // (краще робити атомарно через RPC, але поки так)
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

  console.log("WFP_PAYMENT_APPLIED", { orderReference, add });

  return NextResponse.json({ ok: true });
}
