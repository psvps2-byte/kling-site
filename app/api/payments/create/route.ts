import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getReferralDiscountInfo, REFERRAL_DISCOUNT_RATE } from "@/lib/referrals";

// WayForPay
// Дуже важливо: merchantDomainName має бути БЕЗ https://
const MERCHANT_DOMAIN = (process.env.WFP_MERCHANT_DOMAIN || "www.vilna.pro").trim();

// Твій сайт (для returnUrl/serviceUrl)
const DOMAIN = "https://www.vilna.pro";

// Фіксований курс (як ти сказав)
const USD_TO_UAH_RATE = 44.5;

// Пакети у USD (на сайті показуємо $)
const PACKS_USD: Record<string, { priceUsd: number; points: number; title: string }> = {
  starter: { priceUsd: 7, points: 140, title: "Starter" },
  plus: { priceUsd: 20, points: 440, title: "Plus" },
  pro: { priceUsd: 50, points: 1200, title: "Pro" },
  max: { priceUsd: 100, points: 2600, title: "Max" },
  ultra: { priceUsd: 200, points: 5600, title: "Ultra" },
};

function buildSignature(parts: (string | number)[], merchantSecret: string) {
  const str = parts.map((x) => String(x)).join(";");
  return crypto.createHmac("md5", merchantSecret).update(str).digest("hex");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const MERCHANT_ACCOUNT = requireEnv("WFP_MERCHANT_ACCOUNT");
    const MERCHANT_SECRET = requireEnv("WFP_MERCHANT_SECRET");

    // 1) auth
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // 2) body
    const body = await req.json().catch(() => ({}));
    const pack = String(body?.pack || "").trim();
    const promo = String(body?.promo || "").trim();
    const promoUpper = promo.toUpperCase();
    const packData = PACKS_USD[pack];

    if (!packData) {
      return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    }

    // 3) supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Query promo code
    const { data: promoRow } = await supabase
      .from("promo_codes")
      .select("discount, active")
      .eq("code", promoUpper)
      .maybeSingle();

    if (promoUpper && (!promoRow || promoRow.active !== true)) {
      return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
    }

    // 4) get user_id
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id,referred_by")
      .eq("email", email)
      .single();

    if (userErr || !userRow?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user_id = userRow.id;

    const referralDiscountInfo = await getReferralDiscountInfo(supabase, user_id, userRow.referred_by);

    // 5) amounts
    const amountUAH = round2(packData.priceUsd * USD_TO_UAH_RATE);
    const promoDiscount = promoRow?.discount ? Number(promoRow.discount) : 0;
    const referralDiscount = referralDiscountInfo.eligible ? REFERRAL_DISCOUNT_RATE : 0;
    const totalDiscount = Math.min(0.95, promoDiscount + referralDiscount);
    const amountFinalUAH = round2(amountUAH * (1 - totalDiscount));
    const currency = "UAH";

    // 6) create payment row (PENDING)
    const orderReference = `ORD-${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);

    // ⚠️ У тебе колонка називається amount_usd, але ми тимчасово зберігаємо там UAH.
    // Пізніше краще додати amount_uah / amount_usd окремо.
    const { data: payRow, error: payErr } = await supabase
      .from("payments")
      .insert({
        user_id,
        order_id: orderReference,
        package_name: pack,
        amount_usd: amountUAH, // фактично UAH
        amount_final: amountFinalUAH,
        points: packData.points,
        status: "PENDING",
        promo_code: promo || null,
        referral_discount_percent: referralDiscount,
        referral_code_used: referralDiscount > 0 ? "AUTO_REFERRAL" : null,
        referrer_user_id: referralDiscountInfo.referrerUserId,
      })
      .select("id")
      .single();

    if (payErr || !payRow?.id) {
      return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
    }

    // 7) WayForPay fields
    const productName = [`Vilna ${packData.title} pack`];
    const productCount = ["1"];
    const productPrice = [amountFinalUAH.toFixed(2)];

    const merchantSignature = buildSignature(
      [
        MERCHANT_ACCOUNT,
        MERCHANT_DOMAIN,
        orderReference,
        orderDate,
        amountFinalUAH.toFixed(2),
        currency,
        productName[0],
        productCount[0],
        productPrice[0],
      ],
      MERCHANT_SECRET
    );

    return NextResponse.json({
      merchantAccount: MERCHANT_ACCOUNT,
      merchantDomainName: MERCHANT_DOMAIN,
      orderReference,
      orderDate,
      amount: amountFinalUAH.toFixed(2),
      currency,
      productName,
      productCount,
      productPrice,
      merchantSignature,
      returnUrl: `${DOMAIN}/api/payments/return`,
      serviceUrl: `${DOMAIN}/api/payments/callback`,
      paymentId: payRow.id,
      discountPercent: totalDiscount,
      referralDiscountPercent: referralDiscount,
    });
  } catch (error: unknown) {
    console.error("payments/create error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
