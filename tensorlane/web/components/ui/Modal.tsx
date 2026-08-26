"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="modal-title">{title}</h2>
        {children}
        {footer ? <div className="page-actions" style={{ marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
