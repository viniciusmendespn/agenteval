from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


# --- Agent ---

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

class AgentOut(AgentCreate):
    id: int
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
    agent_id: int
    agent_name: Optional[str] = None
    profile_id: int
    profile_name: Optional[str] = None
    test_case_ids: list[int]
    status: str
    overall_score: Optional[float]
    created_at: datetime
    completed_at: Optional[datetime]
    results: list[TestResultOut] = []

    class Config:
        from_attributes = True


# --- Dataset ---

class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None

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
    created_at: datetime
    record_count: int = 0

    class Config:
        from_attributes = True

class DatasetDetailOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    records: list[DatasetRecordOut] = []

    class Config:
        from_attributes = True


# --- DatasetEvaluation ---

class DatasetEvaluationCreate(BaseModel):
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
    dataset_id: int
    profile_id: int
    status: str
    overall_score: Optional[float]
    created_at: datetime
    completed_at: Optional[datetime]
    results: list[DatasetResultOut] = []

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
