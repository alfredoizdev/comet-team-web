-- Worker progress shown on the admin match page while a video is processing.
alter table videos add column stage text;
alter table videos add column progress integer check (progress between 0 and 100);
