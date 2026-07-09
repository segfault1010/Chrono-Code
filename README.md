# Chronocode

**Turn raw git history into the explanation a senior teammate would give you.**

Chronocode takes a public GitHub repository URL, indexes its full commit history, and uses AI to generate concise, grounded explanations of what each commit does and why — cited against actual diffs, never invented.

## Status

🚧 **V1 — Done**

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript |
| Backend | Node.js, Express.js, TypeScript |
| Database | Supabase Postgres |
| AI | Google Gemini API (`gemini-3.5-flash`) |
| Git | `simple-git` |
| Monorepo | pnpm workspaces |

## Project Structure

```
chronocode/
├── apps/
│   ├── web/              # Next.js frontend → deployed on Vercel
│   └── api/              # Express.js backend → deployed on Railway/Render
├── packages/
│   └── shared-types/     # Shared TypeScript type definitions
└── README.md             # ← You are here
```

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Git** (installed and available on PATH)
- **Supabase** account ([supabase.com](https://supabase.com) — free tier)
- **Google Gemini API key** ([ai.google.dev](https://ai.google.dev))

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd chronocode

# Install all dependencies (monorepo-wide)
pnpm install
```

## Deployment

Chronocode is designed to be easily deployed to modern cloud platforms.

### 1. Database (Supabase)
1. Create a new Supabase project.
2. Run the SQL script located at `apps/api/src/migrations/001_initial_schema.sql` in your Supabase SQL Editor.
3. Note your Database URL and Anon Key.

### 2. Backend API (Render / Railway / Fly.io)
The backend requires `git` to be installed to parse repositories. We provide a `Dockerfile` for seamless deployment.
1. Connect your repository to your hosting provider.
2. Select **Docker** as the deployment method.
3. Set the Dockerfile path to `apps/api/Dockerfile`.
4. Environment Variables needed:
   - `PORT=3001`
   - `SUPABASE_URL=...`
   - `SUPABASE_KEY=...`
   - `GEMINI_API_KEY=...`

### 3. Frontend Web (Vercel)
The project includes a `vercel.json` at the root for zero-config deployment.
1. Import your repository in Vercel.
2. Vercel will automatically detect the settings. If it asks, set the Root Directory to `apps/web`.
3. Environment Variables needed:
   - `NEXT_PUBLIC_API_URL=https://your-backend-api.com/api`

## Environment Variables

### `apps/api/.env`

```env
# Database
DATABASE_URL=postgresql://postgres:<password>@<host>:<port>/<database>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>

# AI
GEMINI_API_KEY=<your-gemini-api-key>

# Git
CLONE_BASE_PATH=./tmp/clones

# Server
PORT=3001
NODE_ENV=development
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Running Locally

```bash
# Terminal 1 — Start the backend API
pnpm --filter @chronocode/api dev

# Terminal 2 — Start the frontend
pnpm --filter @chronocode/web dev
```

The frontend will be available at `http://localhost:3000`.
The backend API will be available at `http://localhost:3001`.

## Build

```bash
# Build all packages
pnpm -r build

# Build a specific package
pnpm --filter @chronocode/web build
pnpm --filter @chronocode/api build
```

## Deployment

| Service | Platform | Notes |
|---------|----------|-------|
| Frontend (`apps/web`) | Vercel | Auto-deploys from monorepo, root directory set to `apps/web` |
| Backend (`apps/api`) | Railway or Render | Root directory set to `apps/api` |
| Database | Supabase | Managed Postgres, free tier |

### Deployment Steps

1. Push code to GitHub.
2. Connect Vercel to the repo, set root directory to `apps/web`, add env vars.
3. Connect Railway/Render to the repo, set root directory to `apps/api`, add env vars.
4. Run database migrations on Supabase.
5. (Optional) Run the demo seed script to pre-index showcase repositories.

## Documentation

| Document | Purpose |
|----------|---------|
| [.agents/PRD.md](./.agents/PRD.md) | Product requirements — what we're building and why |
| [.agents/AGENT.md](./.agents/AGENT.md) | Project constitution — conventions, data model, API contracts |
| [.agents/TASKS.md](./.agents/TASKS.md) | Implementation roadmap — current progress |
| [.agents/DECISIONS.md](./.agents/DECISIONS.md) | Engineering decisions — rationale for key choices |
| [.agents/CONTEXT.md](./.agents/CONTEXT.md) | Current project status and architecture summary |

---
