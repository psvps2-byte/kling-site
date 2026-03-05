import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { promises as fs } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

type ProbeMeta = {
  width: number;
  height: number;
  duration: number;
};

function toEven(n: number) {
  const x = Math.max(2, Math.round(n));
  return x % 2 === 0 ? x : x - 1;
}

function parseProbe(jsonText: string): ProbeMeta {
  try {
    const json = JSON.parse(jsonText);
    const stream = Array.isArray(json?.streams)
      ? json.streams.find((s: any) => Number(s?.width) > 0 && Number(s?.height) > 0)
      : null;
    const width = Number(stream?.width || 0);
    const height = Number(stream?.height || 0);
    const durationRaw = Number(stream?.duration || json?.format?.duration || 0);
    const duration = Number.isFinite(durationRaw) ? durationRaw : 0;
    return { width, height, duration: Math.max(0, duration) };
  } catch {
    return { width: 0, height: 0, duration: 0 };
  }
}

async function probeVideo(filePath: string): Promise<ProbeMeta> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height,duration:format=duration",
    "-of",
    "json",
    filePath,
  ]);
  return parseProbe(stdout || "");
}

function needsConvert(name: string, meta: ProbeMeta) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const isMp4Mov = ext === "mp4" || ext === "mov";
  const validSize =
    meta.width >= 720 &&
    meta.width <= 2160 &&
    meta.height >= 720 &&
    meta.height <= 2160;
  const validDuration = meta.duration >= 3 && meta.duration <= 10;
  return !(isMp4Mov && validSize && validDuration);
}

function calcTargetSize(meta: ProbeMeta) {
  const w = Math.max(1, meta.width);
  const h = Math.max(1, meta.height);

  // Fit inside 2160x2160 and preserve aspect ratio.
  const fit = Math.min(2160 / w, 2160 / h);
  const scaledW = w * fit;
  const scaledH = h * fit;

  const outW = toEven(scaledW);
  const outH = toEven(scaledH);

  const padW = Math.max(720, outW);
  const padH = Math.max(720, outH);

  return {
    outW,
    outH,
    padW,
    padH,
  };
}

export async function POST(req: Request) {
  let inputPath = "";
  let outputPath = "";

  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    let file: File | null = null;

    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({} as any));
      const remoteUrl = String(body?.url || "").trim();
      const filename = String(body?.filename || "remote-video.mov");
      if (!remoteUrl) {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
      }

      const remoteRes = await fetch(remoteUrl);
      if (!remoteRes.ok) {
        return NextResponse.json(
          { error: `Failed to fetch remote video (${remoteRes.status})` },
          { status: 400 }
        );
      }
      const blob = await remoteRes.blob();
      file = new File([blob], filename, { type: blob.type || "video/quicktime" });
    } else {
      const form = await req.formData();
      const f = form.get("file");
      if (f instanceof File) file = f;
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file or url" }, { status: 400 });
    }

    const id = randomUUID();
    const ext = (file.name.split(".").pop() || "mov").toLowerCase();
    inputPath = path.join(tmpdir(), `${id}-in.${ext}`);
    outputPath = path.join(tmpdir(), `${id}-out.mp4`);

    const inBuf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, inBuf);

    let meta: ProbeMeta;
    try {
      meta = await probeVideo(inputPath);
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "ffprobe_failed",
          details:
            e?.message?.includes("ENOENT")
              ? "ffprobe is not available on server. Install ffmpeg/ffprobe in runtime."
              : e?.message || "Probe failed",
        },
        { status: 500 }
      );
    }

    if (!needsConvert(file.name, meta)) {
      return new NextResponse(inBuf, {
        status: 200,
        headers: {
          "Content-Type": file.type || "video/quicktime",
          "Content-Disposition": `inline; filename="${file.name}"`,
          "X-Video-Converted": "0",
          "Cache-Control": "no-store",
        },
      });
    }

    if (meta.duration > 0 && meta.duration < 3) {
      return NextResponse.json(
        { error: `Video too short (${meta.duration.toFixed(2)}s). Minimum is 3s.` },
        { status: 400 }
      );
    }

    const target = calcTargetSize(meta);
    const vf = `scale=${target.outW}:${target.outH}:flags=lanczos,pad=${target.padW}:${target.padH}:(ow-iw)/2:(oh-ih)/2:black`;
    const trimArgs = meta.duration > 10 ? ["-t", "10"] : [];

    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        ...trimArgs,
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "ffmpeg_failed",
          details:
            e?.message?.includes("ENOENT")
              ? "ffmpeg is not available on server. Install ffmpeg in runtime."
              : e?.message || "Conversion failed",
        },
        { status: 500 }
      );
    }

    const outBuf = await fs.readFile(outputPath);

    return new NextResponse(outBuf, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${file.name.replace(/\.[^.]+$/, "")}_kling.mp4"`,
        "X-Video-Converted": "1",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Video convert failed" },
      { status: 500 }
    );
  } finally {
    if (inputPath) {
      await fs.unlink(inputPath).catch(() => {});
    }
    if (outputPath) {
      await fs.unlink(outputPath).catch(() => {});
    }
  }
}
