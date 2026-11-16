/**
 * The 124 generic string features (src/ml/features.py, GenericStringFeatures) named the way the backend
 * names them, plus plain-language descriptions so a student can read what a model looks at.
 *
 * Every feature is defined for any alphabet: nothing here encodes a particular language.
 */

export type FeatureKind = "length" | "flag" | "count" | "ngram" | "ratio" | "position" | "affix" | "run" | "changes" | "residue";

export interface FeatureInfo {
  name: string;
  kind: FeatureKind;
  /** Short plain-language label, e.g. "number of 1s is even". */
  label: string;
  /** True when the feature is a 0/1 indicator (one-hot). */
  binary: boolean;
}

const MAX_NGRAM = 4;
const POSITIONS = 6;
const AFFIXES = [2, 3];
const MODULI = [2, 3, 4];

function decode(alphabet: string[], idx: number, n: number): string {
  const k = alphabet.length;
  const out: string[] = [];
  let v = idx;
  for (let i = 0; i < n; i++) {
    out.push(alphabet[v % k]);
    v = Math.floor(v / k);
  }
  return out.reverse().join("");
}

/** Feature names in the backend's column order (124 for a two-symbol alphabet). */
export function featureNames(alphabet: string[]): string[] {
  const k = alphabet.length;
  const names = ["len", "is_empty"];
  for (let n = 1; n <= MAX_NGRAM; n++) {
    for (let idx = 0; idx < k ** n; idx++) {
      const w = decode(alphabet, idx, n);
      names.push(n === 1 ? `count(${w})` : `ngram(${w})`);
    }
  }
  names.push(...alphabet.map((s) => `ratio(${s})`));
  for (const side of ["first", "last"]) {
    for (let i = 1; i <= POSITIONS; i++) {
      names.push(...alphabet.map((s) => `${side}[${i}]=${s}`), `${side}[${i}]=none`);
    }
  }
  for (const side of ["prefix", "suffix"]) {
    for (const m of AFFIXES) {
      for (let idx = 0; idx < k ** m; idx++) names.push(`${side}=${decode(alphabet, idx, m)}`);
    }
  }
  names.push(...alphabet.map((s) => `max_run(${s})`), "changes");
  for (const q of [...alphabet.map((s) => `count(${s})`), "len"]) {
    for (const m of MODULI) for (let r = 0; r < m; r++) names.push(`${q}%${m}=${r}`);
  }
  return names;
}

/** "1s", "0s", "a’s": the plural of a symbol, for "number of 1s". */
export function plural(sym: string): string {
  return /^[0-9]$/.test(sym) ? `${sym}s` : `${sym}’s`;
}

function ordinal(i: number): string {
  if (i === 1) return "";
  if (i === 2) return "2nd-";
  if (i === 3) return "3rd-";
  return `${i}th-`;
}

function positionLabel(side: "first" | "last", i: number, sym: string): string {
  if (sym === "none") return `shorter than ${i} symbol${i === 1 ? "" : "s"}`;
  if (side === "first") return i === 1 ? `first symbol is ${sym}` : `${ordinalWord(i)} symbol is ${sym}`;
  return i === 1 ? `last symbol is ${sym}` : `${ordinal(i)}to-last symbol is ${sym}`;
}

function ordinalWord(i: number): string {
  return i === 2 ? "2nd" : i === 3 ? "3rd" : `${i}th`;
}

function residueLabel(quantity: string, m: number, r: number): string {
  if (m === 2) return `${quantity} is ${r === 0 ? "even" : "odd"}`;
  if (r === 0) return `${quantity} is a multiple of ${m}`;
  return `${quantity} ≡ ${r} (mod ${m})`;
}

function quantityName(q: string): string {
  if (q === "len") return "length";
  const m = /^count\((.+)\)$/.exec(q);
  return m ? `number of ${plural(m[1])}` : q;
}

const cache = new Map<string, FeatureInfo>();

