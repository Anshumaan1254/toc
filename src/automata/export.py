"""JSON export of every automaton for the website (frozen schema, see ``automaton_file``).

File: ``artifacts/automata/{language}__{approach}.json``::

    {
      "language": "L1", "approach": "min_dfa", "title": "...", "family": "truth|learned",
      "automaton": DFA.to_dict() | NFA.to_dict(),        # kind = "dfa" | "nfa"
      "stats": {...},                                     # states, transitions, accuracy ...
      "subset_construction": {"dfa": ..., "steps": [...]},     # approach == "nfa"
      "minimization": {"before": ..., "moore_rounds": [...], "groups": ..., "state_map": ...},
      "distinguishing_suffixes": [{"p": ..., "q": ..., "suffix": ...}],
      "learning": {...}                                   # learned automata
    }
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .dfa import DFA
from .minimize import distinguishing_suffixes, hopcroft_minimize, moore_rounds
from .nfa import NFA, subset_construction

APPROACH_TITLES = {
    "dfa": "Ground-truth DFA",
    "nfa": "NFA",
    "min_dfa": "Minimized DFA",
    "lstar_lr": "L* DFA from Logistic Regression",
    "lstar_dt": "L* DFA from Decision Tree",
    "lstar_rf": "L* DFA from Random Forest",
    "lstar_stack": "L* DFA from Stacked ensemble",
    "rpni": "Passive DFA (RPNI)",
    "edsm": "Passive DFA (EDSM)",
}


def suffix_table(dfa: DFA) -> list[dict[str, str]]:
    return [{"p": p, "q": q, "suffix": w} for (p, q), w in distinguishing_suffixes(dfa).items()]


def automaton_file(language: str, approach: str, automaton: DFA | NFA, **sections: Any) -> dict[str, Any]:
    return {
        "language": language,
        "approach": approach,
        "title": APPROACH_TITLES.get(approach, approach),
        "family": "learned" if approach.startswith(("lstar", "rpni", "edsm")) else "truth",
        "automaton": automaton.to_dict(),
        **sections,
    }


def truth_files(lang: Any) -> dict[str, dict[str, Any]]:
    """Ground-truth DFA, NFA (+ subset construction) and minimized DFA records for a language."""
    dfa: DFA = lang.dfa
    nfa: NFA = lang.nfa
    subset_dfa, steps = subset_construction(nfa)
    minimal = hopcroft_minimize(subset_dfa)
    _, rounds = moore_rounds(subset_dfa)
    files = {
        "dfa": automaton_file(
            lang.id,
            "dfa",
            dfa,
            stats={"states": dfa.num_states, "transitions": dfa.complete().num_transitions},
            distinguishing_suffixes=suffix_table(dfa),
        ),
        "nfa": automaton_file(
            lang.id,
            "nfa",
            nfa,
            stats={
                "states": nfa.num_states,
                "transitions": nfa.num_transitions,
                "epsilon_moves": sum(len(e) for e in nfa.eps),
                "subset_dfa_states": subset_dfa.num_states,
            },
            subset_construction={"dfa": subset_dfa.to_dict(), "steps": steps},
        ),
        "min_dfa": automaton_file(
            lang.id,
            "min_dfa",
            minimal,
            stats={"states": minimal.num_states, "states_before": subset_dfa.num_states, "transitions": minimal.num_transitions},
            minimization={
                "method": "hopcroft",
                "before": subset_dfa.to_dict(),
                "states_before": subset_dfa.num_states,
                "states_after": minimal.num_states,
                "moore_rounds": rounds,
                "groups": minimal.meta.get("groups", {}),
                "state_map": minimal.meta.get("state_map", {}),
            },
            distinguishing_suffixes=suffix_table(minimal),
        ),
    }
    return files


def write_automaton_files(records: dict[str, dict[str, Any]], out_dir: Path) -> list[Path]:
    from ..data.io import write_json

    paths = []
    for approach, record in records.items():
        paths.append(write_json(record, out_dir / f"{record['language']}__{approach}.json", indent=None))
    return paths
