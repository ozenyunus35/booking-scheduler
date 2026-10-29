import { cx } from "./ui";

/** Cadence, the booking product being demoed. */
export function CadenceMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-md bg-text text-bg", className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.64, height: size * 0.64 }} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
        <path d="M4 10h16M8.5 3.5v3M15.5 3.5v3" />
      </svg>
    </span>
  );
}

/** Halden Hair Studio, the fictional salon. A serif monogram so it reads as the client's brand, not the product's. */
export function HaldenMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-full border border-border-strong bg-surface text-text", className)}
      style={{ width: size, height: size, fontFamily: "ui-serif, Georgia, serif", fontSize: size * 0.5, lineHeight: 1 }}
      aria-hidden
    >
      H
    </span>
  );
}
