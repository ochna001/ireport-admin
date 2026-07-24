import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * One empty-state pattern for the whole app (icon + title + description +
 * next action). Replaces the three different patterns that existed before:
 * a flat gray text line, an icon+copy+CTA block, and a bare "-" placeholder.
 */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`rounded-xl border border-dashed border-border-token bg-surface px-6 py-12 text-center ${className}`}>
      {icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle text-fg-subtle">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-fg-strong">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
