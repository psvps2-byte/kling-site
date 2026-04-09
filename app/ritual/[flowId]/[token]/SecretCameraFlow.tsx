"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Stage = "camera" | "captured" | "generating" | "done" | "error";

type Props = {
  flowId: string;
  token: string;
  prompt: string;
  referencePreviewUrl: string;
  referenceTitle: string;
  referenceSubtitle: string;
  tips: string[];
};

function dataUrlToFile(dataUrl: string, name: string) {
  const [header, body] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], name, { type: mime });
}

export default function SecretCameraFlow({
  flowId,
  token,
  prompt,
  referencePreviewUrl,
  referenceTitle,
  referenceSubtitle,
  tips,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("camera");
  const [previewUrl, setPreviewUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");

  function getErrorMessage(errorValue: unknown) {
    if (errorValue instanceof Error && errorValue.message) return errorValue.message;
    return "Сталася помилка";
  }

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (errorValue: unknown) {
        setError(getErrorMessage(errorValue) || "Не вдалося відкрити камеру");
        setStage("error");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function captureAndGenerate() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1080;
    const height = video.videoHeight || 1920;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Не вдалося зчитати кадр");
      setStage("error");
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    setPreviewUrl(dataUrl);
    setStage("captured");

    try {
      setStage("generating");

      const form = new FormData();
      form.append("flow_id", flowId);
      form.append("token", token);
      form.append("prompt", prompt);
      form.append("photo", dataUrlToFile(dataUrl, "capture.jpg"));

      const res = await fetch("/api/ritual/generate", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.image_url) {
        throw new Error(data?.error || "Генерація не вдалася");
      }

      setResultUrl(String(data.image_url));
      setStage("done");
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue) || "Сталася помилка під час генерації");
      setStage("error");
    }
  }

  function resetFlow() {
    setPreviewUrl("");
    setResultUrl("");
    setError("");
    setStage("camera");
  }

  return (
    <main className="secret-camera-shell">
      <section className="secret-camera-card">
        <div className="secret-topbar">
          <span className="secret-kicker">VILNA private flow</span>
          <p>Станьте прямо, тримайте шию відкритою і розмістіть обличчя в межах рамки.</p>
        </div>

        {stage === "camera" && (
          <div className="secret-camera-stage">
            <video ref={videoRef} playsInline muted autoPlay className="secret-video" />
            <div className="secret-overlay">
              <div className="secret-frame" />
              <div className="secret-tips">
                {tips.map((tip) => (
                  <span key={tip}>{tip}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {(stage === "captured" || stage === "generating" || stage === "error") && previewUrl && (
          <div className="secret-preview-wrap">
            <Image src={previewUrl} alt="Captured preview" className="secret-preview" fill unoptimized />
          </div>
        )}

        {stage === "done" && resultUrl && (
          <div className="secret-result-wrap">
            <Image src={resultUrl} alt="Generated result" className="secret-result" fill unoptimized />
          </div>
        )}

        <div className="secret-reference-box">
          <Image
            src={referencePreviewUrl}
            alt="Reference"
            className="secret-reference"
            width={84}
            height={84}
            unoptimized
          />
          <div>
            <strong>{referenceTitle}</strong>
            <p>{referenceSubtitle}</p>
          </div>
        </div>

        <div className="secret-actions">
          {stage === "camera" && (
            <button type="button" className="secret-button" onClick={captureAndGenerate}>
              Зробити фото
            </button>
          )}

          {stage === "generating" && (
            <button type="button" className="secret-button" disabled>
              Генеруємо 9:16...
            </button>
          )}

          {stage === "done" && (
            <a href={resultUrl} download className="secret-button">
              Завантажити результат
            </a>
          )}

          {(stage === "done" || stage === "error") && (
            <button type="button" className="secret-button secret-button-secondary" onClick={resetFlow}>
              Зняти ще раз
            </button>
          )}
        </div>

        {!!error && <p className="secret-error">{error}</p>}
      </section>

      <style jsx>{`
        .secret-camera-shell {
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 24px 16px;
          background:
            radial-gradient(circle at top, rgba(194, 160, 79, 0.24), transparent 32%),
            linear-gradient(180deg, #120f09 0%, #050505 100%);
          color: #f7f0dc;
        }

        .secret-camera-card {
          width: min(100%, 440px);
          display: grid;
          gap: 16px;
          padding: 18px;
          border: 1px solid rgba(255, 219, 142, 0.18);
          border-radius: 28px;
          background: rgba(17, 13, 9, 0.88);
          box-shadow: 0 20px 80px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(14px);
        }

        .secret-topbar {
          display: grid;
          gap: 6px;
        }

        .secret-kicker {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #d7b76b;
        }

        .secret-topbar p,
        .secret-reference-box p {
          margin: 0;
          color: rgba(247, 240, 220, 0.8);
          line-height: 1.4;
        }

        .secret-camera-stage,
        .secret-preview-wrap,
        .secret-result-wrap {
          position: relative;
          aspect-ratio: 9 / 16;
          overflow: hidden;
          border-radius: 24px;
          background: #000;
        }

        .secret-video,
        .secret-preview,
        .secret-result {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .secret-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 20px;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.1) 32%, rgba(0, 0, 0, 0.38));
        }

        .secret-frame {
          width: min(72%, 240px);
          height: 42%;
          margin: 24px auto 0;
          border: 2px solid rgba(255, 221, 137, 0.92);
          border-radius: 999px 999px 240px 240px;
          box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.2);
        }

        .secret-tips {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }

        .secret-tips span {
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 12px;
          background: rgba(10, 10, 10, 0.58);
          border: 1px solid rgba(255, 221, 137, 0.2);
        }

        .secret-reference-box {
          display: grid;
          grid-template-columns: 84px 1fr;
          gap: 12px;
          align-items: center;
          padding: 12px;
          border-radius: 20px;
          background: rgba(255, 240, 209, 0.06);
          border: 1px solid rgba(255, 221, 137, 0.12);
        }

        .secret-reference {
          width: 84px;
          height: 84px;
          border-radius: 16px;
          object-fit: cover;
          background: #0a0a0a;
        }

        .secret-actions {
          display: grid;
          gap: 10px;
        }

        .secret-button {
          appearance: none;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          min-height: 54px;
          padding: 0 18px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(135deg, #f4d474 0%, #b18a2d 100%);
          color: #1f1504;
          font-weight: 700;
          text-decoration: none;
        }

        .secret-button:disabled {
          opacity: 0.72;
        }

        .secret-button-secondary {
          background: transparent;
          color: #f7f0dc;
          border: 1px solid rgba(255, 221, 137, 0.28);
        }

        .secret-error {
          margin: 0;
          color: #ffb2b2;
        }
      `}</style>
    </main>
  );
}
