import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  busy?: boolean;
}

/**
 * Generic confirm/cancel dialog. Replaces the hand-rolled
 * DeleteConfirmationModal in Agencies.tsx and the native window.confirm()
 * calls in Users.tsx / FinalReportModal.tsx.
 */
export function ConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
}: ConfirmDialogProps) {
  const isDanger = tone === 'danger';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      busy={busy}
      size="sm"
      title={title}
      icon={
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            isDanger
              ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          }`}
        >
          {isDanger ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-10 rounded-lg border border-border-token px-4 py-2 text-sm font-medium text-fg-default hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 disabled:opacity-50 ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
                : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500'
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-fg-default">{description}</p>
    </Modal>
  );
}

export default ConfirmDialog;
