# AGENTS.md — compactpickup

Catalog of compact and mid-size pickup trucks sold in the U.S., styled like an old VHS recording. Started as a CSC436 React class project. Live at compactpickup.vercel.app.

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
- `src/app/binder/` binder sign-in and photo counts. Not in the public nav. `/admin` still redirects to `/studio`.
- `src/app/api/auth/` one-time code. `src/app/api/admin/` photo bytes for the signed-in admin.
- `src/components/` ImageCarousel, 3D truck viewer, `ui/`. `src/lib/`. `src/lib/binder/` db, R2, WebP, session.
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
- Binder photos: one ~1600px WebP in R2, sha256 of the original bytes for dedupe, status `pending` until review. Embeddings are 512-d CLIP ViT-B/32 (`openai/clip-vit-base-patch32`), cosine HNSW, null until a later phase. Matching will use `approved` rows only. `truck_faces` labels never affect matching. Add faces in `data/truck-faces.json`.
- Sign-in allows only `ADMIN_EMAIL` (see `.env.example`). Codes are hashed, emailed with Resend, and the session is an httpOnly SameSite=Lax cookie signed with `AUTH_SECRET`. No shared password. Code sends are capped per day. Lockout counts failures against codes that were actually issued.
- The old `compactpickup-2` and `compactpickup-2-api` class repos were deleted from GitHub. This repo is the live one.
