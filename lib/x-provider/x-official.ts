import type { TweetLookup, XProvider } from "./index";

// Stub for the official X API. Wire up when/if we move off twitterapi.io.
export class XOfficialProvider implements XProvider {
  async getTweet(_tweetId: string): Promise<TweetLookup> {
    throw new Error("XOfficialProvider not implemented yet");
  }
}
