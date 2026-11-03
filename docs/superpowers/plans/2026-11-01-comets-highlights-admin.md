# Comets Highlights Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin y entrenadores suben partidos desde la web de Comets, el worker de PeakClip (portado) corta los highlights en la Mac, y los padres ven reel y clips publicados en `/girls` y `/boys`.

**Architecture:** Next.js 16 App Router (este repo) + Supabase Free (Postgres + Auth, esquema derivado de PeakClip, sin Storage) + Cloudflare R2 (archivos, URLs firmadas) + `worker/` (copia de `~/Desktop/MVP/apps/worker` con R2 en vez de Supabase Storage). Toda lectura/escritura de datos y firma de URLs pasa por server actions con service role; el navegador solo loguea y sube bytes a R2 con presigned URLs.

**Tech Stack:** Next.js 16.4 (cacheComponents on), React 19, Tailwind 4, shadcn/ui, `@supabase/ssr` + `@supabase/supabase-js`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `tsx`, FFmpeg 8 (ya instalado), vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-comets-highlights-admin-design.md`

## Global Constraints

- Toda la UI en **inglés** (spec 4.10). Los textos de este plan entre comillas son copy exacto.
- Service role y claves R2 solo en servidor/worker: nunca en componentes cliente ni en `NEXT_PUBLIC_*`.
- `cacheComponents: true` está activo: toda lectura de `params`, `cookies()` o datos en una page va dentro de `<Suspense>` (patrón ya usado en `src/app/[team]/page.tsx`).
- Claves de objeto en R2 con el formato de PeakClip: `{userId}/{videoId}/video.{ext}`, `{videoId}/clip_{i}.mp4`, `{videoId}/custom_{clipId}.mp4`, `{videoId}/highlight_reel.mp4`.
- Constantes del worker: `MAX_CLIPS = 12`, `MIN_GAP_SECONDS = 20`, `MIN_SCORE = 1.5`, recorte 5 s antes / 10 s después del pico, `POLL_INTERVAL = 5000`, temp en `/tmp/peakclip/{videoId}`.
- Tipos de video permitidos: `mp4`, `mov`, `avi`, `webm`. Tamaño máximo 5 GB. Multipart si `size > 100 MB`, partes de 50 MB.
- URLs firmadas: PUT 4 h, GET 4 h.
- Clip custom: `1 <= end - start <= 60` y `0 <= start`, `end <= video.duration`.
- Publicar exige `status = 'done'` y `highlight_reel_path` no nulo.
- Sin commits ni push salvo que Alfredo lo pida (el repo tiene git iniciado sin commits). Cada tarea termina con `pnpm lint && pnpm test && pnpm build` en verde.
- Decisión del plan (ajusta spec 4.2): en vez de copiar las 18 migraciones de PeakClip y deshacer Storage, se escribe **una migración consolidada** con solo las tablas y columnas que este proyecto usa. Mismos nombres de tablas/columnas que PeakClip para que el worker copiado funcione sin cambios de SQL.

## Review Focus

1. Un coach de `girls` llama a cualquier action con el id de un partido de `boys`: debe recibir `Forbidden`, nunca ejecutar. Test en Task 4 (`canManage`) y Task 5 (`setPublished` con mock).
2. Subida que termina en R2 pero `completeUpload` falla (red): no debe quedar una fila `videos` sin objeto ni un objeto sin fila invisible para siempre. `completeUpload` verifica `HeadObject` antes de insertar; el objeto huérfano se limpia con `abortMultipart` en el cliente. Test en Task 6.
3. Video con `error_message = "no_audio"`: el panel muestra "This video has no usable audio" y permite borrar/reprocesar, y nunca aparece en la página pública. Test de mapeo en Task 8.
4. Reel en regeneración (`status = done`, `highlight_reel_path = null`) en un partido ya publicado: la página pública lo muestra con los clips pero sin reel y el texto "Highlight reel is being rebuilt"; el panel no permite publicar un partido nuevo en ese estado. Test en Task 9.
5. Partido con el original ya borrado de R2 (`source_deleted_at` no nulo): el editor deshabilita "Create clip" y "Reprocess" con el aviso "The full match was removed after processing, so new clips can't be cut." Test en Task 8.

---

## File Structure

```
.env.example                              variables documentadas (sin valores)
supabase/config.toml                      generado por `supabase init`
supabase/migrations/0001_schema.sql       esquema consolidado + claim_next_video
supabase/seed/club_members.sql            plantilla para sembrar emails
vitest.config.ts
src/lib/db/types.ts                       Project, Video, Clip, ClubMember, Team
src/lib/supabase/server.ts                createClient (cookies) / createServiceClient
src/lib/supabase/client.ts                createBrowserClient
src/lib/r2/keys.ts                        builders de claves de objeto (puros, testeados)
src/lib/r2/client.ts                      S3Client + presign/put/get/head/delete/multipart
src/lib/auth/members.ts                   requireMember, canManage, assertCanManage
src/lib/videos/clip-range.ts              validateClipRange (puro, testeado)
src/lib/videos/status.ts                  describeVideoStatus (puro, testeado)
src/lib/videos/public.ts                  getPublishedMatches(team)
src/proxy.ts                              protege /admin/*
src/app/admin/login/page.tsx, actions.ts
src/app/admin/layout.tsx                  shell del panel (header con equipo/colores, sign out)
src/app/admin/page.tsx                    lista de partidos
src/app/admin/actions.ts                  createMatch, deleteMatch, setPublished, reprocessMatch
src/app/admin/matches/new/page.tsx, upload-form.tsx
src/app/admin/upload/actions.ts           signUpload, signUploadPart, completeUpload, abortUpload
src/app/admin/matches/[id]/page.tsx, actions.ts, editor.tsx, status-panel.tsx
src/components/match-card.tsx             tarjeta pública (reel + clips)
src/components/clip-dialog.tsx            reproductor de clip en diálogo
src/app/[team]/page.tsx                   (modificar) lee getPublishedMatches
src/lib/teams.ts                          (modificar) sin videos de YouTube
worker/package.json, tsconfig.json
worker/src/index.ts, process.ts, audio.ts storage.ts (R2 para el worker)
package.json                              scripts dev:all, test, worker
```

---

### Task 1: Dependencias, tests y variables de entorno

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `.env.example`, `src/lib/db/types.ts`
- Test: `src/lib/db/__tests__/types.test.ts`

**Interfaces:**
- Produces: tipos `Team = "girls" | "boys"`, `Role = "admin" | "coach"`, `VideoStatus = "uploaded" | "processing" | "done" | "error"`, `Project { id, user_id, title, team, match_date: string | null, opponent: string | null, created_at }`, `Video { id, project_id, file_path, status, error_message: string | null, duration: number | null, highlight_reel_path: string | null, is_published, published_at: string | null, source_deleted_at: string | null, created_at }`, `Clip { id, video_id, start_time, end_time, score, file_path, created_at }`, `ClubMember { id, email, role, team: Team | null }`. Constantes exportadas: `TEAMS = ["girls","boys"] as const`, `ALLOWED_VIDEO_EXTS = ["mp4","mov","avi","webm"] as const`, `MAX_VIDEO_BYTES = 5 * 1024 ** 3`, `MULTIPART_THRESHOLD = 100 * 1024 ** 2`, `PART_SIZE = 50 * 1024 ** 2`, `SIGNED_URL_TTL_SECONDS = 4 * 3600`.

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add @supabase/ssr @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
pnpm add -D vitest concurrently
pnpm dlx shadcn@latest add input label table tabs dialog alert-dialog progress sonner
```

- [ ] **Step 2: Scripts en `package.json`**: `"test": "vitest run"`, `"worker": "pnpm --dir worker start"`, `"dev:all": "concurrently -n web,worker -c blue,magenta \"pnpm dev\" \"pnpm --dir worker dev\""`.

- [ ] **Step 3: `vitest.config.ts`** con `test.include = ["src/**/*.test.ts", "worker/src/**/*.test.ts"]`, `environment: "node"`, alias `@` → `./src`.

