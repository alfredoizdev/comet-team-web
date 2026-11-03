// Cloudflare R2 access (S3-compatible). Server-only: used by server actions
// and the worker, never by the browser. Imported by `worker/src/storage.ts`
// through a relative path, so keep this file free of Next.js imports.
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SIGNED_URL_TTL_SECONDS } from "../db/types";

export type UploadedPart = { ETag: string; PartNumber: number };

let client: S3Client | null = null;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function bucket(): string {
  return env("R2_BUCKET");
}

export function getR2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env("R2_ENDPOINT"),
      forcePathStyle: true,
      // R2 has historically rejected the SDK's default streaming CRC32 trailers.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

/**
 * Signing date floored to the hour: URLs signed within the same hour are
 * byte-identical, so a page refresh does not swap `<video src>` and restart
 * playback. With a 4 h TTL a URL is always valid for at least 3 h.
 */
function signingDate(ttl: number): Date {
  const d = new Date();
  // Flooring eats up to 1 h of the TTL: only do it when the TTL can afford it.
  if (ttl >= 2 * 3600) d.setUTCMinutes(0, 0, 0);
  return d;
}

export function presignPut(key: string, contentType: string, ttl = SIGNED_URL_TTL_SECONDS): Promise<string> {
  return getSignedUrl(getR2(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), {
    expiresIn: ttl,
    signingDate: signingDate(ttl),
  });
}

export function presignGet(key: string, ttl = SIGNED_URL_TTL_SECONDS): Promise<string> {
  return getSignedUrl(getR2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: ttl,
    signingDate: signingDate(ttl),
  });
}

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const res = await getR2().send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
  );
  if (!res.UploadId) throw new Error("R2 did not return an upload id");
  return res.UploadId;
}

export function presignPart(key: string, uploadId: string, partNumber: number, ttl = SIGNED_URL_TTL_SECONDS): Promise<string> {
  return getSignedUrl(
    getR2(),
    new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: ttl, signingDate: signingDate(ttl) },
  );
}

export async function completeMultipart(key: string, uploadId: string, parts: UploadedPart[]): Promise<void> {
  await getR2().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await getR2().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}

export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const res = await getR2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0 };
  } catch (err) {
    if (err instanceof Error && (err.name === "NotFound" || err.name === "NoSuchKey")) return null;
    throw err;
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await getR2().send(
    new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
  );
}

/** Streams an object to `destPath` (works for files larger than 2 GB). */
export async function downloadToFile(key: string, destPath: string): Promise<void> {
  const res = await getR2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Empty body downloading ${key}`);
  await pipeline(res.Body as Readable, createWriteStream(destPath));
}

export async function uploadFile(key: string, filePath: string, contentType: string): Promise<void> {
  await getR2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: statSync(filePath).size,
      ContentType: contentType,
    }),
  );
}
