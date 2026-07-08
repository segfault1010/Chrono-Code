# Chronocode — Task Roadmap

> Update this file continuously. Mark completed work. Add newly discovered tasks.

---

## Phase 1: Project Scaffolding ✅
- [x] Initialize pnpm monorepo workspace (`pnpm-workspace.yaml`, root `package.json`)
- [x] Create shared `tsconfig.base.json`
- [x] Scaffold `apps/web` — Next.js 14+ with App Router, TypeScript
- [x] Scaffold `apps/api` — Express.js with TypeScript
- [x] Scaffold `packages/shared-types` — barrel exports, domain models, API types
- [x] Configure cross-package imports (`@chronocode/shared-types`)
- [x] Add `.gitignore`
- [x] Verify: `pnpm install` succeeds, imports resolve, TypeScript compiles

## Phase 2: Data Layer
- [ ] Set up Supabase project (or document manual setup steps)
- [x] Write SQL migrations: `repositories`, `commits`, `commit_explanations`, `commit_files` tables + indexes
- [x] Create database client module (`apps/api/src/lib/db.ts`)
- [x] Populate `packages/shared-types` with domain model types matching the schema
- [x] Populate `packages/shared-types` with API request/response types
- [ ] Verify: database connectivity, insert/query round-trip

## Phase 3: Git Operations Service
- [ ] Implement `clone-service.ts` — clone a public GitHub repo to a temp directory via `simple-git`
- [ ] Implement `git-log-service.ts` — parse full commit metadata from `git log`
- [ ] Implement `diff-service.ts` — retrieve the diff for a single commit by SHA
- [ ] Add GitHub URL validation (must be `https://github.com/<owner>/<repo>`, public only)
- [ ] Add clone timeout handling (120s max)
- [ ] Add metadata indexing cap (50k commits eager, backfill older)
- [ ] Verify: clone + parse a real small repo, inspect parsed output

## Phase 4: Repository Import Pipeline
- [ ] `POST /api/repos` — accept URL, validate, create DB record, start background job
- [ ] Background indexing job: clone → parse `git log` → bulk insert commits + commit_files → update repo status
- [ ] `GET /api/repos/:id` — return repo with current status
- [ ] Idempotency: if repo URL already exists, return existing record
- [ ] Error handling: set status to `failed` with `error_message` on any failure
- [ ] Verify: import a real repo end-to-end, poll status until `ready`

## Phase 5: AI Explanation Service
- [ ] Gemini API client setup (`apps/api/src/lib/gemini.ts`)
- [ ] Design and test the system prompt for commit explanations
- [ ] `GET /api/commits/:sha/explain` — check cache → generate if miss → store → return
- [ ] SHA-based global cache lookup (query `commit_explanations` by SHA before calling Gemini)
- [ ] Diff truncation for large diffs (stay within Gemini token limits)
- [ ] Per-session/IP rate limiting on AI calls
- [ ] Token usage tracking (store `prompt_tokens`, `completion_tokens`)
- [ ] Prompt-injection defenses in the system prompt
- [ ] Verify: generate explanations for several real commits, confirm caching works

## Phase 6: API Completion & Middleware
- [ ] `GET /api/repos/:id/commits` — paginated, ordered by `authored_at DESC`
- [ ] Global rate limiting middleware (per-IP, all endpoints)
- [ ] Global error handling middleware
- [ ] Request validation middleware (URL params, query params, body)
- [ ] CORS configuration (allow frontend origin)
- [ ] Request logging middleware
- [ ] Verify: all endpoints return correct responses, rate limits trigger, errors are clean

## Phase 7: Frontend — Design System & Shell
- [ ] Design system: CSS custom properties (colors, spacing, typography, radii, shadows)
- [ ] Import web font (e.g., Inter or Outfit from Google Fonts)
- [ ] Global styles and CSS reset
- [ ] Layout shell: header with logo/nav, main content area, footer
- [ ] Dark mode by default (premium feel)
- [ ] Loading spinner / skeleton components
- [ ] Error display component
- [ ] Verify: layout renders, tokens apply correctly, responsive at common breakpoints

## Phase 8: Frontend — Pages & Integration
- [ ] API client module (`src/lib/api-client.ts`)
- [ ] **Home page**: URL input form + demo repo cards
- [ ] **Repository dashboard page**: status indicator + commit timeline (vertical feed, date-grouped, paginated)
- [ ] **Commit detail page**: metadata panel + AI explanation (with loading/generating state)
- [ ] Repository import flow: URL input → status polling → redirect to dashboard on `ready`
- [ ] Demo repo cards: link directly to pre-indexed repo dashboards
- [ ] Empty states, error states, loading states for all pages
- [ ] Verify: full user flow works end-to-end against local API

## Phase 9: Pre-Indexed Demos
- [ ] Write a seed script (`apps/api/src/scripts/seed-demos.ts`)
- [ ] Select and index one personal repo
- [ ] Select and index one small well-known OSS repo (e.g., `expressjs/express`)
- [ ] Pre-generate AI explanations for a curated set of interesting commits in each demo repo
- [ ] Verify: homepage shows demo repos, clicking through is instant

## Phase 10: Polish & Deploy (Stylize + Trigger)
- [ ] UI micro-animations (hover effects, transitions, loading animations)
- [ ] Responsive design polish (mobile, tablet, desktop)
- [ ] Error boundary with fallback UI
- [ ] SEO: title tags, meta descriptions, OG tags
- [ ] Vercel deployment configuration (`apps/web`)
- [ ] Railway/Render deployment configuration (`apps/api`)
- [ ] Environment variable setup on all platforms
- [ ] Supabase production database setup
- [ ] End-to-end smoke test on production URLs
- [ ] Update README.md with final deployment instructions
- [ ] Final review: demo walkthrough as if presenting in an interview

---

## Future Phases (Out of V1 Scope)

### V2: Authentication & Persistence
- [ ] Supabase Auth integration
- [ ] Per-user saved repositories / dashboards
- [ ] GitHub OAuth for private repo access

### V3: Intelligence Features
- [ ] Natural language search (pgvector embeddings)
- [ ] Function-level history tracking
- [ ] Contributor intelligence / analytics

### V4: Advanced Analysis
- [ ] Risk analysis (breaking change detection)
- [ ] Automated release notes generation
- [ ] Code evolution visualization (horizontal timeline)

### V5: Team & Monetization
- [ ] Team workspaces
- [ ] Export / report generation (PDF, markdown)
- [ ] Paid tier (free-to-analyze, pay-to-export)
