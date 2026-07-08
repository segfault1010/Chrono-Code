// ============================================================================
// Chronocode — Home Page
// Hero section with URL input and demo repository showcase.
// Placeholder for Phase 7–8 implementation.
// ============================================================================

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6)",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "var(--text-4xl)",
          fontWeight: "var(--font-weight-extrabold)",
          letterSpacing: "-0.025em",
          lineHeight: "var(--leading-tight)",
          marginBottom: "var(--space-4)",
        }}
      >
        <span style={{ color: "var(--color-accent-primary)" }}>Chrono</span>
        <span style={{ color: "var(--color-text-primary)" }}>code</span>
      </h1>
      <p
        style={{
          fontSize: "var(--text-lg)",
          color: "var(--color-text-secondary)",
          maxWidth: "32rem",
          lineHeight: "var(--leading-relaxed)",
        }}
      >
        Turn raw git history into the explanation a senior teammate would give you.
      </p>
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--color-text-tertiary)",
          marginTop: "var(--space-8)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Scaffolding complete — UI coming in Phase 7
      </p>
    </main>
  );
}
