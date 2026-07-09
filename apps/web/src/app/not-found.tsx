import Link from "next/link";
import { Button } from "../components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="text-8xl font-black text-[var(--color-bg-elevated)] tracking-tighter mb-4 select-none relative">
        404
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-secondary)] bg-clip-text text-transparent opacity-50 blur-sm">404</div>
      </div>
      <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
      <p className="text-[var(--color-text-secondary)] mb-8 max-w-md">
        We couldn't find the page you're looking for. It might have been moved or deleted.
      </p>
      <Link href="/">
        <Button variant="primary">
          Return Home
        </Button>
      </Link>
    </div>
  );
}
