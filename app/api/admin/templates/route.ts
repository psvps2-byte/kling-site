import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminSupabase();
    const formData = await req.formData();

    const title = String(formData.get('title') || '').trim();
    const prompt = String(formData.get('prompt') || '').trim();
    const section_key = String(formData.get('section_key') || 'popular').trim() || 'popular';
    const preferred_aspect = String(formData.get('preferred_aspect') || '9:16').trim() || '9:16';
    const preferred_model = String(formData.get('preferred_model') || 'nano-banana').trim() || 'nano-banana';
    const sort_order = Number(formData.get('sort_order') || 0);
    const is_active = formData.get('is_active') === 'true';
    const file = formData.get('file') as File | null;

    if (!title || !prompt || !file) {
      return NextResponse.json(
        { error: 'Missing fields' },
        { status: 400 }
      );
    }

    // ---- upload preview image ----
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `previews/${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('template-previews')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase
      .storage
      .from('template-previews')
      .getPublicUrl(path);

    // ---- insert template ----
    const { error: insertError } = await supabase
      .from('templates')
      .insert({
        title,
        prompt,
        preview_url: publicData.publicUrl,
        section_key,
        preferred_aspect,
        preferred_model,
        sort_order,
        is_active,
      });

    if (insertError) throw insertError;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Server error' },
      { status: 500 }
    );
  }
}
