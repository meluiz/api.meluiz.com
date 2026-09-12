# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # hot-reload server on src/server.ts
bun run lint         # biome lint --write
bun run format       # biome format --write
bunx biome check src/    # lint + format + import sorting in one pass (use this)
bunx tsc --noEmit    # typecheck; there is no `build` script
```

There is no test script and no test files. `bun test` is available if you add any (`*.test.ts`).

Deployment is Vercel, with `src/server.ts` as the function entrypoint (see `vercel.json`).

`bunfig.toml` sets `minimumReleaseAge` to 3 days — new dependency versions published within that window will not install.

## Stack and conventions

Bun 1.4.2 · Hono · Zod v4 · Biome · ESM · TypeScript `strict` with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.

Subpath imports (`package.json#imports`) — always prefer these over relative paths across directories:

- `#controller/*` → `src/controllers/*/index.ts` (directory barrel, not a file)
- `#plugin/*`, `#routes/*`, `#util/*` → `src/{plugins,routes,utils}/*.ts`

Biome enforces 96-column lines, single quotes, trailing commas, and a specific import order: types → blank → bun/node → packages → blank → `#aliases` → blank → relative. Run `bunx biome check --write src/` after edits rather than hand-formatting.

Commits follow conventional-commit style with a file or module scope, e.g. `feat(metadata/analyzer.ts): …`.

### Undeclared dependency

`node-html-parser@9.0.4` is imported throughout `src/controllers/metadata/` but is **not** in `package.json` or `bun.lock`. It resolves only because it is present in `node_modules`. A clean install will break the build until it is declared.

## Architecture

### Request pipeline

`src/server.ts` mounts global middleware in order (`requestId` → `cors` → `rateLimit` → `bodyLimit` → `logger`), then routes `/assets`, `/health`, `/metadata`.

Errors are never handled inside routes. Throw a `ServerError` subclass from `#util/errors` (`BadRequestError`, `BadGatewayError`, `UnprocessableError`, …); `onError` in `#plugin/error` converts it to the envelope in `#util/http`, attaching `requestId` and path. Zod failures go through `validate('query'|'json'|'param'|'header', schema)` from `#util/validate`, which throws `UnprocessableError` with flattened field errors.

Success responses go through `toResponse(ctx, { status, data })`, not `ctx.json` directly.

### The metadata controller

`src/controllers/metadata/` is the substance of the project: fetch a page, extract everything a search engine or social platform would read, and score it. The flow is a pipeline, and understanding any one stage requires knowing where its input comes from:

```
service.ts      fetchDocument()  — byte-limited streaming fetch, manual redirects
   ↓
extractor.ts    extractMetadata() — raw HTML → typed `Metadata` (general/opengraph/twitter/mobile/crawler)
   ↓
analysis/context.ts  extractDocumentSignals() — DOM-level facts the extractor does not model
analysis/remote.ts   collectDeepAnalysisSignals() — network probes, `deep` mode only
   ↓
analyzer.ts     analyzeMetadata(metadata, context) → `MetadataAnalysis`
```

`getMetadataAnalysisByUrl` in `service.ts` is the single place that wires all four stages together.

**Extraction** never returns relative URLs. `extractors/context.ts` builds an `ExtractorContext` whose `resolve()` absolutizes every href against the document URL (honoring `<base href>`). Downstream checks assume absolute URLs — do not re-add resolution logic in the analyzer.

**`quick` vs `deep`** is not a branch inside the analyzer. The analyzer emits whatever checks its input signals support; `deep` mode simply populates `context.deep`, which makes four extra checks (`robots-file-policy`, `sitemap-canonical`, `remote-resource-integrity`, `alternate-reciprocity`) evaluable.

### The scoring model (`analysis/scoring.ts`)

This is the part that is easy to get wrong. Read `scoring.ts` before touching any check in `analyzer.ts`.

Every check carries an **`outcome`** and a continuous **`score` (0..1)**. The outcome decides whether the check is scored at all:

