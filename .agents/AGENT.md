# Chronocode — Project Constitution (AGENT.md)

> This file is the project's permanent constitution.
> Only update it when coding conventions, architecture, data models, or API contracts change.
> It should remain stable throughout the project.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript, React 18+ |
| Backend | Node.js 20+, Express.js, TypeScript |
| Database | Supabase Postgres |
| AI | Google Gemini API (`gemini-2.0-flash` for cost efficiency) |
| Git Operations | `simple-git` (Node.js library) |
| Deployment — Frontend | Vercel |
| Deployment — Backend | Railway or Render |
| Package Manager | pnpm 9+ (monorepo workspaces) |
| Monorepo Tool | pnpm workspaces (no Turborepo/Nx for V1) |

---

## Monorepo Structure

```
chronocode/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router pages & layouts
│   │   │   ├── components/     # React components
│   │   │   │   ├── ui/         # Generic reusable UI primitives
│   │   │   │   └── features/   # Feature-specific composed components
│   │   │   ├── lib/            # Client-side utilities, API client, hooks
│   │   │   └── styles/         # Global CSS, custom properties, design tokens
│   │   ├── public/             # Static assets
│   │   ├── next.config.js
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                    # Express.js backend
│       ├── src/
│       │   ├── routes/         # Express route handlers (thin)
│       │   ├── services/       # Business logic (git, AI, repo management)
│       │   ├── middleware/     # Cross-cutting: rate-limit, error handling, validation
│       │   ├── lib/            # Utilities: DB client, Gemini client, logger
│       │   ├── jobs/           # Background job runners (indexing pipeline)
│       │   └── index.ts        # Express app entry point
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared-types/           # Shared TypeScript type definitions
│       ├── src/
│       │   ├── models.ts       # Domain models (Repository, Commit, etc.)
│       │   ├── api.ts          # API request/response shapes
│       │   └── index.ts        # Barrel export
│       ├── tsconfig.json
│       └── package.json
│
├── PRD.md
├── AGENT.md
├── TASKS.md
├── DECISIONS.md
├── README.md
├── .gitignore
├── pnpm-workspace.yaml
├── package.json                # Root package.json (scripts, devDependencies)
└── tsconfig.base.json          # Shared TypeScript compiler options
```

---

## Coding Conventions

### General

- **Language**: TypeScript everywhere, strict mode enabled.
- **No `any`**: Use `unknown` and narrow with type guards.
- **`const` over `let`**: Never use `var`.
- **Named exports only**: No default exports.
- **Single responsibility**: One module = one job.
- **Functions over classes**: Unless genuine state encapsulation is needed.
- **Explicit error handling**: Never swallow errors silently. Log, rethrow, or return a typed error.
- **No dead code**: Remove unused imports, variables, and functions.

### Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| Files | `kebab-case.ts` | `commit-service.ts` |
| Types / Interfaces | `PascalCase` | `CommitExplanation` |
| Functions / Variables | `camelCase` | `getCommitExplanation` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_COMMITS_EAGER` |
| Database columns | `snake_case` | `author_name` |
| API route paths | `kebab-case` | `/api/repos/:id/commits` |
| Environment variables | `UPPER_SNAKE_CASE` | `GEMINI_API_KEY` |

### Frontend (Next.js)

- **App Router** (not Pages Router).
- **Server Components by default**; use `'use client'` only when interactivity is required.
- **CSS**: Vanilla CSS with CSS custom properties for theming. No Tailwind unless explicitly requested.
- **No inline styles**.
- Components go in `src/components/ui/` (generic) or `src/components/features/` (feature-specific).
- Hooks go in `src/lib/hooks/`.
- API calls go through a centralized client in `src/lib/api-client.ts`.

### Backend (Express)

- **Route handlers are thin**: Validate input, call a service, return a response.
- **Services contain business logic**: Git operations, AI calls, data persistence.
- **Middleware for cross-cutting concerns**: Rate limiting, error handling, request logging, CORS.
- **All async handlers must catch errors**: Use an `asyncHandler` wrapper or try/catch.

### Shared Types

- All API request/response shapes defined in `packages/shared-types/src/api.ts`.
- All domain models defined in `packages/shared-types/src/models.ts`.
- Both `apps/web` and `apps/api` import from `@chronocode/shared-types`.

---

## Data Model (Supabase Postgres)

### `repositories`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` |
| `github_url` | `text` | UNIQUE, NOT NULL |
| `owner` | `text` | NOT NULL |
| `name` | `text` | NOT NULL |
| `default_branch` | `text` | |
| `status` | `text` | NOT NULL, `CHECK (status IN ('queued','cloning','indexing','ready','failed'))` |
| `total_commits` | `integer` | `DEFAULT 0` |
| `indexed_commits` | `integer` | `DEFAULT 0` |
| `error_message` | `text` | Nullable |
| `created_at` | `timestamptz` | `DEFAULT now()` |
| `updated_at` | `timestamptz` | `DEFAULT now()` |
| `last_indexed_at` | `timestamptz` | Nullable |

### `commits`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` |
| `repo_id` | `uuid` | FK → `repositories(id) ON DELETE CASCADE`, NOT NULL |
| `sha` | `text` | NOT NULL |
| `message` | `text` | NOT NULL |
| `author_name` | `text` | NOT NULL |
| `author_email` | `text` | |
| `authored_at` | `timestamptz` | NOT NULL |
| `committer_name` | `text` | |
| `committer_email` | `text` | |
| `committed_at` | `timestamptz` | |
| `parent_shas` | `text[]` | `DEFAULT '{}'` |
| `files_changed` | `integer` | `DEFAULT 0` |
| `insertions` | `integer` | `DEFAULT 0` |
| `deletions` | `integer` | `DEFAULT 0` |
| `created_at` | `timestamptz` | `DEFAULT now()` |
| | | `UNIQUE(repo_id, sha)` |

