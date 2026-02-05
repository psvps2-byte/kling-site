import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT!;
const MERCHANT_SECRET = process.env.WFP_MERCHANT_SECRET!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Якщо хочеш тимчасово вимкнути перевірку підпису:
// постав у Railway env: WFP_SKIP_SIGNATURE=1
const SKIP_SIGNATURE = process.env.WFP_SKIP_SIGNATURE === "1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sign(parts: string[]) {
  return crypto
    .createHmac("md5", MERCHANT_SECRET)
    .update(parts.join(";"))
    .digest("hex");
}

async function readPayload(req: NextRequest) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // WayForPay зазвичай шле form-urlencoded
  if (!ct.includes("application/json")) {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    const obj: Record<string, any> = {};
    for (const [k, v] of params.entries()) obj[k] = v;

    // інколи "response" як JSON-рядок
    if (obj.response) {
      try {
        return JSON.parse(obj.response);
      } catch {
        return obj;
      }
    }
    return obj;
  }

  return await req.json().catch(() => ({}));
}

export async function POST(req: NextRequest) {
  const data = await readPayload(req);

  const merchantAccount = String(data?.merchantAccount || "").trim();
  const orderReference = String(data?.orderReference || "").trim();
  const transactionStatus = String(data?.transactionStatus || "").trim();
  const currency = String(data?.currency || "").trim();

  // amount може прийти як "304.5" => нормалізуємо в "304.50"
  const amountRaw = String(data?.amount ?? "").trim();
  const amountFixed = Number(amountRaw || 0).toFixed(2);

  const receivedSig = String(data?.merchantSignature || "").trim();

  console.log("WFP_CALLBACK_HIT", {
    ct: req.headers.get("content-type"),
    merchantAccount,
    orderReference,
    transactionStatus,
    amountRaw,
    amountFixed,
    currency,
    hasSig: Boolean(receivedSig),
    keys: Object.keys(data || {}),
  });

  if (!orderReference) {
    console.log("WFP_CALLBACK_NO_ORDERREFERENCE", { data });
    return NextResponse.json({ ok: false, error: "No orderReference" }, { status: 400 });
  }

  if (MERCHANT_ACCOUNT && merchantAccount && merchantAccount !== MERCHANT_ACCOUNT) {
    console.log("WFP_BAD_MERCHANT", { merchantAccount, orderReference });
    return NextResponse.json({ ok: false, error: "Bad merchantAccount" }, { status: 400 });
  }

  // ✅ Перевірка підпису з amountFixed (ключове виправлення)
  if (!SKIP_SIGNATURE && receivedSig) {
    const expectedSig = sign([
      MERCHANT_ACCOUNT,
      orderReference,
      amountFixed,
      currency,
      transactionStatus,
    ]);

    if (expectedSig !== receivedSig) {
      console.log("WFP_BAD_SIGNATURE", {
        orderReference,
        expectedSig,
        receivedSig,
        amountRaw,
        amountFixed,
        currency,
        transactionStatus,
      });
      return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 400 });
    }
  }

  // ✅ У тебе в БД поле = order_id
  const { data: payRow, error: payErr } = await supabase
    .from("payments")
    .select("id, user_id, points, status")
    .eq("order_id", orderReference)
    .single();

  if (payErr || !payRow?.id) {
    console.log("WFP_PAYMENT_NOT_FOUND", { orderReference, payErr });
    return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
  }

  if (payRow.status === "PAID") {
    console.log("WFP_ALREADY_PAID", { orderReference });
    return NextResponse.json({ ok: true });
  }

  const approved = transactionStatus.toLowerCase() === "approved";
  if (!approved) {
    await supabase.from("payments").update({ status: "FAILED" }).eq("id", payRow.id);
    console.log("WFP_MARK_FAILED", { orderReference });
    return NextResponse.json({ ok: true });
  }

  // 1) payment -> PAID
  await supabase
    .from("payments")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", payRow.id);

  // 2) add points
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

  console.log("WFP_PAYMENT_APPLIED", { orderReference, add, newPoints: current + add });

  return NextResponse.json({ ok: true });
}
