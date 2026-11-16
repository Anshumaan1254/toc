"""Request bodies (responses are documented JSON objects; see the OpenAPI page at /docs)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

MAX_INPUT_LENGTH = 200


class ClassifyRequest(BaseModel):
    language: str = Field(..., examples=["L7"])
    approach: str = Field(..., examples=["dfa"], description="dfa | nfa | min_dfa | lstar_{lr,dt,rf,stack} | rpni | edsm | ml_{lr,dt,rf,stack}")
    string: str = Field("", max_length=MAX_INPUT_LENGTH, examples=["aabb"], description="input string; empty = ε")


class CompareRequest(BaseModel):
    language: str = Field(..., examples=["L6"])
    string: str = Field("", max_length=MAX_INPUT_LENGTH, examples=["110"])


class Sample(BaseModel):
    string: str = Field(..., max_length=40, description="empty string = ε")
    label: bool = Field(..., description="true = accepted, false = rejected")


class LearnRequest(BaseModel):
    samples: list[Sample] = Field(..., max_length=2000)
    learner: Literal["rpni", "edsm", "ml_lr", "ml_dt", "ml_rf"] = "rpni"
    alphabet: str | None = Field(None, max_length=4, description="optional; inferred from the samples when omitted")


class LearnClassifyRequest(BaseModel):
    string: str = Field("", max_length=MAX_INPUT_LENGTH)
