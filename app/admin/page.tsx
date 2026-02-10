'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>('');

  // Check localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('admin_ok');
      if (stored === '1') {
        setAuthenticated(true);
      }
    }
  }, []);

  const handleLogin = () => {
    const correctPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    
    if (!correctPassword) {
      setAuthError('❌ NEXT_PUBLIC_ADMIN_PASSWORD не налаштовано');
      return;
    }

    if (password === correctPassword) {
      setAuthenticated(true);
      setAuthError('');
      if (typeof window !== 'undefined') {
        localStorage.setItem('admin_ok', '1');
      }
    } else {
      setAuthError('❌ Неправильний пароль');
    }
  };

  const canSave = useMemo(() => {
    return title.trim().length > 0 && prompt.trim().length > 0 && !!file && !saving;
  }, [title, prompt, file, saving]);

  const uploadPreview = async (f: File) => {
    const ext = f.name.split('.').pop() || 'jpg';
    const path = `previews/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: uploadErr } = await supabase
      .storage
      .from('template-previews')
      .upload(path, f, { upsert: false });

    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from('template-previews').getPublicUrl(path);
    return data.publicUrl;
  };

  const onCreate = async () => {
    try {
      setSaving(true);
      setMsg('');

      if (!file) {
        setMsg('Додай картинку превʼю');
        return;
      }

      const previewUrl = await uploadPreview(file);

      const { error } = await supabase.from('templates').insert({
        title: title.trim(),
        prompt: prompt.trim(),
        preview_url: previewUrl,
        is_active: isActive,
        sort_order: sortOrder,
      });

      if (error) throw error;

      setTitle('');
      setPrompt('');
      setSortOrder(0);
      setIsActive(true);
      setFile(null);

      setMsg('✅ Шаблон додано!');
    } catch (e: any) {
      setMsg(`❌ Помилка: ${e?.message || 'невідома'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Admin: Templates</h1>

      {!authenticated ? (
        <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              style={{ width: '100%', padding: 10, marginTop: 6 }}
              placeholder="Введи пароль..."
            />
          </label>

          <button
            onClick={handleLogin}
            style={{
              padding: 12,
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Увійти
          </button>

          {authError && <div style={{ color: '#ff6b6b', marginTop: 8 }}>{authError}</div>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
        <label>
          Назва (title)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%', padding: 10, marginTop: 6 }}
            placeholder="Valentine's Day"
          />
        </label>

        <label>
          Prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ width: '100%', padding: 10, marginTop: 6, minHeight: 120 }}
            placeholder="Опиши промпт..."
          />
        </label>

        <label>
          Sort order
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            style={{ width: '100%', padding: 10, marginTop: 6 }}
          />
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Активний
        </label>

        <label>
          Preview image (jpg/png)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ width: '100%', padding: 10, marginTop: 6 }}
          />
        </label>

        <button
          onClick={onCreate}
          disabled={!canSave}
          style={{
            padding: 12,
            borderRadius: 10,
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.5,
            fontWeight: 600,
          }}
        >
          {saving ? 'Зберігаю...' : 'Додати шаблон'}
        </button>

        {msg && <div style={{ marginTop: 8 }}>{msg}</div>}

        <div style={{ marginTop: 24, fontSize: 13, opacity: 0.8 }}>
          Відкрий: <b>/admin</b>
        </div>
      </div>
      )}
    </div>
  );
}
