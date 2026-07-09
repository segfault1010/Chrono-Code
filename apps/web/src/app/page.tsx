"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { api } from "../lib/api";

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      const repo = await api.repos.create(url);
      router.push(`/repos/${repo.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to import repository");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 80px)",
        padding: "var(--space-6)",
      }}
    >
      <div style={{ maxWidth: "600px", width: "100%", textAlign: "center", marginBottom: "var(--space-8)" }}>
        <h1
          style={{
            fontSize: "var(--text-4xl)",
            fontWeight: "var(--font-weight-bold)",
            letterSpacing: "-0.04em",
            marginBottom: "var(--space-4)",
            background: "linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.7) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Understand any codebase in seconds
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-lg)", lineHeight: 1.6 }}>
          Chronocode turns raw git history into the explanation a senior teammate would give you.
          Import a public GitHub repository to get started.
        </p>
      </div>

      <Card style={{ width: "100%", maxWidth: "500px" }}>
        <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Input
            label="GitHub Repository URL"
            placeholder="https://github.com/expressjs/morgan"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={error || undefined}
            disabled={isLoading}
          />
          <Button type="submit" isLoading={isLoading} size="lg" style={{ marginTop: "var(--space-2)" }}>
            Analyze Repository
          </Button>
        </form>
      </Card>
    </main>
  );
}
