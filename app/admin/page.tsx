'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type AdminReferralData = {
  totals: {
    clicks: number;
    signups: number;
    purchases: number;
    rewardedPoints: number;
    pendingWithdrawals: number;
  };
  withdrawals: Array<{
    id: string;
    userEmail: string;
    requestedPoints: number;
    amountUsd: number;
    cardNumber: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  topReferrers: Array<{
    code: string;
    email: string;
    clicks: number;
    signups: number;
    purchases: number;
  }>;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminPage() {
  const aspectOptions = ['1:1', '16:9', '9:16'] as const;
  const modelOptions = [
    { value: 'chatgpt', label: 'ChatGPT' },
    { value: 'nano-banana', label: 'Nano Banana' },
  ] as const;

  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [preferredAspect, setPreferredAspect] = useState<(typeof aspectOptions)[number]>('9:16');
  const [preferredModel, setPreferredModel] = useState<(typeof modelOptions)[number]['value']>('nano-banana');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const [refData, setRefData] = useState<AdminReferralData | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [refMsg, setRefMsg] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('admin_ok');
      const storedPassword = localStorage.getItem('admin_password');
      if (stored === '1') {
        setAuthenticated(true);
      }
      if (storedPassword) {
        setPassword(storedPassword);
      }
    }
  }, []);

  const loadReferralData = useCallback(async (pass = password) => {
    if (!pass) return;
    try {
      setRefLoading(true);
      setRefMsg('');

      const res = await fetch('/api/admin/referrals', {
        headers: { 'x-admin-password': pass },
        cache: 'no-store',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Не вдалося завантажити рефералку');
      }

      setRefData(data);
    } catch (error: unknown) {
      setRefMsg(`❌ ${getErrorMessage(error, 'Помилка завантаження')}`);
    } finally {
      setRefLoading(false);
    }
  }, [password]);

  const handleLogin = async () => {
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
        localStorage.setItem('admin_password', password);
      }
      await loadReferralData(password);
    } else {
      setAuthError('❌ Неправильний пароль');
    }
  };

  const canSave = useMemo(() => {
    return title.trim().length > 0 && prompt.trim().length > 0 && !!file && !saving;
  }, [title, prompt, file, saving]);

  useEffect(() => {
    if (authenticated && password) {
      void loadReferralData(password);
    }
  }, [authenticated, password, loadReferralData]);

  const onCreate = async () => {
    try {
      setSaving(true);
      setMsg('');

      if (!file) {
        setMsg('Додай картинку превʼю');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('prompt', prompt.trim());
      formData.append('preferred_aspect', preferredAspect);
      formData.append('preferred_model', preferredModel);
      formData.append('sort_order', String(sortOrder));
      formData.append('is_active', String(isActive));

      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Помилка збереження');
      }

      setTitle('');
      setPrompt('');
      setPreferredAspect('9:16');
      setPreferredModel('nano-banana');
      setSortOrder(0);
      setIsActive(true);
      setFile(null);

      setMsg('✅ Шаблон додано!');
    } catch (error: unknown) {
      setMsg(`❌ Помилка: ${getErrorMessage(error, 'невідома')}`);
    } finally {
      setSaving(false);
    }
  };

  const updateWithdrawalStatus = async (requestId: string, status: string) => {
    try {
      setRefMsg('');
      const res = await fetch('/api/admin/referrals', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ requestId, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не вдалося змінити статус');
      }
      setRefData(data.data);
      setRefMsg(`✅ Статус заявки ${requestId.slice(0, 8)} оновлено до ${status}`);
    } catch (error: unknown) {
      setRefMsg(`❌ ${getErrorMessage(error, 'Помилка оновлення статусу')}`);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 16, display: 'grid', gap: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 0 }}>Admin</h1>

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
        <>
          <section style={{ display: 'grid', gap: 12, padding: 18, borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Реферальна аналітика</h2>
              <button onClick={() => loadReferralData()} style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer' }}>
                {refLoading ? 'Оновлюю...' : 'Оновити'}
              </button>
            </div>

            {refData ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  {[
                    ['Переходи', refData.totals.clicks],
                    ['Авторизації', refData.totals.signups],
                    ['Покупки', refData.totals.purchases],
                    ['Нараховано балів', refData.totals.rewardedPoints],
                    ['Активні заявки', refData.totals.pendingWithdrawals],
                  ].map(([label, value]) => (
                    <div key={String(label)} style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: 13, opacity: 0.7 }}>{label}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <h3 style={{ margin: 0 }}>Топ реферерів</h3>
                  {refData.topReferrers.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>Ще немає даних.</div>
                  ) : (
                    refData.topReferrers.map((item) => (
                      <div
                        key={`${item.code}-${item.email}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr repeat(3, minmax(80px, 120px))',
                          gap: 12,
                          padding: 12,
                          borderRadius: 12,
                          background: 'rgba(255,255,255,0.04)',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.email}</div>
                          <div style={{ opacity: 0.7 }}>ref: {item.code}</div>
                        </div>
                        <div>Переходи: {item.clicks}</div>
                        <div>Логіни: {item.signups}</div>
                        <div>Покупки: {item.purchases}</div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <h3 style={{ margin: 0 }}>Заявки на вивід</h3>
                  {refData.withdrawals.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>Заявок ще немає.</div>
                  ) : (
                    refData.withdrawals.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'grid',
                          gap: 10,
                          padding: 14,
                          borderRadius: 14,
                          background: 'rgba(255,255,255,0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{item.userEmail}</div>
                            <div style={{ opacity: 0.7 }}>Картка: {item.cardNumber}</div>
                            <div style={{ opacity: 0.7 }}>
                              {item.requestedPoints} балів / ${item.amountUsd.toFixed(2)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700 }}>{item.status}</div>
                            <div style={{ opacity: 0.7 }}>{formatDate(item.createdAt)}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {['PENDING', 'PROCESSING', 'PAID', 'REJECTED'].map((status) => (
                            <button
                              key={status}
                              onClick={() => updateWithdrawalStatus(item.id, status)}
                              disabled={item.status === status}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 10,
                                cursor: item.status === status ? 'default' : 'pointer',
                                opacity: item.status === status ? 0.5 : 1,
                              }}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.7 }}>{refLoading ? 'Завантажую...' : 'Немає даних.'}</div>
            )}

            {refMsg && <div>{refMsg}</div>}
          </section>

          <section style={{ display: 'grid', gap: 12, padding: 18, borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)' }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Templates</h2>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label>
                Формат за замовчуванням
                <select
                  value={preferredAspect}
                  onChange={(e) => setPreferredAspect(e.target.value as (typeof aspectOptions)[number])}
                  style={{ width: '100%', padding: 10, marginTop: 6 }}
                >
                  {aspectOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Модель за замовчуванням
                <select
                  value={preferredModel}
                  onChange={(e) => setPreferredModel(e.target.value as (typeof modelOptions)[number]['value'])}
                  style={{ width: '100%', padding: 10, marginTop: 6 }}
                >
                  {modelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
          </section>
        </>
      )}
    </div>
  );
}