- [ ] **Step 4: `.env.example`** con las variables de spec 4.1 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=soccer-videos`, `R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `DELETE_SOURCE_AFTER_PROCESSING=true`) y un comentario por variable. Agregar `.env.local` a `.gitignore` (verificar: create-next-app ya ignora `.env*`).

- [ ] **Step 5: Test trivial** `types.test.ts`: `expect(TEAMS).toEqual(["girls","boys"])`, `expect(PART_SIZE).toBe(52428800)`. Run `pnpm test` → PASS. Run `pnpm build` → OK.

---

### Task 2: Esquema de base de datos

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/seed/club_members.sql`
- Run: `supabase init` (genera `supabase/config.toml`; aceptar defaults, sin Deno settings)

**Interfaces:**
- Produces: tablas `projects`, `videos`, `clips`, `club_members`; función `claim_next_video()`.

- [ ] **Step 1: `0001_schema.sql`** con, en este orden:
  - `projects`: columnas de PeakClip (001) + `team text not null check (team in ('girls','boys'))`, `match_date date`, `opponent text`.
  - `videos`: columnas de PeakClip (001) + `is_published boolean not null default false`, `published_at timestamptz`, `source_deleted_at timestamptz`. Mismo `check (status in ('uploaded','processing','done','error'))`.
  - `clips`: igual a PeakClip 001 (sin `player_id`/`overlay_path`).
  - `club_members (id uuid pk default gen_random_uuid(), email text unique not null, role text not null check (role in ('admin','coach')), team text check (team in ('girls','boys')), created_at timestamptz default now(), constraint coach_needs_team check (role = 'admin' or team is not null))`.
  - RLS habilitado en las 4 tablas **sin policies** (solo service role accede). Comentario explicando por qué.
  - `claim_next_video()` copiada textual de `~/Desktop/MVP/supabase/migrations/002_claim_function.sql`.
  - Índices: `videos(project_id)`, `videos(status)`, `clips(video_id)`, `projects(team, match_date desc)`.

- [ ] **Step 2: `seed/club_members.sql`**: `insert into club_members (email, role, team) values ('ADMIN@EXAMPLE.COM','admin',null), ('COACH-GIRLS@EXAMPLE.COM','coach','girls'), ('COACH-BOYS@EXAMPLE.COM','coach','boys') on conflict (email) do update set role = excluded.role, team = excluded.team;` con comentario "replace emails, lower-case".

- [ ] **Step 3: Verificar sintaxis** con Postgres local si Docker está disponible: `supabase start && supabase db reset` → "Finished supabase db reset". Si Docker no corre, verificar con `psql --version` ausente → documentar en el reporte de la tarea que la migración se aplicará con `supabase db push` cuando exista el proyecto (Task 11).

---

### Task 3: Módulo R2

**Files:**
- Create: `src/lib/r2/keys.ts`, `src/lib/r2/client.ts`
- Test: `src/lib/r2/__tests__/keys.test.ts`

**Interfaces:**
- Produces (`keys.ts`, puro, sin deps): `videoKey(userId: string, videoId: string, ext: string): string`, `autoClipKey(videoId: string, index: number): string` → `{videoId}/clip_{index}.mp4`, `customClipKey(videoId: string, clipId: string): string`, `reelKey(videoId: string): string`, `extFromName(name: string): string | null` (minúsculas, `null` si no está en `ALLOWED_VIDEO_EXTS`), `contentTypeForExt(ext): string` (`mp4→video/mp4`, `mov→video/quicktime`, `avi→video/x-msvideo`, `webm→video/webm`).
- Produces (`client.ts`, `import "server-only"` NO: el worker lo importa; usar solo `process.env`): `getR2(): S3Client` (singleton; `region: "auto"`, `endpoint: R2_ENDPOINT`, `forcePathStyle: true`), `presignPut(key, contentType, ttl = SIGNED_URL_TTL_SECONDS): Promise<string>`, `presignGet(key, ttl = SIGNED_URL_TTL_SECONDS): Promise<string>`, `createMultipart(key, contentType): Promise<string /*uploadId*/>`, `presignPart(key, uploadId, partNumber): Promise<string>`, `completeMultipart(key, uploadId, parts: {ETag: string; PartNumber: number}[]): Promise<void>`, `abortMultipart(key, uploadId): Promise<void>`, `headObject(key): Promise<{ size: number } | null>`, `deleteObjects(keys: string[]): Promise<void>` (no-op si vacío), `downloadToFile(key, destPath): Promise<void>` (stream `GetObject.Body` a `createWriteStream`, soporta > 2 GB), `uploadFile(key, filePath, contentType): Promise<void>` (`PutObject` con `Body: createReadStream`, `ContentLength: statSync(filePath).size`).

- [ ] **Step 1: Tests de `keys.ts`**: `videoKey("u1","v1","MP4")` → `"u1/v1/video.mp4"`; `autoClipKey("v1", 3)` → `"v1/clip_3.mp4"`; `customClipKey("v1","c1")` → `"v1/custom_c1.mp4"`; `reelKey("v1")` → `"v1/highlight_reel.mp4"`; `extFromName("Match Final.MOV")` → `"mov"`; `extFromName("file.mkv")` → `null`; `extFromName("noext")` → `null`.
- [ ] **Step 2: Run** `pnpm test src/lib/r2` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar `keys.ts`**.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Implementar `client.ts`** (sin test unitario: envuelve el SDK). `pnpm build` → OK.

---

### Task 4: Supabase clients, miembros y protección de `/admin`

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/auth/members.ts`, `src/proxy.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`, `src/app/admin/layout.tsx`
- Test: `src/lib/auth/__tests__/members.test.ts`

