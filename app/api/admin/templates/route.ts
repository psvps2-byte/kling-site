import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const title = String(formData.get('title') || '').trim();
    const prompt = String(formData.get('prompt') || '').trim();
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
