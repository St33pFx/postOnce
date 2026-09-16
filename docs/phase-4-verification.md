# Phase 4 verification matrix

| Requirement | Implementation | Test evidence |
|---|---|---|
| External refresh and provider failures | `src/modules/platforms/clients.ts` (`InstagramClient`, `TikTokClient`, `YouTubeClient`) | `clients.test.ts`: valid payloads, 401/403, expiry, timeout/network, malformed payloads, identity and Creator Info |
| Encrypted token and draft binding | `src/modules/platforms/preflight.ts` | `preflight.test.ts`: missing/expired/invalid token, disconnected account, stale binding, replacement account, ownership |
| Dynamic TikTok limits/options | `TikTokClient` + `TikTokAdapter` | `clients.test.ts`, `preflight.test.ts`: Creator Info privacy, interactions and duration |
| Effective shared values and overrides | `configuration.ts` and `preflight.ts` | `configuration.test.ts`, `preflight.test.ts`: inherited and explicit values |
| Strict configuration | `strictConfiguration` / `parseConfigurations` | `configuration.test.ts`: unknown fields, wrong types, enums, covers and discriminator |
| Per-platform validation and global gate | adapters + `globalPreflight` | `contract.test.ts`, `preflight.test.ts`: media, title/privacy and one NotReady blocks global readiness |
| Configuration UI | `src/app/drafts/platform-editor.tsx` | Browser workflow uses the real draft UI; provider calls remain external and are unavailable without credentials |

No publish batch, attempt, queue, retry or reconciliation code belongs to this phase.

- requiresRevalidation: preflight emits binding_requires_revalidation and never clears it; confirmBinding explicitly validates current revision (preflight.test).
