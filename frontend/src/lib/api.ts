export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const WORKSPACE_STORAGE_KEY = "agenteval.workspaceId"

export function getActiveWorkspaceId() {
  if (typeof window === "undefined") return null
  const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
  if (!stored || stored === "1") return null
  return stored
}

export function setActiveWorkspaceId(id: number | string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, String(id))
}

export function clearActiveWorkspaceId() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
}

export function workspaceHeaders(includeJson = true): HeadersInit {
  const headers: Record<string, string> = {}
  if (includeJson) headers["Content-Type"] = "application/json"
  const workspaceId = getActiveWorkspaceId()
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId
  headers["X-User-Email"] = "local@agenteval.dev"
  return headers
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    cache: "no-store",
    headers: { ...workspaceHeaders(), ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// --- Types ---

export type LLMProvider = {
  id: number
  name: string
  provider_type: "azure" | "openai" | "custom"
  base_url?: string
  api_key: string
  model_name: string
  api_version?: string
  created_at: string
}

export type Agent = {
  id: number
  name: string
  url: string
  api_key: string
  model?: string
  connection_type: string
  request_body: string
  output_field: string
  system_prompt?: string
  token_url?: string
  token_request_body?: string
  token_output_field?: string
  token_header_name?: string
  created_at: string
}

export type Turn = {
  input: string
  expected_output?: string
}

export type TestCase = {
  id: number
  title: string
  input: string
  expected_output?: string
  context?: string[]
  tags?: string
  turns?: Turn[]  // undefined/null = single-turn
  variables?: Record<string, string>
  created_at: string
}

export type EvaluationProfile = {
  id: number
  name: string
  use_relevancy: boolean
  relevancy_threshold: number
  use_hallucination: boolean
  hallucination_threshold: number
  use_toxicity: boolean
  toxicity_threshold: number
  use_bias: boolean
  bias_threshold: number
  use_faithfulness: boolean
  faithfulness_threshold: number
  use_latency: boolean
  latency_threshold_ms: number
  criteria: string[]
  use_non_advice: boolean
  non_advice_threshold: number
  non_advice_types: string[]
  use_role_violation: boolean
  role_violation_threshold: number
  role_violation_role: string
  use_prompt_alignment: boolean
  prompt_alignment_threshold: number
  llm_provider_id?: number | null
  created_at: string
}

// --- Analytics ---
export type AnalyticsOverview = {
  totals: { agents: number; test_cases: number; runs: number; datasets: number }
  avg_score?: number | null
  pass_rate?: number | null
  runs_by_status: Record<string, number>
  score_trend: { run_id: number; score: number; created_at: string }[]
  recent_runs: {
    id: number
    agent_name: string
    score?: number | null
    status: string
    cases: number
    created_at: string
  }[]
}

export type RunBreakdown = {
  run_id: number
  overall_score?: number | null
  total: number
  passed: number
  failed: number
  metric_breakdown: Record<string, {
    avg: number
    min: number
    max: number
    passed_count: number
    total_count: number
  }>
}

export type RunComparison = {
  run_a: { id: number; agent_name: string; score?: number | null; created_at: string; total_cases: number }
  run_b: { id: number; agent_name: string; score?: number | null; created_at: string; total_cases: number }
  metric_comparison: { metric: string; score_a?: number | null; score_b?: number | null; delta?: number | null }[]
  cases: {
    test_case_id: number
    title: string
    status_a: string
    status_b: string
    regression: boolean
    improvement: boolean
    scores_a: Record<string, number>
    scores_b: Record<string, number>
  }[]
  summary: {
    regressions: number
    improvements: number
    unchanged: number
    score_delta?: number | null
  }
}

export type TestResult = {
  id: number
  test_case_id: number
  actual_output?: string
  scores: Record<string, number>
  reasons: Record<string, string>
  passed?: boolean
  error?: string
  turns_executed?: number
  turn_outputs?: Array<{ input: string; output: string }>
  created_at: string
}

export type TestRun = {
  id: number
  agent_id: number
  agent_name?: string
  profile_id: number
  profile_name?: string
  test_case_ids: number[]
  status: "pending" | "running" | "completed" | "failed"
  overall_score?: number
  created_at: string
  completed_at?: string
  results: TestResult[]
}

export type DatasetRecord = {
  id: number
  dataset_id: number
  input: string
  actual_output?: string
  context?: string[]
  session_id?: string
  turn_order?: number
  created_at: string
}

export type Dataset = {
  id: number
  name: string
  description?: string
  system_prompt?: string
  record_count: number
  created_at: string
}

export type DatasetDetail = {
  id: number
  name: string
  description?: string
  system_prompt?: string
  created_at: string
  records: DatasetRecord[]
}

export type DatasetResult = {
  id: number
  record_id: number
  scores: Record<string, number>
  reasons: Record<string, string>
  passed?: boolean
  error?: string
  created_at: string
}

export type DatasetEvaluation = {
  id: number
  dataset_id: number
  profile_id: number
  status: "pending" | "running" | "completed" | "failed"
  overall_score?: number
  created_at: string
  completed_at?: string
  results: DatasetResult[]
}

export type Workspace = {
  id: number
  name: string
  slug: string
  role: "owner" | "admin" | "member" | "viewer"
  created_at: string
}

// --- LLM Providers ---
export const getLLMProviders = () => request<LLMProvider[]>("/llm-providers/")
export const createLLMProvider = (data: Omit<LLMProvider, "id" | "created_at">) =>
  request<LLMProvider>("/llm-providers/", { method: "POST", body: JSON.stringify(data) })
export const updateLLMProvider = (id: number, data: Omit<LLMProvider, "id" | "created_at">) =>
  request<LLMProvider>(`/llm-providers/${id}`, { method: "PUT", body: JSON.stringify(data) })
export const deleteLLMProvider = (id: number) =>
  request<void>(`/llm-providers/${id}`, { method: "DELETE" })

// --- Workspaces ---
export const getWorkspaces = () => request<Workspace[]>("/workspaces/")
export const getCurrentWorkspace = () => request<Workspace>("/workspaces/current")
export const createWorkspace = (data: { name: string; slug?: string }) =>
  request<Workspace>("/workspaces/", { method: "POST", body: JSON.stringify(data) })

// --- Agents ---
export const getAgents = () => request<Agent[]>("/agents/")
export const getAgent = (id: number) => request<Agent>(`/agents/${id}`)
export const createAgent = (data: Omit<Agent, "id" | "created_at">) =>
  request<Agent>("/agents/", { method: "POST", body: JSON.stringify(data) })
export const updateAgent = (id: number, data: Omit<Agent, "id" | "created_at">) =>
  request<Agent>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(data) })
