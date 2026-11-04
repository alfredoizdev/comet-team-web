-- Folder of the HLS streaming copy of the full match (`{videoId}/hls`), set by the
-- worker once all renditions are uploaded. Null while it is not ready (or never made).
alter table videos add column hls_path text;
