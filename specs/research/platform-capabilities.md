# Platform Capabilities Research

> Verificado: 2026-09-14  
> Alcance: publicación de video corto para Instagram Reels, TikTok Direct Post y YouTube Shorts.  
> Este documento describe capacidades externas actuales. Debe revisarse antes de implementar si ha pasado tiempo o cambió alguna API.

## Evidence policy

- `Verified`: respaldado por documentación oficial o recurso oficial del proveedor.
- `Not verified`: no se encontró respaldo suficiente en las fuentes oficiales revisadas.
- `Unavailable in documented schema`: la capacidad no aparece en el esquema oficial revisado; no implica que sea imposible para siempre.

## Capability Matrix

| Capability | Instagram Reels | TikTok Direct Post | YouTube Shorts |
|---|---|---|---|
| Video publishing | Verified | Verified | Verified |
| Account/API eligibility | Professional account required by official Instagram API flows | OAuth + `video.publish` | OAuth scope allowing upload |
| General text mapping | `caption` | `title` acts as video caption | `description` |
| Separate platform title | No Reel title field verified | No separate title/caption pair for video Direct Post | `snippet.title` |
| Separate description | No separate Reel description verified | No separate video description field in Direct Post | `snippet.description` |
| Hashtags in text | Use caption text | Supported inside `title` caption | Can be included in description/title text |
| Custom image cover | Verified in Meta sample via `cover_url` | No custom-image cover field in reviewed Direct Post schema | Verified via `thumbnails.set` |
| Select frame as cover | Verified via `thumb_offset` | Verified via `video_cover_timestamp_ms` | App can extract frame and upload it as custom thumbnail |
| Privacy selection | No per-post Reel privacy field verified | Required; allowed values come from creator info | Required: public/private/unlisted |
| Share Reel to feed | Verified via `share_to_feed` | N/A | N/A |
| Comments control | Not included in reviewed Reel publish request | Verified | Not part of V1 matrix |
| Duet control | N/A | Verified | N/A |
| Stitch control | N/A | Verified | N/A |
| Paid/brand disclosure | Not included in V1 until separately verified | Brand content / organic toggles documented | Not included in V1 |
| AI/synthetic disclosure | Not included in V1 until separately verified | `is_aigc` documented | `status.containsSyntheticMedia` supported |
| Audience / made for kids | N/A | N/A | `status.selfDeclaredMadeForKids` supported |
| Short-form eligibility | Reel video requirements apply | Max duration can depend on creator info | Square or vertical and up to 3 minutes for Shorts classification |

## Instagram Reels

### Verified

Official Meta resources support:

- Instagram professional accounts for publishing integrations.
- Reel publishing through a media container followed by `media_publish`.
- `caption`.
- `share_to_feed`.
- Reel video constraints documented in the official Meta Postman workspace.
- Frame-based cover using `thumb_offset` in Meta's Reels publishing sample.
- Custom cover URL using `cover_url` in Meta's Reels publishing sample.

Meta's sample states that if `cover_url` and `thumb_offset` are both supplied, `cover_url` takes precedence.

### V1 caution

The following controls visible in the consumer Instagram app are **not automatically assumed to be available through the API**:

- Upload at highest quality.
- Translate Reel.
- Share to Threads.
- Share to Facebook.
- Trial Reel.
- Tag people / collaborators under the authorization flow we eventually choose.

These must remain unavailable in our UI until individually verified for the selected Instagram API/auth flow.

### Current documented Reel media constraints in Meta's official Postman workspace

- Container: MOV or MP4.
- Audio: AAC, 48 kHz.
- Video: HEVC or H.264.
- Frame rate: 23–60 FPS.
- Max horizontal pixels: 1920.
- Recommended aspect ratio: 9:16.
- Max video bitrate: 25 Mbps.
- Audio bitrate: 128 kbps.
- Duration: 3 seconds to 15 minutes.
- Max file size: 1 GB.

## TikTok Direct Post

### Verified

The current Direct Post API documents:

- `privacy_level` is required.
- Privacy must use one of the values returned by creator info.
- `title` is the video caption; hashtags and mentions are supported.
- Maximum caption length is 2200 UTF-16 runes.
- `disable_duet`.
- `disable_stitch`.
- `disable_comment`.
- `video_cover_timestamp_ms`.
- `brand_content_toggle`.
- `brand_organic_toggle`.
- `is_aigc`.
- Local `FILE_UPLOAD` and `PULL_FROM_URL`.

Creator Info exposes, among other things:

- allowed privacy options;
- whether comments/duet/stitch are disabled for the creator;
- `max_video_post_duration_sec`.

TikTok's Content Sharing Guidelines require:

- privacy to be manually selected with no default;
- interaction permissions to be manually enabled and not checked by default;
- unavailable interactions to be disabled in the UI;
- explicit user consent before publishing.

Unaudited Direct Post clients are restricted to private visibility until audit requirements are satisfied.

### Custom image cover

The reviewed Direct Post video schema documents a frame timestamp (`video_cover_timestamp_ms`) but no arbitrary custom image upload field for the video cover.

V1 must not claim support for a custom image cover on TikTok unless newer official documentation is verified.

## YouTube Shorts

### Verified upload metadata

YouTube's Required Minimum Functionality for upload clients requires the client to expose:

- `snippet.title`;
- `snippet.description`;
- `status.privacyStatus`.

Constraints include:

- title max 100 characters;
- description max 5000 bytes;
- privacy options public, private, or unlisted.

`videos.insert` supports:

- title;
- description;
- tags;
- privacy;
- made-for-kids declaration;
- synthetic-media disclosure;
- scheduling fields, though scheduling is outside our V1.

### Thumbnails

`thumbnails.set` supports uploading a custom thumbnail.

Documented constraints:

- max 50 MB;
- JPEG or PNG, plus `application/octet-stream`.

A frame selected from the video can be extracted by our app and then uploaded through the same thumbnail endpoint.

### Shorts classification

Current YouTube Help states that videos uploaded as square or vertical and up to 3 minutes are categorized as Shorts for standard channels under the current rules.

### API project restriction

Uploads from unverified API projects are restricted to private viewing until the project passes the applicable audit.

## Official / primary references

### Meta / Instagram

- Official Meta Instagram workspace:
  https://www.postman.com/meta/instagram/overview
- Official Reel publishing collection:
  https://www.postman.com/meta/instagram/folder/830j7my/reels-publishing
- Official Meta Reels publishing sample (`cover_url`, `thumb_offset`):
  https://github.com/fbsamples/reels_publishing_apis/blob/main/insta_reels_publishing_api_sample/README.md

### TikTok

- Direct Post:
  https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- Get Started — Direct Post:
  https://developers.tiktok.com/doc/content-posting-api-get-started
- Query Creator Info:
  https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
- Content Sharing Guidelines:
  https://developers.tiktok.com/doc/content-sharing-guidelines

### YouTube

- Required Minimum Functionality:
  https://developers.google.com/youtube/terms/required-minimum-functionality
- `videos.insert`:
  https://developers.google.com/youtube/v3/docs/videos/insert
- `thumbnails.set`:
  https://developers.google.com/youtube/v3/docs/thumbnails/set
- Three-minute Shorts:
  https://support.google.com/youtube/answer/15424877