export const deleteAgent = (id: number) =>
  request<void>(`/agents/${id}`, { method: "DELETE" })
export const optimizeAgentPrompt = (id: number) =>
  request<{ current_prompt: string; suggested_prompt: string; reasoning: string; failed_cases_analyzed: number }>(
    `/agents/${id}/optimize-prompt`, { method: "POST" }
  )
export const testConnection = (url: string, api_key: string) =>
  request<{ ok: boolean; status_code?: number; error?: string }>("/agents/test-connection", {
    method: "POST", body: JSON.stringify({ url, api_key }),
  })
export const previewResponse = (data: {
  url: string; api_key: string; connection_type: string
  request_body: string; output_field: string; message: string; session_id?: string
}) =>
  request<{
    connection_type: string; raw_response?: unknown; sample_events?: unknown[]
    extracted?: string | null; extract_error?: string | null; error?: string
  }>("/agents/preview", { method: "POST", body: JSON.stringify(data) })

// --- Test Cases ---
export const getTestCases = () => request<TestCase[]>("/test-cases/")
export const getTestCase = (id: number) => request<TestCase>(`/test-cases/${id}`)
export const createTestCase = (data: Omit<TestCase, "id" | "created_at">) =>
  request<TestCase>("/test-cases/", { method: "POST", body: JSON.stringify(data) })
export const updateTestCase = (id: number, data: Omit<TestCase, "id" | "created_at">) =>
  request<TestCase>(`/test-cases/${id}`, { method: "PUT", body: JSON.stringify(data) })
export const deleteTestCase = (id: number) =>
  request<void>(`/test-cases/${id}`, { method: "DELETE" })

// --- Profiles ---
export const getProfiles = () => request<EvaluationProfile[]>("/profiles/")
export const getProfile = (id: number) => request<EvaluationProfile>(`/profiles/${id}`)
export const createProfile = (data: Omit<EvaluationProfile, "id" | "created_at">) =>
  request<EvaluationProfile>("/profiles/", { method: "POST", body: JSON.stringify(data) })
export const updateProfile = (id: number, data: Omit<EvaluationProfile, "id" | "created_at">) =>
  request<EvaluationProfile>(`/profiles/${id}`, { method: "PUT", body: JSON.stringify(data) })
export const deleteProfile = (id: number) =>
  request<void>(`/profiles/${id}`, { method: "DELETE" })

// --- Runs (teste de agente ao vivo) ---
export const getRuns = () => request<TestRun[]>("/runs/")
export const getRun = (id: number) => request<TestRun>(`/runs/${id}`)
export const cancelRun = (id: number) => request<{ ok: boolean }>(`/runs/${id}/cancel`, { method: "POST" })
export const createRun = (data: { agent_id: number; profile_id: number; test_case_ids: number[] }) =>
  request<TestRun>("/runs/", { method: "POST", body: JSON.stringify(data) })

// --- Datasets (avaliação de histórico) ---
export const getDatasets = () => request<Dataset[]>("/datasets/")
export const getDataset = (id: number) => request<DatasetDetail>(`/datasets/${id}`)
export const updateDataset = (id: number, data: { name?: string; description?: string; system_prompt?: string }) =>
  request<Dataset>(`/datasets/${id}`, { method: "PATCH", body: JSON.stringify(data) })
