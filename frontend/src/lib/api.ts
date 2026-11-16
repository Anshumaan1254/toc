import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import type {
  Approach,
  ApproachId,
  AutomatonRecord,
  ClassifyResult,
  CompareResult,
  DatasetReport,
  Language,
  Learner,
  LearnClassifyResult,
  LearnResult,
  ModelDetail,
  PipelineId,
  Summary,
} from "./types";

/** API base: same origin (Vite proxies /api in dev; FastAPI serves the built app in prod). */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  details: Record<string, unknown>;
  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Cannot reach the backend. Start it with `python run_all.py` (it listens on port 8000).", 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    let details: Record<string, unknown> = {};
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (detail && typeof detail === "object" && typeof detail.message === "string") {
        message = detail.message;
        details = detail;
      } else if (typeof detail === "string") {
        message = detail;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, details);
  }
  return (await res.json()) as T;
}

export const api = {
  languages: () => request<Language[]>("/api/languages"),
  approaches: (language: string) => request<Approach[]>(`/api/approaches?language=${encodeURIComponent(language)}`),
  automaton: (language: string, approach: ApproachId) =>
    request<AutomatonRecord>(`/api/automata/${encodeURIComponent(language)}/${encodeURIComponent(approach)}`),
  model: (language: string, pipeline: PipelineId) =>
    request<ModelDetail>(`/api/models/${encodeURIComponent(language)}/${encodeURIComponent(pipeline)}`),
  summary: () => request<Summary>("/api/summary"),
  dataset: () => request<DatasetReport>("/api/dataset"),
  classify: (language: string, approach: ApproachId, string: string) =>
    request<ClassifyResult>("/api/classify", { method: "POST", body: JSON.stringify({ language, approach, string }) }),
  compare: (language: string, string: string) =>
    request<CompareResult>("/api/compare", { method: "POST", body: JSON.stringify({ language, string }) }),
  learn: (samples: { string: string; label: boolean }[], learner: Learner, alphabet?: string) =>
    request<LearnResult>("/api/learn", { method: "POST", body: JSON.stringify({ samples, learner, alphabet: alphabet || null }) }),
  learnClassify: (sessionId: string, string: string) =>
    request<LearnClassifyResult>(`/api/learn/${encodeURIComponent(sessionId)}/classify`, {
      method: "POST",
      body: JSON.stringify({ string }),
    }),
};

// ------------------------------------------------------------------ query hooks
export const useLanguages = () => useQuery({ queryKey: ["languages"], queryFn: api.languages, staleTime: Infinity });

export const useApproaches = (language: string | undefined) =>
  useQuery({
    queryKey: ["approaches", language],
    queryFn: () => api.approaches(language!),
    enabled: !!language,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

export const useAutomaton = (language: string | undefined, approach: ApproachId | undefined) =>
  useQuery({
    queryKey: ["automaton", language, approach],
    queryFn: () => api.automaton(language!, approach!),
    enabled: !!language && !!approach && !approach.startsWith("ml_"),
    staleTime: Infinity,
  });

export const useModel = (language: string | undefined, pipeline: PipelineId | undefined) =>
  useQuery({
    queryKey: ["model", language, pipeline],
    queryFn: () => api.model(language!, pipeline!),
    enabled: !!language && !!pipeline,
    staleTime: Infinity,
  });

export const useSummary = () => useQuery({ queryKey: ["summary"], queryFn: api.summary, staleTime: Infinity });
export const useDataset = () => useQuery({ queryKey: ["dataset"], queryFn: api.dataset, staleTime: Infinity });

export const useClassify = () =>
  useMutation({ mutationFn: (v: { language: string; approach: ApproachId; string: string }) => api.classify(v.language, v.approach, v.string) });

export const useCompare = () => useMutation({ mutationFn: (v: { language: string; string: string }) => api.compare(v.language, v.string) });

export const useLearn = () =>
  useMutation({
    mutationFn: (v: { samples: { string: string; label: boolean }[]; learner: Learner; alphabet?: string }) =>
      api.learn(v.samples, v.learner, v.alphabet),
  });

export const useLearnClassify = () =>
  useMutation({ mutationFn: (v: { sessionId: string; string: string }) => api.learnClassify(v.sessionId, v.string) });

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
