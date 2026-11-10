"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Fenêtres de dialogue aux couleurs de KoraLab, à la place des fenêtres natives
 * du navigateur (confirm / prompt) qui affichent « koralab.vercel.app indique ».
 *
 *   if (await askConfirm("Supprimer ce lab ?", { danger: true })) …
 *   const name = await askText("Nom du lab", { defaultValue: "Mon lab" });
 */

type Request =
  | { kind: "confirm"; title: string; message?: string; ok: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: "text"; title: string; label?: string; value: string; ok: string; resolve: (v: string | null) => void };

let push: ((r: Request) => void) | null = null;

export function askConfirm(title: string, opts: { message?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(title)); // secours si la fenêtre n'est pas montée
    push({ kind: "confirm", title, message: opts.message, ok: opts.ok ?? (opts.danger ? "Supprimer" : "Confirmer"), danger: !!opts.danger, resolve });
  });
}

export function askText(title: string, opts: { label?: string; defaultValue?: string; ok?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.prompt(title, opts.defaultValue ?? ""));
    push({ kind: "text", title, label: opts.label, value: opts.defaultValue ?? "", ok: opts.ok ?? "Valider", resolve });
  });
}

/** À placer une seule fois dans la mise en page racine. */
export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const okBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    push = (r) => {
      setReq(r);
      setValue(r.kind === "text" ? r.value : "");
    };
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const t = setTimeout(() => (req.kind === "text" ? (input.current?.focus(), input.current?.select()) : okBtn.current?.focus()), 30);
    return () => clearTimeout(t);
  }, [req]);

  if (!req) return null;

  const close = (ok: boolean) => {
    if (req.kind === "confirm") req.resolve(ok);
    else req.resolve(ok && value.trim() ? value.trim() : null);
    setReq(null);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close(false)} onKeyDown={(e) => e.key === "Escape" && close(false)}>
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={(e) => (e.preventDefault(), close(true))}
        className="w-full max-w-md animate-[pop_.16s_ease-out] rounded-3xl bg-ink-900 p-6 shadow-2xl ring-1 ring-white/10"
      >
        <div className="flex items-start gap-3">
          {req.kind === "confirm" && req.danger && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ko/15 text-ko">
              <AlertTriangle size={19} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-white">{req.title}</h2>
            {req.kind === "confirm" && req.message && <p className="mt-1 text-sm text-kora-200/80">{req.message}</p>}
          </div>
          <button type="button" onClick={() => close(false)} className="rounded-full p-1 text-kora-200/60 hover:bg-white/8 hover:text-white" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {req.kind === "text" && (
          <label className="mt-5 block rounded-xl border-l-[3px] border-transparent bg-ink-950/60 px-4 pb-2.5 pt-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/.08)] focus-within:border-kora-500">
            {req.label && <span className="block text-[0.7rem] text-kora-200/70">{req.label}</span>}
            <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} className="w-full bg-transparent text-[0.95rem] text-white outline-none" />
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => close(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold text-kora-200 ring-1 ring-white/15 hover:bg-white/5 hover:text-white">
            Annuler
          </button>
          <button
            ref={okBtn}
            type="submit"
            disabled={req.kind === "text" && !value.trim()}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${req.kind === "confirm" && req.danger ? "bg-ko hover:bg-ko/85" : "bg-kora-500 hover:bg-kora-400"}`}
          >
            {req.ok}
          </button>
        </div>
      </form>
    </div>
  );
}
