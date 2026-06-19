"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, StaffNoteItem } from "@/lib/api";

/**
 * Panneau Post-it flottant — Notes du staff vers les managers.
 * Affiché en bas à droite de toutes les pages admin (via layout.tsx).
 */
export default function StaffNotesInbox() {
  const [notes, setNotes] = useState<StaffNoteItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const data = await api.getAdminStaffNotes();
      setNotes(data);
    } catch {
      // Silencieux
    }
  }, []);

  useEffect(() => {
    fetchNotes();
    intervalRef.current = setInterval(fetchNotes, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotes]);

  useEffect(() => {
    const onFocus = () => fetchNotes();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchNotes]);

  const handleResolve = async (noteId: string) => {
    setResolving(noteId);
    try {
      await api.resolveStaffNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      // Silencieux
    } finally {
      setResolving(null);
    }
  };

  const count = notes.length;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    const diffH = Math.floor(diffMins / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    return `Il y a ${Math.floor(diffH / 24)}j`;
  };

  const entityLabel = (note: StaffNoteItem) => {
    if (note.entity_label) return note.entity_label;
    if (note.entity_type === "session") return "Séance";
    if (note.entity_type === "event") return "Évènement";
    return "Note générale";
  };

  if (count === 0 && !isOpen) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col items-end gap-2">
      {/* Panneau ouvert */}
      {isOpen && !isMinimized && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
            <div className="flex items-center gap-2">
              <span className="text-base">🗒️</span>
              <span className="font-semibold text-sm tracking-tight">Post-it</span>
              {count > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all text-slate-300 hover:text-white text-xs font-bold"
                title="Réduire"
              >
                —
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all text-slate-300 hover:text-white text-sm"
                title="Fermer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Liste des notes */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {count === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs italic">
                Aucun post-it en attente
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="p-3 hover:bg-slate-50/60 transition-colors">
                  {/* Ligne d'entête : [checkbox] label | heure */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Checkbox en lieu et place de l'icône entité */}
                      <label
                        className="flex items-center shrink-0 cursor-pointer"
                        title="Marquer comme traité"
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleResolve(note.id)}
                          disabled={resolving === note.id}
                          className="w-4 h-4 rounded border-slate-300 cursor-pointer accent-emerald-500 disabled:opacity-40"
                        />
                      </label>
                      <span className="text-[11px] font-semibold text-slate-700 truncate">
                        {entityLabel(note)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                      {formatTime(note.updated_at || note.created_at)}
                    </span>
                  </div>
                  {/* Message */}
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 whitespace-pre-wrap pl-6">
                    {note.message}
                  </p>
                  {/* Auteur */}
                  <p className="text-[10px] text-slate-400 mt-1.5 pl-6">
                    Par <span className="font-medium text-slate-500">{note.author_name}</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Panneau réduit */}
      {isOpen && isMinimized && (
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl shadow-xl hover:bg-slate-800 transition-all animate-in slide-in-from-bottom-2 duration-200"
        >
          <span className="text-sm">🗒️</span>
          <span className="text-xs font-semibold">Post-it</span>
          {count > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
              {count}
            </span>
          )}
        </button>
      )}

      {/* Bouton flottant (panneau fermé) */}
      {!isOpen && count > 0 && (
        <button
          onClick={() => { setIsOpen(true); setIsMinimized(false); }}
          className="relative w-12 h-12 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center animate-in zoom-in-95 duration-200"
          title={`${count} post-it${count > 1 ? "s" : ""} en attente`}
        >
          <span className="text-xl">🗒️</span>
          <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none shadow-sm">
            {count}
          </span>
        </button>
      )}
    </div>
  );
}
