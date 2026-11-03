"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { OpponentCombobox } from "@/components/opponent-combobox";
import { TEAMS, type Role, type Team } from "@/lib/db/types";
import { teams } from "@/lib/teams";
import { createMatch, deleteMatch } from "../../actions";
import { extFromName } from "@/lib/r2/keys";
import { planUpload } from "@/lib/videos/upload-plan";
import { abortUpload, completeUpload, signUpload, submitYouTube, type SignedUpload } from "@/app/admin/upload/actions";
import { parseYouTubeUrl } from "@/lib/videos/youtube";

type Props = { role: Role; team: Team | null; defaultTeam: Team; opponents: string[] };

const GB = 1024 ** 3;
function fmtEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "…";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

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

/** Retry completeUpload once on a transient failure. */
async function completeWithRetry(input: Parameters<typeof completeUpload>[0]): Promise<{ projectId: string }> {
  try {
    return await completeUpload(input);
  } catch {
    return await completeUpload(input);
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

export function UploadForm({ role, team, defaultTeam, opponents }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [total, setTotal] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const startedAtRef = useRef(0);
  const [rate, setRate] = useState(0); // bytes per second, updated from progress events

  function report(n: number) {
    setSent(n);
    const elapsed = (Date.now() - startedAtRef.current) / 1000;
    if (elapsed > 1) setRate(n / elapsed);
  }

  // Warn before leaving while an upload is in flight.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Reset the form and go to the match page. */
  function finish(projectId: string) {
    setBusy(false);
    setSent(0);
    setTotal(0);
    setRate(0);
    pickFile(null);
    router.push(`/admin/matches/${projectId}`);
  }

  function pickFile(f: File | null) {
    setFile(f);
    if (!f && fileRef.current) fileRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
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
        const done = await submitYouTube({ projectId, url: youtubeUrl });
        finish(done.projectId);
      } catch (err) {
        if (projectId) void deleteMatch(projectId).catch(() => undefined);
        toast.error(err instanceof Error ? err.message : "Could not add the YouTube video.");
        setBusy(false);
      }
      return;
    }

    setTotal(file.size);
    setSent(0);
    startedAtRef.current = Date.now();
    setRate(0);
    let signed: SignedUpload | null = null;
    let projectId: string | null = null;
    try {
      ({ id: projectId } = await createMatch(matchInput));
      signed = await signUpload({ projectId, fileName: file.name, size: file.size, contentType: file.type });

      if (signed.mode === "single") {
        const { url, videoId, key } = signed;
        await withRetry(() => putWithProgress(url, file, file.type || null, report));
        const done = await completeWithRetry({ projectId, videoId, key });
        finish(done.projectId);
      } else {
        const { partSize, partUrls } = signed;
        const parts: { ETag: string; PartNumber: number }[] = [];
        let done = 0;
        for (let i = 0; i < partUrls.length; i++) {
          const chunk = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
          const base = done;
          const etag = await withRetry(() => putWithProgress(partUrls[i], chunk, null, (n) => report(base + n)));
          parts.push({ ETag: etag, PartNumber: i + 1 });
          done += chunk.size;
          report(done);
        }
        const result = await completeWithRetry({ projectId, videoId: signed.videoId, key: signed.key, uploadId: signed.uploadId, parts });
        finish(result.projectId);
      }
    } catch (err) {
      // First completeUpload succeeded but its response was lost: the match is fine, go to it.
      if (projectId && err instanceof Error && err.message.includes("already has a video")) {
        finish(projectId);
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

  if (busy) {
    const eta = rate > 0 ? (total - sent) / rate : Number.POSITIVE_INFINITY;
    return (
      <div className="flex w-full flex-col gap-6 rounded-xl border bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Loader2 className="size-6 animate-spin text-boys" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{total ? "Uploading match video" : "Creating match…"}</h2>
            {file ? (
              <p className="text-sm text-neutral-600">
                {file.name} · {fmtSize(file.size)}
              </p>
            ) : null}
          </div>
        </div>
        {total ? (
          <div className="flex flex-col gap-2">
            <Progress value={pct} className="h-3" />
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-neutral-600">
              <span>
                {fmtSize(sent)} of {fmtSize(total)} ({pct}%)
              </span>
              <span>
                {rate > 0 ? `${fmtSize(rate)}/s · about ${fmtEta(eta)} left` : "Starting…"}
              </span>
            </div>
          </div>
        ) : null}
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Keep this tab open until the upload finishes. You can use other tabs meanwhile. When it is done you will be taken to
          the match page, where the worker cuts the highlights.
        </p>
      </div>
    );
  }

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
          <Label>Opponent</Label>
          <OpponentCombobox name="opponent" opponents={opponents} disabled={busy} />
        </div>
      </div>
      {role === "admin" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team">Team</Label>
          <select id="team" name="team" required disabled={busy} defaultValue={defaultTeam} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
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
            <input
              id="file"
              name="file"
              type="file"
              ref={fileRef}
              accept=".mp4,.mov,.avi,.webm,video/*"
              disabled={busy}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="file"
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (busy) return;
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) pickFile(dropped);
              }}
              className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
                dragging ? "border-boys bg-boys/5" : "border-neutral-300 hover:border-neutral-400"
              } ${busy ? "pointer-events-none opacity-60" : ""}`}
            >
              {file ? (
                <>
                  <span className="text-sm font-semibold text-neutral-900">{file.name}</span>
                  <span className="text-xs text-neutral-500">{fmtSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      pickFile(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900"
                  >
                    <X className="size-3" /> Remove
                  </button>
                </>
              ) : (
                <>
                  <UploadCloud className="size-6 text-neutral-400" aria-hidden="true" />
                  <span className="text-sm font-semibold text-neutral-900">Drag the match video here</span>
                  <span className="text-xs text-neutral-500">or click to choose a file</span>
                </>
              )}
            </label>
            <p className="text-xs text-neutral-500">MP4, MOV, AVI or WebM, up to 20 GB. Keep this page open until the upload finishes.</p>
          </div>
          <span className="text-center text-sm font-semibold uppercase text-neutral-400">or</span>
          <div className="flex flex-col gap-1.5">
            <Input id="youtubeUrl" name="youtubeUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" disabled={busy} aria-label="YouTube link" />
            <p className="text-xs text-neutral-500">Public or unlisted YouTube video. It is downloaded and processed on the worker.</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" render={<Link href={`/admin?team=${role === "admin" ? defaultTeam : (team ?? "girls")}`} />} nativeButton={false}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="bg-boys text-white hover:bg-boys-deep sm:min-w-48">
          {busy ? (total ? "Uploading…" : "Creating match…") : "Create match"}
        </Button>
      </div>
    </form>
  );
}
