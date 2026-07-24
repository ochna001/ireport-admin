import { X } from 'lucide-react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from './useDialogBehavior';

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg' | 'full', string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-4xl',
  full: 'max-w-[92vw]',
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Disable backdrop/escape close while a save is in flight. */
  busy?: boolean;
}

/**
 * Shared modal surface — portal, focus trap, Escape close, backdrop click,
 * body-scroll lock, and return-focus on close are all handled here so
 * individual screens never hand-roll `fixed inset-0 bg-black/50 …` again.
 */
export function Modal({ isOpen, onClose, title, description, icon, size = 'md', footer, children, busy }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(isOpen, () => !busy && onClose(), dialogRef);

  if (!isOpen) return null;

  const titleId = `modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-panel w-full ${SIZE_CLASSES[size]} max-h-[90vh] overflow-hidden rounded-2xl border border-border-token bg-surface shadow-2xl flex flex-col focus:outline-none`}
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
            aria-label={`Close ${title} dialog`}
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

export default Modal;
