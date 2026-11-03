# Comets Web: highlights con el backend de PeakClip

Fecha: 2026-10-31. Estado: borrador para aprobación de Alfredo.

## 1. Intención

La web de Houston Comet SC (este repo) hoy muestra una home partida Girls/Boys y
una página de videos por equipo con placeholders de YouTube. Alfredo tiene otra
app, **PeakClip** (`~/Desktop/MVP`), que sube un partido a Supabase, detecta los
picos de audio con un worker de FFmpeg, corta los clips y arma un highlight
reel. Queremos **traer ese flujo a la web de Comets**: un admin o un entrenador
entra con login, sube el partido de su equipo, revisa y edita los highlights y
los publica; los padres los ven en la página pública del equipo sin login.

Por qué: hoy los highlights se generan en PeakClip pero no hay forma de
mostrárselos a los padres, y PeakClip no sabe de equipos ni de más de un
partido por usuario.

## 2. Objetivos, no objetivos, anti-objetivos

**Objetivos**

- Mismo backend que PeakClip: su esquema de Supabase (base, auth, storage) y su
  worker de FFmpeg, sin servidores nuevos. **Hallazgo 2026-10-31:** el proyecto
  Supabase en la nube de PeakClip (`tykwyjgvtbfpsrdxrgah`) ya no existe (DNS
  NXDOMAIN y no figura en la cuenta), así que se crea un **proyecto Supabase
  nuevo para Comets** y se le aplican las migraciones de PeakClip más las
  nuestras. PeakClip no comparte datos con Comets.
- Panel admin dentro de la web de Comets con login, subida de video, estado del
  procesamiento, editor de clips y botón de publicar.
- Página pública por equipo que muestra el reel y los clips de cada partido
  publicado.
- Admin y entrenadores: un admin ve los dos equipos; un entrenador solo el suyo.

**No objetivos (v1)**

- Análisis con IA (Modal), subida a YouTube, roster de jugadoras y overlays con
  nombre (lower third), colores de camiseta. Nada de eso se trae.
- Login o cuentas para padres. Calendario, plantel, contacto.
- Deployar el worker en un servidor. Sigue corriendo en la Mac de Alfredo.
- Tocar la web de PeakClip. Sigue funcionando como hasta ahora.

**Anti-objetivos (sería un fracaso aunque "funcione")**

- Que un padre pueda ver un video no publicado, o que cualquiera con un link
  pueda bajar el partido completo.
- Que un entrenador pueda borrar o publicar partidos del otro equipo.
- Que el proyecto quede inutilizable por límites del plan de Supabase (ver 3).

## 3. Restricciones

- Proyecto Supabase nuevo (región us-east o us-west, la misma cuenta). Se
  aplican las migraciones `001`–`018` de PeakClip y después las de Comets.
- **Supabase en plan Free** (decisión de Alfredo 2026-11-01): solo base de
  datos, auth y una Edge Function. **Ningún archivo va a Supabase Storage.**
- **Videos en Cloudflare R2**, en la misma cuenta de Cloudflare que ya usa
  riftlens (bucket `riftlens-coaching-videos`), con un bucket nuevo
  `soccer-videos`. R2: 10 GB gratis, egress gratis. Para que alcance, el
  worker borra el partido completo del bucket cuando terminó de cortar clips y
  armar el reel.
- El worker necesita FFmpeg y ffprobe en el PATH de la Mac. Corre con
  `pnpm dev:all` igual que en PeakClip; si la Mac está apagada los videos quedan
  en "processing" hasta que se prenda. Alfredo lo aceptó explícitamente.
- Next.js 16 App Router con `cacheComponents` activo: los accesos a `params`,
  cookies y datos van dentro de `Suspense` o en componentes marcados.
- El bucket R2 es privado (Public Access: Disabled). Todo se sirve con URLs
  firmadas (presigned GET) de 4 horas, el mismo patrón que riftlens.
- Los videos pesan hasta 5 GB. La subida va directo del navegador a R2 con una
  presigned PUT URL (multipart si supera 100 MB), nunca pasa por Vercel.

## 4. Decisiones tomadas

### 4.1 Arquitectura

