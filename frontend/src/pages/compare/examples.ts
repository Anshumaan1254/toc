/**
 * Example inputs for the compare page, three per language:
 *  - short:  a few symbols, the kind of string every approach saw plenty of in training;
 *  - long:   more than 20 symbols, longer than any training string (the "long" split);
 *  - tricky: a string that tests whether an approach really learned the rule.
 * Only the inputs and the reason they are interesting live here. Whether a string is in the
 * language is computed with the ground-truth DFA, and the verdicts come from the API.
 */
export type ExampleKind = "short" | "long" | "tricky";

export interface Example {
  kind: ExampleKind;
  string: string;
  /** Why the string is interesting, in terms of the language's rule (no claims about results). */
  why: string;
}

export const EXAMPLE_KIND_LABEL: Record<ExampleKind, string> = {
  short: "Short",
  long: "Long",
  tricky: "Tricky",
};

export const EXAMPLES: Record<string, Example[]> = {
  L1: [
    { kind: "short", string: "1001", why: "Two 0s." },
    { kind: "long", string: "100111100110010001101", why: "Ten 0s spread over 21 symbols." },
    { kind: "tricky", string: "", why: "ε has zero 0s, and zero is even." },
  ],
  L2: [
    { kind: "short", string: "1101", why: "Ends in 01." },
    { kind: "long", string: "001000011010011000101", why: "Ends in 01 after 21 symbols." },
    { kind: "tricky", string: "1", why: "A lone 1 is too short to end in 01." },
  ],
  L3: [
    { kind: "short", string: "0101", why: "101 sits in the middle." },
    { kind: "long", string: "100100100100100100100100", why: "Plenty of 1s and 0s, never 101." },
    { kind: "tricky", string: "10001", why: "Starts and ends like 101, but the 0 is not alone." },
  ],
  L4: [
    { kind: "short", string: "1011", why: "Three 1s." },
    { kind: "long", string: "111111111111111111111111", why: "Twenty-four 1s, a multiple of 3." },
    { kind: "tricky", string: "000000", why: "No 1s at all, and zero is a multiple of 3." },
  ],
  L5: [
    { kind: "short", string: "10101", why: "Every 1 stands alone." },
    { kind: "long", string: "010101010101010101010101", why: "Alternates for 24 symbols, never 11." },
    { kind: "tricky", string: "0000110000", why: "A single 11 anywhere is enough to reject." },
  ],
  L6: [
    { kind: "short", string: "1001", why: "Nine, which is 3 × 3." },
    { kind: "long", string: "100011010011111111001010", why: "9,256,906 leaves remainder 1 when divided by 3." },
    { kind: "tricky", string: "11011", why: "27 = 3 × 9, with the 1s far apart." },
  ],
  L7: [
    { kind: "short", string: "aabb", why: "Ends in abb." },
    { kind: "long", string: "babaabbbaaabababbbaaabb", why: "Ends in abb after 23 symbols." },
    { kind: "tricky", string: "bb", why: "Ends in bb, not abb." },
  ],
  L8: [
    { kind: "short", string: "abba", why: "Starts with a and has length 4." },
    { kind: "long", string: "abbbabbbabbbabbbabbbabbb", why: "Starts with a and has length 24." },
    { kind: "tricky", string: "", why: "Length 0 is a multiple of 4, but ε does not start with a." },
  ],
  L9: [
    { kind: "short", string: "0100", why: "The third symbol from the end is 1." },
    { kind: "long", string: "000000000000000000000100", why: "A single 1, third from the end." },
    { kind: "tricky", string: "11", why: "All 1s, but too short to have a third-from-last symbol." },
  ],
  L10: [
    { kind: "short", string: "ab", why: "#a − #b = 1 − 1 = 0." },
    { kind: "long", string: "aaabbabbbbbbaaabbbaab", why: "#a − #b = 9 − 12 = −3." },
    { kind: "tricky", string: "bbb", why: "#a − #b = −3, and −3 is a multiple of 3." },
  ],
};

/** The string the page opens with when the link carries no language or string. */
export const DEFAULT_LANGUAGE = "L6";
export const DEFAULT_STRING = "11011";
