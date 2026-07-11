# Chronocode Privacy & Compliance Policy

## Data Collection & PII
Chronocode is designed with data minimization and privacy at its core.

### 1. Analytics & Telemetry
- **No Third-Party Tracking SDKs**: We do not use Google Analytics, Mixpanel, or any third-party behavioral tracking scripts on our frontend.
- **Commit Data (Public Information)**: The analytics dashboard aggregates \`author_name\` and \`authored_at\` directly from public Git repository histories. This data is already public on GitHub/GitLab and is strictly used to visualize commit timelines.
- **GDPR / CCPA**: We do not track user IP addresses for analytics, and we do not sell or share aggregated data with external brokers.

### 2. AI Pipeline Data Security
- **Secret Sanitization**: All commit messages and code diffs are passed through a strict regex-based sanitization pipeline (\`lib/sanitize.ts\`) before being sent to external AI providers (Google Gemini).
- **Redacted Information**: API keys, AWS credentials, JWTs, Stripe tokens, and GitHub PATs are automatically redacted and replaced with \`[REDACTED_SECRET]\`.
- **No Training Data**: We opt out of using our API inputs for training third-party LLM models whenever supported by the provider.

## Access Control (RBAC)
- All intelligence routes (\`/api/repos/:id/risk-analysis\`, \`/api/commits/:sha/explain\`) are strictly protected by \`requireAuth\` middleware, requiring a valid Supabase JWT session.
- AI routes are protected by IP-based rate limiting (maximum 20 requests per hour) to prevent abuse and API exhaustion.
