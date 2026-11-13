# The truck scanner

`/scan` lets anyone take or pick a photo of a compact pickup and get the closest catalog models back. This doc explains how it works end to end, where everything lives, what it costs, how well it does, and how to change it safely.

Each section starts with the plain-language version and then gives the details a developer (or a coding agent) needs.

## The idea in one paragraph

The scanner never "understands" a truck the way a person does. It turns a photo into a **fingerprint**: a list of 768 numbers (an *embedding*) produced by a vision model. Photos of the same truck model end up with similar fingerprints. To identify a visitor's photo, the scanner compares its fingerprint against the fingerprints of the approved reference photos and asks which truck's photos are closest. No AI service is called and nothing is trained at scan time; it is a nearest-neighbour lookup. This is Compact Pickup's own vision pipeline, not an OpenAI wrapper. An earlier CLIP plus vision-LLM attempt (PR #30) was closed unmerged, and its branch has been deleted.

### Library status (November 11, 2026)

| Library | Count |
|---|---|
| Approved | **1,500** photos, all fingerprinted with SigLIP2 on a D-FINE crop. These are the only photos the scanner compares against. |
| Pending | **4** Sonoma photos, moved off the S-15, waiting in `/binder`. |
| Rejected | **0**. A one-time cleanup deleted 119 rejected photos. A local backup was kept outside the repo. |

A live spot-check after the cleanup scored a Sonoma at 0.945, a Ranger at 0.918, and a Tacoma at 0.933 (raw cosine similarity, all well above the 0.80 cutoff). The photo rule is: if it looks like that truck from the outside, it counts. Every photo is approved in `/binder` before it can help the scanner. `/admin` redirects to `/studio`.

## End-to-end flow

```
visitor's photo
  │  (browser, src/lib/clip/browser.ts)
  ├─ 1. decode once, fix EXIF rotation, cap the long edge at 1600 px
  ├─ 2. D-FINE nano finds vehicles → pick the main one → crop with 15% padding
  ├─ 3. SigLIP2-base (q4) turns the crop into a 768-number fingerprint (L2-normalized)
  │
  │  POST /api/scan  { embedding: number[768], pipeline: "siglip2-base-q4-ft20261112+dfine-crop15" }
  ▼  (server, src/lib/binder/scan-http.ts → scan.ts)
  ├─ 4. check origin, body size, pipeline id, rate limits
  ├─ 5. pgvector: 40 nearest approved photos by cosine similarity (Neon)
  ├─ 6. score each truck from its best 3 photos, rank, decide "match" vs "guess"
  ▼
top 3 trucks ranked → the /scan page shows 1–3 adaptive guesses with percentages
```

