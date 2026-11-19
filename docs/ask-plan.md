# Ask the Catalog: build plan

Status: **plan, not built.** Nothing in this document is implemented yet. Numbers marked *measured* come from the live Sanity dataset on 2026-11-18; everything else is a decision or a hypothesis to be tested.

## 1. Goal

Add a grounded question-answering agent to compactpickup.com:

> "Which compact trucks offered a manual transmission with a four-cylinder and tow more than 3,000 lb?"
> "What are the common problems with the first-gen Tacoma?"
> "Did the Ford Maverick ever come with a V8?" (a trap question: the answer must be a grounded "no")

The point is not the chat box. The point is a small, honest, **measured** AI system that shows the skills the target role asks for: retrieval over embeddings, tool-using agents, evaluation, a Python service, cloud deployment, CI/CD, infrastructure as code, and responsible-AI controls. The scanner project already shows the habit of measuring (`docs/scanner.md`). This project applies it to LLMs.

## 2. What the data actually is (measured)

| Fact | Value |
|---|---|
| Truck models | 57, all with prose, engines, summary and sources |
| Manufacturers | 16 |
| Total truck prose | about 92,000 characters (avg 1,614 per truck, min 924, max 3,089), roughly 23,000 tokens |
| Prose blocks | 1,307 (about 23 per truck) |
| Heading structure | `h2` sections (Overview, Trims/Bodies/Drivetrains, Highlights) with `h3` subsections |
| Structured fields | engines (name, config, displacement, hp, torque, years, notes), dimensions, transmissions, drivetrains, trims, bodyStyles, assemblyPlants, markets, productionStart/End |
| **Specs stored as free text** | `curbWeight` ("2WD 3,350-3,580 lb; 4WD 3,845-4,110 lb"), `payload` ("Up to 2,450 lb (Wikipedia)"), `towing` ("Up to 5,200 lb"), `launchMSRP`, displacement ("3.0 L") |
| Sources | URL lists per truck, mostly Wikipedia and fueleconomy.gov |

Two consequences drive the whole design.

**The corpus is tiny.** All truck prose is about 23K tokens. It fits in one prompt of any current model. A vector database is not *needed* at this scale, so "I used RAG" is not an achievement by itself. The credible version of this project **measures RAG against the obvious baseline** (put everything in context) and reports which wins on accuracy, latency and cost, and at what corpus size the answer flips. That comparison is the centerpiece of the write-up.

**Specs are strings, not numbers.** "Tow more than 3,000 lb" cannot be answered by embeddings or by a string match. It needs a normalization step that turns the free-text spec fields into typed, queryable values, with tests, and a record of which values could not be parsed. This is real data engineering and is where most wrong answers will come from if it is skipped.

## 3. Architecture

```
Browser ── /ask page (Next.js, VHS style, streaming)
   │
   ▼
Next.js route handler  src/app/api/ask/route.ts
   (same-origin check, per-visitor and site-wide rate limits, daily spend cap,
    forwards with a service-to-service credential)
   │
   ▼
Python service on Cloud Run  ask/   (FastAPI)
   ├─ Agent loop (LLM with tool calling, provider interface)
   │    ├─ search_prose(query, filters)   → pgvector (+ keyword) over chunks
   │    ├─ filter_trucks(constraints)     → typed spec table, exact match
   │    ├─ get_truck(slug)                → full record for one truck
   │    └─ every answer must cite chunk ids; no citation → refuse
   ├─ Trace logging (question, tool calls, chunks, tokens, cost, latency)
   └─ /healthz, /eval hooks
   │
   ▼
Neon Postgres (existing project, NEW tables only)
   catalog_chunks, catalog_specs, ask_traces, ask_feedback
```

Why this shape:

- **Python service, TypeScript site.** Python is the role's language and the natural home for evals. The Next.js app stays a thin client. The browser never talks to the LLM or the service directly.
- **Neon + pgvector, reused.** Already running, already understood (see `src/lib/binder/db.ts`). New tables only. The `photos` table and the scanner are not touched. At about 1,400 chunks an exact scan is fine, same as the scanner's 1,500 photos.
- **Two retrieval modes behind tools.** Semantic search for prose questions, exact filtering for spec questions. Letting the model pick the tool is the "tool integration" the job posting names, and the eval scores whether it picks correctly.
- **Provider interface.** One small `LLM` protocol with Claude and Gemini adapters, so the eval can compare models without rewriting the agent.

### Open decisions (defaults in bold)

