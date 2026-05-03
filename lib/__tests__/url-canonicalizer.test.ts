import { describe, expect, it } from "vitest";
import { parseTweetUrl } from "../url-canonicalizer";

describe("parseTweetUrl", () => {
  it("parses canonical x.com URL", () => {
    const r = parseTweetUrl("https://x.com/jack/status/20");
    expect(r).toEqual({
      username: "jack",
      tweetId: "20",
      canonical: "https://x.com/jack/status/20",
    });
  });

  it("parses twitter.com URL and canonicalizes to x.com", () => {
    const r = parseTweetUrl("https://twitter.com/Jack/status/123456789");
    expect(r?.canonical).toBe("https://x.com/Jack/status/123456789");
  });

  it("parses mobile.twitter.com URL", () => {
    const r = parseTweetUrl("https://mobile.twitter.com/jack/status/20");
    expect(r?.username).toBe("jack");
    expect(r?.tweetId).toBe("20");
  });

  it("strips trailing query and fragment", () => {
    const r = parseTweetUrl("https://x.com/jack/status/20?s=20&t=abc");
    expect(r?.canonical).toBe("https://x.com/jack/status/20");
  });

  it("accepts http and uppercase host", () => {
    const r = parseTweetUrl("http://X.com/jack/status/20");
    expect(r?.tweetId).toBe("20");
  });

  it("rejects non-status URL", () => {
    expect(parseTweetUrl("https://x.com/jack")).toBeNull();
  });

  it("rejects bare text", () => {
    expect(parseTweetUrl("hello world")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(parseTweetUrl("")).toBeNull();
  });

  it("rejects youtube link", () => {
    expect(parseTweetUrl("https://youtube.com/watch?v=abc")).toBeNull();
  });

  it("rejects illegal handle chars", () => {
    expect(parseTweetUrl("https://x.com/ja-ck/status/20")).toBeNull();
  });
});
