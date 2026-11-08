import { useEffect, useLayoutEffect, useRef, useState, type FC, type ReactNode } from 'react';

export interface PopoverProps {
  /** Content of the trigger button */
  label: ReactNode;
  /** Accessible name / tooltip for the trigger */
  title?: string;
  /** Panel content; receives a close() callback for one-shot choices */
  children: (close: () => void) => ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  disabled?: boolean;
  /** Which edge of the trigger the panel lines up with */
  align?: 'left' | 'right';
}

const VIEWPORT_MARGIN = 16;

/** Button that opens a floating panel. Closes on outside click and Escape. */
export const Popover: FC<PopoverProps> = ({
  label,
  title,
  children,
  triggerClassName = '',
  panelClassName = 'w-80',
  disabled = false,
  align = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen]);

  // Keep the panel inside the viewport (triggers near the right edge, phones)
  useLayoutEffect(() => {
    if (!isOpen || !panelRef.current) {
      setShiftX(0);
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - VIEWPORT_MARGIN);
    const overflowLeft = VIEWPORT_MARGIN - rect.left;
    if (overflowRight > 0) setShiftX(-overflowRight);
    else if (overflowLeft > 0) setShiftX(overflowLeft);
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={triggerClassName}
      >
        {label}
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          style={{ transform: `translateX(${shiftX}px)` }}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 z-40 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 ${panelClassName}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
};