After the visitor picks, drops, or pastes a photo, the crop and scan run automatically. One bar labeled **Cropping the truck…** then **Scanning the truck…** covers both steps. The models are cached in the browser after the first use. The photo itself never leaves the device during a scan. Only the 768 numbers are sent. A photo is uploaded only if the visitor later taps a guess (or Wrong / Not sure) and says **Yes** on the sticky consent island (see [Visitor submissions](#visitor-submissions-teach-the-scanner)).

### 1–2. The crop (D-FINE)

**Plain version:** Vision models squash the whole picture into a small square (224×224) before reading it. If the truck is far away, or the image is a screenshot with black bars, the truck becomes a few pixels and the fingerprint is mostly background. So before fingerprinting, a small object detector finds the truck and cuts it out, the same way you'd crop it by hand.

**Details:**
- Model: `onnx-community/dfine_n_coco-ONNX`, fp16 (D-FINE nano trained on COCO, Apache-2.0). Loaded with transformers.js `DFineForObjectDetection`, wasm backend, one thread.
- Decoding is custom (`src/lib/clip/dfine-post.ts`): sigmoid on the class logits, boxes converted from centre/width/height to corners, normalized to the image.
- The crop rule (`src/lib/clip/crop-select.ts`, constants in `src/lib/clip/pipeline.ts`):
  - keep detections labelled **car, truck or bus** with score ≥ **0.2** that cover ≥ **5%** of the image;
  - pick the one with the highest `area × (0.5 + 0.5 × centrality)`, where `centrality = 1 − min(1, distance from centre ÷ 0.71)`, so a big truck near the middle wins;
  - pad the box by **15%** of its width and height on each side, clamped to the image.
- **Why 0.2 and not the usual 0.5:** this ONNX export scores much lower than the original PyTorch checkpoint (`ustc-community/dfine-nano-coco`) on the same pixels. A clear truck scores about 0.36 here and 0.96 in PyTorch. At 0.5 the crop fell back to the full photo on 94 of 100 test photos. At 0.2 there were no fallbacks, and the chosen boxes matched the PyTorch reference rule with a median overlap (IoU) of 0.947.
- **Fallback:** if no vehicle passes the rule, or the detector fails to download or run, the whole photo is used. Scanning never fails because of the crop. A failed detector download is retried on the next photo.
- On the reference photos, 31 of 1,500 (2%) use the full photo. The median crop covers 63% of the frame.

### 3. The fingerprint (SigLIP2)

**Plain version:** SigLIP2 is a model Google trained on a huge number of images with captions, so it learned which visual details matter. We use only its image half. It is good at fine differences (grille, headlights, body lines), which is what telling a '94 S-10 from a '94 Sonoma needs.

**Details:**
- Model: taught SigLIP2-base vision ONNX (MatMulNBits **q4**, opset 14), `SiglipVisionModel`, output `pooler_output`, L2-normalized, 768 dimensions. Architecture/config/preprocessor match the public `onnx-community/siglip2-base-patch16-224-ONNX` repo; only `onnx/vision_model_q4.onnx` is fine-tuned and is **not** on Hugging Face.
- The crop is fitted to a 768 px long edge, then the processor squashes it to 224×224 (no centre crop).
- **Do not ship q8/int8 for SigLIP2.** Its browser q8 output is broken (cosine 0.81 against fp32). The q4 file is fine (0.97 against fp32).
- About 1.7–2 s per photo on desktop Chrome (one wasm thread) once the models are cached. Phones are slower.

### Where the models come from, and sizes

| What | Source | Size (download, cached by the browser afterwards) |
|---|---|---|
| SigLIP2-base vision q4 (taught) | this site (`/models/siglip2-base-ft20261112/…`) | 63 MB |
| D-FINE nano fp16 | huggingface.co (`onnx-community/dfine_n_coco-ONNX`) | 8 MB |
| ONNX Runtime WebAssembly | cdn.jsdelivr.net (`onnxruntime-web`, transformers.js default) | about 14–27 MB depending on the browser build |

D-FINE is still served from Hugging Face. The taught SigLIP weights are served from the app origin (see `public/models/siglip2-base-ft20261112/README.md` and `scripts/install-siglip-vision.mjs`); they are gitignored and must be installed before deploy (`SIGLIP_VISION_ONNX_PATH` or `SIGLIP_VISION_ONNX_URL` on Vercel). The scanner and binder both use the browser cache (`env.useBrowserCache = true`).

### The single embed entry point

Every fingerprint (visitor scans, binder approvals, "Finish missing fingerprints") goes through the same code in `src/lib/clip/browser.ts`:
- `embedImage(blob)`: crop and embed in one call. Used by the binder.
- `preparePhotoCrop(blob)` then `embedPrepared(prepared)`: the same steps split in two, so `/scan` can show the cropped preview and reuse it on Scan without detecting again.

Both routes share the same internal functions and produce identical vectors (checked: cosine 1.00000 against the stored DB vectors through both paths). This matters because a fingerprint is only comparable to fingerprints made the exact same way.

### 4. The pipeline version check

`EMBED_PIPELINE` in `src/lib/clip/pipeline.ts` (currently `siglip2-base-q4-ft20261112+dfine-crop15`) names the exact model and crop recipe. The scanner sends it with every scan. `/api/scan` rejects any other value with `400 { error: "stale_model", reload: true }`, and the page tells the visitor to reload. This stops an old open tab from sending fingerprints made with a previous model, which would quietly give wrong answers. Vectors with the wrong length are rejected the same way.

### 5. The match (pgvector)

```sql
select truck_id, truck_slug, 1 - (embedding_siglip <=> $1::vector) as similarity
from photos
where status = 'approved' and embedding_siglip is not null and truck_id is not null
order by embedding_siglip <=> $1::vector
limit 40
```

`<=>` is pgvector's cosine distance, so `1 − distance` is cosine similarity (1.0 = identical direction). There are HNSW indexes on `embedding_siglip`, but with about 1,500 rows Postgres simply scans every row and sorts. That is exact and fast enough (a few ms warm).

### 6. Scoring per truck, and the thresholds

**Plain version:** a single lucky photo shouldn't win, so each truck is scored by its 3 closest photos. The on-page results row shows one, two, or three guesses from how tight the raw scores are. If the best truck clearly beats the runner-up, the first card says Closest. Otherwise it says Closest guess.

**Details** (`aggregateTruckScores` and `outcomeFromRanks` in `src/lib/binder/scan.ts`, results UI in `src/app/(site)/scan/scanner.tsx`):
- Group the 40 neighbours by truck. A truck's score is the mean of its best **3** similarities. Missing slots are padded with the 40th neighbour's score, so a truck with 1 close photo doesn't beat one with 3.
- The API returns the top **3** trucks. The results section on `/scan` calls `visibleScanMatches` in `src/lib/binder/scan-types.ts` on those scores: let `m12 = score1 − score2` and `m13 = score1 − score3`. If `m12 ≥ 0.05` (`SCAN_RESULTS_SCORE_GAP`), show only the first; else if `m13 ≥ 0.05`, show the first two; else show all three. Gaps use raw cosine, not the displayed percent. This is separate from the confident-match margin (`SCAN_MATCH_MIN_MARGIN`).
- **Confident match** when the top score ≥ **0.80** (`SCAN_MATCH_MIN_SIMILARITY`) **and** it beats the second truck by ≥ **0.02** (`SCAN_MATCH_MIN_MARGIN`). Then the first card is labeled **Closest**. Otherwise the result is a "guess" and the first card says **Closest guess**. Both cutoffs can be overridden with Vercel env vars.
- **Displayed percent** (`src/lib/binder/scan-types.ts`): raw cosine 0.70 shows as 0%, 0.95 or more as 100% (`assignVisibleScanDisplayPercents` cascades so lower guesses never show the same integer as a higher one unless raw scores tie). Display-only; matching still uses raw cosine.
- Optional **probe scorer**: if `src/lib/scan/probe.json` exists (a trained 57×768 linear classifier), `/api/scan` ranks with it instead, using its own thresholds (`SCAN_PROBE_MATCH_MIN_PROBABILITY` 0.35, `SCAN_PROBE_MIN_MARGIN` 0.04). It isn't shipped yet.

## The binder: how reference photos get in

The binder at `/binder` is the private photo library behind the scanner. Only `ADMIN_EMAIL` can sign in (one-time email code via Resend, session cookie signed with `AUTH_SECRET`). It isn't linked in the nav. `/admin` redirects to `/studio`. The photo rule is: if it looks like that truck from the outside, it counts.

1. **In:** photos arrive from the Sanity import (truck page images), folder imports (`npm run import:folder`), uploads on the binder page, or visitor submissions. Each photo is compressed to one ~1600 px WebP plus a 480 px thumb, stored in private R2, and deduplicated by sha256.
2. **Pending:** every new photo starts as `pending` and is never used for matching.
3. **Review:** in the dashboard you approve, reject or move photos to the right truck, alone or in bulk. Optional offline AI review notes (`photo_ai_reviews`, imported with `npm run import:ai-reviews`) are shown next to each photo. The site never calls an AI model.
4. **Approve → fingerprint:** approving runs `embedImage` in your browser on the stored WebP and saves the vector to `photos.embedding_siglip` (`POST /api/admin/photos/embeddings`, admin only). Rejecting or un-approving clears it. **Finish missing fingerprints** fills any approved photo that has no fingerprint yet (for example after a model change).
5. Only `approved` photos with a fingerprint are matched.

### Visitor submissions ("teach the scanner")

After a scan, guesses, Wrong, and Not sure appear inline on `/scan` (no overlay modal). Tapping a guess (or finishing Wrong with a truck label) can open the truck page or stay on `/scan`, with a sticky **CAN WE USE THESE RESULTS TO IMPROVE?** island (Not sure skips the island). Nothing is stored unless they say **Yes**. With consent, `POST /api/scan/submit` stores the photo (shrunk in the browser to a 1600 px JPEG, then WebP on the server) as a `pending` photo with `source = 'visitor'`, plus a `scanner_feedback` row. Mobile **Take photo** shots can be kept on the device via **Save photo** beside Replace on the page (Web Share or download; not a silent Camera Roll write). Visitor photos never affect matching until you approve them in the binder.

## Where the data lives

| Store | What | Notes |
|---|---|---|
| **Sanity** (project `xbw6uf6e`, dataset `production`) | Manufacturers and truck models: everything on the public pages, including page photos | Edited at `/studio`. Public, read without a token. Pages revalidate hourly. |
| **Neon Postgres** (pgvector) | `photos`: binder photos and fingerprints | Key columns: `truck_id` (the Sanity `_id`), `truck_slug`, `status` (`pending`/`approved`/`rejected`), `source`, `sha256`, `r2_key`, `angle`, `embedding_siglip vector(768)`. The legacy CLIP `embedding vector(512)` column was dropped in migration 007. |
| | `scanner_feedback`, `scanner_rate_buckets` | Visitor verdicts (consent required by a DB constraint), and rate-limit counters (old buckets are pruned automatically) |
| | `photo_ai_reviews`, `truck_faces` | Offline review notes, and optional face labels (`npm run seed:faces`). Faces never affect matching. |
| | `login_codes`, `login_attempts` | Binder sign-in |
| **Cloudflare R2** (private bucket) | Binder photo files (WebP + thumb) | Served to the signed-in admin only, via `/api/admin/photos/[id]` |

**Why a truck page can have no photos while the scanner still knows the truck:** truck pages show Sanity images. The scanner uses binder photos in Neon/R2. They are separate on purpose. Scanner reference photos (auction listings, Commons, uploads) don't have to be good enough or licensed for the public page, and page images don't automatically become reference photos until imported and approved. Schema lives in `db/migrations/` (001–007).

## Rate limits, abuse and cost

**Limits** (`src/lib/binder/scan.ts`, counted per hashed IP; IPv6 shares one bucket per /64):

| Route | Per visitor | Whole site | Protects |
|---|---|---|---|
| `POST /api/scan` | 20 per 10 min | 2,000 per day | Function time and Neon compute (free tiers) |
| `POST /api/scan/submit` | 8 per day | 200 per day | R2 storage and your review queue |

Also: same-origin check on both routes, a 64 KB body cap on scans and 4.5 MB on submissions, a sharp pixel limit (40 MP), and strict validation (768 finite numbers).

**Measured server cost per scan** (preview, Nov 10, 2026): about **133 ms** average function time, of which about **7 ms** is the DB query, and about **23 KB** transferred. All the heavy work (the models) runs on the visitor's device, so a scan costs the server almost nothing. Even at the 2,000-scans-per-day site cap (about 60,000 a month), that is roughly 2 hours of function time and 1.4 GB of transfer a month, well within Vercel's free Hobby allowances. Neon work per scan is one small query. Check the current plan limits in the Vercel and Neon dashboards if traffic grows.

## How well it works (evaluation)

### Method

- **Held-out test set:** 100 photos of 50 catalog trucks from 96 Bring a Trailer listings, mostly sellers' phone shots, at mixed angles. The right answer comes from the listing title plus a visual check. None are in the DB (sha256 checked). One photo showed the same physical truck as a DB photo and is excluded, so **99 are scored**. Not covered (no listings): b-1, b-3, i-series, maverick, mitsubishi-raider, suzuki-equator, p100. The photos are third-party and are **not** in this repo.
- Fingerprints are made with the real browser code in headless Chrome, then scored with an exact copy of the server matching.
- Metrics: **top-1** (first guess right), **top-3** (right truck among the top 3 ranked; the popup may hide guesses when scores are far apart), **top-5**, **make** (first guess has the right manufacturer), and how often the first card is labeled Closest (a confident match) and how often that is right.
- **DB leave-one-out:** each DB photo is scored against all the others. Flattering, because many DB photos are near-duplicates.

### Model history

| Pipeline | Top-1 | Top-3 | Top-5 | Make | Confident: fires / right |
|---|---|---|---|---|---|
| CLIP ViT-B/32 q8 (`Xenova/clip-vit-base-patch32`, the original scanner) | 32% | 49% | 60% | 42% | 12/99, 7 right |
| SigLIP2-base q4, no crop | 70.7% | 93.9% | 97.0% | 73.7% | 54%, 84.9% right |
| **SigLIP2-base q4 + D-FINE crop on both sides (shipped baseline)** | **72.7%** | **92.9%** | **98.0%** | **76.8%** | **62%, 88.5% right** |
| **Taught SigLIP2-base q4 + same crop (current, run 20261112-1138)** | **90/99** | **98/99** | **99/99** | **92/99** | **79 confident-right, 2 confident-wrong** |

Held-out exam for the taught model: Python `onnxruntime`, 2020-photo library, live matching rules (Nov 12, 2026). Untaught live baseline on the same rules: 79/99 top-1, 93/99 top-3, 55 confident-right, 5 confident-wrong.

Current pipeline, DB leave-one-out: re-run after re-fingerprinting. The confident match cutoff (0.80 / 0.02) is unchanged; revisit displayed percents after the new score distribution is live.

Other things that were measured on the same set:
- CLIP at full precision: 54% top-3.
- A trained linear probe on SigLIP: 81% top-1, not shipped.
- gpt-5-mini as a second opinion on SigLIP's top 10: 84% top-1 and 96% top-3, at about $0.002 and 8 s per scan. Not shipped, because of the no-charges rule.
- The pipeline itself was ruled out as the cause: stored vs re-embedded vectors agree, the distance operator is right, HNSW recall was 100%, and other aggregation schemes landed within ±4 points.

The crop helps most on what the test set has little of: far-away shots and letterboxed screenshots. Hand tests with those showed large gains (from a wrong answer to the right truck at a high score). On clean, tightly framed auction photos the gain is small.

### Re-running the eval

The scripts are in `scripts/scanner-eval/`:

1. Put your held-out photos anywhere outside the repo. Write `queries.txt` (one image path per line) and `query_labels.txt` (the true truck slug per line, same order).
2. Fingerprint them with the shipped pipeline:
   ```sh
   CHROME_PATH=/usr/bin/google-chrome node scripts/scanner-eval/embed.mjs queries.txt queries.f32
   ```
   (`CHROME_PATH` is optional. Without it, Playwright's Chromium is used: `npx playwright install chromium`.)
3. Get the DB side. Either export `id, truck_slug, embedding_siglip` for approved photos from Neon, or download the approved photos and run `embed.mjs` on them. Save the vectors as float32 (768 per row) in `db.f32` and the slugs in `db_labels.txt`.
4. Score with the same matching as production:
   ```sh
   python scripts/scanner-eval/score.py db.f32 db_labels.txt queries.f32 query_labels.txt [makes.json]
   ```
   Keep the constants at the top of `score.py` in sync with `scan.ts`.

## Changing the model or the crop safely

A fingerprint only means something next to fingerprints made the same way. Any change to the model, dtype, crop rule, padding, cutoff or image sizing makes every stored vector stale. Steps:

1. Make the change in `src/lib/clip/` and **change `EMBED_PIPELINE`** in `src/lib/clip/pipeline.ts`, so old tabs are told to reload.
2. Run `npm run typecheck && npm run lint && npm run test:binder && npm run build`.
3. Run the eval (above) for both the old and the new pipeline, on the same held-out photos. Only proceed if the new one is better.
4. **Re-fingerprint every approved photo** with the new code before the change goes live. If previews use the same Neon database as production (check `DATABASE_URL` per environment in Vercel), don't clear a column production still reads. Either:
   - add a new column (a migration) and point the new code at it, fill it on the preview with **Finish missing fingerprints**, and confirm no approved photo is missing a fingerprint; or
   - embed all approved photos with `embed.mjs` first, then write them in one transaction at the moment you switch.

   Spot-check that re-embedding a few DB photos in the browser gives cosine ≈ 1.0 against the stored vectors.
5. Re-check the thresholds (0.80 / 0.02 and the 0.70–0.95 display) against the new score distribution.
6. If the vector length changes, a new column is required (`vector(N)` is fixed), and `nearestApproved` plus the embeddings endpoint must point at it.

Never compare vectors across pipelines, and never run a server-side (Python/Node) embedder for the DB unless you've proven it matches the browser output to cosine ≈ 1.0.

## Known follow-ups

These are optional later ideas, not a current to-do list. The main scanner work is done.

- ~~Cleanup after the new scanner is confirmed live~~ (done Nov 11, 2026): the legacy CLIP column and its indexes were dropped in PR #56 (migration 007), misfiled Sonoma photos were moved off the S-15 (4 remain pending), and 119 rejected photos were deleted (0 remain). A local backup was kept outside the repo.
- **Empty galleries:** show scanner photos on truck pages that have no Sanity gallery yet, like the Raider.
- **Second photo pass** for thin trucks (b-1 still has 7 approved photos).
- **Probe scorer:** train on the current fingerprints and ship `src/lib/scan/probe.json` (about +10 points top-1 on the test set).
- **Fine-tuning** SigLIP2 on the binder photos, for a bigger jump. Needs a careful train/test split and re-export to ONNX q4.
- **Optional OpenAI double-check** on low-confidence scans. It costs money per scan, so only with a hard daily cap.
- **Sitemap** so search engines can index every truck page, and a **Cloudflare spending alert** so the R2 bill stays at zero.
- **Exact crop parity:** self-export `ustc-community/dfine-nano-coco` to ONNX so browser crops match PyTorch exactly. Needs free hosting for an 8–15 MB file.
- **HNSW index:** not used at 1,500 rows (exact scan). It will start to matter in the tens of thousands of rows. `SCAN_EF_SEARCH` is already set for then.
