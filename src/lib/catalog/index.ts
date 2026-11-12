import { compile, type CatalogSpec, type CatalogTp } from "./base";
import { CCNA1 } from "./ccna1";
import { CCNA2 } from "./ccna2";
import { CCNA3 } from "./ccna3";
import { DEPANNAGE } from "./depannage";
import type { Tp } from "@/lib/tps";

export { CATEGORIES, type CatalogTp, type Category, type Level } from "./base";

export const SPECS: CatalogSpec[] = [...CCNA1, ...CCNA2, ...CCNA3, ...DEPANNAGE];

let cache: CatalogTp[] | null = null;

/** Les TP officiels KoraLab, compilés (topologie, critères, étapes). */
export function catalog(): CatalogTp[] {
  return (cache ??= SPECS.map((s, i) => compile(s, i + 1)));
}

export function catalogTp(id: string): CatalogTp | undefined {
  return catalog().find((t) => t.id === id);
}

/** Les TP officiels au format des TP enregistrés (tableau de bord, progression). */
export function catalogAsTps(): Tp[] {
  return catalog().map((t) => ({
    id: t.id,
    title: t.title,
    level: t.level,
    category: t.category,
    summary: t.summary,
    statement: t.statement,
    topology: t.topology,
    checks: t.checks,
    published: true,
    position: t.position,
    updatedAt: null,
    image: "",
    context: t.brief.context ?? "",
    objectives: t.brief.objectives ?? "",
    addressing: t.brief.addressing ?? [],
    tips: t.brief.tips ?? "",
    steps: t.brief.steps ?? [],
    commands: t.brief.commands ?? [],
  }));
}