| Decision | Options | Notes |
|---|---|---|
| LLM | **Claude via Anthropic API**, Gemini on Vertex AI, both behind the interface | The posting is GCP-centric, so Vertex is a good second adapter. |
| Embeddings | **Vertex AI `text-embedding-005`**, or an open model run in the service | Claude has no embeddings endpoint, so this is a separate choice. Vertex keeps the story on GCP. Record the model id and dimension and version it the way `EMBED_PIPELINE` does for the scanner. |
| Hosting | **Cloud Run**, optionally GKE later | Cloud Run is the honest choice for a small stateless service. GKE only if the Kubernetes line matters more than the cost. |
| Sync | **Manual or CI-triggered job with a content hash** | `AGENTS.md` says no crons or webhooks. Keep that. Re-embed only changed documents. |

## 4. Data pipeline

1. **Export** published `truckModel` and `manufacturer` documents from Sanity (read-only, public dataset, no token needed).
2. **Chunk** Portable Text by `h2`/`h3` section. Each chunk is prefixed with the truck title, years and section heading so it stands alone ("Toyota T100 (1993-1998), Trims, Bodies and Drivetrains > Trims: ..."). Add one chunk for the truck summary and one for each of `commonIssues`, `history`, `notableFeatures` when present. Chunk size is a parameter the eval will tune, not a guess.
3. **Normalize specs** into `catalog_specs`: numeric `tow_lb_max`, `payload_lb_max`, `curb_weight_lb_min/max`, `hp_max`, `displacement_l`, `cylinders`, booleans for manual/automatic and 4WD, `production_start/end`. Deterministic parsers, unit tests with real strings from the dataset, and an `unparsed` report listing every value that failed. Do not use an LLM to fill missing numbers silently.
4. **Embed and store** with a content hash per chunk and the embedding model id. Re-run only what changed.
5. **Attribution.** Sources are largely Wikipedia, which is CC BY-SA. Answers surface the source URLs, and the docs note the license.

## 5. The evaluation (the part that makes this legit)

Write this **before** the agent. It is what turns the project from a demo into engineering.

**Question set, about 60.** Roughly 20 prose lookups, 20 structured filters (including multi-constraint), 10 comparisons across trucks, and 10 out-of-catalog or false-premise questions that must be refused or corrected. Each has the expected truck slugs and, for prose, the chunk(s) that contain the answer. Questions are hand-written from the content, not LLM-generated from the chunks (that would leak the answer into the question).

**Split.** About 20 questions are a development set used to tune chunking, `k` and prompts. About 40 are held out and run only for reported numbers. This is the same discipline as the scanner's held-out photos.

**Systems compared on the same questions:**

| System | What it is |
|---|---|
| A. Full context | Whole corpus in the prompt, no tools |
| B. Vector RAG | Embed, retrieve top k, answer |
| C. Hybrid agent | Tools: semantic search plus typed filters, model chooses |

**Metrics:**

- Retrieval recall@k for prose questions (is the right chunk in the top k).
- Answer correctness, graded against hand-written reference facts. If an LLM judge is used, first check it against a hand-graded subset and report the agreement rate.
- Citation validity, checked in code: every cited chunk exists and the claimed truck matches.
- Refusal quality: of the 10 trap questions, how many were refused or corrected, and how many normal questions were wrongly refused.
- Tool-selection accuracy for system C.
- Latency (p50 and p95) and cost per question.

**Reporting rule:** publish the table even if the "fancier" system loses. A result like "full context beats vector RAG at 23K tokens, and RAG starts winning at roughly N tokens" is a better interview answer than any claim of "improved accuracy".

## 6. Responsible-AI and operations controls

These map to the posting's governance language, and each is something concrete to build or test, not a paragraph:

- **Grounding:** answers must cite chunks. No supporting chunk means "I don't have that in the catalog."
- **Prompt injection:** retrieved text and CMS content are treated as data, never instructions. Include injection test cases in the eval (a chunk containing "ignore previous instructions").
- **Abuse and cost:** per-IP and site-wide limits and a hard daily spend cap, copying the pattern in `src/lib/binder/scan.ts`. The service refuses to call the model once the cap is hit.
- **Service auth:** Cloud Run is not public. The Next.js route calls it with a Google-signed identity token.
- **Logging:** every request writes a trace (question, tools called, chunk ids, tokens, cost, latency). Do not log IP addresses, and hash anything used for rate limiting like the scanner does.
- **Human in the loop:** thumbs up/down with an optional note goes to `ask_feedback`. Downvoted answers surface in a review list that feeds new eval questions. This reuses the idea behind the `/binder` approval flow.
- **Versioning:** prompts, embedding model id and chunking parameters are versioned and recorded in each trace and in each eval run, so a result can be reproduced.

