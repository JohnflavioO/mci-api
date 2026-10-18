import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-sm border border-accent bg-accent/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent-foreground ${className}`}>
      Demonstração
    </span>
  );
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-6">
      <p className="font-medium text-destructive">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-sm font-medium underline underline-offset-4">
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function SuccessState({ message }: { message: string }) {
  return <div className="rounded-md border border-success/40 bg-success/10 p-4 text-sm font-medium">{message}</div>;
}
