import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase";

export const REFERRAL_COOKIE = "vilna_ref";
export const REFERRAL_VISITOR_COOKIE = "vilna_ref_visitor";
export const REFERRAL_REWARD_POINTS = 50;
export const REFERRAL_REWARD_USD = 2;
export const REFERRAL_DISCOUNT_RATE = 0.1;
export const REFERRAL_DISCOUNT_LIMIT = 2;
export const REFERRAL_PAYOUT_MIN_POINTS = 300;
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "contact.vilna.pro@gmail.com";
export const ADMIN_PAYOUT_EMAIL = process.env.ADMIN_PAYOUT_EMAIL || SUPPORT_EMAIL;

type AdminSupabase = ReturnType<typeof getSupabaseAdmin>;
type ReferralUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  referral_code?: string | null;
  referred_by?: string | null;
  points?: number | null;
};
type DiscountedPaymentRow = {
  status?: string | null;
  referral_discount_percent?: number | null;
};
type ReferralVisitRow = {
  id?: string | null;
  referral_code?: string | null;
  visitor_token?: string | null;
  signed_up_user_id?: string | null;
  purchase_payment_id?: string | null;
  created_at?: string | null;
};
type WithdrawalRow = {
  id: string;
  user_id?: string | null;
  requested_points?: number | null;
  amount_usd?: number | null;
  card_number?: string | null;
  status?: string | null;
  created_at: string;
  updated_at: string;
};
type RewardPaymentRow = {
  id?: string | null;
  user_id?: string | null;
  referrer_user_id?: string | null;
  referral_discount_percent?: number | null;
  referral_reward_points?: number | null;
  referral_reward_points_awarded?: boolean | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
}

function randomSuffix(length = 5) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function maskCardNumber(cardNumber: string) {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `**** **** **** ${digits.slice(-4)}`;
}

function pointsToUsd(points: number) {
  return Math.round((points * (REFERRAL_REWARD_USD / REFERRAL_REWARD_POINTS)) * 100) / 100;
}

export function createVisitorToken() {
  return `rv_${Date.now()}_${randomSuffix(10)}`;
}

