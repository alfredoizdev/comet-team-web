"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertCanManage, requireMember, type Member } from "@/lib/auth/members";
import {
  abortMultipart,
  completeMultipart,
  createMultipart,
  deleteObjects,
  headObject,
  presignPart,
  presignPut,
  type UploadedPart,
} from "@/lib/r2/client";
import { contentTypeForExt, extFromName, videoKey } from "@/lib/r2/keys";
import * as repo from "@/lib/videos/repo";
import { planUpload } from "@/lib/videos/upload-plan";
import { parseYouTubeUrl } from "@/lib/videos/youtube";

export type SignedUpload =
  | { videoId: string; key: string; mode: "single"; url: string }
  | { videoId: string; key: string; mode: "multipart"; uploadId: string; partSize: number; partUrls: string[] };

function assertOwnKey(member: Member, key: string): void {
  if (!key.startsWith(`${member.userId}/`)) throw new Error("Forbidden");
}

export async function signUpload(input: {
  projectId: string;
  fileName: string;
  size: number;
  contentType: string;
}): Promise<SignedUpload> {
  const m = await requireMember();
  const project = await repo.getProject(input.projectId);
  if (!project) throw new Error("Match not found");
  assertCanManage(m, project.team);

  const ext = extFromName(input.fileName);
  if (!ext) throw new Error("Unsupported file type");
  if (await repo.getVideoForProject(project.id)) throw new Error("This match already has a video");

  const plan = planUpload(input.size);
  const videoId = randomUUID();
  const key = videoKey(m.userId, videoId, ext);
  const contentType = contentTypeForExt(ext);

  if (plan.mode === "single") {
    return { videoId, key, mode: "single", url: await presignPut(key, contentType) };
  }
  const uploadId = await createMultipart(key, contentType);
  const partUrls = await Promise.all(
    Array.from({ length: plan.partCount }, (_, i) => presignPart(key, uploadId, i + 1)),
  );
  return { videoId, key, mode: "multipart", uploadId, partSize: plan.partSize, partUrls };
}

export async function completeUpload(input: {
  projectId: string;
  videoId: string;
  key: string;
  uploadId?: string;
  parts?: UploadedPart[];
}): Promise<{ projectId: string }> {
  const m = await requireMember();
  assertOwnKey(m, input.key);
  const project = await repo.getProject(input.projectId);
  if (!project) throw new Error("Match not found");
  assertCanManage(m, project.team);

  if (input.uploadId) await completeMultipart(input.key, input.uploadId, input.parts ?? []);
  if (!(await headObject(input.key))) throw new Error("Upload not found in storage");
  if (await repo.getVideoForProject(project.id)) throw new Error("This match already has a video");

  try {
    await repo.insertVideo({ id: input.videoId, project_id: project.id, file_path: input.key });
  } catch (err) {
    // Never leave a multi-GB object in R2 with no row pointing at it.
    try {
      await deleteObjects([input.key]);
    } catch {
      // best effort
    }
    throw err;
  }
  revalidatePath("/admin");
  return { projectId: project.id };
}

export async function abortUpload(input: { key: string; uploadId?: string }): Promise<void> {
  const m = await requireMember();
  assertOwnKey(m, input.key);
  // If completeUpload already succeeded (and only the response was lost), the
  // object now backs a videos row: leave it alone.
  if (await repo.getVideoByKey(input.key)) return;
  if (input.uploadId) {
    try {
      await abortMultipart(input.key, input.uploadId);
      return;
    } catch (err) {
      // Already completed: the assembled object exists, fall through and delete it.
      if (!(err instanceof Error && err.name === "NoSuchUpload")) throw err;
    }
  }
  await deleteObjects([input.key]);
}

/** Attach a YouTube video to a match; the worker downloads it with yt-dlp and processes it like an upload. */
export async function submitYouTube(input: { projectId: string; url: string }): Promise<{ projectId: string }> {
  const m = await requireMember();
  const project = await repo.getProject(input.projectId);
  if (!project) throw new Error("Match not found");
  assertCanManage(m, project.team);
  const parsed = parseYouTubeUrl(input.url);
  if (!parsed) throw new Error("That doesn't look like a YouTube video link");
  if (await repo.getVideoForProject(project.id)) throw new Error("This match already has a video");

  const videoId = randomUUID();
  await repo.insertVideo({
    id: videoId,
    project_id: project.id,
    file_path: `${m.userId}/${videoId}/youtube-${parsed.id}`,
    source_url: parsed.url,
  });
  revalidatePath("/admin");
  return { projectId: project.id };
}
