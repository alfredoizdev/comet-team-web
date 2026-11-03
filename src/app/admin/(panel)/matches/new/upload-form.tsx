"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { TEAMS, type Role, type Team } from "@/lib/db/types";
import { teams } from "@/lib/teams";
import { createMatch, deleteMatch } from "../../actions";
import { extFromName } from "@/lib/r2/keys";
import { planUpload } from "@/lib/videos/upload-plan";
import { abortUpload, completeUpload, signUpload, submitYouTube, type SignedUpload } from "@/app/admin/upload/actions";
import { parseYouTubeUrl } from "@/lib/videos/youtube";

type Props = { role: Role; team: Team | null };

const GB = 1024 ** 3;
function fmtSize(bytes: number): string {
  return bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** PUT `body` to a presigned URL with progress; resolves with the ETag header. */
function putWithProgress(url: string, body: Blob, contentType: string | null, onProgress: (sent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader("ETag") ?? "");
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

function isRedirect(err: unknown): boolean {
  return err instanceof Error && err.message.includes("NEXT_REDIRECT");
}

/** completeUpload redirects on success (throws NEXT_REDIRECT); retry once on a real failure. */
async function completeWithRetry(input: Parameters<typeof completeUpload>[0]): Promise<void> {
  try {
    await completeUpload(input);
  } catch (err) {
    if (isRedirect(err)) throw err;
    await completeUpload(input);
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("Upload failed");
}

export function UploadForm({ role, team }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [total, setTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    const youtubeUrl = String(form.get("youtubeUrl") ?? "").trim();
    const chosenTeam = (role === "admin" ? String(form.get("team")) : team) as Team;
    const matchInput = {
      title: String(form.get("title") ?? ""),
      team: chosenTeam,
      matchDate: String(form.get("matchDate") ?? "") || null,
      opponent: String(form.get("opponent") ?? "") || null,
    };

    // Validate before creating the match so a bad input never leaves an empty match behind.
    if (!file && !youtubeUrl) return toast.error("Choose a video file or paste a YouTube link.");
    if (file && youtubeUrl) return toast.error("Choose either a file or a YouTube link, not both.");
    if (youtubeUrl && !parseYouTubeUrl(youtubeUrl)) return toast.error("That doesn't look like a YouTube video link.");
    if (file && !extFromName(file.name)) return toast.error("Unsupported file type. Use MP4, MOV, AVI or WebM.");
    if (file) {
      try {
        planUpload(file.size);
      } catch (err) {
        return toast.error(err instanceof Error ? err.message : "File is too large");
      }
    }

    setBusy(true);

    if (!file) {
      let projectId: string | null = null;
      try {
        ({ id: projectId } = await createMatch(matchInput));
        await submitYouTube({ projectId, url: youtubeUrl });
      } catch (err) {
        if (isRedirect(err)) throw err;
        if (projectId) void deleteMatch(projectId).catch(() => undefined);
        toast.error(err instanceof Error ? err.message : "Could not add the YouTube video.");
        setBusy(false);
      }
      return;
    }

    setTotal(file.size);
    setSent(0);
    let signed: SignedUpload | null = null;
    let projectId: string | null = null;
    try {
      ({ id: projectId } = await createMatch(matchInput));
      signed = await signUpload({ projectId, fileName: file.name, size: file.size, contentType: file.type });

      if (signed.mode === "single") {
        const { url, videoId, key } = signed;
        await withRetry(() => putWithProgress(url, file, file.type || null, setSent));
        await completeWithRetry({ projectId, videoId, key });
      } else {
        const { partSize, partUrls } = signed;
        const parts: { ETag: string; PartNumber: number }[] = [];
        let done = 0;
        for (let i = 0; i < partUrls.length; i++) {
          const chunk = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
          const base = done;
          const etag = await withRetry(() => putWithProgress(partUrls[i], chunk, null, (n) => setSent(base + n)));
          parts.push({ ETag: etag, PartNumber: i + 1 });
          done += chunk.size;
          setSent(done);
        }
        await completeWithRetry({ projectId, videoId: signed.videoId, key: signed.key, uploadId: signed.uploadId, parts });
      }
    } catch (err) {
      // completeUpload redirects by throwing; anything else is a real failure.
      if (isRedirect(err)) throw err;
      // First completeUpload succeeded but its response was lost: the match is fine, go to it.
      if (projectId && err instanceof Error && err.message.includes("already has a video")) {
        router.push(`/admin/matches/${projectId}`);
        return;
      }
      if (signed) {
        const { key } = signed;
        const uploadId = signed.mode === "multipart" ? signed.uploadId : undefined;
        // abortUpload is a no-op server-side if the row already exists.
        void abortUpload({ key, uploadId }).catch(() => undefined);
      }
      // No video reached the match: remove the empty match so it can be re-created cleanly.
      if (projectId) void deleteMatch(projectId).catch(() => undefined);
      toast.error(err instanceof Error ? err.message : "Upload failed. Try again.");
      setBusy(false);
    }
  }

  const pct = total ? Math.round((sent / total) * 100) : 0;

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5 rounded-xl border bg-white p-6 sm:p-8">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required placeholder="Comets vs. Dynamo" disabled={busy} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="matchDate">Date</Label>
          <Input id="matchDate" name="matchDate" type="date" disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opponent">Opponent</Label>
          <Input id="opponent" name="opponent" placeholder="Dynamo" disabled={busy} />
        </div>
      </div>
      {role === "admin" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team">Team</Label>
          <select id="team" name="team" required disabled={busy} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {teams[t].name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">Team: {team ? teams[team].name : "—"}</p>
      )}
      <div className="flex flex-col gap-2">
        <Label>Match video</Label>
        <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-1.5">
            <Input id="file" name="file" type="file" ref={fileRef} accept=".mp4,.mov,.avi,.webm,video/*" disabled={busy} aria-label="Video file" />
            <p className="text-xs text-neutral-500">MP4, MOV, AVI or WebM, up to 5 GB. Keep this page open until the upload finishes.</p>
          </div>
          <span className="text-center text-sm font-semibold uppercase text-neutral-400">or</span>
          <div className="flex flex-col gap-1.5">
            <Input id="youtubeUrl" name="youtubeUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" disabled={busy} aria-label="YouTube link" />
            <p className="text-xs text-neutral-500">Public or unlisted YouTube video. It is downloaded and processed on the worker.</p>
          </div>
        </div>
      </div>
      {busy ? (
        <div className="flex flex-col gap-2">
          <Progress value={pct} />
          <p className="text-sm text-neutral-600">
            Uploading {fmtSize(sent)} of {fmtSize(total)} ({pct}%)
          </p>
        </div>
      ) : null}
      <Button type="submit" disabled={busy} className="bg-boys text-white hover:bg-boys-deep">
        {busy ? (total ? "Uploading…" : "Creating match…") : "Create match"}
      </Button>
    </form>
  );
}