### `commit_explanations`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` |
| `sha` | `text` | UNIQUE, NOT NULL — **global cache key** |
| `explanation` | `text` | NOT NULL |
| `model_id` | `text` | NOT NULL (e.g., `gemini-2.0-flash`) |
| `prompt_tokens` | `integer` | Nullable |
| `completion_tokens` | `integer` | Nullable |
| `created_at` | `timestamptz` | `DEFAULT now()` |

### `commit_files`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` |
| `commit_id` | `uuid` | FK → `commits(id) ON DELETE CASCADE`, NOT NULL |
| `file_path` | `text` | NOT NULL |
| `change_type` | `text` | NOT NULL, `CHECK (change_type IN ('A','M','D','R','C'))` |
| `insertions` | `integer` | `DEFAULT 0` |
| `deletions` | `integer` | `DEFAULT 0` |

### Indexes

| Table | Columns | Purpose |
|-------|---------|---------|
| `commits` | `(repo_id, authored_at DESC)` | Timeline pagination |
| `commits` | `(repo_id, sha)` | Unique constraint (above) doubles as index |
| `commit_explanations` | `(sha)` | Unique constraint doubles as cache lookup index |
| `commit_files` | `(commit_id)` | File list for a commit |

---

## API Contracts

### `POST /api/repos`

Start indexing a new repository.

**Request Body:**
```json
{ "url": "https://github.com/owner/repo" }
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "github_url": "https://github.com/owner/repo",
  "owner": "owner",
  "name": "repo",
  "status": "queued",
  "total_commits": 0,
  "indexed_commits": 0,
  "created_at": "ISO-8601"
}
```

**Response (200 OK)** — if repo already exists:
Returns the existing repository object with current status.

**Response (400):**
```json
{ "error": "Invalid GitHub URL" }
```

---

### `GET /api/repos/:id`

Get repository status and metadata.

**Response (200):**
```json
{
  "id": "uuid",
  "github_url": "...",
  "owner": "...",
  "name": "...",
  "status": "ready",
  "total_commits": 1234,
  "indexed_commits": 1234,
  "default_branch": "main",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "last_indexed_at": "ISO-8601"
}
```

---

### `GET /api/repos/:id/commits`

Paginated commit list, ordered by authored date descending.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Commits per page (max 100) |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "sha": "abc1234...",
      "message": "Fix auth middleware",
      "author_name": "Jane Doe",
      "author_email": "jane@example.com",
      "authored_at": "ISO-8601",
      "files_changed": 3,
      "insertions": 42,
      "deletions": 12,
      "parent_shas": ["def5678..."],
      "has_explanation": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "total_pages": 25
  }
}
```

---

### `GET /api/commits/:sha/explain`

Get or generate an AI explanation for a commit.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repoId` | uuid | Yes | Repository ID (needed to locate the clone for diff retrieval) |

**Response (200 — cached):**
```json
{
  "sha": "abc1234...",
  "explanation": "Fixes a race condition in the auth middleware...",
  "cached": true,
  "model_id": "gemini-2.0-flash",
  "created_at": "ISO-8601"
}
```

**Response (200 — generated):**
```json
{
  "sha": "abc1234...",
  "explanation": "Fixes a race condition in the auth middleware...",
  "cached": false,
  "model_id": "gemini-2.0-flash",
  "created_at": "ISO-8601"
}
```

**Response (429):**
```json
{ "error": "AI explanation rate limit exceeded. Try again later." }
```

---

## Security Rules

1. **Read-only**: Never write to, push to, or execute anything from a cloned repository.
2. **No code execution**: Cloned repos are untrusted input. Never run build scripts, makefiles, shell scripts, or anything found inside them.
3. **Prompt-injection defense**: Commit messages and code comments are attacker-controllable text fed to the LLM. System prompts must instruct the model to treat repo content as **data to summarize**, never as **instructions to follow**.
4. **No fabrication**: Never invent authorship, dates, or causal narratives unsupported by the diff.
5. **Public repos only**: Reject private repo URLs; do not work around auth walls.
6. **Input validation**: Sanitize and validate all user input — URLs, query parameters, route params.
7. **Rate limiting**: Per-IP rate limits on all endpoints; stricter per-session limits on AI generation endpoints.
8. **No secrets in client code**: API keys, database credentials, and tokens stay server-side only.

---

## Performance Guidelines

| Metric | Target |
|--------|--------|
| Cached explanation response | < 500ms |
| AI explanation generation | < 15s |
| Commit metadata indexing throughput | ~1000 commits/sec from `git log` |
| Pagination max | 50 commits/page default, 100 max |
| Clone timeout | 120 seconds |
| Database queries | Indexed; no N+1 patterns |

---

## Behavioral Constraints

- **AI tone**: Sharp senior engineer — plain, precise, no filler. If evidence is thin, say so.
- **Honest status**: Indexing states must be visible and truthful. No silent waits.
- **No signup wall**: Core V1 flow requires no account.
- **No fabrication**: If the diff doesn't support a "why", don't invent one.
- **Graceful degradation**: If Gemini is unavailable, show commit metadata without explanation rather than erroring the whole page.
