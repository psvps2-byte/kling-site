import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { promises as fs } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

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

    // Convert without ffprobe dependency: keep aspect ratio, fit max 2160, pad min 720.
    const vf =
      "scale=w='trunc(min(2160/iw,2160/ih)*iw/2)*2':h='trunc(min(2160/iw,2160/ih)*ih/2)*2':flags=lanczos,pad=w='max(iw,720)':h='max(ih,720)':x='(ow-iw)/2':y='(oh-ih)/2':color=black";

    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-t",
        "10",
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
