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

// ---------- helpers ----------

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
  const obj: any = {};

  for (const [k, v] of params.entries()) {
    obj[k] = v;
  }

  // інколи шлють response як JSON-рядок
  if (obj.response) {
    try {
      return JSON.parse(obj.response);
    } catch {}
  }

  return obj;
}

// ---------- handler ----------

export async function POST(req: NextRequest) {
  try {
    const data = await readPayload(req);

    console.log("WFP CALLBACK:", data);

    const orderReference = String(data?.orderReference || "").trim();
    const transactionStatus = String(data?.transactionStatus || "").trim();
    const amount = String(data?.amount || "").trim();
    const currency = String(data?.currency || "").trim();
    const receivedSig = String(data?.merchantSignature || "").trim();

    if (!orderReference) {
      return NextResponse.json({ error: "No orderReference" }, { status: 400 });
    }

    // ---- signature check ----
    const expectedSig = sign([
      MERCHANT_ACCOUNT,
      orderReference,
      amount,
      currency,
      transactionStatus,
    ]);

    if (receivedSig && expectedSig !== receivedSig) {
      console.error("Bad signature", {
        orderReference,
        expectedSig,
        receivedSig,
      });
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }

    // ---- IMPORTANT FIX HERE ----
    const { data: payRow } = await supabase
      .from("payments")
      .select("id, user_id, points, status")
      .eq("order_id", orderReference) // 🔥 ВАЖЛИВО
      .single();

    if (!payRow?.id) {
      console.error("Payment not found:", orderReference);
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // якщо вже зарахований
    if (payRow.status === "PAID") {
      return NextResponse.json({ ok: true });
    }

    const approved =
      transactionStatus.toLowerCase() === "approved" ||
      transactionStatus.toLowerCase() === "successful";

    if (!approved) {
      await supabase
        .from("payments")
        .update({ status: "FAILED" })
        .eq("id", payRow.id);

      return NextResponse.json({ ok: true });
    }

    // ---- mark payment paid ----
    await supabase
      .from("payments")
      .update({
        status: "PAID",
        paid_at: new Date().toISOString(),
      })
      .eq("id", payRow.id);

    // ---- add points ----
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

    console.log("PAYMENT SUCCESS:", orderReference);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("CALLBACK ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
