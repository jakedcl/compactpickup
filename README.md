# Compact Pickup

A catalog of compact and mid-size pickup trucks sold in the U.S., styled like an old VHS recording. It started as a React class project and grew into a full Next.js app with a CMS.

Live at [compactpickup.com](https://compactpickup.com).

![Compact Pickup homepage](docs/screenshot.png)

## What it does

- The home page is a manufacturer menu (Chevy, Ford, GMC, Isuzu, Mazda, Nissan, Toyota and more) with an image carousel and a running clock in the VHS-style status bar.
- `/[manufacturer]` lists a maker's trucks and `/[manufacturer]/[model]` shows a single model.
- `/timeline` walks through the models by year.
- `/browse` lets you search and filter trucks by year, drivetrain, engine and market.
- `/game` is "Name that truck": ten stills, four choices each.
- `/scan` identifies a truck from a photo. The models run in the visitor's browser and the server only compares 768-number fingerprints, so a scan is free. How it works, how accurate it is, and how to change it: **[docs/scanner.md](docs/scanner.md)**.
- Model pages include a 3D model viewer built with React Three Fiber.
- Manufacturers and truck models are stored in Sanity. The studio is embedded at `/studio` (config in `sanity/`, schemas `manufacturer`, `truckModel`, `truckSpecFields`). Pages revalidate hourly, so a Studio edit shows up on the site within an hour. There are no webhooks or crons.

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Sanity, React Three Fiber and drei, deployed on Vercel. The scanner and binder add Neon Postgres with pgvector, private Cloudflare R2, Resend, and transformers.js (D-FINE + SigLIP2 in the browser).

## Running it locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. The Sanity project id and dataset are set in `src/lib/sanity.ts` and the data is public, so the public site runs without any environment variables.

The scanner and the binder (the private photo library at `/binder`, not linked in the nav) need the variables in `.env.example`:

| Variable | Used for |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Neon: pooled for the app, direct for migrations and imports |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Private photo storage |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | Sign-in code emails |
| `ADMIN_EMAIL` | The only address that can sign in |
| `AUTH_SECRET` | Signs the session cookie and hashes visitor IPs for rate limits |
| `BINDER_CONFIRM=1` | Lets a migration, import or script actually write (otherwise dry run) |
| `SCAN_MATCH_MIN_SIMILARITY`, `SCAN_MATCH_MIN_MARGIN`, `SCAN_PROBE_*` | Optional scanner tuning (defaults in `src/lib/binder/scan.ts`) |
| `SANITY_API_TOKEN` | Only for `npm run fix:makes` writes |
| `REVIEW_FIT=1` | Only for the Playwright layout test |

`/admin` redirects to `/studio`. Sign-in allows only `ADMIN_EMAIL` via a one-time email code. The signed-in page is the review dashboard:
- pending, approved and rejected photos, with bulk approve or reject
- upload, a coverage list, and a Sanity import
- offline AI review notes, and **Finish missing fingerprints**

Approving a photo builds its scanner fingerprint in your browser. Only approved photos are used by the scanner. The photo rule is: if it looks like that truck from the outside, it counts. Visitors' "teach the scanner" photos arrive as pending, and only when they say yes on the consent popup. Rejected photos stay in the Rejected library so they can be undone; they are not used for matching. (A one-time cleanup on November 11, 2026 deleted 119 old rejected photos; 0 remain as of that date.) A folder import takes each truck from the Sanity slug and ignores a truck id written in the manifest. Details are in [docs/scanner.md](docs/scanner.md#the-binder-how-reference-photos-get-in).

Migrations, imports and scripts stay a dry run until `BINDER_CONFIRM=1`. Migrations and imports use the direct Neon URL:

```sh
npm run db:migrate                          # BINDER_CONFIRM=1 to apply db/migrations/*.sql
npm run import:sanity                       # copy Sanity truck images into the binder as pending
npm run import:folder -- ./path/to/folder   # import a folder of photos (manifest picks the truck slug)
npm run import:ai-reviews -- ./results.json # attach offline AI review notes to photos
npm run seed:faces                          # optional face labels from data/truck-faces.json
npm run fix:makes                           # fix truck makes in Sanity (needs SANITY_API_TOKEN to write)
```

To work on content locally, use the site at `/studio` (`npm run dev`) or run `npm run studio:dev` for a standalone dev server.

Checks: `npm run typecheck`, `npm run lint`, `npm run test:binder` (binder, scanner and crop unit tests), `npm run test:review-fit` (Playwright layout test of the review screen), and `npm run build`. To re-run the scanner accuracy eval, see `scripts/scanner-eval/` and [docs/scanner.md](docs/scanner.md#re-running-the-eval).

## Layout

```
src/app/(site)/       pages (home, [manufacturer], timeline, browse, game, scan)
src/app/binder/       review dashboard (sign-in, approve, upload, coverage, fingerprints)
src/app/api/          catalog API, scan + scan/submit, auth, admin review routes
src/components/       ImageCarousel and the 3D truck viewer
src/lib/sanity.ts     Sanity client and queries
src/lib/binder/       database, R2, image compress, session, scan matching + rate limits
src/lib/clip/         shared browser crop + fingerprint (D-FINE + SigLIP2), pipeline id
src/lib/scan/         optional probe scorer (probe.json)
db/migrations/        binder SQL
data/truck-faces.json optional face labels
scripts/              migrate, imports, seed, fix-makes; scanner-eval/ (accuracy eval)
sanity/               studio and schemas
docs/                 scanner.md (how the scanner works), screenshot
```
