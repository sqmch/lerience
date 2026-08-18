/** Facts the app has actually established when the tutor session opens. */
export interface SessionOpenerFacts {
  currentModuleId: string | null;
  /** Script-computed doctor output, compacted by the conductor. */
  doctorReport?: string;
  /** The course quiz script's most-overdue-first output, kept opaque. */
  dueItems?: string;
  /** Bounded tail of the course-owned tutor journal. */
  journalTail?: string;
  observedAt?: string;
  /** The actual learner/lifecycle opener. The protocol, not this function,
   *  decides what it means. */
  learnerOpener?: string;
}

/**
 * Build the one additive app-conduction message described by ADR-014.
 *
 * Keep this function factual and deletable: the course CLAUDE.md remains the
 * only pedagogy source, and the learner's agent settings remain authoritative.
 */
export function buildSessionOpener(facts: SessionOpenerFacts): string {
  const currentModule = facts.currentModuleId ?? "none selected";
  const context: string[] = [`Current module: ${currentModule}`];
  if (facts.doctorReport !== undefined) context.push(`Doctor report:\n${facts.doctorReport}`);
  if (facts.dueItems !== undefined) context.push(`Due items:\n${facts.dueItems}`);
  if (facts.journalTail !== undefined) context.push(`Recent journal:\n${facts.journalTail}`);

  return [
    "[Desktop app conduction note:",
    "The learner sees this conversation in a designed chat, not a terminal.",
    "The app renders course files live in the course rail, material pane, and labs, so file edits are visible to the learner as soon as they land.",
    "The learner writes code in their own editor and runs module checks from the app.",
    "]",
    "",
    `[Facts as of ${facts.observedAt ?? "session open"}:`,
    ...context,
    "These facts were assembled at session open from course state and, where applicable, the engine's own scripts. You may treat them as satisfying the protocol's initial gather-state steps and need not re-run those scripts unless something looks inconsistent.",
    "]",
    "",
    facts.learnerOpener ?? "start session",
  ].join("\n");
}
