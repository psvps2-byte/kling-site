import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function createS3Client() {
  return new S3Client({
    region: "auto",
    endpoint: mustEnv("R2_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: mustEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: mustEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function POST(req: Request) {
  const { filename, contentType } = await req.json();
  const bucket = mustEnv("R2_BUCKET");
  const s3 = createS3Client();

  const ext = (filename?.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `uploads/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });
  const base = process.env.R2_PUBLIC_BASE_URL?.trim();
  const publicUrl = base
    ? `${base.replace(/\/+$/, "")}/${String(key).replace(/^\/+/, "")}`
    : null;

  return NextResponse.json({ uploadUrl, key, publicUrl });
}