- **Un solo repo, dos procesos**: la app Next.js (`src/`) y el worker copiado
  de PeakClip en `worker/` (su propio `package.json`, `tsx`). Script raíz
  `pnpm dev:all` levanta ambos, como `dev.sh` en PeakClip. Sin monorepo ni
  turbo: el worker se copia tal cual (`index.ts`, `process.ts`, `audio.ts`),
  quitando `overlay.ts`, el loop de overlays y el análisis IA.
- **Supabase propio de Comets (Free)**, con el esquema de PeakClip. Claves en
  `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`). Se vincula con `supabase link` y las
  migraciones se aplican con `supabase db push`.
- **Cloudflare R2 para archivos.** Variables en `.env.local`:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  (`soccer-videos`), `R2_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`).
  Las usan solo el servidor Next.js (server actions) y el worker, nunca el
  navegador. Cliente: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  en un módulo `src/lib/r2.ts` compartido con el worker (`worker/src/r2.ts`
  importa el mismo código).
- **Patrón de firma copiado de riftlens** (`lol-app/desktop-app/supabase/functions/r2-sign`):
  el cliente pide al servidor una URL firmada para `put`/`get`, y el servidor
  valida que el path pertenezca al usuario (`{userId}/...`) o esté publicado.
  En Comets esto es una server action, no una Edge Function, porque ya
  tenemos servidor Next.js.
- **Service role solo en servidor** (server actions, route handlers, worker).
  El navegador usa la anon key con la sesión del usuario únicamente para login
  y para la subida TUS.

### 4.2 Base de datos (migraciones nuevas, aditivas)

`supabase/migrations/` de este repo contiene **una migración consolidada**
(`0001_schema.sql`) con las tablas de PeakClip que usamos (`projects`,
`videos`, `clips`, `claim_next_video`), mismos nombres de columnas para que el
worker copiado funcione, más nuestras columnas y `club_members`. Sin Storage.
(Ajuste del plan 2026-11-01: más simple que copiar las 18 migraciones de
PeakClip y deshacer Storage.) Se aplica con `supabase db push`.

```
019_club_members.sql
  club_members (id, email unique, role check in ('admin','coach'),
                team check in ('girls','boys') null, created_at)
  -- admin: team null (ve los dos). coach: team obligatorio.
  -- RLS: solo service role. Se siembra con los emails que pase Alfredo.

020_projects_team.sql
  projects.team text check in ('girls','boys') null   -- null = proyecto de PeakClip
  projects.match_date date null
  projects.opponent text null

021_videos_published.sql
  videos.is_published boolean not null default false
  videos.published_at timestamptz null

022_no_storage.sql
  -- Deshace lo de Storage de las migraciones de PeakClip (004, 015–018):
  -- borra los buckets `videos`, `clips`, `players`, `team-logos` y sus
  -- policies. Los paths en `videos.file_path`, `clips.file_path` y
  -- `videos.highlight_reel_path` pasan a ser claves de objeto en R2 con el
  -- mismo formato que usaba PeakClip.
```

Las RLS de tablas de PeakClip se mantienen (no estorban: el panel usa el
service role y la autorización se hace en código, ver 4.4). `projects.user_id`
es el usuario que creó el partido (admin o coach); `club_members` se cruza por
email con `auth.users`, no necesita `user_id`.

### 4.3 Modelo de dominio en Comets

- **Partido** = `projects` row con `team`, `title`, `match_date`, `opponent`.
  Un partido tiene un video (igual que PeakClip; no se traen los límites de
  beta de 1 proyecto por usuario ni 3 subidas por hora).
- **Video** = `videos` row. Estados de PeakClip: `uploaded` → `processing` →
  `done` | `error`. `error_message = "no_audio"` se muestra como "el video no
  tiene audio utilizable".
- **Clip** = `clips` row. Auto (score ≥ 1.5), custom pendiente (score 0),
  custom listo (1), custom fallido (−1). Sin `player_id` ni overlays.
- **Reel** = `videos.highlight_reel_path`. `null` con `status = done` significa
  "regenerar"; el worker lo rehace solo.
- **Publicado** = `videos.is_published`. Solo se puede publicar un video en
  `done` con reel.

### 4.4 Auth y permisos

- Supabase Auth del proyecto nuevo, solo email + contraseña. **Registro
  público desactivado** en el dashboard (Authentication → Sign up): solo
  entran cuentas creadas por Alfredo.