export const deleteDataset = (id: number) => request<void>(`/datasets/${id}`, { method: "DELETE" })
export const deleteDatasetRecord = (datasetId: number, recordId: number) =>
  request<void>(`/datasets/${datasetId}/records/${recordId}`, { method: "DELETE" })
export const bulkDeleteRecords = (datasetId: number, recordIds: number[]) =>
  request<{ deleted: number }>(`/datasets/${datasetId}/records/bulk-delete`, {
    method: "POST", body: JSON.stringify({ record_ids: recordIds }),
  })

export const getDatasetEvaluations = (datasetId: number) =>
  request<DatasetEvaluation[]>(`/datasets/${datasetId}/evaluations/`)
export const getDatasetEvaluation = (datasetId: number, evalId: number) =>
  request<DatasetEvaluation>(`/datasets/${datasetId}/evaluations/${evalId}`)
export const createDatasetEvaluation = (datasetId: number, profileId: number) =>
  request<DatasetEvaluation>(`/datasets/${datasetId}/evaluations/`, {
    method: "POST", body: JSON.stringify({ profile_id: profileId }),
  })

// --- Imports ---
export type MappingRequest = {
  dataset_name: string
  dataset_description?: string
  dataset_system_prompt?: string
  file_ids: string[]
  input_path: string
  output_path?: string
  context_paths: string[]
  manual_context?: string
  session_id_path?: string
  order_path?: string
}

export type AnalyzeResult = {
  file_id: string
  record_count: number
  sample: Record<string, unknown>[]
  all_paths: string[]
  suggestion: {
    input_path: string | null
    output_path: string | null
    context_paths: string[]
    session_id_path: string | null
    order_path: string | null
    reasoning: string
  }
}

export type PreviewResult = {
  previews: { input: string; output?: string; context?: string[]; session_id?: string; turn_order?: number }[]
  record_count: number
}

export const analyzeImport = (file: File): Promise<AnalyzeResult> => {
  const form = new FormData()
  form.append("file", file)
  return fetch(`${API}/imports/analyze`, { method: "POST", body: form, cache: "no-store", headers: workspaceHeaders(false) })
    .then(async res => { if (!res.ok) throw new Error(await res.text()); return res.json() })
}

export const uploadExtraFile = (file: File): Promise<{ file_id: string; filename: string; record_count: number }> => {
  const form = new FormData()
  form.append("file", file)
  return fetch(`${API}/imports/upload`, { method: "POST", body: form, cache: "no-store", headers: workspaceHeaders(false) })
    .then(async res => { if (!res.ok) throw new Error(await res.text()); return res.json() })
}

export const previewImport = (data: MappingRequest) =>
  request<PreviewResult>("/imports/preview", { method: "POST", body: JSON.stringify(data) })

export const confirmImport = (data: MappingRequest) =>
  request<{ dataset_id: number; created: number }>("/imports/confirm", { method: "POST", body: JSON.stringify(data) })

export type AppendRequest = {
  dataset_id: number
  file_ids: string[]
  input_path: string
  output_path?: string
  context_paths: string[]
  manual_context?: string
  session_id_path?: string
  order_path?: string
}

export const appendToDataset = (data: AppendRequest) =>
  request<{ dataset_id: number; appended: number }>("/imports/append", { method: "POST", body: JSON.stringify(data) })

// --- Analytics ---
export type DatasetEvaluationSummary = {
  id: number
  dataset_id: number
  dataset_name: string
  profile_id: number
  profile_name: string
  status: "pending" | "running" | "completed" | "failed"
  overall_score?: number | null
  created_at: string
  completed_at?: string | null
}

export type TimelinePoint = {
  id: number
  type: "run" | "dataset_eval"
  date: string
  overall_score?: number | null
  metrics: Record<string, number>
  total: number
  passed: number
  profile_id: number
}

export type TimelineData = {
  agent_id?: number
  agent_name?: string
  dataset_id?: number
  dataset_name?: string
  points: TimelinePoint[]
  profile_names: Record<number, string>
}

export const getAgentTimeline = (agentId: number) =>
  request<TimelineData>(`/analytics/timeline/agents/${agentId}`)
export const getDatasetTimeline = (datasetId: number) =>
  request<TimelineData>(`/analytics/timeline/datasets/${datasetId}`)

export const getAnalyticsOverview = () => request<AnalyticsOverview>("/analytics/overview")
export const getAllDatasetEvaluations = () => request<DatasetEvaluationSummary[]>("/analytics/dataset-evaluations")
export const getRunBreakdown = (runId: number) => request<RunBreakdown>(`/analytics/runs/${runId}/breakdown`)
export const compareRuns = (runIdA: number, runIdB: number) =>
  request<RunComparison>("/analytics/runs/compare", {
    method: "POST",
    body: JSON.stringify({ run_id_a: runIdA, run_id_b: runIdB }),
  })