## 7. Repository layout

```
ask/                         Python service
  pyproject.toml
  app/        main.py, agent.py, llm/ (protocol, claude.py, gemini.py),
              retrieval.py, specs.py, chunking.py, tracing.py, limits.py
  scripts/    sync_catalog.py (Sanity → chunks → embeddings → Neon)
  evals/      questions.jsonl, run_eval.py, reports/
  tests/      pytest (parsers, chunking, citation checks, agent with a fake LLM)
  Dockerfile
infra/                       Terraform: Cloud Run service, service account, Artifact Registry, secrets
db/migrations/008_ask.sql    catalog_chunks, catalog_specs, ask_traces, ask_feedback
src/app/(site)/ask/          page (VHS style, streaming, source cards)
src/app/api/ask/route.ts     guarded proxy to the service
docs/ask.md                  architecture, eval results, costs (written last, like scanner.md)
.github/workflows/           extend checks.yml with Python lint/test, add deploy.yml
```

The Python service is a separate directory so the existing Node CI keeps working unchanged.

## 8. Phases

Each phase ends with something runnable and a decision point.

| Phase | Deliverable | Done when |
|---|---|---|
| 0. Setup | Install deps, read the Next.js 16 docs in `node_modules`, read the dev framework (see risks), run the existing checks green | `npm run typecheck && npm run lint && npm run test:binder` pass on this branch |
| 1. Corpus and eval | Sanity export script, chunker, spec parsers with tests, `unparsed` report, 60 hand-written questions with the dev/held-out split | Parsers cover the dataset or list what they can't; questions reviewed by you |
| 2. Baselines | Systems A and B running against the eval, first results table | Numbers recorded, chunking and `k` tuned on the dev set only |
| 3. Agent | Tool-calling agent (system C), provider interface, trace logging, refusal behavior, pytest with a fake LLM | Held-out results for A, B, C in one table |
| 4. Service and site | FastAPI endpoints, guarded Next.js route, `/ask` page with citations and feedback buttons, rate limits and spend cap | Works locally end to end; limits tested |
| 5. Cloud | Dockerfile, Cloud Run via Terraform, deploy workflow, service-to-service auth, secrets in Secret Manager | A merge deploys; the live `/ask` answers with citations |
| 6. Write-up | `docs/ask.md`, README section with a screenshot and the results table, a short "enterprise considerations" section | You can explain every number in it |

**Cut line if time runs short:** keep phases 0 to 3 and 6. A measured eval plus a working agent with a good write-up beats a deployed system with no numbers. Phases 4 and 5 are what make it live, so do them next, but do not skip the eval to get there.

## 9. Risks and open questions

- **Dev framework not loaded.** `AGENTS.md` says `jakedcl/dev-framework` is the source of truth, but it is private and `DEV_FRAMEWORK_READ_TOKEN` is not set in this session. It needs to be provided before building, or the conventions may conflict with this plan.
- **Dependencies not installed.** `node_modules` is absent here, so the Next.js 16 docs that `AGENTS.md` requires reading are not available yet. Phase 0 installs them.
- **Cost.** LLM and embedding spend is real. Set a budget alert and the daily cap before any public exposure.
- **Shared database.** The scanner's production data lives in the same Neon project. Use new tables only, and test migrations on a Neon branch first.
- **Free-text spec parsing** may be messier than the sample suggests (ranges, "up to", footnotes). Phase 1 measures this before anything depends on it.
- **Manufacturer history field.** A character count query on `compactPickupHistory` returned 0 although 8 manufacturers define it, so its type needs checking (probably plain text, not Portable Text) before chunking.
- **Claims discipline.** Only claim in the application what the eval shows. Describe the project as "measured against a long-context baseline", not "production AI platform".

## 10. How to talk about it (draft)

> I built a grounded Q&A agent over my truck catalog and measured it. Because the whole corpus fits in a single prompt, I compared three systems on a held-out question set: full context, vector RAG, and a hybrid agent that chooses between semantic search and exact spec filters. [Result.] I also normalized free-text specs into typed columns so numeric questions are answered exactly, and I built refusal, citation, rate-limit and spend controls. It runs as a Python service on Cloud Run, deployed through Terraform and GitHub Actions.

Fill the bracket with the real result and nothing else.
