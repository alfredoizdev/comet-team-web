-- A match can come from a YouTube link instead of an uploaded file. When set,
-- the worker downloads the video with yt-dlp (file_path is then only a label).
alter table videos add column source_url text;
