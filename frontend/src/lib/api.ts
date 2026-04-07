const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
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

export type Agent = {
  id: number
  name: string
  url: string
  api_key: string
  connection_type: string
  request_body: string
  output_field: string
  created_at: string
}

export type TestCase = {
  id: number
  title: string
  input: string
  expected_output?: string
  context?: string[]
  tags?: string
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
  created_at: string
}

export type Dataset = {
  id: number
  name: string
  description?: string
  record_count: number
  created_at: string
}

export type DatasetDetail = {
  id: number
  name: string
  description?: string
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

// --- Agents ---
export const getAgents = () => request<Agent[]>("/agents/")
export const getAgent = (id: number) => request<Agent>(`/agents/${id}`)
export const createAgent = (data: Omit<Agent, "id" | "created_at">) =>
  request<Agent>("/agents/", { method: "POST", body: JSON.stringify(data) })
export const updateAgent = (id: number, data: Omit<Agent, "id" | "created_at">) =>
  request<Agent>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(data) })
export const deleteAgent = (id: number) =>
  request<void>(`/agents/${id}`, { method: "DELETE" })
export const testConnection = (url: string, api_key: string) =>
  request<{ ok: boolean; status_code?: number; error?: string }>("/agents/test-connection", {
    method: "POST", body: JSON.stringify({ url, api_key }),
  })
export const previewResponse = (data: {
  url: string; api_key: string; connection_type: string
  request_body: string; output_field: string; message: string
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
export const createRun = (data: { agent_id: number; profile_id: number; test_case_ids: number[] }) =>
  request<TestRun>("/runs/", { method: "POST", body: JSON.stringify(data) })

// --- Datasets (avaliação de histórico) ---
export const getDatasets = () => request<Dataset[]>("/datasets/")
export const getDataset = (id: number) => request<DatasetDetail>(`/datasets/${id}`)
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
  file_ids: string[]
  input_path: string
  output_path?: string
  context_paths: string[]
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
    reasoning: string
  }
}

export type PreviewResult = {
  previews: { input: string; output?: string; context?: string[] }[]
  record_count: number
}

export const analyzeImport = (file: File): Promise<AnalyzeResult> => {
  const form = new FormData()
  form.append("file", file)
  return fetch(`${API}/imports/analyze`, { method: "POST", body: form, cache: "no-store" })
    .then(async res => { if (!res.ok) throw new Error(await res.text()); return res.json() })
}

export const uploadExtraFile = (file: File): Promise<{ file_id: string; filename: string; record_count: number }> => {
  const form = new FormData()
  form.append("file", file)
  return fetch(`${API}/imports/upload`, { method: "POST", body: form, cache: "no-store" })
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