- `/admin/login`. Tras loguearse, el servidor busca el email en `club_members`.
  Si no está, cierra sesión y muestra "Tu cuenta no está autorizada".
- Helper `requireMember()` en servidor: devuelve `{ userId, email, role, team }`
  o redirige a `/admin/login`. Helper `assertCanManage(member, project)`:
  admin siempre; coach solo si `project.team === member.team`. **Toda** server
  action del panel llama a ambos antes de tocar datos, incluida la firma de
  URLs (PeakClip firmaba cualquier path sin chequear; acá no).
- `proxy.ts` (nombre de Next 16) protege `/admin/*` salvo `/admin/login`.
- Alta de usuarios: Alfredo crea las cuentas en el dashboard de Supabase
  (Authentication → Users) y agrega el email a `club_members`. Sin pantalla de
  registro en v1.

### 4.5 Panel admin (rutas)

```
/admin/login              email + contraseña
/admin                    lista de partidos; admin ve pestañas Girls/Boys,
                          coach ve solo su equipo. Estado, publicado sí/no,
                          botón "Nuevo partido"
/admin/matches/new        título, fecha, rival, equipo (fijo para coach) +
                          subida del video (TUS, barra de progreso)
/admin/matches/[id]       estado del procesamiento (polling cada 5 s como
                          PeakClip), reel, lista de clips, editor, publicar /
                          despublicar, reprocesar, borrar partido
```

**Subida**: mismo flujo que PeakClip pero contra R2. La fila `videos` se
inserta recién cuando el archivo terminó de subir, igual que en PeakClip, para
no agregar estados nuevos. Flujo:
1. Server action `signUpload(projectId, ext, contentType, size)` valida
   membership/equipo y tipo (mp4, mov, avi, webm), genera `videoId`, y devuelve
   una presigned PUT URL (o un multipart `uploadId` + URLs por parte si
   `size > 100 MB`, partes de 50 MB) para la clave
   `{userId}/{videoId}/video.{ext}`.
2. El navegador sube con XHR y barra de progreso. No hace falta TUS: el
   multipart de R2 permite reintentar cada parte.
3. Server action `completeUpload(videoId, uploadId?, parts?)` cierra el
   multipart, verifica con `HeadObject` que el objeto existe, e inserta
   `videos` con `status = uploaded`, `analysis_type = audio`.

**Editor**: port de `clips/[videoId]/edit/page.tsx` de PeakClip (867 líneas,
componente cliente) a Comets con el mismo comportamiento. Ojo: en PeakClip esa
página lee `videos` y `clips` desde el navegador con la anon key apoyada en
RLS; acá todo acceso a datos pasa a server actions, así que es una reescritura
del acceso a datos, no una copia. fuente "Full match" /
"Highlight reel", timeline con handles de recorte, zoom, salto a tiempo,
"crear clip" (inserta `clips` con score 0 y path `{videoId}/custom_{uuid}.mp4`),
borrar clip (borra archivo + fila y pone `highlight_reel_path = null`). Se
quitan: asignar jugadora, overlays, IA. El estilo se adapta a los colores del
equipo (rosa o navy) con shadcn.

**Publicar**: server action `setPublished(videoId, boolean)`; exige `done` y
reel presente para publicar.

### 4.6 Página pública por equipo

`/girls` y `/boys` dejan de leer `src/lib/teams.ts` (que se reduce a nombre,
colores y escudo) y pasan a leer Supabase con el service role y firmar GET en
R2:

- `projects` donde `team = X`, join `videos` con `is_published = true` y
  `status = done`, orden `match_date desc`.
- Por partido: tarjeta con título, rival, fecha, el **reel** como video
  principal (presigned GET de 4 h) y debajo los clips (score > 0, orden
  `start_time`) como miniaturas que se reproducen en un diálogo.
- El partido completo **no** se expone a los padres (y además el worker lo
  borra de R2 al terminar).
- Cache: la página se renderiza en servidor por request con las URLs firmadas;
  no se cachea más de 1 hora para no entregar links vencidos (decisión del
  builder: `"use cache"` con `cacheLife` corto, o sin cache).
- El diseño sigue las pantallas 1b/1c de Claude Design (header de color,
  título "Videos", grilla). Estado vacío: "No videos yet".

