import type { TweetLookup, XProvider } from "./index";

const BASE_URL = "https://api.twitterapi.io";

export class TwitterApiIoProvider implements XProvider {
  private readonly key: string;

  constructor(key?: string) {
    this.key = key ?? process.env.TWITTERAPI_IO_KEY ?? "";
    if (!this.key) {
      // We don't throw at construction time so the app can boot without keys.
      // Throw on first use instead.
    }
  }

  async getTweet(tweetId: string): Promise<TweetLookup> {
    if (!this.key) throw new Error("TWITTERAPI_IO_KEY is not set");

    const url = `${BASE_URL}/twitter/tweets?ids=${encodeURIComponent(tweetId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.key}` },
      cache: "no-store",
    });

    if (res.status === 404) {
      return deletedShape(tweetId);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`twitterapi.io error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as TwitterApiIoResponse;
    const tweet = pickTweet(json, tweetId);
    if (!tweet) return deletedShape(tweetId);

    return {
      tweetId,
      authorUsername: (tweet.author?.userName ?? tweet.author?.username ?? "").toLowerCase(),
      authorId: String(tweet.author?.id ?? tweet.authorId ?? ""),
      impressionCount: pickImpressions(tweet),
      createdAt: tweet.createdAt ?? tweet.created_at ?? new Date().toISOString(),
      deleted: false,
    };
  }
}

type TwitterApiIoResponse = {
  data?: TwitterApiIoTweet[];
  tweets?: TwitterApiIoTweet[];
};

type TwitterApiIoTweet = {
  id?: string;
  tweetId?: string;
  authorId?: string;
  createdAt?: string;
  created_at?: string;
  author?: {
    id?: string;
    userName?: string;
    username?: string;
  };
  viewCount?: number;
  view_count?: number;
  public_metrics?: { impression_count?: number };
};

function pickTweet(json: TwitterApiIoResponse, tweetId: string): TwitterApiIoTweet | null {
  const list = json.data ?? json.tweets ?? [];
  if (!list.length) return null;
  return list.find((t) => String(t.id ?? t.tweetId) === tweetId) ?? list[0];
}

function pickImpressions(tweet: TwitterApiIoTweet): number | null {
  if (typeof tweet.public_metrics?.impression_count === "number") {
    return tweet.public_metrics.impression_count;
  }
  if (typeof tweet.viewCount === "number") return tweet.viewCount;
  if (typeof tweet.view_count === "number") return tweet.view_count;
  return null;
}

function deletedShape(tweetId: string): TweetLookup {
  return {
    tweetId,
    authorUsername: "",
    authorId: "",
    impressionCount: null,
    createdAt: new Date().toISOString(),
    deleted: true,
  };
}
