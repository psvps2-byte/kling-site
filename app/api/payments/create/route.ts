import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// WayForPay
const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT!;
const MERCHANT_SECRET = process.env.WFP_MERCHANT_SECRET!;

// Дуже важливо: merchantDomainName має бути БЕЗ https://
// Наприклад: "www.vilna.pro"
const MERCHANT_DOMAIN =
  (process.env.WFP_MERCHANT_DOMAIN || "www.vilna.pro").trim();

// Твій сайт (для returnUrl/serviceUrl)
const DOMAIN = "https://www.vilna.pro";

// Пакети (постав тут реальні ціни В UAH)
const PACKS: Record<string, { price: number; points: number; title: string }> = {
  starter: { price: 7, points: 140, title: "Starter" },
  plus: { price: 20, points: 440, title: "Plus" },
  pro: { price: 50, points: 1200, title: "Pro" },
  max: { price: 100, points: 2600, title: "Max" },
  ultra: { price: 200, points: 5600, title: "Ultra" },
};

function buildSignature(parts: (string | number)[]) {
  const str = parts.map((x) => String(x)).join(";");
  return crypto.createHmac("md5", MERCHANT_SECRET).update(str).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    // 1) auth
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2) body
    const body = await req.json().catch(() => ({}));
    const pack = String(body?.pack || "").trim();
    const packData = PACKS[pack];

    if (!packData) {
      return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    }

    // 3) supabase
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE env vars" }, { status: 500 });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 4) get user_id
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (userErr || !userRow?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user_id = userRow.id;

    // 5) create payment row (PENDING)
    const orderReference = `ORD-${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);

    const amount = Number(packData.price); // UAH
    const currency = "UAH";

    const { data: payRow, error: payErr } = await supabase
      .from("payments")
      .insert({
        user_id,
        order_id: orderReference,
        package_name: pack,
        amount_usd: amount, // тут фактично UAH (див. коментар зверху)
        points: packData.points,
        status: "PENDING",
      })
      .select("id")
      .single();

    if (payErr || !payRow?.id) {
      return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
    }

    // 6) WayForPay поля
    const productName = [`Vilna ${packData.title} pack`];
    const productCount = ["1"];
    const productPrice = [amount.toFixed(2)];

    // ✅ Правильний порядок для підпису (важливо)
    const merchantSignature = buildSignature([
      MERCHANT_ACCOUNT,
      MERCHANT_DOMAIN,
      orderReference,
      orderDate,
      amount.toFixed(2),
      currency,
      productName[0],
      productCount[0],
      productPrice[0],
    ]);

    // Повертаємо дані, які фронт відправить POST-формою на WayForPay
    return NextResponse.json({
      merchantAccount: MERCHANT_ACCOUNT,
      merchantDomainName: MERCHANT_DOMAIN,
      orderReference,
      orderDate,
      amount: amount.toFixed(2),
      currency,
      productName,
      productCount,
      productPrice,
      merchantSignature,

      // куди повернути користувача після оплати/відмови
      returnUrl: `${DOMAIN}/api/payments/return`,

      // куди WayForPay шле callback (POST)
      serviceUrl: `${DOMAIN}/api/payments/callback`,

      // щоб потім можна було зв’язати оплату
      paymentId: payRow.id,
    });
  } catch (e: any) {
    console.error("payments/create error:", e?.message || e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
