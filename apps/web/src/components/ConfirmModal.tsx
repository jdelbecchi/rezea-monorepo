"use client";

import React from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  type: "info" | "success-stars" | "success-check" | "warning" | "danger";
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  type,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  // Icons mapping
  const getIcon = () => {
    switch (type) {
      case "info":
        return <span className="text-2xl leading-none select-none">🔔</span>;
      case "success-stars":
        return <span className="text-2xl leading-none select-none">✨</span>;
      case "success-check":
        return <span className="text-emerald-500 text-3xl font-medium select-none leading-none">✓</span>;
      case "warning":
        return (
          <svg className="w-5 h-5 text-amber-500 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case "danger":
        return (
          <svg className="w-5 h-5 text-rose-500 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Danger/Warning colors mapping
  const getConfirmButtonClass = () => {
    switch (type) {
      case "danger":
        return "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100/80 shadow-sm active:scale-95";
      case "warning":
        return "bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100/80 shadow-sm active:scale-95";
      default:
        return "bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-sm";
    }
  };

  const hasTwoButtons = !!cancelLabel && !!onCancel;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-[340px] xs:max-w-[360px] sm:max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-center sm:justify-start gap-2.5">
              <div className="flex-shrink-0 select-none">{getIcon()}</div>
              <h3 className="text-lg font-semibold text-slate-900 tracking-tight leading-snug">
                {title}
              </h3>
            </div>
            <div className="text-slate-500 text-sm leading-relaxed text-center sm:text-left">
              {message}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 pt-1 flex flex-wrap gap-2.5 justify-center sm:justify-end items-center">
          {hasTwoButtons ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-all text-xs shadow-sm active:scale-95"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-5 py-2.5 rounded-xl font-medium transition-all text-xs ${getConfirmButtonClass()}`}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              className={`px-5 py-2.5 rounded-xl font-medium transition-all text-xs w-auto ${getConfirmButtonClass()}`}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
