const originalFetch = globalThis.fetch;
const userInfoUrl = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name";
const creatorInfoUrl = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";

function requestUrl(input) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
}

function isFixtureRequest(input, init) {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  return headers.get("authorization") === "Bearer tiktok-fixture-token";
}

globalThis.fetch = async (input, init) => {
  const url = requestUrl(input);
  if (isFixtureRequest(input, init) && url === userInfoUrl) {
    return new Response(JSON.stringify({ data: { user: { open_id: "tiktok-fixture" } }, error: { code: "ok" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (isFixtureRequest(input, init) && url === creatorInfoUrl) {
    return new Response(JSON.stringify({
      data: {
        creator_nickname: "TikTok fixture",
        privacy_level_options: ["SELF_ONLY"],
        comment_disabled: false,
        duet_disabled: true,
        stitch_disabled: true,
        max_video_post_duration_sec: 180,
      },
      error: { code: "ok" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return originalFetch(input, init);
};
