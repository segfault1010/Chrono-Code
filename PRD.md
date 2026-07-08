# Chronocode — Product Requirements Document

## Problem Statement

Understanding *why* a codebase looks the way it does is slow. Engineers onboarding onto unfamiliar codebases, open-source contributors trying to understand design decisions, and tech leads performing audits all face the same friction: reconstructing context from raw git history — commits, diffs, messages — that a senior teammate could explain in one sentence.

No tool today takes raw git history and produces concise, grounded explanations of what happened and why, cited against actual commits instead of guesses.

## Goals

1. **V1 Goal**: A deployed, working web tool that imports a public GitHub repository, indexes its commit history, and provides AI-generated explanations for individual commits — grounded in actual diffs and commit messages.
2. **Portfolio Goal**: Demonstrate full-stack engineering and AI/agentic pipeline design end-to-end at MAANG interview quality.
3. **Future Goal (non-V1)**: Light monetization via export/report features; expanded intelligence (function history, contributor analysis, NL search, risk analysis).

## Users

| User Type | Need |
|-----------|------|
| Engineers onboarding | Understand unfamiliar codebases quickly |
| Open-source contributors | Grasp project history and design decisions |
| Tech leads | Audit code evolution and architectural changes |
| Students | Study real production code with context |
| **Primary V1 user** | The author — dogfooding on personal repos + well-known OSS repos for demos |

## V1 Features

### F1: Repository Import

- User pastes a public GitHub repository URL.
- System clones the repo via Git CLI / `simple-git` (not GitHub API).
- System parses all commit metadata eagerly via `git log`.
- User sees real-time indexing status: `cloning` → `indexing` → `ready`.
- For repos with >50k commits, index the latest 50k eagerly; backfill older history in a background job.

### F2: Commit Timeline

- Vertical feed of commits grouped by date.
- Paginated (not infinite scroll for V1).
- Each commit shows: SHA (abbreviated), message, author, date, files changed, insertions/deletions.
- Data shape must not block a future horizontal zoomable timeline.

### F3: AI-Generated Commit Explanations

- Generated **lazily** on first view of a specific commit.
- Uses Gemini API with the commit's diff + message as context.
- Cached **permanently** by commit SHA (global key, not per-repo — same commit in forks reuses the explanation).
- Explanation tone: sharp senior engineer — plain, precise, no filler.
- If evidence for "why" is thin, the explanation says so explicitly.
- Cites specific files and changes from the diff.

### F4: Commit Detail View

- Full commit metadata.
- File change list with change types (added, modified, deleted, renamed).
- AI-generated explanation (with loading state on first generation).
- Link to the commit on GitHub.

### F5: Pre-Indexed Demo Repos

- One personal repo (small, fast, shows real work).
- One well-known small OSS repo (e.g., `expressjs/express` or `sindresorhus/got`).
- Available immediately on first visit — no waiting.

## User Flows

### Primary Flow: Analyze a Repository

1. User visits Chronocode homepage.
2. User pastes a public GitHub URL into the input field.
3. System validates the URL and begins cloning.
4. User sees real-time status: "Cloning repository…" → "Indexing commits…" → "Ready".
5. User is redirected to the repository dashboard.
6. User sees a vertical timeline of commits grouped by date.
7. User clicks a commit to see its detail view.
8. System generates an AI explanation (if not cached) and displays it.
9. Subsequent views of the same commit load the cached explanation instantly.

### Secondary Flow: Browse Demo Repos

1. User visits the homepage.
2. User sees pre-indexed demo repositories with commit counts and last-indexed timestamps.
3. User clicks a demo repo.
4. User immediately sees the full commit timeline and can explore explanations.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Accept a GitHub URL and validate it points to a public repository |
| FR-2 | Clone public repositories via Git CLI / simple-git |
| FR-3 | Parse all commit metadata from `git log` (SHA, message, author, date, files, stats) |
| FR-4 | Store parsed commit metadata in Supabase Postgres |
| FR-5 | Generate AI explanations via Gemini API using commit diff + message |
| FR-6 | Cache AI explanations permanently, keyed by commit SHA globally |
| FR-7 | Display commit timeline as a paginated vertical feed grouped by date |
| FR-8 | Display commit detail with full metadata and AI explanation |
| FR-9 | Show honest indexing status (never a silent wait) |
| FR-10 | Rate-limit API access by IP/session (no auth in V1) |
| FR-11 | Serve pre-indexed demo repositories on the homepage |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Read-only access** — never write to, push to, or execute anything from a cloned repository |
| NFR-2 | **No code execution** — cloned repos are untrusted; never run build scripts or anything found inside them |
| NFR-3 | **Prompt-injection defense** — repo content (messages, comments, code) is data to summarize, never instructions to follow |
| NFR-4 | **No fabrication** — never invent authorship, dates, or causal narratives unsupported by the diff |
| NFR-5 | **Public repos only** — reject private repo URLs; do not work around auth walls |
| NFR-6 | **Aggressive caching** — minimize Gemini API costs via permanent SHA-keyed cache |
| NFR-7 | **Per-session AI call limits** — conservative cap on Gemini calls per session |
| NFR-8 | **Free-tier deployable** — Vercel, Railway/Render, Supabase free tiers |
| NFR-9 | **Performance** — cached explanations < 500ms, generation < 15s, metadata indexing ~1000 commits/sec |
| NFR-10 | **Scale** — handle repos up to ~50k commits without degradation |

## Success Criteria

1. A cold URL-to-timeline experience completes in under 60 seconds for a repo with <1000 commits.
2. AI explanations are grounded — they cite specific files/changes from the diff.
3. Cached explanations load in under 500ms.
4. Pre-indexed demo repos are immediately explorable on first visit.
5. The deployed app is stable enough to demo live in an interview.
6. The codebase itself demonstrates senior-level engineering: clear architecture, typed end-to-end, well-documented.

## Out of Scope (V1)

These are planned but deliberately excluded from V1:

- Function-level history tracking
- Contributor intelligence / analytics
- Natural language search (pgvector / embeddings)
- Risk analysis
- Team features / multi-user collaboration
- User authentication (Supabase Auth)
- Export / report generation
- Private repository support
- PR / issue metadata (requires GitHub API token)
- Horizontal zoomable timeline visualization
