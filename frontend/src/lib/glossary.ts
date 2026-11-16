/** Plain-language definitions shown by <Term>. Keys are lowercase ids. */
export const GLOSSARY: Record<string, { term: string; definition: string }> = {
  alphabet: { term: "Alphabet", definition: "The finite set of symbols strings are made of, such as {0, 1} or {a, b}." },
  language: { term: "Language", definition: "A set of strings over an alphabet, for example every binary string that ends in 01." },
  regular: {
    term: "Regular language",
    definition: "A language some finite automaton can recognize; equivalently, one described by a regular expression. It needs only a fixed, finite memory.",
  },
  dfa: {
    term: "DFA",
    definition: "Deterministic finite automaton: a finite set of states with exactly one transition per state and symbol. It reads a string left to right and accepts if it ends in an accepting state.",
  },
  nfa: {
    term: "NFA",
    definition: "Nondeterministic finite automaton: a state may have several (or no) transitions on a symbol, so the machine can be in many states at once. It accepts if any of them is accepting.",
  },
  epsilon: { term: "ε-transition", definition: "A move an NFA may take without reading a symbol. ε also denotes the empty string." },
  "epsilon-closure": { term: "ε-closure", definition: "Every state reachable from a set of states using ε-transitions alone." },
  "subset-construction": {
    term: "Subset construction",
    definition: "Turns an NFA into an equivalent DFA whose states are sets of NFA states. With n NFA states it can need up to 2ⁿ DFA states.",
  },
  minimization: {
    term: "State minimization",
    definition: "Merging states that no string can tell apart. The result is the unique smallest DFA for the language.",
  },
  hopcroft: { term: "Hopcroft's algorithm", definition: "Minimizes a DFA by repeatedly splitting groups of states using the smaller half as the splitter: O(n log n)." },
  moore: { term: "Moore's algorithm", definition: "Minimization by rounds: round k groups states that no string of length ≤ k can distinguish." },
  "myhill-nerode": {
    term: "Myhill–Nerode",
    definition: "Two states are equivalent if and only if no suffix leads one to accept and the other to reject. A shortest separating suffix proves two states must stay apart.",
  },
  equivalence: {
    term: "Equivalence check",
    definition: "Two DFAs accept the same language if their product automaton has no reachable pair of states that disagree on acceptance. A breadth-first search finds the shortest string where they differ.",
  },
  product: { term: "Product construction", definition: "Runs two DFAs in lockstep on pairs of states; used for intersection, union and equivalence checking." },
  trap: { term: "Trap state", definition: "A non-accepting state that every symbol maps back to itself: once entered, the string is rejected." },
  lstar: {
    term: "L*",
    definition: "Angluin's active learning algorithm. It asks membership queries (is w in the language?) and equivalence queries (is this DFA right?) and builds the minimal DFA from an observation table.",
  },
  "membership-query": { term: "Membership query", definition: "A question to the teacher: is this particular string accepted?" },
  "equivalence-query": {
    term: "Equivalence query",
    definition: "A question to the teacher: is this hypothesis DFA correct? If not, the teacher returns a counterexample string. Here it is approximated by testing thousands of strings.",
  },
  "observation-table": {
    term: "Observation table",
    definition: "L*'s memory: rows are access strings, columns are experiment suffixes, and cells record membership answers.",
  },
  closed: { term: "Closed table", definition: "Every one-symbol extension of a row already appears as a row, so every transition of the hypothesis is defined." },
  consistent: { term: "Consistent table", definition: "Rows that look identical stay identical after appending any symbol, so the hypothesis is well defined." },
  counterexample: { term: "Counterexample", definition: "A string on which the hypothesis and the target disagree." },
  rpni: {
    term: "RPNI",
    definition: "Regular Positive and Negative Inference: builds a prefix tree of the labelled examples and merges states in a fixed order whenever the merge stays consistent with every example.",
  },
  edsm: {
    term: "EDSM",
    definition: "Evidence-Driven State Merging: like RPNI, but it always performs the merge supported by the most agreeing examples first.",
  },
  pta: { term: "Prefix tree acceptor", definition: "A tree-shaped DFA with one path per training string: the starting point of RPNI and EDSM." },
  fidelity: { term: "Fidelity", definition: "How often an extracted DFA agrees with the model it was extracted from (as opposed to accuracy, which compares it with the true language)." },
  generalization: {
    term: "Length generalization",
    definition: "Accuracy on strings of length 21–40. Every training string is at most 20 symbols long.",
  },
  stacking: { term: "Stacking", definition: "An ensemble where a meta-model (here logistic regression) learns how to combine the base models' predicted probabilities." },
  "out-of-fold": { term: "Out-of-fold predictions", definition: "Predictions for each training example made by a model that did not see it, so the stacking meta-model is not trained on overconfident inputs." },
  "characteristic-sample": {
    term: "Characteristic sample",
    definition: "A set of examples rich enough that RPNI is guaranteed to recover the exact target DFA.",
  },
};