export async function ensureReferralCode(
  supabase: AdminSupabase,
  user: ReferralUser
) {
  if (user.referral_code) return user.referral_code;

  const emailLocal = String(user.email || "").split("@")[0] || "user";
  const base = slugify(user.name || emailLocal) || "user";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${base}-${randomSuffix(attempt < 3 ? 4 : 6)}`;
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("referral_code", candidate)
      .maybeSingle();

    if (existing?.id) continue;

    const { error } = await supabase
      .from("users")
      .update({ referral_code: candidate })
      .eq("id", user.id)
      .is("referral_code", null);

    if (!error) return candidate;
  }

  throw new Error("Failed to create referral code");
}

export async function trackReferralVisit(
  supabase: AdminSupabase,
  code: string,
  visitorToken: string,
  landingPath?: string
) {
  const referralCode = String(code || "").trim().toLowerCase();
  if (!referralCode || !visitorToken) return { ok: false as const };

  const { data: referrer } = await supabase
    .from("users")
    .select("id, referral_code")
    .eq("referral_code", referralCode)
    .maybeSingle();

  if (!referrer?.id) return { ok: false as const };

  await supabase.from("referral_visits").insert({
    referrer_user_id: referrer.id,
    referral_code: referralCode,
    visitor_token: visitorToken,
    landing_path: landingPath || null,
  });

  return { ok: true as const, referrerUserId: referrer.id, referralCode };
}

export async function attachReferralToUser(
  supabase: AdminSupabase,
  user: ReferralUser & { email: string },
  referralCode: string | null | undefined,
  visitorToken: string | null | undefined
) {
  await ensureReferralCode(supabase, user);

  if (user.referred_by || !referralCode || !visitorToken) return;

  const normalizedCode = String(referralCode).trim().toLowerCase();
  if (!normalizedCode) return;

  const { data: referrer } = await supabase
    .from("users")
    .select("id, referral_code")
    .eq("referral_code", normalizedCode)
    .maybeSingle();

  if (!referrer?.id || referrer.id === user.id) return;

  const { error } = await supabase
    .from("users")
    .update({
      referred_by: referrer.id,
      referred_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .is("referred_by", null);

  if (error) return;

  const now = new Date().toISOString();

  const { data: visit } = await supabase
    .from("referral_visits")
    .select("id")
    .eq("referrer_user_id", referrer.id)
    .eq("visitor_token", visitorToken)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (visit?.id) {
    await supabase
      .from("referral_visits")
      .update({
        signed_up_user_id: user.id,
        signed_up_at: now,
      })
      .eq("id", visit.id);
    return;
  }

  await supabase.from("referral_visits").insert({
    referrer_user_id: referrer.id,
    referral_code: normalizedCode,
    visitor_token: visitorToken,
    signed_up_user_id: user.id,
    signed_up_at: now,
  });
}

export async function getReferralDiscountInfo(supabase: AdminSupabase, userId: string, referredBy: string | null | undefined) {
  if (!referredBy) {
    return {
      eligible: false,
      reservedUses: 0,
      paidUses: 0,
      usesLeft: 0,
      referrerUserId: null,
    };
  }

  const { data: discountedPayments } = await supabase
    .from("payments")
    .select("status, referral_discount_percent")
    .eq("user_id", userId);

  const rows = (discountedPayments || []) as DiscountedPaymentRow[];
  const reservedUses = Array.isArray(rows)
    ? rows.filter((row) => {
        const percent = Number(row?.referral_discount_percent || 0);
        const status = String(row?.status || "").toUpperCase();
        return percent > 0 && status !== "FAILED" && status !== "EXPIRED" && status !== "CANCELLED";
      }).length
    : 0;

  const paidUses = Array.isArray(rows)
    ? rows.filter((row) => {
        const percent = Number(row?.referral_discount_percent || 0);
        return percent > 0 && String(row?.status || "").toUpperCase() === "PAID";
      }).length
    : 0;

  return {
    eligible: reservedUses < REFERRAL_DISCOUNT_LIMIT,
    reservedUses,
    paidUses,
    usesLeft: Math.max(0, REFERRAL_DISCOUNT_LIMIT - reservedUses),
    referrerUserId: referredBy,
  };
}

async function getReservedWithdrawalPoints(supabase: AdminSupabase, userId: string) {
  const { data } = await supabase
    .from("withdrawal_requests")
    .select("requested_points, status")
    .eq("user_id", userId);

  return ((data || []) as WithdrawalRow[]).reduce((sum: number, row) => {
    const status = String(row?.status || "").toUpperCase();
    if (status === "REJECTED" || status === "CANCELLED") return sum;
    return sum + Number(row?.requested_points || 0);
  }, 0);
}

export async function getReferralOverview(supabase: AdminSupabase, user: ReferralUser, siteUrl?: string) {
  const referralCode = await ensureReferralCode(supabase, user);

  const [{ data: visits }, { data: rewardedPayments }, { data: withdrawals }, discountInfo] = await Promise.all([
    supabase
      .from("referral_visits")
      .select("visitor_token, signed_up_user_id, purchase_payment_id")
      .eq("referrer_user_id", user.id),
    supabase
      .from("payments")
      .select("referral_reward_points, status")
      .eq("referrer_user_id", user.id)
      .eq("referral_reward_points_awarded", true),
    supabase
      .from("withdrawal_requests")
      .select("id, requested_points, amount_usd, card_number, status, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    getReferralDiscountInfo(supabase, user.id, user.referred_by),
  ]);

  const visitRows = (visits || []) as ReferralVisitRow[];
  const rewardedRows = (rewardedPayments || []) as RewardPaymentRow[];
  const withdrawalRows = (withdrawals || []) as WithdrawalRow[];

  const clicks = Array.isArray(visitRows) ? visitRows.length : 0;
  const signups = new Set(
    visitRows.map((row) => row?.signed_up_user_id).filter((value): value is string => typeof value === "string" && !!value)
  ).size;
  const purchases = new Set(
    visitRows
      .map((row) => row?.purchase_payment_id)
      .filter((value): value is string => typeof value === "string" && !!value)
  ).size;

  const rewardedPoints = rewardedRows.reduce((sum: number, row) => {
    if (String(row?.status || "").toUpperCase() !== "PAID") return sum;
    return sum + Number(row?.referral_reward_points || 0);
  }, 0);

  const reservedWithdrawalPoints = await getReservedWithdrawalPoints(supabase, user.id);
  const maxByRewards = Math.max(0, rewardedPoints - reservedWithdrawalPoints);
  const availablePoints = Math.max(0, Math.min(Number(user.points || 0), maxByRewards));

  return {
    code: referralCode,
    link: `${siteUrl || process.env.NEXT_PUBLIC_APP_URL || "https://www.vilna.pro"}/?ref=${referralCode}`,
    stats: { clicks, signups, purchases },
    rewardPoints: rewardedPoints,
    rewardUsd: pointsToUsd(rewardedPoints),
    availableWithdrawalPoints: availablePoints,
    availableWithdrawalUsd: pointsToUsd(availablePoints),
    minWithdrawalPoints: REFERRAL_PAYOUT_MIN_POINTS,
    rewardRateText: `${REFERRAL_REWARD_POINTS} points = $${REFERRAL_REWARD_USD}`,
    discount: {
      eligible: discountInfo.eligible,
      usesLeft: discountInfo.usesLeft,
      reservedUses: discountInfo.reservedUses,
      paidUses: discountInfo.paidUses,
      percent: REFERRAL_DISCOUNT_RATE * 100,
    },
    withdrawals: withdrawalRows.map((row) => ({
      id: row.id,
      requestedPoints: Number(row.requested_points || 0),
      amountUsd: Number(row.amount_usd || 0),
      cardMasked: maskCardNumber(String(row.card_number || "")),
      status: String(row.status || "PENDING"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function sendPayoutRequestEmail(payload: {
  userEmail: string;
  referralCode: string;
  requestedPoints: number;
  amountUsd: number;
  cardNumber: string;
  requestId: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("Payout email skipped: RESEND_API_KEY is missing");
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "Vilna <login@vilna.pro>",
    to: ADMIN_PAYOUT_EMAIL,
    subject: `Payout request ${payload.requestId} from ${payload.userEmail}`,
    html: `
      <div style="font-family:Arial,sans-serif;padding:24px">
        <h2>New payout request</h2>
        <p><b>Request ID:</b> ${payload.requestId}</p>
        <p><b>User:</b> ${payload.userEmail}</p>
        <p><b>Referral code:</b> ${payload.referralCode}</p>
        <p><b>Points:</b> ${payload.requestedPoints}</p>
        <p><b>Amount:</b> $${payload.amountUsd.toFixed(2)}</p>
        <p><b>Card:</b> ${payload.cardNumber}</p>
      </div>
    `,
  });
}

export async function createWithdrawalRequest(supabase: AdminSupabase, user: ReferralUser & { email: string }, cardNumber: string) {
  const cleanCardNumber = cardNumber.replace(/\s+/g, "");
  const digits = cleanCardNumber.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19) {
    throw new Error("invalid_card_number");
  }

  const overview = await getReferralOverview(supabase, user);
  if (overview.availableWithdrawalPoints < REFERRAL_PAYOUT_MIN_POINTS) {
    throw new Error("not_enough_withdrawable_points");
  }

  const requestedPoints = overview.availableWithdrawalPoints;
  const amountUsd = pointsToUsd(requestedPoints);

  const nextBalance = Number(user.points || 0) - requestedPoints;
  if (nextBalance < 0) {
    throw new Error("not_enough_points");
  }

  const { data: requestRow, error } = await supabase
    .from("withdrawal_requests")
    .insert({
      user_id: user.id,
      requested_points: requestedPoints,
      amount_usd: amountUsd,
      card_number: digits,
      status: "PENDING",
    })
    .select("id, created_at, updated_at")
    .single();

  if (error || !requestRow?.id) {
    throw new Error(error?.message || "failed_to_create_withdrawal");
  }

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({ points: nextBalance })
    .eq("id", user.id);

  if (userUpdateError) {
    await supabase.from("withdrawal_requests").delete().eq("id", requestRow.id);
    throw new Error(userUpdateError.message || "failed_to_reserve_points");
  }

  await sendPayoutRequestEmail({
    userEmail: user.email,
    referralCode: overview.code,
    requestedPoints,
    amountUsd,
    cardNumber: digits,
    requestId: requestRow.id,
  });

  return {
    id: requestRow.id,
    requestedPoints,
    amountUsd,
    cardMasked: maskCardNumber(digits),
    status: "PENDING",
    createdAt: requestRow.created_at,
    updatedAt: requestRow.updated_at,
  };
}

export async function updateWithdrawalRequestStatus(
  supabase: AdminSupabase,
  requestId: string,
  nextStatus: string
) {
  const normalizedStatus = String(nextStatus || "").toUpperCase();
  const allowed = new Set(["PENDING", "PROCESSING", "PAID", "REJECTED"]);
  if (!allowed.has(normalizedStatus)) {
    throw new Error("invalid_status");
  }

  const { data: requestRow, error } = await supabase
    .from("withdrawal_requests")
    .select("id, user_id, requested_points, status")
    .eq("id", requestId)
    .single();

  if (error || !requestRow?.id) throw new Error("request_not_found");

  const currentStatus = String(requestRow.status || "").toUpperCase();
  if (currentStatus === normalizedStatus) return { changed: false };
  if (currentStatus === "PAID") throw new Error("paid_request_is_final");

  if (normalizedStatus === "REJECTED") {
    const { data: userRow } = await supabase
      .from("users")
      .select("points")
      .eq("id", requestRow.user_id)
      .single();

    const restoredPoints = Number(userRow?.points || 0) + Number(requestRow.requested_points || 0);
    await supabase.from("users").update({ points: restoredPoints }).eq("id", requestRow.user_id);
  }

  if (currentStatus === "REJECTED" && normalizedStatus !== "REJECTED") {
    const { data: userRow } = await supabase
      .from("users")
      .select("points")
      .eq("id", requestRow.user_id)
      .single();

    const nextPoints = Number(userRow?.points || 0) - Number(requestRow.requested_points || 0);
    if (nextPoints < 0) throw new Error("not_enough_points_to_restore_request");
    await supabase.from("users").update({ points: nextPoints }).eq("id", requestRow.user_id);
  }

  const { error: updateError } = await supabase
    .from("withdrawal_requests")
    .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (updateError) throw new Error(updateError.message || "failed_to_update_request");

  return { changed: true };
}

export async function getAdminReferralSummary(supabase: AdminSupabase) {
  const [{ data: visits }, { data: rewardedPayments }, { data: withdrawals }, { data: users }] = await Promise.all([
    supabase
      .from("referral_visits")
      .select("id, referral_code, visitor_token, signed_up_user_id, purchase_payment_id, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("payments")
      .select("id, user_id, referrer_user_id, referral_discount_percent, referral_reward_points, referral_reward_points_awarded, status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("withdrawal_requests")
      .select("id, user_id, requested_points, amount_usd, card_number, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("users")
      .select("id, email, referral_code, points"),
  ]);

  const userRows = ((users || []) as ReferralUser[]).filter((user): user is ReferralUser & { email: string } => typeof user.id === "string");
  const visitRows = (visits || []) as ReferralVisitRow[];
  const rewardRows = (rewardedPayments || []) as RewardPaymentRow[];
  const withdrawalRows = (withdrawals || []) as WithdrawalRow[];
  const userMap = new Map(userRows.map((user) => [user.id, user]));

  return {
    totals: {
      clicks: visitRows.length,
      signups: new Set(
        visitRows.map((row) => row?.signed_up_user_id).filter((value): value is string => typeof value === "string" && !!value)
      ).size,
      purchases: new Set(
        visitRows
          .map((row) => row?.purchase_payment_id)
          .filter((value): value is string => typeof value === "string" && !!value)
      ).size,
      rewardedPoints: rewardRows.reduce((sum: number, row) => {
        if (row?.referral_reward_points_awarded !== true) return sum;
        return sum + Number(row?.referral_reward_points || 0);
      }, 0),
      pendingWithdrawals: withdrawalRows.filter((row) => {
        const status = String(row?.status || "").toUpperCase();
        return status === "PENDING" || status === "PROCESSING";
      }).length,
    },
    withdrawals: withdrawalRows.map((row) => ({
      id: row.id,
      userEmail: (row.user_id ? userMap.get(row.user_id)?.email : null) || "Unknown",
      requestedPoints: Number(row.requested_points || 0),
      amountUsd: Number(row.amount_usd || 0),
      cardNumber: String(row.card_number || ""),
      status: String(row.status || "PENDING"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    topReferrers: Array.from(
      visitRows.reduce((acc: Map<string, { code: string; email: string; clicks: number; signups: Set<string>; purchases: Set<string> }>, row) => {
        const code = String(row?.referral_code || "");
        const owner = userRows.find((u) => u.referral_code === code);
        if (!owner?.id) return acc;
        if (!acc.has(owner.id)) {
          acc.set(owner.id, {
            code,
            email: owner.email,
            clicks: 0,
            signups: new Set<string>(),
            purchases: new Set<string>(),
          });
        }
        const bucket = acc.get(owner.id)!;
        bucket.clicks += 1;
        if (row?.signed_up_user_id) bucket.signups.add(row.signed_up_user_id);
        if (row?.purchase_payment_id) bucket.purchases.add(row.purchase_payment_id);
        return acc;
      }, new Map()).values()
    )
      .map((item) => ({
        code: item.code,
        email: item.email,
        clicks: item.clicks,
        signups: item.signups.size,
        purchases: item.purchases.size,
      }))
      .sort((a, b) => b.purchases - a.purchases || b.clicks - a.clicks)
      .slice(0, 20),
  };
}
