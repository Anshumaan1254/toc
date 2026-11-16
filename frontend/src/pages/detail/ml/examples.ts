import { randomString, seededRandom } from "@/lib/automata";

/**
 * Example inputs per language: a short member, a short non-member and strings longer than anything
 * in the training data (21–40 symbols). For L6 and L10 the long ones are strings the pipelines were
 * checked to get wrong, so the generalization failure can be seen, not just read about. Whether a run
 * is right or wrong always comes from the live result.
 */
const EXAMPLES: Record<string, string[]> = {
  L1: ["1001", "10", "", "0110100110010110100101100110"],
  L2: ["1101", "0110", "0010110100101110100100101101", "1101001011101001010010110110"],
  L3: ["0101", "1001", "0001100011000110001100011000101", "0001100011000110001100011000"],
  L4: ["10101", "11", "010000110111000000111010100100", "1001010010101001010010100100101"],
  L5: ["10010", "0110", "1001010010101001010010100100101", "1001010010101001010010110100101"],
  L6: ["110", "111", "1001", "1101100111010110110110001010011101", "11110001111000011010111111010", "00101101000011010000101000010"],
  L7: ["babb", "abab", "abbabababbbaaabababbaabaababb", "abbabababbbaaabababbaabaababa"],
  L8: ["abab", "baba", "abbaabbaabbaabbaabbaabbaabbaabba", "abbaabbaabbaabbaabbaabbaabbaabb"],
  L9: ["0100", "0011", "0110100110010110100101100110100", "0110100110010110100101100110001"],
  L10: ["aaa", "aab", "bbabaaaabbaaaaaabbbaaabbabb", "abaaabaaabaaaababbbaabbabbbab", "babaababaaabbaabaabbbabbbbbbaa"],
};

export function examplesFor(languageId: string, alphabet: string[]): string[] {
  const known = EXAMPLES[languageId];
  if (known) return known.filter((s) => [...s].every((c) => alphabet.includes(c)));
  const rand = seededRandom(7);
  return [randomString(alphabet, 4, rand), randomString(alphabet, 5, rand), randomString(alphabet, 28, rand)];
}

/** A fresh string longer than any training string (21–40 symbols). */
export function randomLongString(alphabet: string[], seed: number): string {
  const rand = seededRandom(seed * 7919 + 17);
  return randomString(alphabet, 21 + Math.floor(rand() * 20), rand);
}
