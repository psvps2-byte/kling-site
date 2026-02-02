// app/api/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    },
  });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function getMyUserIdByEmail(supabase: ReturnType<typeof getSupabaseAdmin>, email: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (error || !data?.id) {
    throw new Error(`User not found for email: ${email}`);
  }
  return data.id as string;
}

export async function GET() {
  try {
    // 1) беремо користувача через NextAuth
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
      return noStoreJson({ error: "Not authenticated" }, { status: 401 });
    }

    // 2) супабейс адмін (server only)
    const supabase = getSupabaseAdmin();

    // 3) знаходимо свій user_id (з public.users)
    const user_id = await getMyUserIdByEmail(supabase, email);

    // 4) забираємо ТІЛЬКИ свої генерації
    const { data, error } = await supabase
      .from("generations")
      .select("id, created_at, kind, status, result_url")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return noStoreJson(
        { error: "Failed to read history", details: error.message },
        { status: 500 }
      );
    }

    const items = (data ?? []).map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      kind: row.kind,
      status: row.status,
      urls: typeof row.result_url === "string" && row.result_url ? [row.result_url] : [],
    }));

    return noStoreJson(items);
  } catch (e: any) {
    return noStoreJson(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
      return noStoreJson({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const user_id = await getMyUserIdByEmail(supabase, email);

    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) return noStoreJson({ error: "Missing id" }, { status: 400 });

    // ВАЖЛИВО: видаляємо тільки якщо це рядок цього юзера
    const { error } = await supabase
      .from("generations")
      .delete()
      .eq("id", id)
      .eq("user_id", user_id);

    if (error) {
      return noStoreJson(
        { error: "Failed to delete", details: error.message },
        { status: 500 }
      );
    }

    return noStoreJson({ ok: true });
  } catch (e: any) {
    return noStoreJson(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
