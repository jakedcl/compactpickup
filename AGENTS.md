# AGENTS.md — compactpickup

Catalog of compact and mid-size pickup trucks sold in the U.S., styled like an old VHS recording. Started as a CSC436 React class project. Live at compactpickup.vercel.app.

## Stack
- Next.js 15.5 (App Router), React 19.1, TypeScript, Tailwind CSS 4.
- 3D model viewer: three 0.180, @react-three/fiber 9, drei 10.
- Sanity project `xbw6uf6e`, dataset `production`, public data (no env needed). Client and queries are in `src/lib/sanity.ts`.
- Studio lives in `sanity/` (Sanity 4), hosted as `compactpickup` (compactpickup.sanity.studio). Not embedded in the site.
- Vercel (`vercel.json` is just the Next.js framework preset).

## Layout
- `src/app/` home (manufacturer menu + carousel + VHS clock), `[manufacturer]/`, `[manufacturer]/[model]/`, `timeline/`, `browse/`, `game/`, `api/catalog/`.
- `src/components/` ImageCarousel, 3D truck viewer, `ui/`. `src/lib/`.
- `sanity/schemaTypes/` manufacturer, truckModel, truckSpecFields.
- `docs/` (screenshot).

## Commands
- `npm run dev`, `npm run build`, `npm run start`, `npm run lint`.
- `npm run studio:dev`, `studio:build`, `studio:deploy` (all use `--dir ./sanity`).

## Gotchas
- `sanity/` has its own package.json. Run Studio through the root `studio:*` scripts.
- Sanity images must stay under `cdn.sanity.io/images/**` (`next.config.ts` remotePatterns), with custom `deviceSizes` and `imageSizes`.
- Keep the VHS look (status bar, VCR font) consistent across new pages.
- The old `compactpickup-2` and `compactpickup-2-api` class repos were deleted from GitHub. This repo is the live one.