**Interfaces:**
- `server.ts`: copia de `~/Desktop/MVP/apps/web/lib/supabase/server.ts` (`createClient()`, `createServiceClient()`), tipada con `Database` mínima o `any` explícito.
- `client.ts`: `createBrowserClient()` con `@supabase/ssr`.
- `members.ts`: `type Member = { userId: string; email: string; role: Role; team: Team | null }`; `canManage(member: Pick<Member,"role"|"team">, team: Team): boolean` (puro); `getMemberForUser(user: { id: string; email?: string | null }): Promise<Member | null>` (busca `club_members` por `lower(email)` con service client); `requireMember(): Promise<Member>` (usa `createClient().auth.getUser()`; sin user o sin membership → `redirect("/admin/login")`); `assertCanManage(member: Member, team: Team): void` (lanza `Error("Forbidden")` si `!canManage`).
- `login/actions.ts`: `signIn(prev: {error?: string}, formData: FormData): Promise<{error?: string}>`: `signInWithPassword`; si OK y `getMemberForUser` devuelve null → `signOut()` y `{ error: "Your account is not authorized." }`; si credenciales malas → `{ error: "Invalid email or password." }`; éxito → `redirect("/admin")`. `signOut(): Promise<void>` → `redirect("/admin/login")`.
- `proxy.ts`: puerto de `~/Desktop/MVP/apps/web/middleware.ts` a `export async function proxy(request: NextRequest)`; redirige a `/admin/login` cuando no hay user y el path empieza con `/admin` y no es `/admin/login`. `config.matcher = ["/admin/:path*"]`.

