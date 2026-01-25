"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Aspect } from "./types";
import RatioSelect from "./components/RatioSelect";
import { getLang, setLang, t, type Lang } from "./i18n";
import { useSession } from "next-auth/react";
import Link from "next/link";

type MediaTab = "photo" | "video";
type VideoMode = "i2v" | "motion";
type VideoQuality = "standard" | "pro";
type VideoDuration = 5 | 10;
type CharacterOrientation = "image" | "video";

function LoadingDots() {
  return (
    <span className="ldots" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

async function fileToBase64NoPrefix(file: File): Promise<string> {
  const ab = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(ab);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function normalizeErr(e: any) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e?.message) return String(e.message);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function readJsonOrRaw(res: Response) {
  const rawText = await res.text();
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

function extractTaskId(data: any): string | null {
  const tid = data?.data?.task_id || data?.task_id || data?.data?.id || data?.id;
  return typeof tid === "string" && tid.trim() ? tid : null;
}

function extractVideoUrlFromTask(data: any): string | null {
  const url = data?.data?.task_result?.videos?.[0]?.url;
  return typeof url === "string" && url.trim() ? url : null;
}

function extractUrlsFromOmniTask(data: any): string[] {
  const imgs = data?.data?.task_result?.images;
  if (!Array.isArray(imgs)) return [];
  return imgs.map((x: any) => x?.url).filter((u: any) => typeof u === "string" && u.trim());
}

function fileSig(f: File) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

export default function Home() {
  // GLOBAL
  const [mediaTab, setMediaTab] = useState<MediaTab>("photo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lang, setLangState] = useState<Lang>("uk");
  const dict = t(lang);
  const { data: session } = useSession();

  useEffect(() => {
    setLangState(getLang());
  }, []);

  // ✅ Points
  const [points, setPoints] = useState<number>(0);

  useEffect(() => {
    if (!session) {
      setPoints(0);
      return;
    }

    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.authenticated) setPoints(Number(j.user?.points ?? 0));
      })
      .catch(() => {});
  }, [session]);

  // COMMON PROMPT
  const [prompt, setPrompt] = useState("");

  // PHOTO (Omni O1)
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [srcFile2, setSrcFile2] = useState<File | null>(null);

  // R2 urls for references
  const [srcUrl, setSrcUrl] = useState<string>("");
  const [srcUrl2, setSrcUrl2] = useState<string>("");

  const [refUploading, setRefUploading] = useState(false);

  // ✅ resolution завжди 2k, без UI
  const OMNI_RESOLUTION = "2k" as const;

  // ✅ кількість генерацій (Omni O1 зазвичай 1..9)
  const [omniN, setOmniN] = useState<number>(1);

  // Settings popover state (for Images tab)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape + click outside panel (overlay handles click on backdrop)
  useEffect(() => {
    if (!settingsOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    // Lock scroll while overlay is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [settingsOpen]);

  const acceptImg = "image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png";
  const srcPreview = useMemo(() => (srcFile ? URL.createObjectURL(srcFile) : ""), [srcFile]);
  const srcPreview2 = useMemo(() => (srcFile2 ? URL.createObjectURL(srcFile2) : ""), [srcFile2]);

  // VIDEO
  const [videoMode, setVideoMode] = useState<VideoMode>("i2v");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("standard");
  const [videoDuration, setVideoDuration] = useState<VideoDuration>(5);

  const [vStartImg, setVStartImg] = useState<File | null>(null);
  const [vEndImg, setVEndImg] = useState<File | null>(null);

  const [vMotionVideo, setVMotionVideo] = useState<File | null>(null);
  const [motionPreviewUrl, setMotionPreviewUrl] = useState<string>("");
  const [vCharacterImg, setVCharacterImg] = useState<File | null>(null);
  const [characterOrientation, setCharacterOrientation] = useState<CharacterOrientation>("image");
  const [keepOriginalSound, setKeepOriginalSound] = useState(true);
  const [refVideoSeconds, setRefVideoSeconds] = useState<number>(0);

  const acceptVid = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
  const vStartPreview = useMemo(() => (vStartImg ? URL.createObjectURL(vStartImg) : ""), [vStartImg]);
  const vEndPreview = useMemo(() => (vEndImg ? URL.createObjectURL(vEndImg) : ""), [vEndImg]);
  const vCharPreview = useMemo(() => (vCharacterImg ? URL.createObjectURL(vCharacterImg) : ""), [vCharacterImg]);

  // ✅ anti-double-upload cache (fileSig -> url)
  const uploadCacheRef = useRef<Map<string, { key: string; url: string }>>(new Map());

  useEffect(() => {
    return () => {
      if (srcPreview) URL.revokeObjectURL(srcPreview);
      if (srcPreview2) URL.revokeObjectURL(srcPreview2);
      if (vStartPreview) URL.revokeObjectURL(vStartPreview);
      if (vEndPreview) URL.revokeObjectURL(vEndPreview);
      if (vCharPreview) URL.revokeObjectURL(vCharPreview);
    };
  }, [srcPreview, srcPreview2, vStartPreview, vEndPreview, vCharPreview]);

  useEffect(() => {
    if (!vMotionVideo) {
      setMotionPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(vMotionVideo);
    setMotionPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [vMotionVideo]);

  useEffect(() => {
    setError(null);
    setImageUrls([]);
  }, [mediaTab]);

  useEffect(() => {
    if (!vStartImg) setVEndImg(null);
  }, [vStartImg]);

  useEffect(() => {
    setError(null);
    if (videoMode === "i2v") {
      setVMotionVideo(null);
      setVCharacterImg(null);
    } else {
      setVStartImg(null);
      setVEndImg(null);
    }
  }, [videoMode]);

  useEffect(() => {
    if (videoMode === "motion") {
      setCharacterOrientation(refVideoSeconds > 10 ? "video" : "image");
    }
  }, [videoMode, refVideoSeconds]);

  // ✅ Правило: start+end працює тільки PRO
  useEffect(() => {
    if (videoMode === "i2v" && videoQuality === "standard" && vEndImg) {
      setVEndImg(null);
    }
  }, [videoQuality, videoMode, vEndImg]);

  // ---- R2 upload (presign-put) ----
  async function uploadToR2AndGetPublicUrl(file: File): Promise<{ key: string; url: string }> {
    const sig = fileSig(file);
    const cached = uploadCacheRef.current.get(sig);
    if (cached) return cached;

    const pres = await fetch("/api/upload/presign-put", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      }),
    }).then((r) => r.json());

    if (!pres?.uploadUrl || !pres?.key) throw new Error("Presign failed");

    const put = await fetch(pres.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    if (!base) throw new Error("Missing NEXT_PUBLIC_R2_PUBLIC_BASE_URL");
    const url = `${base.replace(/\/+$/, "")}/${String(pres.key).replace(/^\/+/, "")}`;

    const result = { key: String(pres.key), url };
    uploadCacheRef.current.set(sig, result);
    return result;
  }

  async function importRemoteToR2(remoteUrl: string, filename: string) {
    const res = await fetch("/api/r2/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: remoteUrl, filename }),
    });
    const data = await readJsonOrRaw(res);
    if (!res.ok || !data?.key) {
      throw new Error(data?.error || `Import to R2 failed (${res.status})`);
    }
    return data as { ok: true; key: string; publicUrl?: string | null };
  }

  async function pollVideoTask(opts: { kind: "image2video" | "motion-control"; taskId: string }) {
    const { kind, taskId } = opts;
    const endpoint = kind === "image2video" ? `/api/kling/image2video/${taskId}` : `/api/kling/motion-control/${taskId}`;

    const started = Date.now();
    const maxMs = 10 * 60 * 1000;
    const intervalMs = 1800;

    while (Date.now() - started < maxMs) {
      const res = await fetch(endpoint, { method: "GET" });
      const data = await readJsonOrRaw(res);

      if (!res.ok) {
        const msg = data?.error || data?.message || data?.details?.message || "Server error";
        throw new Error(msg);
      }

      const status = data?.data?.task_status;

      if (status === "succeed") {
        const vurl = extractVideoUrlFromTask(data);
        if (!vurl) throw new Error(lang === "uk" ? "Задача успішна, але нема URL відео" : "Task succeeded but no video URL");

        const imp = await importRemoteToR2(vurl, `kling_${kind}_${taskId}_${Date.now()}.mp4`);

        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: taskId,
            createdAt: Date.now(),
            prompt: prompt.trim(),
            r2Keys: [imp.key],
            urls: imp.publicUrl ? [imp.publicUrl] : [vurl],
          }),
        });

        window.open(imp.publicUrl || vurl, "_blank", "noopener,noreferrer");
        return;
      }

      if (status === "failed") {
        const msg = data?.data?.task_status_msg || data?.message || "Task failed";
        throw new Error(String(msg));
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(lang === "uk" ? "Час очікування задачі вичерпано" : "Task timeout");
  }

  async function pollOmniImageTask(taskId: string): Promise<string[]> {
    const endpoint = `/api/kling/omni-image/${taskId}`;

    const started = Date.now();
    const maxMs = 2 * 60 * 1000;
    const intervalMs = 1500;

    while (Date.now() - started < maxMs) {
      const res = await fetch(endpoint, { method: "GET" });
      const data = await readJsonOrRaw(res);

      if (!res.ok) {
        const msg = data?.error || data?.message || data?.details?.message || "Server error";
        throw new Error(msg);
      }

      if (typeof data?.code === "number" && data.code !== 0) {
        throw new Error(data?.message || "Omni error");
      }

      const status = data?.data?.task_status;

      if (status === "succeed") {
        const urls = extractUrlsFromOmniTask(data);
        if (!urls.length) throw new Error(lang === "uk" ? "Нема URL зображень у task_result" : "No image URLs");
        return urls;
      }

      if (status === "failed") {
        const msg = data?.data?.task_status_msg || data?.message || "Task failed";
        throw new Error(String(msg));
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(lang === "uk" ? "Час очікування задачі вичерпано" : "Task timeout");
  }

  // ✅ ЦІНИ
  const currentCost = useMemo(() => {
    if (mediaTab === "photo") {
      const n = Math.max(1, Math.min(9, Number(omniN) || 1));
      return n;
    }

    if (videoMode === "i2v") {
      if (videoQuality === "standard") return videoDuration === 5 ? 8 : 16;
      return videoDuration === 5 ? 14 : 28;
    }

    const perSec = videoQuality === "standard" ? 3 : 4;
    const secs = Math.min(30, Math.max(1, Math.ceil(refVideoSeconds || 0)));
    return perSec * secs;
  }, [mediaTab, omniN, videoMode, videoQuality, videoDuration, refVideoSeconds]);

  const needsAuth = !session;
  const needsBuy = !!session && points <= 0;
  const notEnoughPoints = !!session && points > 0 && points < currentCost;

  async function generate() {
    setError(null);

    if (!session) {
      window.location.href = "/auth";
      return;
    }

    if (points <= 0) {
      setError(lang === "uk" ? "У тебе 0 балів. Обери пакет у кабінеті." : "You have 0 points. Choose a package in your account.");
      return;
    }

    if (points < currentCost) {
      setError(
        lang === "uk"
          ? `Недостатньо балів. Потрібно ${currentCost}, у тебе ${points}.`
          : `Not enough points. Need ${currentCost}, you have ${points}.`
      );
      return;
    }

    if (mediaTab === "video" && videoMode === "i2v" && videoQuality === "standard" && vEndImg) {
      setError(lang === "uk" ? "Кінцеве фото (start+end) доступне тільки в PRO." : "End image (start+end) works only in PRO.");
      return;
    }

    if (mediaTab === "video" && videoMode === "motion" && vMotionVideo && (refVideoSeconds || 0) <= 0) {
      setError(lang === "uk" ? "Ще зчитую тривалість відео..." : "Still reading video duration...");
      return;
    }

    setLoading(true);
    setImageUrls([]);

    try {
      if (mediaTab === "video") {
        if (videoMode === "i2v") {
          if (!vStartImg) throw new Error(lang === "uk" ? "Потрібне початкове фото" : "Start image is required");

          const imageB64 = await fileToBase64NoPrefix(vStartImg);
          const imageTailB64 = vEndImg ? await fileToBase64NoPrefix(vEndImg) : null;

          const body: any = {
            model_name: "kling-v2-5-turbo",
            mode: videoQuality === "pro" ? "pro" : "std",
            duration: String(videoDuration),
            image: imageB64,
          };

          if (imageTailB64 && videoQuality === "pro") body.image_tail = imageTailB64;
          if (prompt.trim()) body.prompt = prompt.trim();

          const res = await fetch("/api/kling/image2video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          const data = await readJsonOrRaw(res);
          if (!res.ok) {
            const msg = data?.error || data?.message || data?.details?.message || "Server error";
            const reqId = data?.details?.request_id || data?.request_id;
            throw new Error(reqId ? `${msg} (request_id: ${reqId})` : msg);
          }

          const taskId = extractTaskId(data);
          if (!taskId) throw new Error(lang === "uk" ? "Нема task_id у відповіді" : "Missing task_id");

          await pollVideoTask({ kind: "image2video", taskId });
          return;
        }

        if (!vCharacterImg) throw new Error(lang === "uk" ? "Потрібне фото персонажа" : "Character image is required");
        if (!vMotionVideo) throw new Error(lang === "uk" ? "Потрібне відео з рухами" : "Motion video is required");

        const { url: motionUrl } = await uploadToR2AndGetPublicUrl(vMotionVideo);
        const { url: characterUrl } = await uploadToR2AndGetPublicUrl(vCharacterImg);

        const body: any = {
          mode: videoQuality === "pro" ? "pro" : "std",
          character_orientation: characterOrientation,
          keep_original_sound: keepOriginalSound ? "yes" : "no",
          image_url: characterUrl,
          video_url: motionUrl,
        };

        if (prompt.trim()) body.prompt = prompt.trim();

        const res = await fetch("/api/kling/motion-control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await readJsonOrRaw(res);
        if (!res.ok) {
          const msg = data?.error || data?.message || data?.details?.message || "Server error";
          const reqId = data?.details?.request_id || data?.request_id;
          throw new Error(reqId ? `${msg} (request_id: ${reqId})` : msg);
        }

        const taskId = extractTaskId(data);
        if (!taskId) throw new Error(lang === "uk" ? "Нема task_id у відповіді" : "Missing task_id");

        await pollVideoTask({ kind: "motion-control", taskId });
        return;
      }

      // PHOTO (Kling Omni O1)
      if (!prompt.trim()) throw new Error(lang === "uk" ? "Введи промт" : "Please enter a prompt");
      if (refUploading) throw new Error(lang === "uk" ? "Зачекай, фото ще завантажується..." : "Please wait, image is still uploading...");

      if (srcFile && !srcUrl) throw new Error(lang === "uk" ? "Не вдалось завантажити 1-е фото в R2" : "Failed to upload first image");

      const userPrompt = prompt.trim();
      const tags = srcUrl ? "<<<image_1>>> " : "";
      const finalPrompt = (tags + userPrompt).trim();

      const n = Math.max(1, Math.min(9, Number(omniN) || 1));

      const body: any = {
        model_name: "kling-image-o1",
        prompt: finalPrompt,
        n,
        resolution: OMNI_RESOLUTION,
        aspect_ratio: aspect,
      };

      if (srcUrl) body.image_1 = srcUrl;

      const res = await fetch("/api/kling/omni-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await readJsonOrRaw(res);
      if (!res.ok) {
        const msg = data?.error || data?.message || "Server error";
        throw new Error(msg);
      }
      if (typeof data?.code === "number" && data.code !== 0) {
        throw new Error(data?.message || "Omni error");
      }

      const taskId = extractTaskId(data);
      if (!taskId) throw new Error(lang === "uk" ? "Нема task_id у відповіді" : "Missing task_id");

      const urls = await pollOmniImageTask(taskId);

      const imported = await Promise.all(urls.map((u, idx) => importRemoteToR2(u, `kling_omni_${taskId}_${idx + 1}_${Date.now()}.jpg`)));

      const r2Keys = imported.map((x) => x.key);
      const publicUrls = imported.map((x, i) => x.publicUrl || urls[i]);

      setImageUrls(publicUrls);

      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: taskId,
          createdAt: Date.now(),
          prompt: userPrompt,
          r2Keys,
          urls: publicUrls,
        }),
      });
    } catch (e: any) {
      setError(normalizeErr(e));
    } finally {
      setLoading(false);
    }
  }

  const generateDisabled =
    loading ||
    refUploading ||
    needsAuth ||
    needsBuy ||
    notEnoughPoints ||
    (mediaTab === "photo"
      ? prompt.trim().length < 1
      : videoMode === "i2v"
        ? !vStartImg
        : !vCharacterImg || !vMotionVideo);

  const generateBtnText = useMemo(() => {
    if (!session) return lang === "uk" ? "Увійти" : "Sign in";
    if (points <= 0) return lang === "uk" ? "Купити бали" : "Buy points";
    if (points < currentCost) return lang === "uk" ? "Мало балів" : "Not enough points";

    const base = loading ? (lang === "uk" ? "Генерація" : "Generating") : (lang === "uk" ? "Згенерувати" : "Generate");
    return `${base} · ${currentCost}`;
  }, [session, points, currentCost, loading, lang]);

  function onGenerateClick() {
    if (!session) {
      window.location.href = "/auth";
      return;
    }
    if (points <= 0) {
      window.location.href = "/account";
      return;
    }
    if (points < currentCost) {
      window.location.href = "/account";
      return;
    }
    generate();
  }

  return (
    <div className="page-wrap">
      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          .ldots span,
          .skeleton::after {
            animation: none !important;
          }
        }

        .ldots {
          display: inline-flex;
          gap: 2px;
          margin-left: 2px;
        }
        .ldots span {
          display: inline-block;
          transform: translateY(0);
          opacity: 0.55;
          animation: dot 1.05s ease-in-out infinite;
        }
        .ldots span:nth-child(2) {
          animation-delay: 0.15s;
        }
        .ldots span:nth-child(3) {
          animation-delay: 0.3s;
        }
        @keyframes dot {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.55;
          }
          50% {
            transform: translateY(-3px);
            opacity: 0.95;
          }
        }

        .gen-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
          color: rgba(255, 255, 255, 0.9);
          font-weight: 650;
        }

        .skeleton {
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          height: 260px;
          max-width: 520px;
        }
        .skeleton::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-60%);
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.12) 45%,
            rgba(255, 255, 255, 0) 90%
          );
          animation: shimmer 1.25s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% {
            transform: translateX(-60%);
          }
          100% {
            transform: translateX(60%);
          }
        }

        .seg {
          display: inline-flex;
          gap: 6px;
          padding: 6px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
        }
        .seg button {
          border-radius: 999px;
          padding: 8px 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          font-weight: 650;
        }
        .seg button.active {
          background: rgba(10, 132, 255, 0.28);
          border-color: rgba(10, 132, 255, 0.35);
        }

        .tabs {
          display: flex;
          justify-content: center;
          margin-bottom: 14px;
        }
        .tabsWrap {
          display: inline-flex;
          gap: 6px;
          padding: 6px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.25);
        }
        .tabBtn {
          border-radius: 999px;
          padding: 10px 18px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.82);
          cursor: pointer;
          font-weight: 750;
          letter-spacing: 0.2px;
          min-width: 120px;
          transition: transform 0.15s ease, filter 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }
        .tabBtn:hover {
          filter: brightness(1.05);
          transform: translateY(-1px);
        }
        .tabBtnActive {
          background: rgba(10, 132, 255, 0.28);
          border-color: rgba(10, 132, 255, 0.35);
          color: rgba(255, 255, 255, 0.92);
        }

        .vRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 12px;
        }
        .vPill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          color: rgba(255, 255, 255, 0.9);
          font-weight: 650;
        }
        .vSelect {
          border-radius: 999px;
          padding: 8px 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.22);
          color: rgba(255, 255, 255, 0.9);
          outline: none;
        }

        .uploadRow {
          display: flex;
          gap: 20px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .uploadTile {
          width: 170px;
          height: 170px;
          border-radius: 26px;
          position: relative;
          overflow: hidden;
          cursor: pointer;

          border: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.035));
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);

          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.09),
            inset 0 0 0 1px rgba(255, 255, 255, 0.04);

          transition: transform 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
          user-select: none;
        }

        .uploadTile:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.14);
          filter: brightness(1.02);
        }

        .uploadTile img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .uploadPlus {
          position: absolute;
          top: 18px;
          left: 18px;
          font-size: 64px;
          font-weight: 650;
          line-height: 1;
          color: rgba(255, 255, 255, 0.28);
          user-select: none;
          pointer-events: none;
        }

        .tile-label {
          position: absolute;
          left: 16px;
          bottom: 14px;
          font-size: 14px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.6);
          text-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
          pointer-events: none;
          transition: color 0.12s ease, opacity 0.12s ease;
          opacity: 0.95;
        }
        .uploadTile:hover .tile-label {
          color: rgba(255, 255, 255, 0.96);
          opacity: 1;
        }
        .tile-remove {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.45);
          border: none;
          color: #fff;
          border-radius: 8px;
          padding: 6px 8px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.12s ease, transform 0.12s ease;
        }
        .uploadTile:hover .tile-remove {
          opacity: 1;
          transform: translateY(0);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
          margin-top: 14px;
          max-width: 900px;
        }
        .thumb {
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
        }
        .thumb img {
          width: 100%;
          height: auto;
          display: block;
        }

        /* ===== Settings trigger button ===== */
        .settings-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.06);
          cursor: pointer;
          font-weight: 600;
        }

        /* ===== New overlay popover (doesn't shift layout) ===== */
        .settingsOverlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          justify-content: flex-end;
          align-items: flex-start;
          padding: 16px;
        }

        .settingsPanel {
          width: min(420px, calc(100vw - 32px));
          background: rgba(6, 8, 12, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 12px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px) saturate(120%);
          -webkit-backdrop-filter: blur(12px) saturate(120%);
          max-height: calc(100dvh - 32px);
          overflow: auto;
          -webkit-overflow-scrolling: touch;
        }

        .settingsGroup {
          margin-bottom: 10px;
        }
        .groupTitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.75);
          margin-bottom: 6px;
        }
        .groupButtons button {
          margin-right: 6px;
          margin-bottom: 6px;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
          color: #fff;
          cursor: pointer;
        }
        .groupButtons button.active {
          background: rgba(10, 132, 255, 0.18);
          border-color: rgba(10, 132, 255, 0.28);
          color: #fff;
        }

        @media (max-width: 640px) {
          .settingsOverlay {
            justify-content: center;
            align-items: flex-end;
            padding: 0;
          }
          .settingsPanel {
            width: 100%;
            border-radius: 16px 16px 0 0;
            max-height: 75dvh;
            padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
          }
        }
      `}</style>

      {/* Topbar */}
      <div className="topbar">
        <div style={{ flex: 1 }} />
        <div className="topbar-right">
          <button
            className={`ios-btn ${lang === "uk" ? "ios-btn--primary" : "ios-btn--ghost"}`}
            onClick={() => {
              setLang("uk");
              setLangState("uk");
            }}
          >
            UA
          </button>
          <button
            className={`ios-btn ${lang === "en" ? "ios-btn--primary" : "ios-btn--ghost"}`}
            onClick={() => {
              setLang("en");
              setLangState("en");
            }}
          >
            EN
          </button>

          {session ? (
            <>
              <Link className="ios-btn ios-btn--ghost" href="/history" style={{ textDecoration: "none" }}>
                {dict.history}
              </Link>

              <Link
                className="ios-btn ios-btn--ghost"
                href="/account"
                style={{
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
                title="Кабінет"
              >
                <span style={{ fontWeight: 800 }}>{points}</span>
                <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block" }}>
                  <path
                    fill="rgba(255,255,255,0.92)"
                    d="M32 2l6.2 18.7L57 27l-18.8 6.3L32 52l-6.2-18.7L7 27l18.8-6.3L32 2zm20 30l3.1 9.4L64 44l-8.9 3L52 56l-3.1-9.4L40 44l8.9-3L52 32zM12 40l2.6 7.8L22 50l-7.4 2.5L12 60l-2.6-7.8L2 50l7.4-2.5L12 40z"
                  />
                </svg>
              </Link>
            </>
          ) : (
            <Link className="ios-btn ios-btn--primary" href="/auth" style={{ textDecoration: "none" }}>
              {dict.signIn}
            </Link>
          )}
        </div>
      </div>

      {/* Main card */}
      <div className="glass-card">
        {/* Tabs */}
        <div className="tabs">
          <div className="tabsWrap" role="tablist" aria-label="media tabs">
            <button
              type="button"
              role="tab"
              aria-selected={mediaTab === "photo"}
              className={`tabBtn ${mediaTab === "photo" ? "tabBtnActive" : ""}`}
              onClick={() => setMediaTab("photo")}
            >
              {dict.image}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mediaTab === "video"}
              className={`tabBtn ${mediaTab === "video" ? "tabBtnActive" : ""}`}
              onClick={() => setMediaTab("video")}
            >
              {dict.video}
            </button>
          </div>
        </div>

        {/* PHOTO UI */}
        {mediaTab === "photo" && (
          <>
            <div className="uploadRow">
              <div
                className="uploadTile"
                role="button"
                tabIndex={0}
                aria-label={lang === "uk" ? "Завантажити фото" : "Upload image"}
                onClick={() => (document.getElementById("file1") as HTMLInputElement | null)?.click()}
                onKeyDown={(e) => e.key === "Enter" && (document.getElementById("file1") as HTMLInputElement | null)?.click()}
              >
                {srcPreview ? (
                  <>
                    <img src={srcPreview} alt="reference1" />
                    <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                    <button
                      type="button"
                      className="tile-remove"
                      aria-label={lang === "uk" ? "Видалити референс" : "Remove reference"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSrcFile(null);
                        setSrcUrl("");
                      }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="uploadPlus">+</span>
                    <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                  </>
                )}
              </div>

              <input
                id="file1"
                type="file"
                accept={acceptImg}
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;

                  setError(null);
                  setSrcFile(f);
                  setSrcUrl("");

                  if (!f) return;

                  try {
                    setRefUploading(true);
                    const { url } = await uploadToR2AndGetPublicUrl(f);
                    setSrcUrl(url);
                  } catch (err: any) {
                    setError(normalizeErr(err));
                  } finally {
                    setRefUploading(false);
                  }
                }}
              />
            </div>

            {/* Settings trigger */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <button
                type="button"
                className="vPill settings-pill"
                onClick={() => setSettingsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
              >
                <strong style={{ marginRight: 8 }}>{aspect}</strong>
                <span style={{ opacity: 0.75 }}>· {omniN}</span>
              </button>

              {refUploading && (
                <div className="gen-pill">
                  <span>
                    {lang === "uk" ? "Завантаження фото" : "Uploading image"}
                    <LoadingDots />
                  </span>
                </div>
              )}
            </div>

            {/* Overlay settings */}
            {settingsOpen && (
              <div
                className="settingsOverlay"
                role="dialog"
                aria-label="Settings"
                onMouseDown={() => setSettingsOpen(false)}
                onTouchStart={() => setSettingsOpen(false)}
              >
                <div
                  ref={settingsPanelRef}
                  className="settingsPanel"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <div className="settingsGroup">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <RatioSelect value={aspect} onChange={setAspect} lang={lang} />
                    </div>
                  </div>

                  <div className="settingsGroup">
                    <div className="groupTitle">{lang === "uk" ? "Кількість" : "Output"}</div>
                    <div className="groupButtons">
                      {Array.from({ length: 9 }, (_, i) => i + 1).map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={omniN === k ? "active" : ""}
                          onClick={() => setOmniN(k)}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" className="ios-btn ios-btn--ghost" onClick={() => setSettingsOpen(false)}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            )}

            <textarea
              className="ios-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lang === "uk" ? "Опиши що потрібно зробити..." : "Describe what you want..."}
            />
          </>
        )}

        {/* VIDEO UI */}
        {mediaTab === "video" && (
          <>
            <div className="seg" style={{ marginTop: 4 }}>
              <button className={videoMode === "i2v" ? "active" : ""} onClick={() => setVideoMode("i2v")} type="button">
                {lang === "uk" ? "Картинка → Відео" : "Image → Video"}
              </button>
              <button className={videoMode === "motion" ? "active" : ""} onClick={() => setVideoMode("motion")} type="button">
                {lang === "uk" ? "Контроль рухів" : "Motion Control"}
              </button>
            </div>

            {videoMode === "i2v" ? (
              <>
                <div className="uploadRow">
                  <div
                    className="uploadTile"
                    role="button"
                    tabIndex={0}
                    aria-label={lang === "uk" ? "Початкове фото" : "Start image"}
                    onClick={() => (document.getElementById("vStart") as HTMLInputElement | null)?.click()}
                  >
                    {vStartPreview ? (
                      <>
                        <img src={vStartPreview} alt="video-start" />
                        <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                      </>
                    ) : (
                      <>
                        <span className="uploadPlus">+</span>
                        <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                      </>
                    )}
                  </div>

                  <input
                    id="vStart"
                    type="file"
                    accept={acceptImg}
                    style={{ display: "none" }}
                    onChange={(e) => setVStartImg(e.target.files?.[0] ?? null)}
                  />

                  {vStartImg && videoQuality === "pro" && (
                    <>
                      <div
                        className="uploadTile"
                        role="button"
                        tabIndex={0}
                        aria-label={lang === "uk" ? "Кінцеве фото (тільки PRO)" : "End image (PRO only)"}
                        onClick={() => (document.getElementById("vEnd") as HTMLInputElement | null)?.click()}
                      >
                        {vEndPreview ? (
                          <>
                            <img src={vEndPreview} alt="video-end" />
                            <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                          </>
                        ) : (
                          <>
                            <span className="uploadPlus">+</span>
                            <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                          </>
                        )}
                      </div>

                      <input
                        id="vEnd"
                        type="file"
                        accept={acceptImg}
                        style={{ display: "none" }}
                        onChange={(e) => setVEndImg(e.target.files?.[0] ?? null)}
                      />
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="uploadRow">
                  <div
                    className="uploadTile"
                    role="button"
                    tabIndex={0}
                    aria-label={lang === "uk" ? "Відео з рухами" : "Motion video"}
                    onClick={() => (document.getElementById("vMotion") as HTMLInputElement | null)?.click()}
                  >
                    {motionPreviewUrl ? (
                      <>
                        <video
                          src={motionPreviewUrl}
                          muted
                          playsInline
                          controls
                          preload="metadata"
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                        />
                        <span className="tile-label">{lang === "uk" ? "Відео" : "Video"}</span>
                      </>
                    ) : (
                      <>
                        <span className="uploadPlus">+</span>
                        <span className="tile-label">{lang === "uk" ? "Відео" : "Video"}</span>
                      </>
                    )}
                  </div>

                  <input
                    id="vMotion"
                    type="file"
                    accept={acceptVid}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      setVMotionVideo(f);
                      if (!f) {
                        setRefVideoSeconds(0);
                        return;
                      }
                      try {
                        const url = URL.createObjectURL(f);
                        const vid = document.createElement("video");
                        vid.preload = "metadata";
                        vid.src = url;
                        await new Promise((resolve) => {
                          vid.onloadedmetadata = () => {
                            const secs = Math.round(vid.duration || 0);
                            setRefVideoSeconds(secs);
                            resolve(true);
                          };
                          vid.onerror = () => {
                            setRefVideoSeconds(0);
                            resolve(true);
                          };
                        });
                        URL.revokeObjectURL(url);
                      } catch {
                        setRefVideoSeconds(0);
                      }
                    }}
                  />

                  <div
                    className="uploadTile"
                    role="button"
                    tabIndex={0}
                    aria-label={lang === "uk" ? "Фото персонажа" : "Character image"}
                    onClick={() => (document.getElementById("vChar") as HTMLInputElement | null)?.click()}
                  >
                    {vCharPreview ? (
                      <>
                        <img src={vCharPreview} alt="character" />
                        <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                      </>
                    ) : (
                      <>
                        <span className="uploadPlus">+</span>
                        <span className="tile-label">{lang === "uk" ? "Фото" : "Photo"}</span>
                      </>
                    )}
                  </div>

                  <input
                    id="vChar"
                    type="file"
                    accept={acceptImg}
                    style={{ display: "none" }}
                    onChange={(e) => setVCharacterImg(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div className="vRow">
                  <div className="vPill">
                    <span style={{ opacity: 0.75 }}>{lang === "uk" ? "Тривалість референсу" : "Reference duration"}</span>
                    <span style={{ opacity: 0.9, marginLeft: 8 }}>{Math.min(30, Math.ceil(refVideoSeconds || 0))}с</span>
                  </div>

                  <div className="vPill" style={{ cursor: "pointer" }} onClick={() => setKeepOriginalSound((v) => !v)}>
                    <span style={{ opacity: 0.75 }}>{lang === "uk" ? "Аудіо" : "Audio"}</span>
                    <span style={{ opacity: 0.9 }}>{keepOriginalSound ? "ON" : "OFF"}</span>
                  </div>
                </div>
              </>
            )}

            <div className="vRow">
              <div className="vPill">
                <span style={{ opacity: 0.75 }}>{lang === "uk" ? "Якість" : "Quality"}</span>
                <select className="vSelect" value={videoQuality} onChange={(e) => setVideoQuality(e.target.value as VideoQuality)}>
                  <option value="standard">Standard</option>
                  <option value="pro">Professional</option>
                </select>
              </div>

              {videoMode === "i2v" && (
                <div className="vPill">
                  <span style={{ opacity: 0.75 }}>{lang === "uk" ? "Тривалість" : "Duration"}</span>
                  <select className="vSelect" value={String(videoDuration)} onChange={(e) => setVideoDuration(Number(e.target.value) as VideoDuration)}>
                    <option value="5">5s</option>
                    <option value="10">10s</option>
                  </select>
                </div>
              )}
            </div>

            <textarea
              className="ios-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lang === "uk" ? "Опиши що потрібно зробити (опційно)..." : "Describe what you want (optional)..."}
            />
          </>
        )}

        {(needsAuth || needsBuy || notEnoughPoints) && (
          <div style={{ marginTop: 10, opacity: 0.9 }}>
            {needsAuth && <div>Щоб генерувати — увійди через Google.</div>}
            {needsBuy && (
              <div>
                У тебе 0 балів —{" "}
                <Link href="/account" style={{ textDecoration: "underline" }}>
                  обери пакет балів
                </Link>
                .
              </div>
            )}
            {notEnoughPoints && (
              <div>
                Недостатньо балів —{" "}
                <Link href="/account" style={{ textDecoration: "underline" }}>
                  поповнити
                </Link>
                .
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button className="ios-btn ios-btn--primary" onClick={onGenerateClick} disabled={generateDisabled}>
            {generateBtnText}
          </button>

          {(loading || refUploading) && (
            <div className="gen-pill">
              <span>
                {loading ? dict.generating : lang === "uk" ? "Завантаження фото" : "Uploading image"}
                <LoadingDots />
              </span>
            </div>
          )}

          {error && (
            <div style={{ color: "rgba(255, 120, 120, 0.95)", maxWidth: 680, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {loading && imageUrls.length === 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="skeleton" />
        </div>
      )}

      {imageUrls.length > 0 && (
        <div className="grid">
          {imageUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="generated" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
