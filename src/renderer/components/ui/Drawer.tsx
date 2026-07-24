import { X } from 'lucide-react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from './useDialogBehavior';

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  children: React.ReactNode;
  busy?: boolean;
}

/**
 * Right-side slide-in panel for forms with more than ~5 fields (station
 * editors, user creation, final report review). Keeps the parent screen
 * visible on the left instead of blocking it entirely like a centered modal.
 */
export function Drawer({ isOpen, onClose, title, description, icon, size = 'md', footer, children, busy }: DrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(isOpen, () => !busy && onClose(), dialogRef);

  if (!isOpen) return null;

  const titleId = `drawer-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex justify-end bg-slate-950/50"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`drawer-panel h-full w-full ${SIZE_CLASSES[size]} flex flex-col overflow-hidden border-l border-border-token bg-surface shadow-2xl focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-token p-5">
          <div className="flex items-start gap-3 min-w-0">
            {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-bold text-fg-strong truncate">{title}</h2>
              {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            aria-label={`Close ${title} panel`}
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border-token p-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Drawer;
