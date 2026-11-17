/**
 * Parsing and validating the two sample columns. Mirrors the backend's rules
 * (backend/app/services.py `_clean_samples`): each line is stripped, "ε", "eps" and "λ" mean
 * the empty string, a string is at most 40 symbols, and the alphabet is inferred from every
 * symbol used (at most 4). Blank lines are ignored.
 */

export const MAX_SAMPLE_LENGTH = 40;
export const MAX_SAMPLES = 2000;
export const MAX_SYMBOLS = 4;
export const EMPTY_MARKERS = new Set(["ε", "eps", "λ"]);

export type Column = "accepted" | "rejected";

export type LineStatus = "blank" | "ok" | "duplicate" | "conflict" | "invalid";

export interface ParsedLine {
  /** 0-based line index in the textarea. */
  index: number;
  /** The string this line stands for ("" = ε); null for blank or invalid lines. */
  value: string | null;
  status: LineStatus;
  /** Human explanation for invalid / conflict / duplicate lines. */
  note?: string;
}

export interface ParsedColumn {
  lines: ParsedLine[];
  /** Distinct valid strings, in order of first appearance. */
  strings: string[];
}

export type IssueKind = "invalid" | "too-many" | "conflict" | "alphabet" | "one-sided";

export interface Issue {
  /** Blocking issues stop the request (and disable Learn); soft ones go to the server, which explains them. */
  severity: "block" | "soft";
  kind: IssueKind;
  message: string;
  column?: Column;
  line?: number;
}

export interface SampleState {
  accepted: ParsedColumn;
  rejected: ParsedColumn;
  alphabet: string[];
  conflicts: string[];
  issues: Issue[];
  /** Distinct (string, label) pairs to send, conflicts included so the server can report them. */
  payload: { string: string; label: boolean }[];
  total: number;
}

export const show = (s: string) => (s === "" ? "ε" : s);

function parseLine(raw: string, index: number): ParsedLine {
  const s = raw.trim();
  if (s === "") return { index, value: null, status: "blank" };
  if (EMPTY_MARKERS.has(s)) return { index, value: "", status: "ok" };
  if (/\s/.test(s)) return { index, value: null, status: "invalid", note: "has a space inside; put one string on each line" };
  if (s.includes("ε")) return { index, value: null, status: "invalid", note: "uses ε inside a string; write ε alone on a line for the empty string" };
  if ([...s].length > MAX_SAMPLE_LENGTH) {
    return { index, value: null, status: "invalid", note: `is ${[...s].length} symbols long; the limit is ${MAX_SAMPLE_LENGTH}` };
  }
  return { index, value: s, status: "ok" };
}

function parseColumn(text: string): ParsedColumn {
  const lines = text.split("\n").map(parseLine);
  const seen = new Set<string>();
  const strings: string[] = [];
  for (const line of lines) {
    if (line.value === null) continue;
    if (seen.has(line.value)) {
      line.status = "duplicate";
      line.note = "repeats an earlier line; it counts once";
    } else {
      seen.add(line.value);
      strings.push(line.value);
    }
  }
  return { lines, strings };
}

export function analyzeSamples(acceptedText: string, rejectedText: string): SampleState {
  const accepted = parseColumn(acceptedText);
  const rejected = parseColumn(rejectedText);
  const rejectedSet = new Set(rejected.strings);
  const conflicts = accepted.strings.filter((s) => rejectedSet.has(s));
  const conflictSet = new Set(conflicts);
  for (const col of [accepted, rejected]) {
    for (const line of col.lines) {
      if (line.value !== null && conflictSet.has(line.value)) {
        line.status = "conflict";
        line.note = "is in both columns";
      }
    }
  }

  const alphabet = [...new Set([...accepted.strings, ...rejected.strings].flatMap((s) => [...s]))].sort();
  const issues: Issue[] = [];
  const columns: [Column, ParsedColumn][] = [
    ["accepted", accepted],
    ["rejected", rejected],
  ];
  for (const [name, col] of columns) {
    for (const line of col.lines) {
      if (line.status === "invalid") {
        issues.push({ severity: "block", kind: "invalid", column: name, line: line.index, message: `Line ${line.index + 1} of ${name === "accepted" ? "Accepted" : "Rejected"} ${line.note}.` });
      }
    }
  }
  const total = accepted.strings.length + rejected.strings.length;
  if (total > MAX_SAMPLES) issues.push({ severity: "block", kind: "too-many", message: `That is ${total.toLocaleString("en-US")} strings; the learner takes at most ${MAX_SAMPLES.toLocaleString("en-US")}.` });
  if (conflicts.length) {
    const shown = conflicts.slice(0, 3).map((s) => `“${show(s)}”`).join(", ");
    const more = conflicts.length > 3 ? ` and ${conflicts.length - 3} more` : "";
    issues.push({
      severity: "block",
      kind: "conflict",
      message:
        conflicts.length === 1
          ? `This string is in both lists: ${shown}. Remove it from one.`
          : `These strings are in both lists: ${shown}${more}. Remove each from one.`,
    });
  }
  if (alphabet.length > MAX_SYMBOLS) {
    issues.push({
      severity: "block",
      kind: "alphabet",
      message: `Your strings use ${alphabet.length} different symbols (${alphabet.join(", ")}); a learner here takes at most ${MAX_SYMBOLS}.`,
    });
  }
  if (total > 0 && (accepted.strings.length === 0 || rejected.strings.length === 0)) {
    issues.push({
      severity: "block",
      kind: "one-sided",
      message: accepted.strings.length === 0 ? "Add at least one accepted string." : "Add at least one rejected string.",
    });
  }

  const payload = [
    ...accepted.strings.map((s) => ({ string: s, label: true })),
    ...rejected.strings.map((s) => ({ string: s, label: false })),
  ];
  return { accepted, rejected, alphabet, conflicts, issues, payload, total };
}

/** Append a string to a column's text, on its own line. */
export function appendLine(text: string, s: string): string {
  const line = show(s);
  if (text.trim() === "") return line;
  return text.endsWith("\n") ? `${text}${line}` : `${text}\n${line}`;
}

export const toText = (strings: string[]) => strings.map(show).join("\n");
