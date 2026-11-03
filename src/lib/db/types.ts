export const TEAMS = ["girls", "boys"] as const;
export type Team = (typeof TEAMS)[number];

export type Role = "admin" | "coach";

export type VideoStatus = "uploaded" | "processing" | "done" | "error";

export const ALLOWED_VIDEO_EXTS = ["mp4", "mov", "avi", "webm"] as const;
export type VideoExt = (typeof ALLOWED_VIDEO_EXTS)[number];

export const MAX_VIDEO_BYTES = 5 * 1024 ** 3;
export const MULTIPART_THRESHOLD = 100 * 1024 ** 2;
export const PART_SIZE = 50 * 1024 ** 2;
export const SIGNED_URL_TTL_SECONDS = 4 * 3600;

export type Project = {
  id: string;
  user_id: string;
  title: string;
  team: Team;
  match_date: string | null;
  opponent: string | null;
  created_at: string;
};

export type Video = {
  id: string;
  project_id: string;
  file_path: string;
  status: VideoStatus;
  error_message: string | null;
  duration: number | null;
  highlight_reel_path: string | null;
  is_published: boolean;
  published_at: string | null;
  source_deleted_at: string | null;
  /** YouTube watch URL when the match was imported from a link. */
  source_url: string | null;
  created_at: string;
};

export type Clip = {
  id: string;
  video_id: string;
  start_time: number;
  end_time: number;
  score: number;
  file_path: string;
  created_at: string;
};

export type ClubMember = {
  id: string;
  email: string;
  role: Role;
  team: Team | null;
};
