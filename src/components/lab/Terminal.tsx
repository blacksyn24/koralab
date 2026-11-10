"use client";

import { useEffect, useRef, useState } from "react";

export type Shell = {
  prompt(): string;
  exec(line: string): string;
  complete(line: string): string;
  banner(): string;
};

/** Terminal façon console : historique ↑↓, complétion Tab, aide « ? » immédiate, Ctrl+Z. */
export function Terminal({
  shell,
  lines,
  onLines,
  onChange,
}: {
  shell: Shell;
  /** Historique affiché (conservé par le parent pour chaque équipement) */
  lines: string[];
  onLines: (lines: string[]) => void;
  /** Appelé après chaque commande (pour rafraîchir le canevas) */
  onChange: () => void;
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines, input]);

  useEffect(() => {
    field.current?.focus();
  }, [shell]);

  const run = (line: string) => {
    const promptBefore = shell.prompt();
    if (line.trim() === "cls" || line.trim() === "clear") {
      onLines([]);
      setInput("");
      return;
    }
    const out = shell.exec(line);
    const next = [...lines, `${promptBefore}${line}`];
    if (out) next.push(out);
    onLines(next.slice(-600));
    if (line.trim()) setHistory((h) => [line, ...h.filter((x) => x !== line)].slice(0, 50));
    setHIndex(-1);
    setInput("");
    onChange();
  };

  return (
    <div
      ref={box}
      onClick={() => window.getSelection()?.toString() || field.current?.focus()}
      className="term h-full overflow-y-auto bg-[#03061a] px-4 py-3 text-[#d6e2ff]"
    >
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      <div className="flex">
        <span className="shrink-0">{shell.prompt()}</span>
        <input
          ref={field}
          value={input}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Commande"
          onChange={(e) => {
            const v = e.target.value;
            // Comme sur un vrai équipement, « ? » affiche l'aide sans valider la ligne
            if (v.endsWith("?")) {
              const before = v.slice(0, -1);
              onLines([...lines, `${shell.prompt()}${v}`, shell.exec(v)]);
              setInput(before);
              return;
            }
            setInput(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(input);
            else if (e.key === "Tab") {
              e.preventDefault();
              setInput(shell.complete(input));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const i = Math.min(hIndex + 1, history.length - 1);
              if (i >= 0) (setHIndex(i), setInput(history[i]));
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const i = hIndex - 1;
              setHIndex(Math.max(i, -1));
              setInput(i >= 0 ? history[i] : "");
            } else if (e.key === "z" && e.ctrlKey) {
              e.preventDefault();
              if (shell.prompt().includes("(config")) run("end");
            } else if (e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) {
              e.preventDefault();
              onLines([...lines, `${shell.prompt()}${input}^C`]);
              setInput("");
            }
          }}
          className="min-w-0 flex-1 bg-transparent caret-kora-300 outline-none"
        />
      </div>
    </div>
  );
}
