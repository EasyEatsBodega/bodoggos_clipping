-- Track consecutive "tweet missing" responses from the X data provider so we
-- don't reject a clip on a single transient signal. Both twitterapi.io and
-- the official X API occasionally return empty data or 404 for tweets that
-- are still live (rate limits, indexing lag, briefly-protected accounts).
-- The poll-clips and finalize-clips routes increment this on missing,
-- reset to 0 on any successful lookup, and only reject the clip once it
-- crosses a small confirmation threshold.
alter table public.clips
  add column if not exists missing_poll_count integer not null default 0;
