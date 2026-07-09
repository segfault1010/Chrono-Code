"use client";

export function Navbar() {
  return (
    <header
      suppressHydrationWarning
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--color-border)",
        background: "rgba(10, 10, 10, 0.8)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        suppressHydrationWarning
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "var(--space-4) var(--space-6)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {/* Subtle glowing orb as logo */}
          <div
            suppressHydrationWarning
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: "var(--color-accent-primary)",
              boxShadow: "0 0 15px var(--color-accent-primary), inset 0 0 10px rgba(255,255,255,0.5)",
            }}
          />
          <span
            suppressHydrationWarning
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: "var(--font-weight-bold)",
              fontSize: "var(--text-xl)",
              letterSpacing: "-0.02em",
            }}
          >
            Chronocode
          </span>
        </div>
        
        <nav style={{ display: "flex", gap: "var(--space-6)" }}>
          <a
            suppressHydrationWarning
            href="https://github.com/your-username/chronocode"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--color-text-secondary)",
              textDecoration: "none",
              fontSize: "var(--text-sm)",
              transition: "color var(--transition-fast)",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseOut={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