- [ ] **Step 1: Tests `members.test.ts`** (`canManage`): admin sin team → true para girls y boys; coach girls → true girls, false boys; coach boys → false girls.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar `members.ts`**. **Step 4: Run** → PASS.
- [ ] **Step 5: Implementar `server.ts`, `client.ts`, `proxy.ts`, `login/actions.ts`.**
- [ ] **Step 6: `login/page.tsx`**: card centrada, título "Houston Comet SC", subtítulo "Admin sign in", `Label`+`Input` email y password, `Button` "Sign in", error en rojo bajo el form (`useActionState(signIn, {})`). Fondo navy `bg-boys`, escudo arriba.
- [ ] **Step 7: `admin/layout.tsx`**: lee `requireMember()` dentro de `<Suspense>`; header con escudo, "Comets Admin", badge con `role` y `team` ("Admin" / "Girls coach" / "Boys coach"), botón "Sign out" (form → `signOut`). Children debajo en `max-w-6xl`.
- [ ] **Step 8:** `pnpm lint && pnpm test && pnpm build` → OK. Nota: `proxy.ts` requiere Next ≥ 16; verificar que el build lo reconoce (log "ƒ Proxy").

---

### Task 5: Lista de partidos y acciones de partido

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `src/lib/videos/status.ts`
- Test: `src/lib/videos/__tests__/status.test.ts`, `src/app/admin/__tests__/actions.test.ts`