/** Plain-language description of a backend feature name. Unknown names fall back to the raw name. */
export function describeFeature(name: string): FeatureInfo {
  const hit = cache.get(name);
  if (hit) return hit;
  let info: FeatureInfo;
  let m: RegExpExecArray | null;
  if (name === "len") info = { name, kind: "length", label: "length of the string", binary: false };
  else if (name === "is_empty") info = { name, kind: "flag", label: "string is empty", binary: true };
  else if (name === "changes") info = { name, kind: "changes", label: "number of symbol changes", binary: false };
  else if ((m = /^(count\(.+\)|len)%(\d+)=(\d+)$/.exec(name)))
    info = { name, kind: "residue", label: residueLabel(quantityName(m[1]), Number(m[2]), Number(m[3])), binary: true };
  else if ((m = /^count\((.+)\)$/.exec(name))) info = { name, kind: "count", label: `number of ${plural(m[1])}`, binary: false };
  else if ((m = /^ngram\((.+)\)$/.exec(name))) info = { name, kind: "ngram", label: `occurrences of ${m[1]}`, binary: false };
  else if ((m = /^ratio\((.+)\)$/.exec(name))) info = { name, kind: "ratio", label: `share of ${plural(m[1])}`, binary: false };
  else if ((m = /^(first|last)\[(\d+)\]=(.+)$/.exec(name)))
    info = { name, kind: "position", label: positionLabel(m[1] as "first" | "last", Number(m[2]), m[3]), binary: true };
  else if ((m = /^prefix=(.+)$/.exec(name))) info = { name, kind: "affix", label: `starts with ${m[1]}`, binary: true };
  else if ((m = /^suffix=(.+)$/.exec(name))) info = { name, kind: "affix", label: `ends with ${m[1]}`, binary: true };
  else if ((m = /^max_run\((.+)\)$/.exec(name))) info = { name, kind: "run", label: `longest run of ${plural(m[1])}`, binary: false };
  else info = { name, kind: "flag", label: name, binary: false };
  cache.set(name, info);
  return info;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A tree split "feature <= threshold" phrased as a yes/no question. scikit-learn sends a string
 * left when value <= threshold, so "yes" (value > threshold) is always the right branch.
 */
export function splitQuestion(name: string, threshold: number): string {
  const info = describeFeature(name);
  const t = Math.floor(threshold);
  let m: RegExpExecArray | null;
  if (info.binary) return `${capitalize(info.label)}?`;
  if (info.kind === "ngram" && (m = /^ngram\((.+)\)$/.exec(name))) {
    if (t <= 0) return `Does ${m[1]} occur?`;
    if (t === 1) return `Does ${m[1]} occur at least twice?`;
    return `Does ${m[1]} occur more than ${t} times?`;
  }
  if (info.kind === "count" && (m = /^count\((.+)\)$/.exec(name))) {
    if (t <= 0) return `Contains a ${m[1]}?`;
    return `More than ${t} ${plural(m[1])}?`;
  }
  if (info.kind === "length") return `Longer than ${t} symbol${t === 1 ? "" : "s"}?`;
  if (info.kind === "run" && (m = /^max_run\((.+)\)$/.exec(name))) return `A run of more than ${t} ${plural(m[1])}?`;
  if (info.kind === "changes") return `More than ${t} symbol change${t === 1 ? "" : "s"}?`;
  if (info.kind === "ratio") return `${capitalize(info.label)} above ${(threshold * 100).toFixed(0)}%?`;
  return `${name} > ${threshold}?`;
}

/** Display a feature value for one string: yes/no for indicators, a share for ratios, a count otherwise. */
export function formatFeatureValue(name: string, value: number): string {
  const info = describeFeature(name);
  if (info.binary) return value > 0.5 ? "yes" : "no";
  if (info.kind === "ratio") return `${(value * 100).toFixed(0)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * How full a value bar should be for one string, per feature kind (the values mix 0/1 flags,
 * counts that grow with the length and shares): flags are empty or full, counts are relative
 * to the string length, shares are already in [0, 1].
 */
export function featureFill(name: string, value: number, length: number): number {
  const info = describeFeature(name);
  if (info.binary) return value > 0.5 ? 1 : 0;
  if (info.kind === "ratio") return Math.max(0, Math.min(1, value));
  if (info.kind === "length") return Math.max(0, Math.min(1, value / 40));
  return Math.max(0, Math.min(1, value / Math.max(length, 1)));
}

export interface FeatureRow {
  key: string;
  label: string;
  names: string[];
  /** Sizes of visual sub-groups (one per position, one per modulus...), summing to names.length. */
  chunks?: number[];
}

/** Rows of the feature panel, so a lit pattern can be read ("the first 6 symbols"). */
export function featureRows(alphabet: string[]): FeatureRow[] {
  const k = alphabet.length;
  const all = featureNames(alphabet);
  const pick = (test: (n: string) => boolean) => all.filter(test);
  const rows: FeatureRow[] = [
    { key: "length", label: "length", names: pick((n) => n === "len" || n === "is_empty") },
    { key: "counts", label: "counts", names: pick((n) => /^count\([^)]+\)$/.test(n)) },
    { key: "ratios", label: "shares", names: pick((n) => n.startsWith("ratio(")) },
    { key: "ng2", label: "2-grams", names: pick((n) => /^ngram\(.{2}\)$/.test(n)) },
    { key: "ng3", label: "3-grams", names: pick((n) => /^ngram\(.{3}\)$/.test(n)) },
    { key: "ng4", label: "4-grams", names: pick((n) => /^ngram\(.{4}\)$/.test(n)) },
    { key: "first", label: "first 6", names: pick((n) => n.startsWith("first[")), chunks: Array(POSITIONS).fill(k + 1) },
    { key: "last", label: "last 6", names: pick((n) => n.startsWith("last[")), chunks: Array(POSITIONS).fill(k + 1) },
    { key: "prefix", label: "prefixes", names: pick((n) => n.startsWith("prefix=")), chunks: AFFIXES.map((m) => k ** m) },
    { key: "suffix", label: "suffixes", names: pick((n) => n.startsWith("suffix=")), chunks: AFFIXES.map((m) => k ** m) },
    { key: "runs", label: "runs", names: pick((n) => n.startsWith("max_run(") || n === "changes"), chunks: [k, 1] },
  ];
  for (const q of [...alphabet.map((s) => `count(${s})`), "len"]) {
    const label = q === "len" ? "length mod" : `${plural(q.slice(6, -1))} mod`;
    rows.push({ key: `mod-${q}`, label, names: pick((n) => n.startsWith(`${q}%`)), chunks: MODULI });
  }
  return rows;
}
