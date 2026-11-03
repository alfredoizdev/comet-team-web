import { MAX_VIDEO_BYTES, MULTIPART_THRESHOLD, PART_SIZE } from "@/lib/db/types";

export type UploadPlan = { mode: "single" } | { mode: "multipart"; partCount: number; partSize: number };

/** Single PUT up to 100 MB; multipart in 50 MB parts above that; nothing over 5 GB. */
export function planUpload(size: number): UploadPlan {
  if (size > MAX_VIDEO_BYTES) throw new Error("File is larger than 5 GB");
  if (size <= MULTIPART_THRESHOLD) return { mode: "single" };
  return { mode: "multipart", partCount: Math.ceil(size / PART_SIZE), partSize: PART_SIZE };
}
