const TWEET_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,30})(?:\/|\?|#|$)/i;

export type ParsedTweetUrl = {
  username: string;
  tweetId: string;
  canonical: string;
};

export function parseTweetUrl(input: string): ParsedTweetUrl | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(TWEET_URL);
  if (!match) return null;
  const username = match[1];
  const tweetId = match[2];
  return {
    username,
    tweetId,
    canonical: `https://x.com/${username}/status/${tweetId}`,
  };
}