**Interfaces:**
- `status.ts`: `type VideoView = { label: string; tone: "neutral" | "progress" | "ok" | "error"; canPublish: boolean; canCut: boolean; canReprocess: boolean }`; `describeVideo(v: Pick<Video,"status"|"error_message"|"highlight_reel_path"|"source_deleted_at"> | null): VideoView`. Reglas: `null` → "No video" neutral, todo false. `uploaded` → "Queued" progress. `processing` → "Processing" progress. `done` + reel → "Ready" ok, `canPublish = true`, `canCut = !source_deleted_at`, `canReprocess = !source_deleted_at`. `done` + sin reel → "Rebuilding highlight reel" progress, `canPublish = false`, `canCut` como arriba. `error` + `error_message === "no_audio"` → "No usable audio" error, `canReprocess = !source_deleted_at`. `error` otro → "Failed" error, `canReprocess` igual.
- `actions.ts` (todas `"use server"`, todas empiezan con `const m = await requireMember()`):
  - `createMatch(input: { title: string; team: Team; matchDate: string | null; opponent: string | null }): Promise<{ id: string }>`: `assertCanManage(m, team)`; inserta `projects` con `user_id = m.userId`.
  - `listMatches(): Promise<MatchRow[]>` donde `MatchRow = { project: Project; video: Video | null; clipCount: number }`; admin → todos, coach → `team = m.team`; orden `match_date desc nulls last, created_at desc`.
  - `setPublished(videoId: string, published: boolean): Promise<void>`: carga video+project, `assertCanManage`; si `published` y `!describeVideo(v).canPublish` → `Error("Video is not ready to publish")`; update `is_published`, `published_at = published ? now : null`; `revalidatePath("/" + team)`.
  - `reprocessMatch(videoId: string): Promise<void>`: port de `reprocessVideo` de `~/Desktop/MVP/apps/web/app/dashboard/actions.ts:79-111` con R2: `deleteObjects` de clips + reel, borra filas `clips`, update `status = uploaded, error_message = null, highlight_reel_path = null, is_published = false`. Si `source_deleted_at` → `Error("Source video was removed")`.
  - `deleteMatch(projectId: string): Promise<void>`: borra objetos R2 (video, clips, reel), luego `projects` (cascade). `revalidatePath`.
- `page.tsx`: tabla (shadcn `Table`) con columnas Match, Date, Opponent, Status (badge según `tone`), Published (switch/botón "Publish"/"Unpublish"), acciones (link "Open", "Delete" con `AlertDialog`). Admin ve `Tabs` Girls/Boys; coach sin tabs. Botón "New match" → `/admin/matches/new`. Estado vacío: "No matches yet."

