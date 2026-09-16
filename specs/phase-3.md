# Phase 3 — Drafts and media

Approved scope: multiple owner-scoped drafts, server-confirmed cross-device recovery,
debounced autosave with optimistic versions and explicit conflict handling. Unpublished
drafts and their media have no automatic expiry; only explicit deletion removes them.
Original video is remote after upload, independent of the original local file.

Internal defaults use decimal units: video 2,000,000,000 bytes, image 25,000,000 bytes,
active/reserved media quota 10,000,000,000 bytes per user. Configuration is centralized.
Accept MP4/MOV video and JPEG/PNG/WebP images based on inspection, not browser claims.
Persist duration; no product duration limit and no video transcoding. Platform limits,
selection, overrides and publishing eligibility belong to Phase 4.

Media kinds: original_video, uploaded_image, extracted_frame, rendered_cover, thumbnail.
Assets contain owner/draft, generated object key, actual MIME/bytes/SHA-256, dimensions,
duration/container/codecs, source/editor recipe, lifecycle, timestamps and retention.
Future terminal batches may set original-video deletion to terminal time + 24 hours;
no batches or automatic publication cleanup are implemented here.

Cover V1: one base image/frame and one optional text block, normalized position/size,
predefined styles, touch/mouse preview. Persist recipe and regenerate on the server.
Replacing the selected video invalidates its frame-based cover, preserving caption.

Technical implementation: AWS SDK v3 behind an S3-compatible interface; private bucket,
server-generated keys, short-lived signed multipart parts/read URLs. Local S3-compatible
service and real integration tests; no production fake storage. Quota reserves expected
bytes before initiation, checks parts and actual object size, retains failed reservations
until remote cleanup. Uploads are resumable with reselected file and SHA-256 per part.
Only validated assets can become draft video/cover or obtain read URLs.

FFmpeg/Sharp run in a separate bounded media HTTP process on an internal network,
authenticated by a server secret. It accepts work only when idle (no custom queue).
Durable asset states and expiring processing leases permit explicit recovery after crash.
This is not a publishing worker or pg-boss deployment. Temporary processing files are
random, bounded, outside the web process and removed after each operation.

Acceptance: owner isolation, CRUD/recovery, stale version refusal, quota reservation,
multipart lifecycle and private access, real FFmpeg/Sharp inspection and corrupt fixtures,
frame extraction, cover recipe/regeneration, responsive editor, complete Phase 1/2 checks.
Stop after Phase 3. Google credentials are external setup, not a blocker or auth bypass.
