/** Symbole KoraLab : un « K » formé de nœuds réseau reliés (d'après le logo officiel). */
export function KoraMark({ size = 32, color = "#007AFF", className = "" }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <g fill={color} stroke={color} strokeWidth="9" strokeLinecap="round">
        <line x1="18" y1="18" x2="18" y2="82" />
        <line x1="22" y1="50" x2="82" y2="18" />
        <line x1="22" y1="50" x2="82" y2="82" />
        <circle cx="18" cy="18" r="13" stroke="none" />
        <circle cx="18" cy="82" r="13" stroke="none" />
        <circle cx="82" cy="18" r="13" stroke="none" />
        <circle cx="82" cy="82" r="13" stroke="none" />
      </g>
    </svg>
  );
}

/** Logo complet : symbole + « Kora » en gras et « Lab » en léger. */
export function KoraLogo({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <KoraMark size={size} />
      <span className="tracking-tight text-white">
        <b className="font-extrabold">Kora</b>
        <span className="font-light">Lab</span>
      </span>
    </span>
  );
}