### 4.7 Worker

Copia de `~/Desktop/MVP/apps/worker/src/{index,process,audio}.ts` a
`worker/src/`. Cambios:

- **Storage → R2**: donde PeakClip hace `storage.from('videos').download()` y
  `storage.from('clips').upload()`, el worker usa `GetObject` / `PutObject` de
  R2 con las mismas claves de objeto. Es un reemplazo 1:1 en `process.ts`.
- **Borrado del partido completo**: al terminar `processVideo` con éxito
  (clips + reel subidos), borra `{userId}/{videoId}/video.{ext}` de R2 y marca
  `videos.source_deleted_at` (columna nueva, migración 023; `file_path` queda
  como estaba porque PeakClip lo exige `NOT NULL`). Con el original borrado ya no se pueden crear clips custom ni reprocesar: el
  panel lo muestra y deshabilita esos botones. **Esto es una decisión de
  diseño para quedar dentro de los 10 GB gratis de R2**; si Alfredo prefiere
  conservar los partidos completos, basta con no activar el borrado (flag
  `DELETE_SOURCE_AFTER_PROCESSING`, default `true`).
- Se elimina `overlay.ts`, `processOverlays()`, `@napi-rs/canvas` y el bloque
  de IA (ya comentado).
- Se mantienen `claim_next_video`, `processCustomClips`, `regenerateStaleReels`,
  constantes `MAX_CLIPS = 12`, `MIN_GAP_SECONDS = 20`, `MIN_SCORE = 1.5`,
  recorte 5 s antes / 10 s después del pico, temp en `/tmp/peakclip`.
- Lee `.env.local` de la raíz (`tsx --env-file=../.env.local`).

Nota: el worker de PeakClip apunta a su propio Supabase local (`.env`), no a
este proyecto. El único worker que procesa Comets es `worker/` de este repo.

### 4.8 Seguridad (arreglos respecto a PeakClip)

- Nunca firmar un path sin verificar que pertenece a un proyecto del equipo
  del usuario (o publicado, en la página pública).
- `createCustomClip`, `deleteClip`, `setPublished`, `reprocess`, `deleteMatch`
  validan membership + equipo.
- Límites de rango al crear clips: 1 s ≤ duración ≤ 60 s, dentro de la
  duración del video.
- Rate limit: no se trae el de PeakClip en v1 (usuarios de confianza).

### 4.9 Limpieza de lo que ya existe en Comets

- `src/lib/teams.ts`: quedan `name`, `shortName`, colores y escudo; se va el
  array `videos` de YouTube y `src/components/video-card.tsx` se reemplaza por
  tarjetas de reel/clip. `next.config.ts` deja de necesitar `i.ytimg.com`.
- Home partida: sin cambios.

### 4.10 Idioma

Toda la interfaz, pública y admin, en **inglés**, igual que la web actual y
el diseño de Claude Design. Los textos en español de este documento son
descripciones, no copy.

## 5. Lo que queda a criterio del builder

- Estructura exacta de carpetas bajo `src/app/admin` y `src/lib/supabase`.
- Componentes shadcn a usar (tabs, dialog, alert-dialog, progress, table…).
- Cómo hacer el polling de estado (server action + `setInterval` como
  PeakClip, o `router.refresh`).
- Detalle visual del panel admin: debe respetar los colores del equipo pero no
  hay diseño de Claude Design para él; usar shadcn con criterio.
- Tests: unitarios para `assertCanManage`, validación de rangos de clip y
  mapeo de estados; no se exige test del worker (ya tiene los de PeakClip).

## 6. Datos que Alfredo tiene que aportar

- **Cloudflare R2**: crear el bucket `soccer-videos` (privado) en la cuenta de
  riftlens y un API token con permiso "Object Read & Write" sobre ese bucket.
  Poner `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` en
  `.env.local` (Claude no maneja esas claves; solo las lee del archivo).
- **Supabase**: crear el proyecto `comets` (Free) en el dashboard, o
  autorizar a Claude a crearlo con `supabase projects create`. Pegar URL, anon
  key y service role key en `.env.local`.
- Emails de admin y de cada entrenador con su equipo (se siembran en
  `club_members`).
- FFmpeg: verificado, versión 8 instalada en la Mac.
