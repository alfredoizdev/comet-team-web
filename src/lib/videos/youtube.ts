const ID = /^[A-Za-z0-9_-]{11}$/;

/** Returns the 11-char video id and a canonical watch URL, or null if it is not a YouTube video link. */
export function parseYouTubeUrl(input: string): { id: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/);
      if (m) id = m[1];
    }
  }
  if (!id || !ID.test(id)) return null;
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}
