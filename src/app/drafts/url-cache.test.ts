import { describe, expect, it } from "vitest";
import { mergeAssetUrls } from "./url-cache";

describe("draft media URL cache", () => {
  it("keeps a ready video src stable across an unchanged polling cycle", () => {
    const current = {video:"https://media.test/video?signature=first"};
    const unchanged = mergeAssetUrls(current,{video:"https://media.test/video?signature=second"},new Set(["video"]));
    expect(unchanged.video).toBe(current.video);
  });
  it("only replaces a URL when the caller explicitly renewed it", () => {
    const renewed = mergeAssetUrls({video:"old"},{video:"new"},new Set(["video"]),new Set(["video"]));
    expect(renewed.video).toBe("new");
  });
});
