import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="mt-2 text-sm font-medium text-accent underline">
        Back to booking
      </Link>
    </main>
  );
}
