import { TwitterApiIoProvider } from "./twitterapi-io";
import { XOfficialProvider } from "./x-official";

export type TweetLookup = {
  tweetId: string;
  authorUsername: string;
  authorId: string;
  impressionCount: number | null;
  createdAt: string;
  deleted: boolean;
};

export interface XProvider {
  getTweet(tweetId: string): Promise<TweetLookup>;
}

let cached: XProvider | null = null;

export function getXProvider(): XProvider {
  if (cached) return cached;
  const choice = process.env.X_PROVIDER || "twitterapi_io";
  if (choice === "x_official") {
    cached = new XOfficialProvider();
  } else {
    cached = new TwitterApiIoProvider();
  }
  return cached;
}

// for tests
export function _resetXProvider() {
  cached = null;
}
