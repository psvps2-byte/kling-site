"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type Stage = "idle" | "generating" | "done" | "error";

type Props = {
  flowId: string;
  token: string;
  prompt: string;
};

export default function SecretCameraFlow({ flowId, token, prompt }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [shareState, setShareState] = useState("");

  const examplePreviewUrl = "/secret/result-preview.jpg";

  function resetMessages() {
    setError("");
    setShareState("");
  }

  function handleSelectFile(file: File | null) {
    resetMessages();
    setResultUrl("");
    setStage("idle");

    if (!file) {
      setSourceFile(null);
      setSourcePreviewUrl("");
      return;
    }

    setSourceFile(file);
    setSourcePreviewUrl(URL.createObjectURL(file));
  }

  async function handleGenerate() {
    if (!sourceFile) {
      setError("Спочатку додайте фото");
      return;
    }

    resetMessages();
    setStage("generating");

    try {
      const form = new FormData();
      form.append("flow_id", flowId);
      form.append("token", token);
      form.append("prompt", prompt);
      form.append("photo", sourceFile);

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
      setStage("error");
      setError(errorValue instanceof Error ? errorValue.message : "Сталася помилка під час генерації");
    }
  }

  async function handleShare() {
    if (!resultUrl) return;

    resetMessages();

    try {
      const absoluteUrl = new URL(resultUrl, window.location.origin).toString();

      if (navigator.share) {
        await navigator.share({
          title: "VILNA result",
          text: "Моє згенероване фото",
          url: absoluteUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(absoluteUrl);
      setShareState("Посилання скопійовано");
    } catch {
      setShareState("Не вдалося поділитися");
    }
  }

  return (
    <main className="ritual-shell">
      <section className="ritual-card">
        <div className="ritual-header">
          <span className="ritual-kicker">VILNA</span>
          <h1>Додайте своє фото</h1>
        </div>

        <div className="ritual-grid">
          <section className="ritual-panel ritual-panel-combo">
            <div className="ritual-panel-top">
              <strong>Ваше фото</strong>
              <strong>Результат</strong>
            </div>

            <div className="ritual-stage">
              <button
                type="button"
                className={`ritual-upload ritual-narrow ${sourcePreviewUrl ? "has-image" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {sourcePreviewUrl ? (
                  <Image src={sourcePreviewUrl} alt="Uploaded source" fill className="ritual-image ritual-image-contain" unoptimized />
                ) : (
                  <span className="ritual-upload-copy">Натисніть, щоб завантажити фото</span>
                )}
              </button>

              <div className={`ritual-result ritual-narrow ${(resultUrl || examplePreviewUrl) ? "has-image" : ""}`}>
                {resultUrl ? (
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ritual-result-link"
                  >
                    <img src={resultUrl} alt="Generated result" className="ritual-image ritual-image-contain" />
                  </a>
                ) : examplePreviewUrl ? (
                  <Image src={examplePreviewUrl} alt="Preview result example" fill className="ritual-image ritual-image-contain" unoptimized />
                ) : (
                  <span className="ritual-placeholder">
                    Тут з’явиться готове зображення після генерації
                  </span>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => handleSelectFile(event.target.files?.[0] || null)}
            />

            <div className="ritual-center-action">
              <button
                type="button"
                className="ritual-button ritual-button-large"
                onClick={handleGenerate}
                disabled={!sourceFile || stage === "generating"}
              >
                {stage === "generating" ? "Генеруємо..." : "Згенерувати"}
              </button>
            </div>

            <div className="ritual-panel-actions ritual-panel-actions-end">
              <button type="button" className="ritual-button ritual-button-secondary" onClick={() => fileInputRef.current?.click()}>
                Обрати фото
              </button>
              <a
                href={resultUrl || "#"}
                download
                className={`ritual-button ${resultUrl ? "" : "is-disabled"}`}
                aria-disabled={!resultUrl}
                onClick={(event) => {
                  if (!resultUrl) event.preventDefault();
                }}
              >
                Завантажити
              </a>
              <button
                type="button"
                className="ritual-button ritual-button-secondary"
                onClick={handleShare}
                disabled={!resultUrl}
              >
                Поділитися
              </button>
            </div>
          </section>
        </div>

        {(error || shareState) && <p className="ritual-message">{error || shareState}</p>}
      </section>

      <style jsx>{`
        .ritual-shell {
          min-height: 100dvh;
          padding: 24px 16px;
          background:
            radial-gradient(circle at top, rgba(194, 160, 79, 0.24), transparent 30%),
            linear-gradient(180deg, #120f09 0%, #050505 100%);
          color: #f7f0dc;
        }

        .ritual-card {
          width: min(100%, 1180px);
          margin: 0 auto;
          display: grid;
          gap: 18px;
          padding: 22px;
          border-radius: 32px;
          border: 1px solid rgba(255, 219, 142, 0.18);
          background: rgba(17, 13, 9, 0.88);
          box-shadow: 0 24px 90px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(14px);
        }

        .ritual-header {
          display: grid;
          gap: 6px;
        }

        .ritual-kicker {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #d7b76b;
        }

        .ritual-header h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 48px);
          line-height: 1.02;
        }

        .ritual-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px;
        }

        .ritual-panel {
          display: grid;
          gap: 14px;
          padding: 16px;
          border-radius: 26px;
          background: rgba(255, 240, 209, 0.05);
          border: 1px solid rgba(255, 221, 137, 0.12);
        }

        .ritual-panel-top strong {
          font-size: 16px;
        }

        .ritual-panel-combo .ritual-panel-top {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }

        .ritual-stage {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.7fr);
          gap: 18px;
          align-items: stretch;
        }

        .ritual-upload,
        .ritual-result {
          position: relative;
          width: 100%;
          aspect-ratio: 9 / 16;
          overflow: hidden;
          border-radius: 22px;
          border: 1px dashed rgba(255, 221, 137, 0.22);
          background:
            linear-gradient(180deg, rgba(255, 221, 137, 0.08), rgba(255, 221, 137, 0.02)),
            #0a0a0a;
        }

        .ritual-narrow {
          aspect-ratio: 4 / 7;
        }

        .ritual-upload {
          cursor: pointer;
        }

        .ritual-upload.has-image,
        .ritual-result.has-image {
          border-style: solid;
        }

        .ritual-image {
          object-fit: cover;
        }

        .ritual-image-contain {
          object-fit: contain;
          background: #0a0a0a;
        }

        .ritual-result-link {
          display: block;
          width: 100%;
          height: 100%;
        }

        .ritual-upload-copy,
        .ritual-placeholder {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          padding: 20px;
          text-align: center;
          color: rgba(247, 240, 220, 0.72);
          font-size: 16px;
          line-height: 1.4;
        }

        .ritual-panel-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ritual-panel-actions-end {
          justify-content: center;
        }

        .ritual-center-action {
          display: flex;
          justify-content: center;
        }

        .ritual-button {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 52px;
          padding: 0 18px;
          border-radius: 999px;
          border: 0;
          background: linear-gradient(135deg, #f4d474 0%, #b18a2d 100%);
          color: #1f1504;
          text-decoration: none;
          font-weight: 700;
        }

        .ritual-button-large {
          min-width: 240px;
        }

        .ritual-button:disabled,
        .ritual-button.is-disabled {
          opacity: 0.45;
          pointer-events: none;
        }

        .ritual-button-secondary {
          background: transparent;
          color: #f7f0dc;
          border: 1px solid rgba(255, 221, 137, 0.24);
        }

        .ritual-message {
          margin: 0;
          color: #f3dca4;
        }

        @media (max-width: 820px) {
          .ritual-card {
            padding: 16px;
            border-radius: 24px;
          }

          .ritual-stage,
          .ritual-panel-combo .ritual-panel-top {
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
        }

        @media (max-width: 560px) {
          .ritual-stage,
          .ritual-panel-combo .ritual-panel-top {
            gap: 10px;
          }

          .ritual-button-large {
            width: 100%;
            min-width: 0;
          }

          .ritual-upload-copy,
          .ritual-placeholder {
            font-size: 14px;
            padding: 14px;
          }
        }
      `}</style>
    </main>
  );
}
