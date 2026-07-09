# Chronocode — Engineering Decisions

> Record information that future developers should know.
> Do not log routine progress here — only lasting architectural insights, trade-offs, and rationale.

---

## D-001: Git CLI over GitHub REST API for repository access

**Date**: 2026-07-09
**Status**: Active

**Decision**: Clone repositories via `simple-git` / Git CLI using the public git protocol. Do not use the GitHub REST API for commit history.

**Rationale**: GitHub's unauthenticated REST API rate limit is 60 requests/hour — far too low for parsing full commit histories of any meaningful size. `git clone --bare` + `git log` has no rate limit and returns complete commit metadata in a single operation. PR/issue metadata (which does require the API) is deferred to V2 when a GitHub token can be required.

**Trade-off**: We lose access to PR linkage, issue references, and review comments. Acceptable for V1 since the core value prop is commit-level explanation, not PR-level.

---

## D-002: Lazy AI explanation generation with SHA-keyed global cache

**Date**: 2026-07-09
**Status**: Active

**Decision**: Generate Gemini explanations on-demand (when a user first views a commit), not eagerly during indexing. Cache permanently in Postgres, keyed by commit SHA globally (not per-repository).

**Rationale**:
- **Cost**: A repo with 10k commits would cost significant Gemini API credits to index eagerly. Most commits will never be viewed by any user. Lazy generation pays only for what's actually consumed.
- **Latency**: Eager generation would make the import pipeline minutes-to-hours longer with no user waiting.
- **Global cache**: A commit SHA is content-addressed (it's a hash of the tree, parent, author, message, and timestamp). The same commit in forks produces the same diff. One explanation serves all copies across repositories.

**Trade-off**: First-view latency of ~5–15s for uncached commits. Acceptable given the honest "generating explanation…" loading state.

---

## D-003: Supabase Postgres as the sole data store (V1)

**Date**: 2026-07-09
**Status**: Active

**Decision**: Use Supabase Postgres for all persistent data. No Redis, no vector database, no separate cache layer in V1.

**Rationale**: Supabase provides a generous free tier, managed Postgres with connection pooling (PgBouncer), and a clean JS client. V1's caching needs are met by the `commit_explanations` table itself — a DB query by unique SHA is fast enough. Redis would only be needed for rate-limit state at scale, and pgvector for NL search (V3). Both are clean additions later without schema migration.

---

## D-004: No authentication in V1

**Date**: 2026-07-09
**Status**: Active

**Decision**: No user accounts or authentication. Rate-limit by IP/session.

**Rationale**: V1's core flow (paste URL → explore commits → read explanations) doesn't require user identity. Adding auth introduces a signup wall that actively harms the demo experience — the first thing a recruiter or interviewer does is paste a URL, and any friction before that is lost engagement. Supabase Auth is a straightforward V2 addition when per-user dashboards and saved repos need persistence.

---

## D-005: pnpm workspaces without Turborepo or Nx

**Date**: 2026-07-09
**Status**: Active

**Decision**: Use plain pnpm workspaces for monorepo management. No Turborepo, Nx, or Lerna.

**Rationale**: With exactly three packages (`apps/web`, `apps/api`, `packages/shared-types`), build orchestration tools add complexity, config files, and a learning curve without meaningful benefit. pnpm workspaces handle dependency linking and cross-package scripts cleanly. If build times become a bottleneck (unlikely at this scale), Turborepo can be layered on top without restructuring.

---

## D-006: Metadata indexing cap at 50,000 commits

**Date**: 2026-07-09
**Status**: Active

**Decision**: For repositories with more than 50,000 commits, eagerly index only the most recent 50k. Queue the remainder for background backfill.

**Rationale**: Prevents pathological cases (Linux kernel: 1.2M+ commits; Chromium: 1M+) from blocking the indexing pipeline or overwhelming Postgres with a single bulk insert. 50k covers the full history of the vast majority of repositories. For the rare giants, background backfill ensures eventual completeness without blocking the user from exploring recent history immediately.

**Implementation note**: The cap applies to the eager `git log` parse-and-store step. The clone itself is always complete (bare clone), so backfill can read older commits from the existing clone without re-cloning.

---

## D-007: Vertical feed timeline for V1

**Date**: 2026-07-09
**Status**: Active

**Decision**: V1's commit timeline is a paginated vertical feed grouped by date. A horizontal zoomable timeline with commit-density visualization is deferred to the Stylize/Polish phase.

**Rationale**: A vertical feed is faster to build, easier to paginate server-side, naturally responsive on mobile, and is the pattern users already know from GitHub's commit history view. The underlying data model (commits with `authored_at` timestamps) supports both visualizations equally, so switching or adding a horizontal view later requires zero schema changes.

---

## D-008: Express.js over alternatives (Fastify, Hono, tRPC)

**Date**: 2026-07-09
**Status**: Active

**Decision**: Use Express.js for the backend API server.

**Rationale**: Express has the largest middleware ecosystem, the most hiring-relevant familiarity (this is a portfolio project), and the simplest mental model for a solo build. Fastify's performance edge is irrelevant at V1 traffic levels. tRPC would tightly couple frontend and backend, which conflicts with the separate-deployment architecture (Vercel vs Railway). Hono is excellent but less recognizable in a MAANG interview context.

---

## D-009: Bare clone vs full clone

**Date**: 2026-07-09
**Status**: Pending investigation

**Decision**: TBD — investigate whether `git clone --bare` provides everything we need (commit metadata + diffs) without the working tree overhead, or whether a full clone is required for `git diff` operations.

**Notes**: A bare clone saves significant disk space (no checked-out working tree) but may limit some `git show`/`git diff` operations. Need to verify with `simple-git` before committing to one approach.
