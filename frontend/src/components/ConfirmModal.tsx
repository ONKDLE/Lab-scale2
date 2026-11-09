import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean; // 되돌리기 어려운 동작이면 확인 버튼을 빨간색으로
  busy?: boolean; // 처리 중이면 버튼을 잠그고 닫기를 막는다
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "정말 하시겠어요?" 확인 팝업.
 * - 열리면 '닫기' 버튼에 포커스가 가고, 닫히면 원래 누르던 버튼으로 포커스가 돌아온다.
 * - Esc 키, 바깥 영역 클릭으로 닫을 수 있다. (처리 중에는 안 닫힘)
 * - Tab 키가 팝업 밖으로 나가지 않는다.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = '닫기',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 최신 값을 키보드 처리 함수에서 쓰기 위해 ref에 담아 둔다.
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!latest.current.busy) latest.current.onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
      if (!focusable || focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <p id={messageId} className="modal-message">
          {message}
        </p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'danger-button danger-button--solid' : 'primary-button'}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
