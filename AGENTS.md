# AGENTS.md — compactpickup

Catalog of compact and mid-size pickup trucks sold in the U.S., styled like an old VHS recording. Started as a CSC436 React class project. Live at compactpickup.com.

## Dev framework

This repo follows Jake's dev framework: [jakedcl/dev-framework](https://github.com/jakedcl/dev-framework) (start at its `AGENTS.md`). The framework is the source of truth; if anything in this file conflicts with it, the framework wins.

The framework repo is private. Cloud agents open it with `git clone --depth 1 https://x-access-token:${DEV_FRAMEWORK_READ_TOKEN}@github.com/jakedcl/dev-framework /tmp/dev-framework` (the token is a Cursor secret; never print or commit it).

## Stack
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.
- 3D model viewer: three 0.186, @react-three/fiber 9, drei 10.
- Sanity project `xbw6uf6e`, dataset `production`, public data (no env needed). Client and queries are in `src/lib/sanity.ts`.
- Studio config and schemas live in `sanity/`; the editor is embedded at `/studio` via `next-sanity`.
- Binder (camera identifier): Neon Postgres (`pg` + `db/migrations`), private Cloudflare R2, Resend one-time codes. Public pages do not read Neon or R2.
- Vercel (`vercel.json` is just the Next.js framework preset).

## Layout
- `src/app/` home (manufacturer menu + carousel + VHS clock), `[manufacturer]/`, `[manufacturer]/[model]/`, `timeline/`, `browse/`, `game/`, `api/catalog/`.
- `src/app/binder/` private review dashboard (sign-in, approve, upload, coverage). Not in the public nav. `/admin` still redirects to `/studio`.
- `src/app/api/auth/` one-time code. `src/app/api/admin/` review routes for the signed-in admin.
- `src/components/` ImageCarousel, 3D truck viewer, `ui/`. `src/lib/`. `src/lib/binder/` db, R2, WebP, session. `src/lib/clip/browser.ts` shared browser fingerprint.
- `sanity/schemaTypes/` manufacturer, truckModel, truckSpecFields.
- `db/migrations/`, `data/truck-faces.json`, `scripts/` (migrate, import, seed).
- `docs/` (screenshot).

## Commands
- `npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm run test:binder`.
- `npm run studio:dev` and `studio:build` (both use `--dir ./sanity`). Production Studio is `/studio` on the site.
- Binder writes are dry-run unless `BINDER_CONFIRM=1`. Use `DATABASE_URL_UNPOOLED` for `npm run db:migrate`, `npm run import:sanity`, `npm run import:folder -- ./folder`, and `npm run seed:faces`. The app uses pooled `DATABASE_URL`. Env names are in `.env.example`. Clients are lazy, so lint, typecheck, and build pass when the vars are unset.

## Gotchas
- `sanity/` has its own package.json. Run Studio through the root `studio:*` scripts.
- Sanity images must stay under `cdn.sanity.io/images/**` (`next.config.ts` remotePatterns), with custom `deviceSizes` and `imageSizes`.
- Keep the VHS look (status bar, VCR font) consistent across new pages.
- Binder photos: one ~1600px WebP in private R2, plus a 480px thumb. sha256 of the bytes handed to the importer, for dedupe. status `pending` until the owner approves at `/binder`. Embeddings are 768-d SigLIP2-base on a D-FINE vehicle crop (15% pad), computed in the browser by `embedImage` in `src/lib/clip/browser.ts` (D-FINE `onnx-community/dfine_n_coco-ONNX` fp16, then SigLIP q4). Pipeline id `siglip2-base-q4+dfine-crop15`. Stored in `photos.embedding_siglip` on approve. Legacy `photos.embedding` (512-d CLIP) is kept until re-fingerprinting finishes. Matching uses `approved` rows whose `embedding_siglip` is not null. Optional trained probe weights load from `src/lib/scan/probe.json` when present. `truck_faces` labels never affect matching. Add faces in `data/truck-faces.json`.
- Sign-in allows only `ADMIN_EMAIL` (see `.env.example`). Codes are hashed, emailed with Resend, and the session is an httpOnly SameSite=Lax cookie signed with `AUTH_SECRET`. No shared password. Code sends are capped per day. Lockout counts failures against codes that were actually issued.
- The old `compactpickup-2` and `compactpickup-2-api` class repos were deleted from GitHub. This repo is the live one.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
