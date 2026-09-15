import { describe, expect, it } from "vitest";
import { platforms } from "../platforms/domain";
import { canRequestPrimaryRetry, canRequestSecondaryRetry, confirmedPublicationStatus, type PublicationStatus } from "./policy";

describe("approved reliability policies (not a publishing implementation)", () => {
  it("retains all mandatory platforms", () => expect(platforms).toEqual(["instagram", "tiktok", "youtube"]));
  it.each<PublicationStatus>(["Ready", "Uploading", "Processing", "Published", "PublishedWithWarning", "UnknownOutcome"])(
    "blocks primary retry for %s", (status) => expect(canRequestPrimaryRetry(status)).toBe(false));
  it("allows requesting retry after known failure only", () => expect(canRequestPrimaryRetry("Failed")).toBe(true));
  it("keeps secondary failures separate from primary success", () => {
    expect(confirmedPublicationStatus(true)).toBe("PublishedWithWarning");
    expect(confirmedPublicationStatus(false)).toBe("Published");
  });
  it("requires independent repeatability for secondary retries", () => {
    expect(canRequestSecondaryRetry("PublishedWithWarning", true)).toBe(true);
    expect(canRequestSecondaryRetry("PublishedWithWarning", false)).toBe(false);
    expect(canRequestSecondaryRetry("UnknownOutcome", true)).toBe(false);
  });
});
