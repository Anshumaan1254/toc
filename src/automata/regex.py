"""Regular expressions -> ε-NFA by Thompson's construction.

Supported syntax: single-character symbols from the alphabet, ``|`` (union),
concatenation by juxtaposition, postfix ``*`` ``+`` ``?``, parentheses and ``ε`` for the
empty string.  Spaces are ignored.  Concatenation identifies the accept state of the left
fragment with the start state of the right one (as in the Dragon Book), so ``(a|b)*abb``
yields the classic 11-state ε-NFA.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Sequence, Union

from .nfa import NFA


class RegexSyntaxError(ValueError):
    pass


@dataclass(frozen=True)
class Sym:
    symbol: str


@dataclass(frozen=True)
class Eps:
    pass


@dataclass(frozen=True)
class Cat:
    left: "Node"
    right: "Node"


@dataclass(frozen=True)
class Alt:
    left: "Node"
    right: "Node"


@dataclass(frozen=True)
class Star:
    inner: "Node"


@dataclass(frozen=True)
class Plus:
    inner: "Node"


@dataclass(frozen=True)
class Opt:
    inner: "Node"


Node = Union[Sym, Eps, Cat, Alt, Star, Plus, Opt]


class _Parser:
    def __init__(self, text: str, alphabet: Sequence[str]) -> None:
        self.text = text.replace(" ", "")
        self.alphabet = set(alphabet)
        self.pos = 0

    def peek(self) -> str | None:
        return self.text[self.pos] if self.pos < len(self.text) else None

    def parse(self) -> Node:
        node = self.alt()
        if self.peek() is not None:
            raise RegexSyntaxError(f"unexpected {self.peek()!r} at position {self.pos}")
        return node

    def alt(self) -> Node:
        node = self.cat()
        while self.peek() == "|":
            self.pos += 1
            node = Alt(node, self.cat())
        return node

    def cat(self) -> Node:
        items: list[Node] = []
        while self.peek() is not None and self.peek() not in "|)":
            items.append(self.repeat())
        if not items:
            return Eps()
        node = items[0]
        for item in items[1:]:
            node = Cat(node, item)
        return node

    def repeat(self) -> Node:
        node = self.atom()
        while self.peek() is not None and self.peek() in "*+?":
            op = self.peek()
            self.pos += 1
            node = Star(node) if op == "*" else Plus(node) if op == "+" else Opt(node)
        return node

    def atom(self) -> Node:
        ch = self.peek()
        if ch is None:
            raise RegexSyntaxError("unexpected end of expression")
        if ch == "(":
            self.pos += 1
            node = self.alt()
            if self.peek() != ")":
                raise RegexSyntaxError(f"missing ')' at position {self.pos}")
            self.pos += 1
            return node
        if ch == "ε":
            self.pos += 1
            return Eps()
        if ch in self.alphabet:
            self.pos += 1
            return Sym(ch)
        raise RegexSyntaxError(f"symbol {ch!r} at position {self.pos} is not in the alphabet")


def parse_regex(text: str, alphabet: Sequence[str]) -> Node:
    return _Parser(text, alphabet).parse()


class _Builder:
    """Thompson fragments: each has one start (no incoming edges) and one accept (no outgoing)."""

    def __init__(self) -> None:
        self.count = 0
        self.edges: list[tuple[int, str | None, int]] = []  # label None = ε

    def new(self) -> int:
        self.count += 1
        return self.count - 1

    def build(self, node: Node) -> tuple[int, int]:
        if isinstance(node, Sym):
            s, f = self.new(), self.new()
            self.edges.append((s, node.symbol, f))
            return s, f
        if isinstance(node, Eps):
            s, f = self.new(), self.new()
            self.edges.append((s, None, f))
            return s, f
        if isinstance(node, Cat):
            s1, f1 = self.build(node.left)
            s2, f2 = self.build(node.right)
            # Merge f1 (no outgoing edges) with s2 (no incoming edges): re-home s2's edges.
            self.edges = [(f1 if src == s2 else src, lab, dst) for (src, lab, dst) in self.edges]
            return s1, f2
        if isinstance(node, Alt):
            s, f = self.new(), self.new()
            s1, f1 = self.build(node.left)
            s2, f2 = self.build(node.right)
            self.edges += [(s, None, s1), (s, None, s2), (f1, None, f), (f2, None, f)]
            return s, f
        if isinstance(node, (Star, Plus, Opt)):
            s = self.new()
            s1, f1 = self.build(node.inner)
            f = self.new()
            self.edges += [(s, None, s1), (f1, None, f)]
            if isinstance(node, (Star, Plus)):
                self.edges.append((f1, None, s1))
            if isinstance(node, (Star, Opt)):
                self.edges.append((s, None, f))
            return s, f
        raise TypeError(f"unknown regex node {node!r}")


def thompson(text: str, alphabet: Sequence[str]) -> NFA:
    """Thompson ε-NFA for ``text``; states renumbered ``0..n-1`` in BFS order from the start."""
    builder = _Builder()
    start, accept = builder.build(parse_regex(text, alphabet))
    out: dict[int, list[tuple[str | None, int]]] = {}
    for src, lab, dst in builder.edges:
        out.setdefault(src, []).append((lab, dst))
    order_key = {None: -1, **{a: i for i, a in enumerate(alphabet)}}
    order = [start]
    seen = {start}
    queue = deque([start])
    while queue:
        q = queue.popleft()
        for lab, dst in sorted(out.get(q, []), key=lambda e: (order_key[e[0]], e[1])):
            if dst not in seen:
                seen.add(dst)
                order.append(dst)
                queue.append(dst)
    if accept not in seen:  # cannot happen for well-formed Thompson fragments
        order.append(accept)
    renum = {old: new for new, old in enumerate(order)}
    transitions: dict[tuple[int, str], list[int]] = {}
    epsilon: dict[int, list[int]] = {}
    for src, lab, dst in builder.edges:
        if src not in renum:
            continue
        if lab is None:
            epsilon.setdefault(renum[src], []).append(renum[dst])
        else:
            transitions.setdefault((renum[src], lab), []).append(renum[dst])
    names = [str(i) for i in range(len(order))]
    return NFA(
        alphabet,
        names,
        [renum[start]],
        [renum[accept]],
        transitions,
        epsilon,
        meta={"construction": "thompson", "regex": text},
    )
