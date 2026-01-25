import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // payload — це ВСЕ що треба для Kling потім
  const payload = {
    prompt: body.prompt,
    ratio: body.ratio,
    output: body.output,
    // якщо є референс
    ref_image_url: body.ref_image_url ?? null,
  };

  // ⚠️ user_id: якщо поки немає авторизації — тимчасово передавай з фронта
  const user_id = body.user_id;

  const { data, error } = await supabase
    .from("generations")
    .insert({
      user_id,
      kind: "PHOTO",
      tier: "STANDARD",
      cost_points: Number(body.output ?? 1),
      status: "QUEUED",
      payload,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ generationId: data.id, status: "QUEUED" });
}
