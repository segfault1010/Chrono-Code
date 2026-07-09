"use client";

import { useEffect } from "react";
import { Button } from "../components/ui/Button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-error-bg)] flex items-center justify-center mb-6 shadow-lg text-[var(--color-error)]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold mb-4">Something went wrong!</h1>
      <p className="text-[var(--color-text-secondary)] mb-8 max-w-md">
        An unexpected error occurred while loading this page. Our team has been notified.
      </p>
      <div className="flex gap-4">
        <Button onClick={() => reset()} variant="primary">
          Try Again
        </Button>
        <Button onClick={() => window.location.href = "/"} variant="secondary">
          Go Home
        </Button>
      </div>
    </div>
  );
}
