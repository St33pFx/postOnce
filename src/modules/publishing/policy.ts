export type PublicationStatus =
  | "Ready" | "Uploading" | "Processing" | "Published"
  | "PublishedWithWarning" | "Failed" | "UnknownOutcome";

/** Eligibility only: authorization, preflight and attempt locking are still required. */
export function canRequestPrimaryRetry(status: PublicationStatus): boolean {
  return status === "Failed";
}

export function confirmedPublicationStatus(secondaryFailed: boolean): PublicationStatus {
  return secondaryFailed ? "PublishedWithWarning" : "Published";
}

export function canRequestSecondaryRetry(status: PublicationStatus, independentlyRepeatable: boolean): boolean {
  return status === "PublishedWithWarning" && independentlyRepeatable;
}
