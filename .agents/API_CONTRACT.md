# Chronocode API Contract & Versioning

## V1 to V2 Backward Compatibility
The transition to the "V2" architecture and the "Final V!" milestone in the commit history represents a non-destructive expansion of the Chronocode API.

### 1. Stable Endpoints (No Breaking Changes)
The following legacy endpoints maintain strict backward compatibility:
- \`GET /api/repos/:id\` (Repository fetching)
- \`GET /api/repos/:id/commits\` (Paginated timeline)
- \`GET /api/commits/:sha/explain\` (AI Explanation generation)

The data payloads for these endpoints have strictly additive schema modifications (e.g., adding \`model_id\`), guaranteeing that V1 client integrations will not break.

### 2. New V2 Endpoints (Additive Only)
The V2 migration introduced intelligence and analytics routes. These do not override existing paths:
- \`GET /api/repos/:id/releases/generate\` (Server-Sent Events)
- \`GET /api/repos/:id/risk-analysis\` (Server-Sent Events)
- \`GET /api/repos/:id/analytics/contributors\`

### 3. Production Stability Guarantee
The "Final" releases represent the freezing of the V2 REST API contract. Any future architectural shifts (V3) will be routed under a new namespace (e.g., \`/api/v3/\`) or utilizing GraphQL to prevent destructive refactoring of the current production paths.

A health check endpoint is available at \`/api/health\` for continuous production monitoring.