- [ ] **Step 1: Tests `status.test.ts`** cubriendo las 7 reglas de `describeVideo` (una `it` por regla, assert de `label`, `canPublish`, `canCut`, `canReprocess`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar `status.ts`**. **Step 4: Run** → PASS.
- [ ] **Step 5: Test `actions.test.ts`** para `setPublished`: con `vi.mock("@/lib/auth/members")` devolviendo coach girls y `vi.mock("@/lib/supabase/server")` cuyo `createServiceClient` devuelve un stub encadenable que resuelve un video de proyecto `boys` → `await expect(setPublished("v1", true)).rejects.toThrow("Forbidden")` y el stub `update` nunca llamado. Segundo caso: proyecto girls, video `done` sin reel → rejects "not ready".
- [ ] **Step 6: Run** → FAIL. **Step 7: Implementar `actions.ts`**. **Step 8: Run** → PASS.
- [ ] **Step 9: `page.tsx`.** `pnpm lint && pnpm build` → OK.

---

### Task 6: Subida de partidos a R2

**Files:**
- Create: `src/app/admin/upload/actions.ts`, `src/app/admin/matches/new/page.tsx`, `src/app/admin/matches/new/upload-form.tsx`, `src/lib/videos/upload-plan.ts`
- Test: `src/lib/videos/__tests__/upload-plan.test.ts`, `src/app/admin/upload/__tests__/actions.test.ts`

**Interfaces:**
- `upload-plan.ts` (puro): `planUpload(size: number): { mode: "single" } | { mode: "multipart"; partCount: number; partSize: number }`; `size > MAX_VIDEO_BYTES` → `throw Error("File is larger than 5 GB")`; `size <= MULTIPART_THRESHOLD` → single; else multipart con `partCount = ceil(size / PART_SIZE)`.
- `actions.ts`:
  - `signUpload(input: { projectId: string; fileName: string; size: number; contentType: string }): Promise<{ videoId: string; key: string; mode: "single"; url: string } | { videoId: string; key: string; mode: "multipart"; uploadId: string; partSize: number; partUrls: string[] }>`: `requireMember`, carga project, `assertCanManage`; `extFromName` null → `Error("Unsupported file type")`; si el proyecto ya tiene video → `Error("This match already has a video")`; `videoId = randomUUID()`; key = `videoKey(m.userId, videoId, ext)`; firma según `planUpload`. `contentType` que se firma = `contentTypeForExt(ext)` (ignorar el del navegador).
  - `completeUpload(input: { projectId: string; videoId: string; key: string; uploadId?: string; parts?: {ETag: string; PartNumber: number}[] }): Promise<void>`: `requireMember` + `assertCanManage`; si `uploadId` → `completeMultipart`; `headObject(key)` null → `Error("Upload not found in storage")`; inserta `videos { id: videoId, project_id, file_path: key, status: "uploaded" }`; `redirect("/admin/matches/" + projectId)`.
  - `abortUpload(input: { key: string; uploadId?: string }): Promise<void>`: `requireMember`; `uploadId` → `abortMultipart`, sino `deleteObjects([key])`. Solo permitido si `key` empieza con `m.userId + "/"`.
- `upload-form.tsx` (cliente): formulario con Title, Date, Opponent, Team (select; coach: fijo y oculto), input file; al enviar: `createMatch` → `signUpload` → sube (single: `XMLHttpRequest` PUT con `upload.onprogress`; multipart: partes secuenciales con reintento ×3 por parte, ETag del header `ETag`) → `completeUpload`. Barra `Progress` y texto "Uploading 1.2 GB of 3.4 GB". En error: `abortUpload` y toast "Upload failed. Try again." La página `new/page.tsx` renderiza el form con `member` del layout (prop `team` y `role`).

- [ ] **Step 1: Tests `upload-plan.test.ts`**: 10 MB → single; 100 MB exacto → single; 100 MB + 1 byte → multipart con `partCount 3` (`ceil(104857601 / 52428800)`); 3.4 GB → `partCount 70`; 5 GB + 1 → throws.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Test `actions.test.ts`** para `completeUpload`: mocks de members (admin), supabase stub, y `vi.mock("@/lib/r2/client")` con `headObject` → `null` → rejects "Upload not found in storage" y `insert` no llamado.
- [ ] **Step 6: Run** → FAIL. **Step 7: Implementar `actions.ts`.** **Step 8: Run** → PASS.
- [ ] **Step 9: `upload-form.tsx` + `new/page.tsx`.** `pnpm lint && pnpm build` → OK.

---

### Task 7: Worker (port de PeakClip con R2)

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/src/index.ts`, `worker/src/process.ts`, `worker/src/audio.ts`, `worker/src/storage.ts`
- Test: `worker/src/__tests__/audio.test.ts` (copiar los tests existentes de `~/Desktop/MVP/apps/worker/src/__tests__/` que cubran `audio.ts`)

**Interfaces:**
- `storage.ts`: re-exporta desde `../../src/lib/r2/client` y `../../src/lib/r2/keys` (import relativo; `tsconfig` del worker con `include: ["src", "../src/lib/r2"]`).
- `package.json` del worker: `{ "name": "comets-worker", "private": true, "type": "module", "scripts": { "dev": "tsx watch --env-file=../.env.local src/index.ts", "start": "tsx --env-file=../.env.local src/index.ts" }, "dependencies": { "@supabase/supabase-js": "^2", "@aws-sdk/client-s3": "<misma versión que raíz>" }, "devDependencies": { "tsx": "^4", "typescript": "^5" } }`.
- `audio.ts`: copia textual de PeakClip.
- `process.ts`: copia de PeakClip con estos cambios y nada más:
  1. Reemplazar la descarga por `fetch` a Supabase (líneas 92-112 y 275-299 del original) por `downloadToFile(key, destPath)`.
  2. Reemplazar cada `supabase.storage.from("clips").upload(path, buffer, …)` por `uploadFile(path, localFilePath, "video/mp4")`; cada `.remove([...])` por `deleteObjects([...])`.
  3. Quitar `processClipOverlay` y todo import de `overlay`.
  4. Al final de `processVideo`, tras el update `status: "done"`: si `process.env.DELETE_SOURCE_AFTER_PROCESSING !== "false"` → `deleteObjects([filePath])` y update `source_deleted_at = new Date().toISOString()`. Log `[videoId] Source video deleted from R2`.
  5. Limpieza de `/tmp/peakclip/{videoId}` en `finally` (ya existe en PeakClip; conservar).
- `index.ts`: copia de PeakClip quitando `processOverlays`, `processAiAnalysis`, `processWithModal`, `computeHighlightsPerTeam`, `processWithLocalAI` y sus imports. Loop: `claimNextVideo` → `processVideo` → `processCustomClips` → `regenerateStaleReels` → sleep `POLL_INTERVAL`. Log inicial "Comets worker started. Polling for videos...".

- [ ] **Step 1: Copiar `audio.ts` y sus tests**; `pnpm test worker` → PASS (prueba que la copia y el vitest config funcionan).
- [ ] **Step 2: Escribir `storage.ts`, `process.ts`, `index.ts`** según la lista de cambios.
- [ ] **Step 3: Typecheck del worker**: `pnpm --dir worker exec tsc --noEmit` → sin errores.
- [ ] **Step 4: Arranque en seco**: con `.env.local` sin claves válidas, `pnpm --dir worker start` debe imprimir "Comets worker started" y luego "Poll error: …" cada 5 s, no crashear. Ctrl+C.

---

### Task 8: Detalle del partido y editor de clips

**Files:**
- Create: `src/app/admin/matches/[id]/page.tsx`, `src/app/admin/matches/[id]/actions.ts`, `src/app/admin/matches/[id]/status-panel.tsx`, `src/app/admin/matches/[id]/editor.tsx`, `src/lib/videos/clip-range.ts`
- Test: `src/lib/videos/__tests__/clip-range.test.ts`

**Interfaces:**
- `clip-range.ts` (puro): `validateClipRange(start: number, end: number, duration: number): { ok: true } | { ok: false; reason: string }` con razones exactas: "Clip must be at least 1 second", "Clip can't be longer than 60 seconds", "Clip is outside the video".
- `actions.ts` (`"use server"`, todas con `requireMember` + `assertCanManage` sobre el project del video):
  - `getMatchState(projectId: string): Promise<{ project: Project; video: Video | null; clips: Clip[]; view: VideoView; urls: { source: string | null; reel: string | null; clips: Record<string,string> } }>`: `source` firmado solo si `!source_deleted_at`; `reel` si existe; `clips[c.id]` para `score > 0`.
  - `createCustomClip(videoId: string, start: number, end: number): Promise<{ clipId: string }>`: `validateClipRange` con `video.duration`; `!view.canCut` → `Error("Can't cut clips for this video")`; inserta `clips { video_id, start_time, end_time, score: 0, file_path: customClipKey(videoId, clipId) }` con `clipId = randomUUID()` (insert con `id` explícito).
  - `deleteClip(clipId: string): Promise<void>`: port de `~/Desktop/MVP/apps/web/app/gallery/actions.ts:13-48` con `deleteObjects([clip.file_path])`, delete fila, update `highlight_reel_path = null`.
- `status-panel.tsx` (cliente): muestra `view.label` con color por `tone`, mensajes de Review Focus 3 y 5, botones Publish/Unpublish, Reprocess, Delete (AlertDialog) que llaman a las actions de Task 5; polling cada 5 s con `getMatchState` mientras `tone === "progress"`.
- `editor.tsx` (cliente): port de `~/Desktop/MVP/apps/web/app/clips/[videoId]/edit/page.tsx` quitando players/overlays/IA y reemplazando toda lectura de Supabase y `getSignedUrl` por `getMatchState`. Conserva: `VideoSource` "Full match" / "Highlight reel", timeline con `trimStart`/`trimEnd` (default 15 s), drag handles, zoom 1-5x, `TimeInput`, lista de clips con "Preview" y "Delete", botón "Create clip" (deshabilitado si `!view.canCut`, con tooltip del mensaje de Review Focus 5). Estilos con tokens de shadcn y el color del equipo (`team.bg`) en el handle y el botón primario.
- `page.tsx`: `<Suspense>` → carga `getMatchState` → `status-panel` + `editor` (editor solo si `video?.status === "done"`).

- [ ] **Step 1: Tests `clip-range.test.ts`**: (10, 10.5, 100) → "at least 1 second"; (0, 61, 100) → "longer than 60"; (90, 110, 100) → "outside"; (-1, 5, 100) → "outside"; (10, 25, 100) → ok.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Implementar `actions.ts`, `status-panel.tsx`, `editor.tsx`, `page.tsx`.**
- [ ] **Step 6:** `pnpm lint && pnpm test && pnpm build` → OK.

---

### Task 9: Páginas públicas por equipo

**Files:**
- Create: `src/lib/videos/public.ts`, `src/components/match-card.tsx`, `src/components/clip-dialog.tsx`
- Modify: `src/app/[team]/page.tsx`, `src/lib/teams.ts` (quitar `videos`, `Video`), `next.config.ts` (quitar `images.remotePatterns`)
- Delete: `src/components/video-card.tsx`
- Test: `src/lib/videos/__tests__/public.test.ts`

**Interfaces:**
- `public.ts`: `type PublicMatch = { id: string; title: string; opponent: string | null; matchDate: string | null; reelUrl: string | null; reelRebuilding: boolean; clips: { id: string; startTime: number; url: string }[] }`; `selectPublishable(rows: { project: Project; video: Video; clips: Clip[] }[]): PublicMatch[]` (puro, sin firmar: devuelve `url` vacío); `getPublishedMatches(team: Team): Promise<PublicMatch[]>` (service client: `projects.team = team` join `videos.is_published = true and status = 'done'`, clips `score > 0` orden `start_time`; firma con `presignGet`; orden `match_date desc nulls last`).
- `match-card.tsx`: título (`title` + " vs " + `opponent` si existe), fecha formateada `en-US` "October 25, 2026", `<video controls playsInline preload="metadata">` con `reelUrl` o, si `reelRebuilding`, caja gris con "Highlight reel is being rebuilt"; grilla de clips (miniatura = `<video preload="metadata">` del clip con overlay de play en el color del equipo) que abre `clip-dialog.tsx` (shadcn `Dialog` con `<video autoPlay controls>`).
- `[team]/page.tsx`: mantiene header y título "Videos" de la versión actual; lista `getPublishedMatches(slug)`; vacío → el `Card` "No videos yet" actual. Sin `"use cache"` (las URLs firmadas son por request).

- [ ] **Step 1: Tests `public.test.ts`** sobre `selectPublishable`: video `done` con reel y 2 clips (uno `score 0`) → 1 match con 1 clip, `reelRebuilding false`; video `done` sin reel → `reelUrl null`, `reelRebuilding true`; video `error` publicado por error de datos → excluido; video `is_published false` → excluido.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar `public.ts`.** **Step 4: Run** → PASS.
- [ ] **Step 5: Componentes y page; limpiar `teams.ts`, `next.config.ts`, borrar `video-card.tsx`.**
- [ ] **Step 6:** `pnpm lint && pnpm test && pnpm build` → OK. Verificar en navegador con `.env.local` vacío que `/girls` muestra "No videos yet" sin crashear (la action debe atrapar el error de conexión y devolver `[]` con `console.error`).

---

### Task 10: README y arranque local

**Files:**
- Modify: `README.md` (reemplazar el de create-next-app)

- [ ] **Step 1: README** con: qué es, requisitos (Node 24, pnpm, FFmpeg), variables de `.env.example`, cómo crear el proyecto Supabase y aplicar `supabase db push`, cómo crear bucket y token R2, cómo sembrar `club_members` y crear usuarios en Authentication → Users (desactivar sign up), `pnpm dev:all`, y la nota de que el worker corre en la Mac.
- [ ] **Step 2:** `pnpm lint && pnpm test && pnpm build` → OK.

---

### Task 11: Puesta en marcha con credenciales reales (requiere a Alfredo)

Bloqueada hasta que `.env.local` tenga Supabase y R2.

- [ ] **Step 0:** En Cloudflare, bucket `soccer-videos` → Settings → CORS policy con `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["Content-Type"]`, `ExposeHeaders: ["ETag"]` y los orígenes `http://localhost:3000` + dominio de Vercel (ver README). Sin esto ninguna subida desde el navegador funciona.
- [ ] **Step 1:** `supabase link --project-ref <ref>` y `supabase db push` → migración aplicada. Sembrar `club_members` con los emails reales (editar `seed/club_members.sql`, ejecutar en SQL Editor o `psql`).
- [ ] **Step 2:** Crear usuario admin en Authentication → Users (Alfredo) y desactivar sign up.
- [ ] **Step 3:** `pnpm dev:all`; login en `/admin/login`; crear partido con un video corto (< 100 MB) y otro > 100 MB; ver que el worker procesa, aparecen clips y reel; crear clip custom; publicar; ver `/girls` con reel y clips; comprobar que el objeto original desapareció de R2 y `source_deleted_at` está seteado.
- [ ] **Step 4:** `vercel env` con las mismas variables (sin `DELETE_SOURCE…` que es del worker) y deploy preview cuando Alfredo lo pida.
