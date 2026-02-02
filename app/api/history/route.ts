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
  // URL беремо з SUPABASE_URL (серверний) або NEXT_PUBLIC_SUPABASE_URL (як запасний)
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function getUserIdByEmail(
  admin: ReturnType<typeof getAdminSupabase>,
  email: string
) {
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

function asString(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function GET() {
  try {
    // 1) AUTH (NextAuth)
    const session = await getServerSession(authOptions);
    const email = asString(session?.user?.email).trim();

    if (!email) return noStoreJson({ error: "Not authenticated" }, { status: 401 });

    // 2) ADMIN supabase (service role) + отримати user_id
    const admin = getAdminSupabase();
    const user_id = await getUserIdByEmail(admin, email);

    // 3) Взяти ТІЛЬКИ свої генерації
    const { data, error } = await admin
      .from("generations")
      .select("id, created_at, kind, status, result_url")
      .eq("user_id", user_id) // ✅ ключова штука
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return noStoreJson(
        { error: "Failed to read history", details: error.message },
        { status: 500 }
      );
    }

    // 4) Додатковий захист від "чужих/битих" карток:
    //    не повертаємо записи без result_url, щоб не з’являлось "Немає превʼю".
    const items = (data ?? [])
      .filter((row: any) => {
        const url = asString(row?.result_url).trim();
        return url.length > 10; // простий фільтр: якщо URL нормальний — показуємо
      })
      .map((row: any) => {
        const direct = asString(row.result_url).trim();
        return {
          id: row.id,
          createdAt: row.created_at,
          kind: row.kind,
          status: row.status,
          urls: [direct],
        };
      });

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
    // 1) AUTH (NextAuth)
    const session = await getServerSession(authOptions);
    const email = asString(session?.user?.email).trim();

    if (!email) return noStoreJson({ error: "Not authenticated" }, { status: 401 });

    // 2) id з query
    const id = asString(req.nextUrl.searchParams.get("id")).trim();
    if (!id) return noStoreJson({ error: "Missing id" }, { status: 400 });

    // 3) ADMIN supabase + user_id
    const admin = getAdminSupabase();
    const user_id = await getUserIdByEmail(admin, email);

    // 4) Видаляти тільки своє
    const { error } = await admin
      .from("generations")
      .delete()
      .eq("id", id)
      .eq("user_id", user_id); // ✅ другий захист

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
