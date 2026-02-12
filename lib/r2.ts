import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const r2 = new S3Client({
  region: "auto",
  endpoint: mustEnv("R2_ENDPOINT"),
  forcePathStyle: true,
  credentials: {
    accessKeyId: mustEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: mustEnv("R2_SECRET_ACCESS_KEY"),
  },
});

export async function presignGet(key: string, expiresInSeconds = 7200) {
  const cmd = new GetObjectCommand({
    Bucket: mustEnv("R2_BUCKET"),
    Key: key,
  });
  return getSignedUrl(r2, cmd, { expiresIn: expiresInSeconds });
}

// ✅ Завантаження файлу в R2
export async function uploadToR2(params: {
  buffer: Buffer;
  contentType: string;
  prefix?: string; // наприклад "refs/" або "uploads/"
}) {
  const bucket = mustEnv("R2_BUCKET");
  const prefix = params.prefix ?? "uploads/";
  const key = `${prefix}${crypto.randomUUID()}`;

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: params.buffer,
    ContentType: params.contentType,
  });

  await r2.send(cmd);

  // ⚠️ Повертаємо "key" — він приватний.
  // URL для Kling будемо робити signed через presignGet(key)
  return { key };
}
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
export async function deleteFromR2(key: string) {
  const cmd = new DeleteObjectCommand({
    Bucket: mustEnv("R2_BUCKET"),
    Key: key,
  });
  await r2.send(cmd);
  return { ok: true };
}
