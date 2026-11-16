import { useDataset, useSummary } from "@/lib/api";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Small counts as words in running text ("ten languages"), larger ones as numerals. */
export const words = (n: number | null | undefined, fallback = "the"): string =>
  n === null || n === undefined ? fallback : (WORDS[n] ?? n.toLocaleString("en-US"));

/**
 * The length bands of the dataset, read from the API (dataset config buckets, summary meta),
 * so copy like "lengths 21–40" never drifts from the data.
 */
export function useBands() {
  const dataset = useDataset();
  const summary = useSummary();
  const buckets = dataset.data?.config.buckets ?? [];
  const main = buckets.filter((b) => b.pool === "main");
  const long = buckets.filter((b) => b.pool === "long");
  const trainMax = summary.data?.meta.max_train_length ?? (main.length ? Math.max(...main.map((b) => b.hi)) : null);
  const trainMin = main.length ? Math.min(...main.map((b) => b.lo)) : 0;
  const longLo = long.length ? Math.min(...long.map((b) => b.lo)) : trainMax !== null ? trainMax + 1 : null;
  const longHi = long.length ? Math.max(...long.map((b) => b.hi)) : null;
  const longDash = longLo !== null && longHi !== null ? `${longLo}–${longHi}` : longLo !== null ? `${longLo}+` : "beyond training";
  const longWords = longLo !== null && longHi !== null ? `${longLo} to ${longHi}` : longLo !== null ? `${longLo} or more` : "beyond the training lengths";
  return {
    trainMin,
    trainMax,
    trainWords: trainMax !== null ? `${trainMin} to ${trainMax}` : "up to the training length",
    longLo,
    longHi,
    /** "21–40" */
    longDash,
    /** "21 to 40" */
    longWords,
  };
}
