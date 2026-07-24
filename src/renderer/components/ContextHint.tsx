import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface ContextHintProps {
  children: ReactNode;
  title: string;
  description: ReactNode;
  ariaLabel?: string;
  className?: string;
}

interface HintPosition {
  left: number;
  top: number;
  width: number;
}

export function ContextHint({
  children,
  title,
  description,
  ariaLabel,
  className = '',
}: ContextHintProps) {
  const hintId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextFocusOpenRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<HintPosition>({ left: 12, top: 12, width: 320 });
  const open = hovered || focused || pinned;

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setHovered(false);
      setFocused(false);
    }, 120);
  };

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const width = Math.min(320, Math.max(220, window.innerWidth - viewportPadding * 2));
    const height = popoverRef.current?.offsetHeight || 150;
    const preferredLeft = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(
      Math.max(viewportPadding, preferredLeft),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );
    const below = rect.bottom + gap;
    const top = below + height <= window.innerHeight - viewportPadding
      ? below
      : Math.max(viewportPadding, rect.top - height - gap);
    setPosition({ left, top, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition, title, description]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!pinned) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setPinned(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setHovered(false);
        setFocused(false);
        if (document.activeElement !== triggerRef.current) {
          suppressNextFocusOpenRef.current = true;
          triggerRef.current?.focus();
        }
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pinned]);

  useEffect(() => () => cancelClose(), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel || `More information about ${title}`}
        aria-describedby={open ? hintId : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setPinned((current) => !current)}
        onMouseEnter={() => { cancelClose(); setHovered(true); }}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          cancelClose();
          if (suppressNextFocusOpenRef.current) {
            suppressNextFocusOpenRef.current = false;
            return;
          }
          setFocused(true);
        }}
        onBlur={scheduleClose}
        className={`inline-flex min-h-7 items-center gap-1 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${className}`}
      >
        {children}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          id={hintId}
          role="tooltip"
          onMouseEnter={() => { cancelClose(); setHovered(true); }}
          onMouseLeave={scheduleClose}
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: 'calc(100vh - 24px)' }}
          className="fixed z-[300] overflow-y-auto rounded-lg border border-blue-200 bg-white p-3 text-left shadow-xl dark:border-blue-800 dark:bg-slate-900"
        >
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">{title}</p>
          <div className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">{description}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default ContextHint;
