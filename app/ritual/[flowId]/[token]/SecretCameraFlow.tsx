"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Stage = "camera" | "captured" | "generating" | "done" | "error";
type ZoomCapability = {
  min: number;
  max: number;
  step?: number;
};

type Props = {
  flowId: string;
  token: string;
  prompt: string;
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
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("camera");
  const [previewUrl, setPreviewUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [zoomCapability, setZoomCapability] = useState<ZoomCapability | null>(null);
  const [zoomValue, setZoomValue] = useState(1);

  function getErrorMessage(errorValue: unknown) {
    if (errorValue instanceof Error && errorValue.message) return errorValue.message;
    return "Сталася помилка";
  }

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacingMode },
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
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities =
          typeof videoTrack?.getCapabilities === "function"
            ? (videoTrack.getCapabilities() as MediaTrackCapabilities & { zoom?: ZoomCapability })
            : null;
        const facingModes = Array.isArray(capabilities?.facingMode) ? capabilities.facingMode : [];
        setCanSwitchCamera(facingModes.includes("user") && facingModes.includes("environment"));
        if (capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min) {
          const nextZoom = Math.max(1, capabilities.zoom.min);
          setZoomCapability(capabilities.zoom);
          setZoomValue(nextZoom);
          await videoTrack.applyConstraints({
            advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet],
          });
        } else {
          setZoomCapability(null);
          setZoomValue(1);
        }

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
  }, [cameraFacingMode]);

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

  function toggleCamera() {
    setError("");
    setCameraFacingMode((current) => (current === "user" ? "environment" : "user"));
  }

  async function handleZoomChange(nextValue: number) {
    setZoomValue(nextValue);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [{ zoom: nextValue } as MediaTrackConstraintSet],
      });
    } catch {
      setError("Зум не підтримується цією камерою");
    }
  }

  return (
    <main className="secret-camera-shell">
      <section className="secret-camera-card">
        {stage === "camera" && (
          <div className="secret-camera-stage">
            <video ref={videoRef} playsInline muted autoPlay className="secret-video" />
            <div className="secret-overlay">
              <div className="secret-toolbar">
                <span className="secret-kicker">VILNA</span>
                <div className="secret-toolbar-actions">
                  {zoomCapability && (
                    <label className="secret-zoom" aria-label="Camera zoom">
                      <span>{zoomValue.toFixed(1)}x</span>
                      <input
                        type="range"
                        min={zoomCapability.min}
                        max={zoomCapability.max}
                        step={zoomCapability.step || 0.1}
                        value={zoomValue}
                        onChange={(event) => handleZoomChange(Number(event.target.value))}
                      />
                    </label>
                  )}
                  {canSwitchCamera && (
                    <button type="button" className="secret-icon-button" onClick={toggleCamera}>
                      {cameraFacingMode === "user" ? "Основна" : "Фронтальна"}
                    </button>
                  )}
                </div>
              </div>
              <div className="secret-frame" />
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
          padding: 0;
          background:
            radial-gradient(circle at top, rgba(194, 160, 79, 0.24), transparent 32%),
            linear-gradient(180deg, #120f09 0%, #050505 100%);
          color: #f7f0dc;
        }

        .secret-camera-card {
          width: min(100%, 460px);
          min-height: 100dvh;
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          gap: 10px;
          padding: 12px;
          border: 0;
          border-radius: 0;
          background: rgba(17, 13, 9, 0.88);
          box-shadow: none;
          backdrop-filter: blur(14px);
        }

        .secret-kicker {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #d7b76b;
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
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 14px;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.1) 32%, rgba(0, 0, 0, 0.38));
        }

        .secret-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          pointer-events: auto;
        }

        .secret-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .secret-icon-button {
          appearance: none;
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 221, 137, 0.24);
          background: rgba(10, 10, 10, 0.58);
          color: #f7f0dc;
          font-size: 13px;
          font-weight: 600;
        }

        .secret-zoom {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 221, 137, 0.24);
          background: rgba(10, 10, 10, 0.58);
          color: #f7f0dc;
          font-size: 12px;
          font-weight: 600;
        }

        .secret-zoom input {
          width: 88px;
          accent-color: #f4d474;
        }

        .secret-frame {
          width: min(82%, 300px);
          height: 58%;
          margin: 12px auto 0;
          border: 2px solid rgba(255, 221, 137, 0.92);
          border-radius: 999px 999px 280px 280px;
          box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.2);
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

        @media (min-width: 481px) {
          .secret-camera-shell {
            padding: 20px 0;
          }

          .secret-camera-card {
            min-height: auto;
            height: min(100dvh - 40px, 900px);
            border: 1px solid rgba(255, 219, 142, 0.18);
            border-radius: 28px;
            box-shadow: 0 20px 80px rgba(0, 0, 0, 0.45);
          }
        }

        @media (max-width: 380px) {
          .secret-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .secret-toolbar-actions {
            width: 100%;
            justify-content: space-between;
          }

          .secret-zoom input {
            width: 72px;
          }
        }
      `}</style>
    </main>
  );
}
