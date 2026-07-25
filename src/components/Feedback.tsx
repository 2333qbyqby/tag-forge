import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Check, X } from "lucide-react";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  duration?: number;
}

export function ToastRegion({
  message,
  onDismiss,
  onActionError,
}: {
  message?: ToastMessage;
  onDismiss: () => void;
  onActionError?: (reason: unknown) => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(
      onDismiss,
      message.duration ?? (message.actionLabel ? 5000 : 3000),
    );
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div
      className={`app-toast tone-${message.tone ?? "info"}`}
      role={message.tone === "error" ? "alert" : "status"}
      aria-live={message.tone === "error" ? "assertive" : "polite"}
    >
      {message.tone === "error" ? (
        <AlertTriangle size={17} />
      ) : (
        <Check size={17} />
      )}
      <span>{message.text}</span>
      {message.actionLabel && message.onAction ? (
        <button
          onClick={async () => {
            try {
              await message.onAction?.();
              onDismiss();
            } catch (reason) {
              onActionError?.(reason);
            }
          }}
        >
          {message.actionLabel}
        </button>
      ) : null}
      <button className="toast-close" onClick={onDismiss} aria-label="关闭通知">
        <X size={15} />
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  destructive = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      window.setTimeout(() => restoreFocusRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(
    () => () => {
      restoreFocusRef.current?.focus();
    },
    [],
  );

  const close = () => {
    if (busy) return;
    onCancel();
    window.setTimeout(() => restoreFocusRef.current?.focus(), 0);
  };

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        if (open && !busy) onCancel();
      }}
    >
      <div className="dialog-heading">
        {destructive ? <AlertTriangle size={22} /> : null}
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children ? <div className="dialog-content">{children}</div> : null}
      {actionError ? (
        <p className="dialog-error" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="dialog-actions">
        <button className="secondary-button" onClick={close} disabled={busy}>
          取消
        </button>
        <button
          className={destructive ? "danger-button" : "primary-compact"}
          disabled={busy || confirmDisabled}
          onClick={async () => {
            setBusy(true);
            setActionError("");
            try {
              await onConfirm();
            } catch (reason) {
              setActionError(
                reason instanceof Error ? reason.message : "操作失败，请重试。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "处理中…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
