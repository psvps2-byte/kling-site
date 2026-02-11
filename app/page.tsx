"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Aspect } from "./types";
import { getLang, setLang, t, type Lang } from "./i18n";
import { useSession } from "next-auth/react";
import Link from "next/link";
import LegalMenu from "./components/LegalMenu";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null);

  // Load templates from Supabase
  useEffect(() => {
    const loadTemplates = async () => {
      const { data } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (data) setTemplates(data);
    };

    loadTemplates();
  }, []);

  // GLOBAL
  const [mediaTab, setMediaTab] = useState<MediaTab>("photo");

//   {
//     id: "0001",
//     title: "Valentine’s Day",
//     preview: "/templates/0001.jpg",
//     prompt: "Stylish studio portrait of a woman, shot from a top-down overhead angle (flat lay perspective), with the camera positioned directly above her. She is lying flat on her back on a surface completely covered with unfolded black-and-white newspapers, creating a textured editorial background. Her head is centered in the frame, with voluminous hair symmetrically and artistically spread around it, forming a soft halo shape. The composition is balanced and clean, with a strong central focus. She is wearing a bright red tailored blazer with a deep neckline, revealing a black choker underneath. On her face are fashionable cat-eye sunglasses with a red tortoiseshell frame. The makeup is glamorous and flawless: perfectly sculpted eyebrows, smooth porcelain-like skin, and rich glossy red lips. She is looking straight into the camera lens with a confident, elegant, and subtly seductive expression. Around her are carefully arranged Valentine’s Day elements: vivid red roses placed along the edges of the frame and several red heart-shaped balloons partially entering the composition, adding depth and visual contrast. In her hands, positioned across her torso, she is holding a folded newspaper at a slight diagonal angle. The newspaper is clearly visible and in sharp focus, with a clean white front page and a handwritten-style red headline reading “Valentine’s Day”, bold and legible, resembling editorial calligraphy. Her hands are relaxed and elegant, fingers naturally placed, with neat manicure. The lighting is professional studio lighting, soft and diffused, with gentle shadows that enhance facial features and textures without harsh contrast. The overall mood is a high-end fashion editorial photoshoot — chic, glamorous, photorealistic, ultra-detailed, fashion photography, editorial style, clean composition, 8K resolution, ultra-sharp focus, cinematic lighting."
//   },
//   {
//     id: "0003",
//     title: "Valentine’s Day",
//     preview: "/templates/0003.jpg",
//     prompt: "A photorealistic artistic fashion portrait of a woman styled as a modern Cupid, shot from a precise top-down overhead angle (flat lay). The model is lying on her back on a warm wooden parquet floor, fully aligned along the vertical axis of the frame. The camera is positioned directly above her, creating a symmetrical, carefully composed editorial layout. She is holding a Cupid’s bow, pulling back the bowstring, with the arrow aimed directly at the camera, creating a strong sense of depth and dramatic perspective. The arrowhead is shaped like a metal heart and remains in sharp focus. Her arms are extended forward, fingers elegant and tense, with a neat manicure. Her outfit consists of a soft powder-pink corset with ruffles and lace-up detailing that accentuates the waist, paired with a light flowing skirt made of delicate fabric. She wears sheer lace gloves on her hands and a refined pearl choker around her neck. Behind her back are white fluffy angel wings, carefully spread on both sides of her body. The makeup is romantic and glamorous: soft pink eyeshadow, long lashes, glowing skin, and glossy lips in a delicate pink shade. Small red heart shapes decorate her cheeks as a playful accent. Her hair is light-colored, voluminous, and wavy, artistically arranged around her head. She looks directly into the lens with a sensual, confident, and captivating expression. Surrounding the model are Valentine’s Day elements: handwritten letters tied with ribbons, pink and white peonies, and small red heart-shaped candies. All elements are carefully styled, creating the atmosphere of a romantic fairytale and a high-end editorial photoshoot. Lighting is soft, warm, and natural, with gentle shadows that enhance body contours, fabric textures, and prop details. The overall mood is tender, sensual, and cinematic, blending classic romance with modern fashion aesthetics. Photorealistic, high detail, editorial fashion photography, Valentine’s Day aesthetic, Cupid concept, soft cinematic lighting, shallow depth of field, ultra-sharp focus, 8K resolution, luxury mood."
//   },
//   {
//     id: "0002",
//     title: "Valentine’s Day",
//     preview: "/templates/0002.jpg",
//     prompt: "A dynamic, photorealistic fashion portrait of a woman, shot from a low wide-angle perspective (fisheye / wide-angle lens), as if the camera is very close to her face while she slightly leans toward the lens. She is blowing a kiss, which transforms into vivid red smoke that gradually breaks apart into pixelated hearts in an 8-bit / glitch-art style, floating in the air. The model has a confident, bold, slightly ironic facial expression. She is wearing red frameless sunglasses with semi-transparent lenses. Around her neck is a metal spiked choker, adding a punk edge. Outfit: a distressed red denim vest in a Diesel-inspired style, dyed in a deep oxblood red tone, layered over a sheer crystal mesh top that reflects neon light beautifully. Accessories are metallic, futuristic, with a subtle industrial feel. The background is a chaotic cyberpunk nighttime megacity, filled with neon signs, digital artifacts, light trails, and datamosh effects. Around the model, floating neon holograms display the text “ERROR: LOVE NOT FOUND” in glowing red, appearing as digital signage. The city feels alive, overloaded with information, featuring deep perspective and cinematic bokeh lights. Lighting is high-contrast and cinematic: cool neon rim light from behind combined with warm red light from the front. Visible effects include film grain, chromatic aberration, light bloom, glow, and subtle noise reminiscent of nighttime street photography. Skin texture is hyper-detailed and natural, with a slight sheen. The overall mood conveys anti-romantic Valentine energy, cyberpunk irony, and digital loneliness, presented as a high-end fashion editorial. Photorealistic, ultra-detailed, fashion photography, cyberpunk aesthetic, neon noir, glitch art, cinematic lighting, shallow depth of field, 8K, ultra-sharp, dramatic mood."
//   },
//   {
//     id: "0004",
//     title: "Valentine’s Day",
//     preview: "/templates/0004.jpg",
//     prompt: "A photorealistic full-body fashion portrait of a woman, shot in a studio from a frontal, eye-level angle. The model stands confidently in the center of the frame, with her legs slightly apart and a subtle asymmetry in her pose that accentuates her silhouette. She looks directly into the camera with a confident, bold, and elegant expression. She is wearing a bright red classic tailored suit: a fitted blazer and trousers with sharp creases. Under the blazer, she wears black lace lingerie (a bralette), creating a daring, sensual accent and a striking contrast with the red suit. On her feet are red high-heeled pumps. The look is stylish and modern, with notes of power dressing and high-fashion eroticism. Her hair is light-colored, voluminous, and softly styled in waves. The makeup is glamorous and clean: even skin tone, defined eyebrows, emphasized eyes, and rich red lipstick. The background is a studio art installation: transparent plastic sheets stretched on metal stands, featuring large red spray-painted lettering reading “LOVE”, along with chaotically scattered hearts, lines, and abstract symbols. Along the edges of the frame are red heart-shaped balloons, some placed on the floor, creating depth in the composition. The lighting is professional studio lighting—soft, even, and flattering—with a subtle focus on the model. Shadows are clean, without harsh contrast. The overall atmosphere is a modern Valentine’s Day fashion editorial: bold, stylish, slightly provocative, combining romance and strength. Photorealistic, high detail, editorial fashion photography, Valentine’s Day aesthetic, modern studio setup, clean background, bold red color palette, ultra-sharp, 8K, cinematic studio lighting, luxury fashion mood."
//   },
//   {
//     id: "0005",
//     title: "Valentine’s Day",
//     preview: "/templates/0005.jpg",
//     prompt: "A photorealistic fantasy-glam fashion portrait of a woman, shot in a studio from a frontal angle, with the camera positioned slightly below eye level to emphasize the grandeur of the look. The model is seated at the center of the frame on the hood of a vintage pink car from the 1950s–1960s, with a symmetrical composition and sharp focus on her figure. Behind her are large pink angel wings made of feathers, fully spread to both sides, creating a sense of power, magic, and divine presence. The wings are highly detailed, soft, and fluffy, with rich feather texture. Her look features a luxurious bright pink gown with a voluminous, multi-layered tulle tutu skirt and a corset lavishly embellished with crystals and shimmer. The neckline is deep yet elegant. On her feet are pink high-heeled shoes encrusted with gemstones. Her legs are crossed, and her pose is confident, glamorous, and iconic. The makeup is flawless glam: glowing skin, sculpted contouring, emphasis on the eyes, long lashes, and glossy lips in a pink palette. Her facial expression is calm and confident, with a touch of cool elegance and pop-diva attitude. Surrounding the car is dense pink smoke or mist, enveloping the scene and adding mystique and depth. The background is dark, almost black, creating strong contrast and enhancing the pink color palette. The lighting is cinematic studio lighting: soft frontal light to flatter the skin, rim lighting to highlight the wings and silhouette, with subtle glow and bloom effects. The overall atmosphere is luxury fantasy fashion, pop-culture icon, modern angel aesthetic, blending gloss, fairytale elements, and high fashion. Photorealistic, ultra-high detail, fantasy fashion photography, pink monochrome palette, cinematic studio lighting, ultra-sharp focus, shallow depth of field, 8K resolution, dramatic glamorous mood."
//   }
// ];

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
      .catch(() => { });
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

  // ✅ кількість генерацій (Omni O1 зазвичай 1..5)
  const [omniN, setOmniN] = useState<number>(1);

  // Inline small dropdowns (Format / Quantity)
  const [formatOpen, setFormatOpen] = useState(false);
  const [qtyOpen, setQtyOpen] = useState(false);
  const inlineSelectorsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFormatOpen(false);
        setQtyOpen(false);
      }
    }

    function onOutside(e: MouseEvent | TouchEvent) {
      const el = inlineSelectorsRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setFormatOpen(false);
        setQtyOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("touchstart", onOutside, true);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("touchstart", onOutside, true);
    };
  }, []);



  const acceptImg = "image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png";
  const srcPreview = useMemo(() => (srcFile ? URL.createObjectURL(srcFile) : ""), [srcFile]);
  const srcPreview2 = useMemo(() => (srcFile2 ? URL.createObjectURL(srcFile2) : ""), [srcFile2]);

  // VIDEO
  const [videoMode, setVideoMode] = useState<VideoMode>("i2v");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("standard");
  const [videoDuration, setVideoDuration] = useState<VideoDuration>(5);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);

  const qualityRef = useRef<HTMLDivElement | null>(null);
  const durationRef = useRef<HTMLDivElement | null>(null);

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
    const endpoint =
      kind === "image2video" ? `/api/kling/image2video/${taskId}` : `/api/kling/motion-control/${taskId}`;

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
        if (!vurl)
          throw new Error(lang === "uk" ? "Задача успішна, але нема URL відео" : "Task succeeded but no video URL");

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
      setError(
        lang === "uk" ? "У тебе 0 балів. Обери пакет у кабінеті." : "You have 0 points. Choose a package in your account."
      );
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
      const userPrompt = selectedTemplateId ? (templatePrompt ?? "") : prompt.trim();
      if (!userPrompt) throw new Error(lang === "uk" ? "Введи промт" : "Please enter a prompt");
      if (refUploading) throw new Error(lang === "uk" ? "Зачекай, фото ще завантажується..." : "Please wait, image is still uploading...");

      if (srcFile && !srcUrl) throw new Error(lang === "uk" ? "Не вдалось завантажити 1-е фото в R2" : "Failed to upload first image");

      const tags = `${srcUrl ? "<<<image_1>>> " : ""}${srcUrl2 ? "<<<image_2>>> " : ""}`;
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
      if (srcUrl2) body.image_2 = srcUrl2;

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
    !session ||
    (!!session && points <= 0) ||
    (!!session && points > 0 && points < currentCost) ||
    (mediaTab === "photo"
      ? (selectedTemplateId ? false : prompt.trim().length < 1)
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
    <>
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

        /* settings-pill removed; using inline select triggers */

        /* anchor for dropdown */
        .settingsWrap {
          position: relative;
          display: inline-flex;
        }

        /* dropdown panel */
        .settingsDropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 9999;

          width: min(420px, calc(100vw - 32px));
          background: rgba(6, 8, 12, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 12px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px) saturate(120%);
          -webkit-backdrop-filter: blur(12px) saturate(120%);
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

        /* --- NEW: separate grids --- */
        .formatButtons {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .qtyButtons {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .formatButtons button,
        .qtyButtons button {
          margin: 0;
          width: 100%;
        }

        .selectTrigger {
          padding: 8px 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          color: #fff;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .smallDropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 10000;
          width: max-content;
          background: rgba(6,8,12,0.82);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          padding: 8px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.6);
          backdrop-filter: blur(10px) saturate(120%);
          -webkit-backdrop-filter: blur(10px) saturate(120%);
        }

        .smallDropdown button {
          background: transparent;
          border: none;
          color: white;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          width: 100%;
        }

        .smallDropdown button:hover {
          background: rgba(255,255,255,0.03);
        }

        .smallDropdown button.active {
          background: rgba(10,132,255,0.18);
          border-radius: 8px;
        }

        @media (max-width: 640px) {

          /* Тригери Формат / Кількість */
          .miniSelectTrigger {
            padding: 10px 14px;
            font-size: 15px;
            min-height: 40px;
            border-radius: 12px;
          }

          /* Кнопки всередині dropdown (1:1, 16:9, цифри) */
          .formatOption,
          .qtyOption {
            padding: 12px 0;
            font-size: 15px;
            border-radius: 10px;
          }

          /* Контейнер гріда кількості */
          .qtyGrid {
            gap: 10px;
          }

          /* Сам dropdown трохи більший */
          .miniDropdown {
            padding: 12px;
            border-radius: 14px;
          }
        }

        /* tabular numbers so they look одинаково (як 1:1) */
        .numMono {
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum";
        }
        .numMono.light {
          opacity: 0.75;
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-left: 6px;
        }

        /* spacer placed before prompt textarea to unify spacing across tabs */
        .promptSpacer { margin-top: 10px; }
        @media (max-width: 640px) { .promptSpacer { margin-top: 12px; } }

        /* previously hid the internal LegalMenu open button; removed so the embedded menu remains the sole menu button */

        .uploadTileHome {
          width: 170px;
          height: 170px;
          border-radius: 26px;
        }

        .templatesRow {
          margin-top: 16px;
          display: flex;
          gap: 14px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .templateCard {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          border-radius: 18px;
          padding: 0;
          height: 240px;
          aspect-ratio: 9 / 16;
          flex: 0 0 auto;
          overflow: hidden;
          cursor: pointer;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .templatePreviewWrap {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.02);
        }

        .templatePreviewWrap img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
        }

        .templateCard .templateLabel {
          position: absolute;
          bottom: 12px;
          left: 12px;
          right: 12px;
          font-size: 13px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
          text-align: center;
          pointer-events: none;
        }

        .templateCard.active {
          border-color: rgba(10,132,255,0.55);
          box-shadow: 0 0 0 2px rgba(10,132,255,0.25);
        }

        .uploadTileBig {
          width: 360px;
          height: 360px;
          border-radius: 26px;
        }

        @media (max-width: 900px) {
          .uploadTileBig {
            width: 100%;
            height: 320px;
          }
        }

        .templatePreviewBig {
          cursor: default;
        }

        .templatePreviewBig img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .templatesSection {
          max-width: 900px;
          margin: 26px auto 0;
          padding: 0 6px;
        }

        .templatesTitle {
          font-size: 28px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.92);
          margin: 0 0 14px;
        }
      `}</style>

        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <div id="legalmenu-host">
              <LegalMenu email="contact.vilna.pro@gmail.com" />
            </div>
          </div>
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
              {selectedTemplateId ? (
                <>
                  {/* РОЗШИРЕНИЙ ВИГЛЯД після вибору шаблону */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <button
                      type="button"
                      className="ios-btn ios-btn--ghost"
                      onClick={() => {
                        setSelectedTemplateId(null);
                        setTemplatePrompt(null);
                      }}
                      style={{ padding: "8px 12px" }}
                    >
                      ← {lang === "uk" ? "Назад" : "Back"}
                    </button>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                      {templates.find(t => t.id === selectedTemplateId)?.title}
                    </h2>
                  </div>

                  <div className="uploadRow">
                    <div
                      className="uploadTile uploadTileBig"
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
                              setSrcFile2(null);
                              setSrcUrl2("");
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

                    {(srcFile || srcUrl) && (
                      <div
                        className="uploadTile uploadTileBig"
                        role="button"
                        tabIndex={0}
                        aria-label={lang === "uk" ? "Завантажити друге фото" : "Upload second image"}
                        onClick={() => (document.getElementById("file2t") as HTMLInputElement | null)?.click()}
                        onKeyDown={(e) => e.key === "Enter" && (document.getElementById("file2t") as HTMLInputElement | null)?.click()}
                      >
                        {srcPreview2 ? (
                          <>
                            <img src={srcPreview2} alt="reference2" />
                            <span className="tile-label">{lang === "uk" ? "Фото 2" : "Photo 2"}</span>
                            <button
                              type="button"
                              className="tile-remove"
                              aria-label={lang === "uk" ? "Видалити" : "Remove"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSrcFile2(null);
                                setSrcUrl2("");
                              }}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="uploadPlus">+</span>
                            <span className="tile-label">{lang === "uk" ? "Фото 2" : "Photo 2"}</span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="uploadTile uploadTileBig templatePreviewBig">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={templates.find(t => t.id === selectedTemplateId)?.preview_url} 
                        alt={templates.find(t => t.id === selectedTemplateId)?.title}
                      />
                      <span className="tile-label">{lang === "uk" ? "Шаблон" : "Template"}</span>
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
                    <input
                      id="file2t"
                      type="file"
                      accept={acceptImg}
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0] ?? null;

                        setError(null);
                        setSrcFile2(f);
                        setSrcUrl2("");

                        if (!f) return;

                        try {
                          setRefUploading(true);
                          const { url } = await uploadToR2AndGetPublicUrl(f);
                          setSrcUrl2(url);
                        } catch (err: any) {
                          setError(normalizeErr(err));
                        } finally {
                          setRefUploading(false);
                        }
                      }}
                    />
                  </div>

                  {/* Inline Format + Quantity selectors */}
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
                    <div ref={inlineSelectorsRef} style={{ display: "flex", gap: 24, alignItems: "center" }}>
                      {/* Format trigger with label */}
                      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <div className="groupTitle" style={{ marginBottom: 0, marginRight: 8 }}>
                          {lang === "uk" ? "Формат" : "Format"}
                        </div>
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="vPill selectTrigger miniSelectTrigger"
                            onClick={() => {
                              setFormatOpen((v) => !v);
                              setQtyOpen(false);
                            }}
                            aria-haspopup="menu"
                            aria-expanded={formatOpen}
                          >
                            <span style={{ opacity: 0.95 }}>{aspect}</span>
                            <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>▾</span>
                          </button>

                          {formatOpen && (
                            <div className="smallDropdown miniDropdown" role="menu" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {(["1:1", "16:9", "9:16"] as const).map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    className={aspect === r ? "formatOption active numMono" : "formatOption numMono"}
                                    onClick={() => {
                                      setAspect(r);
                                      setFormatOpen(false);
                                    }}
                                  >
                                    <span style={{ display: "inline-flex", justifyContent: "space-between", width: "100%" }}>
                                      <span>{r}</span>
                                      {aspect === r && <span>✓</span>}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quantity trigger with label */}
                      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <div className="groupTitle" style={{ marginBottom: 0, marginRight: 8 }}>
                          {lang === "uk" ? "Кількість" : "Quantity"}
                        </div>
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="vPill selectTrigger miniSelectTrigger"
                            onClick={() => {
                              setQtyOpen((v) => !v);
                              setFormatOpen(false);
                            }}
                            aria-haspopup="menu"
                            aria-expanded={qtyOpen}
                          >
                            <span style={{ opacity: 0.95 }}>{omniN}</span>
                            <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>▾</span>
                          </button>

                          {qtyOpen && (
                            <div className="smallDropdown miniDropdown" role="menu" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                              <div
                                className="qtyButtons qtyGrid"
                                style={{ width: 30, display: "flex", flexDirection: "column" }}
                              >
                                {Array.from({ length: 5 }, (_, i) => i + 1).map((k) => (
                                  <button
                                    key={k}
                                    type="button"
                                    className={omniN === k ? "qtyOption active" : "qtyOption"}
                                    onClick={() => {
                                      setOmniN(k);
                                      setQtyOpen(false);
                                    }}
                                  >
                                    {k}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {refUploading && (
                      <div className="gen-pill">
                        <span>
                          {lang === "uk" ? "Завантаження фото" : "Uploading image"}
                          <LoadingDots />
                        </span>
                      </div>
                    )}
                  </div>

                  {(!session || (!!session && points <= 0) || (!!session && points > 0 && points < currentCost)) && (
                    <div style={{ marginTop: 10, opacity: 0.9 }}>
                      {!session && <div>{dict.authRequired}</div>}
                      {!!session && points <= 0 && (
                        <div>
                          У тебе 0 балів —{" "}
                          <Link href="/account" style={{ textDecoration: "underline" }}>
                            обери пакет балів
                          </Link>
                          .
                        </div>
                      )}
                      {!!session && points > 0 && points < currentCost && (
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
                </>
              ) : (
                <>
                  {/* ЗВИЧАЙНИЙ ВИГЛЯД */}
                  <div className="uploadRow">
                    <div
                      className="uploadTile uploadTileHome"
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
                              setSrcFile2(null);
                              setSrcUrl2("");
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

                    {(srcFile || srcUrl) && (
                      <div
                        className="uploadTile uploadTileHome"
                        role="button"
                        tabIndex={0}
                        aria-label={lang === "uk" ? "Завантажити друге фото" : "Upload second image"}
                        onClick={() => (document.getElementById("file2") as HTMLInputElement | null)?.click()}
                        onKeyDown={(e) => e.key === "Enter" && (document.getElementById("file2") as HTMLInputElement | null)?.click()}
                      >
                        {srcPreview2 ? (
                          <>
                            <img src={srcPreview2} alt="reference2" />
                            <span className="tile-label">{lang === "uk" ? "Фото 2" : "Photo 2"}</span>
                            <button
                              type="button"
                              className="tile-remove"
                              aria-label={lang === "uk" ? "Видалити" : "Remove"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSrcFile2(null);
                                setSrcUrl2("");
                              }}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="uploadPlus">+</span>
                            <span className="tile-label">{lang === "uk" ? "Фото 2" : "Photo 2"}</span>
                          </>
                        )}
                      </div>
                    )}

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
                    <input
                      id="file2"
                      type="file"
                      accept={acceptImg}
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0] ?? null;

                        setError(null);
                        setSrcFile2(f);
                        setSrcUrl2("");

                        if (!f) return;

                        try {
                          setRefUploading(true);
                          const { url } = await uploadToR2AndGetPublicUrl(f);
                          setSrcUrl2(url);
                        } catch (err: any) {
                          setError(normalizeErr(err));
                        } finally {
                          setRefUploading(false);
                        }
                      }}
                    />
                  </div>

                  {/* Inline Format + Quantity selectors */}
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
                    <div ref={inlineSelectorsRef} style={{ display: "flex", gap: 24, alignItems: "center" }}>
                      {/* Format trigger with label */}
                      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <div className="groupTitle" style={{ marginBottom: 0, marginRight: 8 }}>
                          {lang === "uk" ? "Формат" : "Format"}
                        </div>
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="vPill selectTrigger miniSelectTrigger"
                            onClick={() => {
                              setFormatOpen((v) => !v);
                              setQtyOpen(false);
                            }}
                            aria-haspopup="menu"
                            aria-expanded={formatOpen}
                          >
                            <span style={{ opacity: 0.95 }}>{aspect}</span>
                            <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>▾</span>
                          </button>

                          {formatOpen && (
                            <div className="smallDropdown miniDropdown" role="menu" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {(["1:1", "16:9", "9:16"] as const).map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    className={aspect === r ? "formatOption active numMono" : "formatOption numMono"}
                                    onClick={() => {
                                      setAspect(r);
                                      setFormatOpen(false);
                                    }}
                                  >
                                    <span style={{ display: "inline-flex", justifyContent: "space-between", width: "100%" }}>
                                      <span>{r}</span>
                                      {aspect === r && <span>✓</span>}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quantity trigger with label */}
                      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <div className="groupTitle" style={{ marginBottom: 0, marginRight: 8 }}>
                          {lang === "uk" ? "Кількість" : "Quantity"}
                        </div>
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="vPill selectTrigger miniSelectTrigger"
                            onClick={() => {
                              setQtyOpen((v) => !v);
                              setFormatOpen(false);
                            }}
                            aria-haspopup="menu"
                            aria-expanded={qtyOpen}
                          >
                            <span style={{ opacity: 0.95 }}>{omniN}</span>
                            <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>▾</span>
                          </button>

                          {qtyOpen && (
                            <div className="smallDropdown miniDropdown" role="menu" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                              <div
                                className="qtyButtons qtyGrid"
                                style={{ width: 30, display: "flex", flexDirection: "column" }}
                              >
                                {Array.from({ length: 5 }, (_, i) => i + 1).map((k) => (
                                  <button
                                    key={k}
                                    type="button"
                                    className={omniN === k ? "qtyOption active" : "qtyOption"}
                                    onClick={() => {
                                      setOmniN(k);
                                      setQtyOpen(false);
                                    }}
                                  >
                                    {k}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {refUploading && (
                      <div className="gen-pill">
                        <span>
                          {lang === "uk" ? "Завантаження фото" : "Uploading image"}
                          <LoadingDots />
                        </span>
                      </div>
                    )}
                  </div>

                  {!selectedTemplateId && (
                    <>
                      <div className="promptSpacer" />
                      <textarea
                        className="ios-textarea"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        suppressHydrationWarning={true}
                        placeholder={lang === "uk" ? "Опиши що потрібно зробити..." : "Describe what you want..."}
                      />
                    </>
                  )}

                  {(!session || (!!session && points <= 0) || (!!session && points > 0 && points < currentCost)) && (
                    <div style={{ marginTop: 10, opacity: 0.9 }}>
                      {!session && <div>{dict.authRequired}</div>}
                      {!!session && points <= 0 && (
                        <div>
                          У тебе 0 балів —{" "}
                          <Link href="/account" style={{ textDecoration: "underline" }}>
                            обери пакет балів
                          </Link>
                          .
                        </div>
                      )}
                      {!!session && points > 0 && points < currentCost && (
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
                </>
              )}
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
                          <button
                            type="button"
                            className="tile-remove"
                            aria-label={lang === "uk" ? "Видалити" : "Remove"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setVStartImg(null);
                              setVEndImg(null);
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

                    <input id="vStart" type="file" accept={acceptImg} style={{ display: "none" }} onChange={(e) => setVStartImg(e.target.files?.[0] ?? null)} />

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
                              <button
                                type="button"
                                className="tile-remove"
                                aria-label={lang === "uk" ? "Видалити" : "Remove"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVEndImg(null);
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

                        <input id="vEnd" type="file" accept={acceptImg} style={{ display: "none" }} onChange={(e) => setVEndImg(e.target.files?.[0] ?? null)} />
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
                          <button
                            type="button"
                            className="tile-remove"
                            aria-label={lang === "uk" ? "Видалити" : "Remove"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setVMotionVideo(null);
                              setMotionPreviewUrl("");
                              setRefVideoSeconds(0);
                            }}
                          >
                            ✕
                          </button>
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
                          <button
                            type="button"
                            className="tile-remove"
                            aria-label={lang === "uk" ? "Видалити" : "Remove"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setVCharacterImg(null);
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

                    <input id="vChar" type="file" accept={acceptImg} style={{ display: "none" }} onChange={(e) => setVCharacterImg(e.target.files?.[0] ?? null)} />
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
                <div ref={qualityRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <div className="groupTitle" style={{ marginBottom: 0, marginRight: 8 }}>{lang === "uk" ? "Якість" : "Quality"}</div>
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className="vPill selectTrigger miniSelectTrigger"
                      onClick={() => {
                        setQualityOpen((v) => !v);
                        setDurationOpen(false);
                      }}
                      aria-haspopup="menu"
                      aria-expanded={qualityOpen}
                    >
                      <span style={{ opacity: 0.95 }}>{videoQuality === "standard" ? "Standard" : "Professional"}</span>
                      <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>▾</span>
                    </button>

                    {qualityOpen && (
                      <div className="smallDropdown miniDropdown" role="menu" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {([
                            ["standard", lang === "uk" ? "Стандарт" : "Standard"],
                            ["pro", lang === "uk" ? "Професійно" : "Professional"],
                          ] as const).map(([val, label]) => (
                            <button
                              key={String(val)}
                              type="button"
                              className={videoQuality === val ? "formatOption active numMono" : "formatOption numMono"}
                              onClick={() => {
                                setVideoQuality(val as VideoQuality);
                                setQualityOpen(false);
                              }}
                            >
                              <span style={{ display: "inline-flex", justifyContent: "space-between", width: "100%" }}>
                                <span>{label}</span>
                                {videoQuality === val && <span>✓</span>}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {videoMode === "i2v" && (
                  <div ref={durationRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                    <div className="groupTitle" style={{ marginBottom: 0, marginRight: 8 }}>{lang === "uk" ? "Тривалість" : "Duration"}</div>
                    <div style={{ position: "relative" }}>
                      <button
                        type="button"
                        className="vPill selectTrigger miniSelectTrigger"
                        onClick={() => {
                          setDurationOpen((v) => !v);
                          setQualityOpen(false);
                        }}
                        aria-haspopup="menu"
                        aria-expanded={durationOpen}
                      >
                        <span style={{ opacity: 0.95 }}>{videoDuration === 5 ? "5s" : "10s"}</span>
                        <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>▾</span>
                      </button>

                      {durationOpen && (
                        <div className="smallDropdown miniDropdown" role="menu" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {[5, 10].map((v) => (
                              <button
                                key={v}
                                type="button"
                                className={videoDuration === v ? "formatOption active numMono" : "formatOption numMono"}
                                onClick={() => {
                                  setVideoDuration(v as VideoDuration);
                                  setDurationOpen(false);
                                }}
                              >
                                {v}s
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="promptSpacer" />
              <textarea
                className="ios-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                suppressHydrationWarning={true}
                placeholder={lang === "uk" ? "Опиши що потрібно зробити (опційно)..." : "Describe what you want (optional)..."}
              />

              {(!session || (!!session && points <= 0) || (!!session && points > 0 && points < currentCost)) && (
                <div style={{ marginTop: 10, opacity: 0.9 }}>
                  {!session && <div>{dict.authRequired}</div>}
                  {!!session && points <= 0 && (
                    <div>
                      У тебе 0 балів —{" "}
                      <Link href="/account" style={{ textDecoration: "underline" }}>
                        обери пакет балів
                      </Link>
                      .
                    </div>
                  )}
                  {!!session && points > 0 && points < currentCost && (
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
            </>
          )}
        </div>

        {mediaTab === "photo" && (
          <div className="templatesSection">
            <h2 className="templatesTitle">{lang === "uk" ? "Шаблони" : "Templates"}</h2>
            <div className="templatesRow">
              {templates?.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={`templateCard ${selectedTemplateId === tpl.id ? "active" : ""}`}
                  onClick={() => {
                    if (selectedTemplateId === tpl.id) {
                      setSelectedTemplateId(null);
                      setTemplatePrompt(null);
                    } else {
                      setSelectedTemplateId(tpl.id);
                      setTemplatePrompt(tpl.prompt);
                    }
                  }}
                >
                  <div className="templatePreviewWrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tpl.preview_url} alt={tpl.title} />
                  </div>
                  <div className="templateLabel">{tpl.title}</div>
                </button>
              ))}
            </div>
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
    </>
  );
}
