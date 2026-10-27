# AGENTS.md — compactpickup

Catalog of compact and mid-size pickup trucks sold in the U.S., styled like an old VHS recording. Started as a CSC436 React class project. Live at compactpickup.vercel.app.

## Dev framework

This repo follows Jake's dev framework: [jakedcl/dev-framework](https://github.com/jakedcl/dev-framework) (start at its `AGENTS.md`). The framework is the source of truth; if anything in this file conflicts with it, the framework wins.

## Stack
- Next.js 15.5 (App Router), React 19.1, TypeScript, Tailwind CSS 4.
- 3D model viewer: three 0.180, @react-three/fiber 9, drei 10.
- Sanity project `xbw6uf6e`, dataset `production`, public data (no env needed). Client and queries are in `src/lib/sanity.ts`.
- Studio config and schemas live in `sanity/`; the editor is embedded at `/studio` via `next-sanity`.
- Vercel (`vercel.json` is just the Next.js framework preset).

## Layout
- `src/app/` home (manufacturer menu + carousel + VHS clock), `[manufacturer]/`, `[manufacturer]/[model]/`, `timeline/`, `browse/`, `game/`, `api/catalog/`.
- `src/components/` ImageCarousel, 3D truck viewer, `ui/`. `src/lib/`.
- `sanity/schemaTypes/` manufacturer, truckModel, truckSpecFields.
- `docs/` (screenshot).

## Commands
- `npm run dev`, `npm run build`, `npm run start`, `npm run lint`.
- `npm run studio:dev` and `studio:build` (both use `--dir ./sanity`). Production Studio is `/studio` on the site.

## Gotchas
- `sanity/` has its own package.json. Run Studio through the root `studio:*` scripts.
- Sanity images must stay under `cdn.sanity.io/images/**` (`next.config.ts` remotePatterns), with custom `deviceSizes` and `imageSizes`.
- Keep the VHS look (status bar, VCR font) consistent across new pages.
- The old `compactpickup-2` and `compactpickup-2-api` class repos were deleted from GitHub. This repo is the live one.
