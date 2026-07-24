import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * The eyebrow/title/description/actions pattern already existed by hand on
 * six screens (Dashboard, Incidents, Agencies, Reports, NotificationsPage…).
 * Centralizing it here keeps future header tweaks (spacing, type scale) a
 * one-file change instead of a six-file grep-and-replace.
 */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-fg-strong">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

export default PageHeader;
