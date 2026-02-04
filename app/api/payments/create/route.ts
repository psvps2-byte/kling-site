import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

export const runtime = "nodejs";

const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT!;
const MERCHANT_SECRET = process.env.WFP_MERCHANT_SECRET!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DOMAIN = "https://www.vilna.pro";

// Пакети (ціна + бали)
const PACKS: Record<string, { priceUsd: number; points: number }> = {
  starter: { priceUsd: 7, points: 140 },
  plus: { priceUsd: 20, points: 440 },
  pro: { priceUsd: 50, points: 1200 },
  max: { priceUsd: 100, points: 2600 },
  ultra: { priceUsd: 200, points: 5600 },
};

function buildSignature(parts: string[]) {
  // ВАЖЛИВО: join(";")
  return crypto
    .createHmac("md5", MERCHANT_SECRET)
    .update(parts.join(";"))
    .digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    // 0) ENV
    if (!MERCHANT_ACCOUNT || !MERCHANT_SECRET) {
      return NextResponse.json({ error: "Missing WFP env vars" }, { status: 500 });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE env vars" }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) AUTH
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (userErr || !userRow?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 2) BODY
    const body = await req.json().catch(() => ({}));
    const pack = String(body?.pack || "").trim();

    if (!PACKS[pack]) {
      return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    }

    // 3) Order
    const orderReference = "ORD-" + Date.now();
    const amount = PACKS[pack].priceUsd;
    const points = PACKS[pack].points;
    const time = Math.floor(Date.now() / 1000);

    const amountStr = amount.toFixed(2);

    // 4) Signature (під pay form)
    const signature = buildSignature([
      MERCHANT_ACCOUNT,
      orderReference,
      time.toString(),
      amountStr,
      "USD",
      `Vilna ${pack} pack`,
      "1",
      amountStr,
    ]);

    // 5) Insert into payments (ВАЖЛИВО: твої назви колонок)
    const { error: payErr } = await supabase.from("payments").insert({
      user_id: userRow.id,
      order_id: orderReference,
      package_name: pack,
      amount_usd: amount,
      points,
      status: "PENDING",
      // created_at заповниться автоматично
      // paid_at поки null
    });

    if (payErr) {
      return NextResponse.json(
        { error: "Failed to create payment row", details: payErr.message },
        { status: 500 }
      );
    }

    // 6) Return payload to frontend
    return NextResponse.json({
      merchantAccount: MERCHANT_ACCOUNT,
      orderReference,
      orderDate: time,
      amount: amountStr,
      currency: "USD",
      productName: [`Vilna ${pack} pack`],
      productCount: ["1"],
      productPrice: [amountStr],
      merchantSignature: signature,
      returnUrl: `${DOMAIN}/profile`,
      serviceUrl: `${DOMAIN}/api/payments/callback`,
      // опційно, але хай буде
      customFields: {
        points,
        pack,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: "Server error", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
