# Module boundaries

- `platforms`: platform identities; adapters are deliberately absent pending real integration work.
- `publishing`: pure outcome/retry eligibility policies only; no executor or network effects.
- `users` and `drafts`: initial tables in `src/db/schema.ts`, no exposed CRUD until auth exists.

Application routes orchestrate modules. Pure domain code must not import Next.js,
database or external SDKs. Server infrastructure lives in `src/db` and is guarded
with `server-only`; scripts use its explicit connection factory.
Do not create empty placeholder adapters or success-returning stubs.
