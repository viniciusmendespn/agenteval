from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


# --- LLMProvider ---

class LLMProviderCreate(BaseModel):
    name: str
    provider_type: str = "azure"
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: str
    api_version: Optional[str] = None
    aws_account_id: Optional[str] = None
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_session_token: Optional[str] = None
    aws_region: Optional[str] = None

class LLMProviderOut(LLMProviderCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- AgentPromptVersion ---

class AgentPromptVersionOut(BaseModel):
    id: int
    version_num: int
    system_prompt: str
    status: str = "active"   # "active" | "archived"
    label: Optional[str] = None
    change_summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Agent ---

class AgentMetadataSnapshot(BaseModel):
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    environment: Optional[str] = None
    tags: list[str] = []
    extra_metadata: dict = {}
    system_prompt: Optional[str] = None
    agent_notes: Optional[str] = None
    connection_type: Optional[str] = None
    request_body: Optional[str] = None
    output_field: Optional[str] = None

    class Config:
        from_attributes = True


class AgentCreate(BaseModel):
    name: str
    url: str
    api_key: str = ""
    connection_type: str = "http"
    request_body: str = '{"message": "{{message}}"}'
    output_field: str = "response"
    system_prompt: Optional[str] = None
    token_url: Optional[str] = None
    token_request_body: Optional[str] = None
    token_output_field: Optional[str] = None
    token_header_name: Optional[str] = None
    model_provider: str = "custom"
    model_name: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    environment: str = "experiment"
    tags: list[str] = []
    extra_metadata: dict = {}
    agent_notes: Optional[str] = None

class AgentOut(AgentCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Guardrail ---

class GuardrailCreate(BaseModel):
    name: str
    description: Optional[str] = None
    mode: str = "both"       # "input" | "output" | "both"
    criterion: str

class GuardrailOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    mode: str
    criterion: str
    preset_key: Optional[str] = None
    is_system: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# --- TestCase ---

class Turn(BaseModel):
    input: str
    expected_output: Optional[str] = None

class TestCaseCreate(BaseModel):
    title: str
    input: str
    expected_output: Optional[str] = None
    context: Optional[list[str]] = None
    tags: Optional[str] = None
    turns: Optional[list[Turn]] = None  # None = single-turn (backward compat)
    variables: Optional[dict] = None  # {"chave": "valor"} — substituídos em {{chave}} no body

class TestCaseOut(TestCaseCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- EvaluationProfile ---

class EvaluationProfileCreate(BaseModel):
    name: str
    use_relevancy: bool = True
    relevancy_threshold: float = 0.5
    use_hallucination: bool = False
    hallucination_threshold: float = 0.5
    use_toxicity: bool = False
    toxicity_threshold: float = 0.5
    use_bias: bool = False
    bias_threshold: float = 0.5
    use_faithfulness: bool = False
    faithfulness_threshold: float = 0.5
    use_latency: bool = False
    latency_threshold_ms: int = 5000
    criteria: list[str] = []
    use_non_advice: bool = False
    non_advice_threshold: float = 0.5
    non_advice_types: list[str] = []
    use_role_violation: bool = False
    role_violation_threshold: float = 0.5
    role_violation_role: str = ""
    use_prompt_alignment: bool = False
    prompt_alignment_threshold: float = 0.5
    llm_provider_id: Optional[int] = None
    guardrail_ids: list[int] = []

    @field_validator("non_advice_types", mode="before")
    @classmethod
    def _coerce_non_advice_types(cls, v):
        return v if v is not None else []

    @field_validator("role_violation_role", mode="before")
    @classmethod
    def _coerce_role_violation_role(cls, v):
        return v if v is not None else ""

class EvaluationProfileOut(EvaluationProfileCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- TestRun ---

class TestRunCreate(BaseModel):
    name: Optional[str] = None
    agent_id: int
    profile_id: int
    test_case_ids: list[int]

class TestResultOut(BaseModel):
    id: int
    test_case_id: int
    actual_output: Optional[str]
    scores: dict
    reasons: dict = {}
    passed: Optional[bool]
    error: Optional[str]
    turns_executed: Optional[int] = None
    turn_outputs: Optional[list[dict]] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TestRunOut(BaseModel):
    id: int
    name: Optional[str] = None
    agent_id: int
    agent_name: Optional[str] = None
    profile_id: int
    profile_name: Optional[str] = None
    test_case_ids: list[int]
    status: str
    overall_score: Optional[float]
    error_count: int = 0
    agent_metadata_snapshot: Optional[AgentMetadataSnapshot] = None
    created_at: datetime
    completed_at: Optional[datetime]
    results: list[TestResultOut] = []

    class Config:
        from_attributes = True


# --- Dataset ---

class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    agent_id: Optional[int] = None

class DatasetRecordOut(BaseModel):
    id: int
    dataset_id: int
    input: str
    actual_output: Optional[str]
    context: Optional[list[str]]
    session_id: Optional[str] = None
    turn_order: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DatasetOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    system_prompt: Optional[str] = None
    agent_id: Optional[int] = None
    agent_name: Optional[str] = None
    created_at: datetime
    record_count: int = 0

    class Config:
        from_attributes = True

class DatasetDetailOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    system_prompt: Optional[str] = None
    agent_id: Optional[int] = None
    agent_name: Optional[str] = None
    created_at: datetime
    records: list[DatasetRecordOut] = []

    class Config:
        from_attributes = True


# --- DatasetEvaluation ---

class DatasetEvaluationCreate(BaseModel):
    name: Optional[str] = None
    profile_id: int

class DatasetResultOut(BaseModel):
    id: int
    record_id: int
    scores: dict
    reasons: dict = {}
    passed: Optional[bool]
    error: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class DatasetEvaluationOut(BaseModel):
    id: int
    name: Optional[str] = None
    dataset_id: int
    profile_id: int
    status: str
    overall_score: Optional[float]
    agent_metadata_snapshot: Optional[AgentMetadataSnapshot] = None
    created_at: datetime
    completed_at: Optional[datetime]
    results: list[DatasetResultOut] = []

    class Config:
        from_attributes = True


# --- Evaluation (unificado) ---

class EvaluationOut(BaseModel):
    id: int
    name: Optional[str] = None
    eval_type: str
    agent_id: Optional[int] = None
    agent_name: Optional[str] = None
    dataset_id: Optional[int] = None
    dataset_name: Optional[str] = None
    profile_id: int
    profile_name: Optional[str] = None
    source_run_id: Optional[int] = None
    source_eval_id: Optional[int] = None
    status: str
    overall_score: Optional[float]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# --- Workspace ---

class WorkspaceCreate(BaseModel):
    name: str
    slug: Optional[str] = None


class WorkspaceOut(BaseModel):
    id: int
    name: str
    slug: str
    role: str = "member"
    created_at: datetime

    class Config:
        from_attributes = True


class WorkspaceSettingsOut(BaseModel):
    chat_llm_provider_id: Optional[int] = None
    system_llm_provider_id: Optional[int] = None

    class Config:
        from_attributes = True


class WorkspaceSettingsPatch(BaseModel):
    chat_llm_provider_id: Optional[int] = None
    system_llm_provider_id: Optional[int] = None
