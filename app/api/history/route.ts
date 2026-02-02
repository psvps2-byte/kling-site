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

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function getUserIdByEmail(admin: ReturnType<typeof getAdminSupabase>, email: string) {
  const { data, error } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (error || !data?.id) {
    throw new Error(`User not found by email. ${error?.message ?? ""}`);
  }

  return data.id as string;
}

export async function GET() {
  try {
    // 1) AUTH (NextAuth)
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) return noStoreJson({ error: "Not authenticated" }, { status: 401 });

    // 2) ADMIN client (але з ЖОРСТКИМ фільтром по user_id)
    const admin = getAdminSupabase();
    const user_id = await getUserIdByEmail(admin, email);

    // 3) Беремо ТІЛЬКИ свої генерації
    const { data, error } = await admin
      .from("generations")
      .select("id, created_at, kind, status, result_url")
      .eq("user_id", user_id) // ✅ критично важливо
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return noStoreJson({ error: "Failed to read history", details: error.message }, { status: 500 });
    }

    // 4) Формат під твій фронт (urls масив)
    const items = (data ?? []).map((row: any) => {
      const direct = typeof row.result_url === "string" ? row.result_url : null;
      return {
        id: row.id,
        createdAt: row.created_at,
        kind: row.kind,
        status: row.status,
        urls: direct ? [direct] : [],
      };
    });

    return noStoreJson(items);
  } catch (e: any) {
    return noStoreJson({ error: "Server error", details: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // 1) AUTH (NextAuth)
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) return noStoreJson({ error: "Not authenticated" }, { status: 401 });

    // 2) id з query
    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) return noStoreJson({ error: "Missing id" }, { status: 400 });

    // 3) ADMIN client + user_id
    const admin = getAdminSupabase();
    const user_id = await getUserIdByEmail(admin, email);

    // 4) Видаляємо ТІЛЬКИ своє
    const { error } = await admin
      .from("generations")
      .delete()
      .eq("id", id)
      .eq("user_id", user_id); // ✅ критично важливо

    if (error) {
      return noStoreJson({ error: "Failed to delete", details: error.message }, { status: 500 });
    }

    return noStoreJson({ ok: true });
  } catch (e: any) {
    return noStoreJson({ error: "Server error", details: String(e?.message ?? e) }, { status: 500 });
  }
}