| outcome | in denominator? | meaning |
|---|---|---|
| `pass` / `warn` / `fail` | yes | the subject exists and was graded |
| `absent` | **yes** | the subject is missing and that absence *is* the defect |
| `not-applicable` | no | does not apply to this page, or the defect is charged by another check |
| `unknown` | no | could not be evaluated (timeout, missing signal) |

The critical distinction is `absent` vs `not-applicable`. A missing `<title>` is `absent` — it consumes its full weight at score 0. A missing web app manifest is `not-applicable` — optional, so it leaves the score untouched. Reporting a defect that does not move the score is the bug this model exists to prevent: never pair an error-ish status with a zero denominator.

Other invariants:

- **`points.earned = weight * (score + (1-score) * (1-confidence))`.** `confidence` is a real term, so a heuristic that fails at 0.65 confidence forfeits only 65% of its weight. Set `confidence: 1` for deterministic measurements (presence, HTTP headers) and lower it for genuine heuristics.
- **`dependsOn`** is resolved by `resolveCheckDependencies` over the *flat* list of checks, across category boundaries, before categories are scored. When the parent's outcome is `absent`/`unknown`/`not-applicable`, the child is flipped to `not-applicable`. This is what stops one missing `og:image` from being charged four times.
- **`CATEGORY_WEIGHTS`** are explicit and sum to 100. Each category is normalized before entering the weighted average (`aggregateScore`), so adding a check does not silently reweight the model and `quick`/`deep` scores stay comparable.
- **`percentageOf` returns `null`**, not 100, when nothing was evaluated. `MetadataAnalysis.score`, category `score`, and all four `scores` fields are `number | null`.
- **`rampScore`** gives piecewise-linear partial credit for range checks, so fixing a 79-character title toward 60 moves the score monotonically.
- `scoring.coverage` reports evaluated weight / total weight, so a consumer can tell an 87 from a complete audit apart from an 87 where half the checks were skipped.

`status` (`passed`/`warning`/`error`/`skipped`) is a derived UI projection of `outcome`. Nothing should read it for scoring.

### SSRF policy

Every outbound request to a user-supplied URL goes through `assertSafeRemoteUrl` (`url-policy.ts`), which blocks non-http(s) protocols, embedded credentials, loopback/link-local/private/CGNAT ranges (IPv4 and IPv6), and `.local`/`.internal`/`localhost` suffixes, resolving DNS when the host is not an IP literal.

It must be re-run **on every redirect hop**, not just the initial URL — `fetchDocument` (`service.ts`), `fetchRemote` (`analysis/remote.ts`), and the favicon fetchers all follow `redirect: 'manual'` for exactly this reason. Preserve that pattern in any new fetch path.

### Timeouts and byte limits

Remote work is bounded on two independent axes, and conflating them is a known failure mode: a single overall budget means one slow asset aborts everything else and a slow site gets scored as if its metadata were broken.

`collectDeepAnalysisSignals` keeps a global budget (`timeout`, default 8s) *and* a per-request ceiling (`requestTimeout`, default 4s), with a concurrency pool (default 4). Requests that time out set a `timeout` flag on their signal, and the analyzer maps those to outcome `unknown` so transport failures leave the denominator instead of being scored as defects.

Every response body is read through a byte-limited reader. Text-ish fetches can opt into `truncate: true`, which keeps the prefix and reports `truncated` — used by `inspectAlternate` so a body cut before `</head>` reports "unknown", never a false canonical mismatch.

### Text and URL normalization

Shared helpers live in `#util/text` and `#util/url`. Do not reimplement these locally — divergent copies of `normalizeText` and ad-hoc URL comparison were a past source of bugs.

- `normalizeText` strips combining marks (`\p{M}`) after NFKD and keeps `\p{L}`/`\p{N}`, so accented and non-Latin text survive. An `[^a-z0-9]` filter would erase CJK entirely.
- `textSimilarity` is Dice over token sets, evaluated on both the raw strings and their brand-stripped variants (`stripBrandSuffix`).
- `getComparableUrl` / `urlsAreEquivalent` are the only correct way to ask whether two URLs address the same document (host case, `www.`, default port, trailing slash, query order, fragment).
