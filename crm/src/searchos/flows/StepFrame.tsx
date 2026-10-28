/**
 * The Flow register's unit (interface system v2, "StepFrame"): one ask on
 * screen. Eyebrow "Step 2 of 4", the title as a question or an instruction,
 * a lede, the content (choice tiles or the one input), then the footer with
 * Back (Quiet, chevron) and the one Primary. Progress rail on top.
 * Shadcn primitives and tokens only.
 */
import { ChevronLeft, CheckCircle2, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProgressRail({ n, of }: { n: number; of: number }) {
  return (
    <div
      className="flex gap-1.5"
      role="group"
      aria-label={`Step ${n} of ${of}`}
      data-testid="step-rail"
    >
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "h-[3px] flex-1 rounded-full",
            i < n ? "bg-primary" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

export function StepFrame({
  n,
  of,
  title,
  lede,
  back,
  primary,
  quiet,
  wide = false,
  done = false,
  children,
  testid,
}: {
  n: number;
  of: number;
  title: string;
  lede?: ReactNode;
  /** The Back link target; absent on the first screen. */
  back?: string | null;
  /** The one Primary of the screen. */
  primary?: {
    label: string;
    onClick?: () => void;
    to?: string;
    disabled?: boolean;
    busy?: boolean;
  };
  /** Extra Quiet actions beside Back (Skip, Log another...). */
  quiet?: { label: string; to?: string; onClick?: () => void }[];
  wide?: boolean;
  done?: boolean;
  children?: ReactNode;
  testid?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-5 py-2 md:py-6",
        wide ? "max-w-[58.67rem]" : "max-w-[41.33rem]",
      )}
      data-testid={testid ?? "step"}
      data-step-n={n}
    >
      <ProgressRail n={n} of={of} />
      <section
        className="flex flex-col rounded-[0.875rem] border bg-card px-5 py-7 text-card-foreground md:px-9 md:py-9"
        aria-labelledby="step-title"
      >
        {done ? (
          <span className="text-primary mb-3" aria-hidden>
            <CheckCircle2 className="size-8" />
          </span>
        ) : null}
        <p className="si-eyebrow">
          Step {n} of {of}
        </p>
        <h1 id="step-title" className="si-title" data-crm-title>
          {title}
        </h1>
        {lede ? <p className="si-lede">{lede}</p> : null}
        {children ? (
          <div className="flex flex-col gap-3 pt-9">{children}</div>
        ) : null}
        <footer className="flex flex-wrap items-center gap-2 pt-10">
          {back ? (
            <Button variant="ghost" asChild data-testid="step-back">
              <Link to={back}>
                <ChevronLeft className="size-4" />
                Back
              </Link>
            </Button>
          ) : null}
          {quiet?.map((q) =>
            q.to ? (
              <Button key={q.label} variant="ghost" asChild>
                <Link to={q.to}>{q.label}</Link>
              </Button>
            ) : (
              <Button
                key={q.label}
                variant="ghost"
                type="button"
                onClick={q.onClick}
              >
                {q.label}
              </Button>
            ),
          )}
          {primary ? (
            primary.to && !primary.disabled ? (
              <Button
                className="ml-auto h-11 px-7 text-[0.95rem]"
                asChild
                data-testid="step-primary"
              >
                <Link to={primary.to}>{primary.label}</Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="ml-auto h-11 px-7 text-[0.95rem]"
                onClick={primary.onClick}
                disabled={primary.disabled || primary.busy}
                aria-busy={primary.busy ? "true" : undefined}
                data-testid="step-primary"
              >
                {primary.busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {primary.label}
              </Button>
            )
          ) : null}
        </footer>
      </section>
    </div>
  );
}

/** A choice tile: title and a note; selected is a ring and a tint, never a fill. */
export function Choice({
  title,
  note,
  selected = false,
  onClick,
  to,
  testid,
}: {
  title: string;
  note?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  to?: string;
  testid?: string;
}) {
  // The kit's Choice: hairline tile, .75rem radius; hover darkens the hairline,
  // selected is accent border + tint + a 1px ring. Never a fill.
  const cls = cn(
    "flex min-h-14 w-full flex-col items-start gap-0.5 rounded-xl border bg-card px-4 py-3 text-left text-card-foreground transition-colors hover:border-foreground/60",
    selected &&
      "border-primary bg-accent ring-1 ring-primary hover:border-primary",
  );
  if (to) {
    return (
      <Link
        to={to}
        className={cls}
        data-testid={testid ?? "choice"}
        aria-pressed={selected}
      >
        <span className="text-sm font-medium">{title}</span>
        {note ? (
          <span className="text-xs text-muted-foreground">{note}</span>
        ) : null}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testid ?? "choice"}
    >
      <span className="text-sm font-medium">{title}</span>
      {note ? (
        <span className="text-xs text-muted-foreground">{note}</span>
      ) : null}
    </button>
  );
}

export const Choices = ({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
}) => (
  <div
    className={cn(
      "grid gap-2",
      cols === 1 && "grid-cols-1",
      cols === 2 && "grid-cols-1 sm:grid-cols-2",
      cols === 3 && "grid-cols-1 sm:grid-cols-3",
    )}
    role="group"
  >
    {children}
  </div>
);
