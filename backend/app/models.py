from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, default=1, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    api_key = Column(String, nullable=False)
    model = Column(String, default="custom")
    system_prompt = Column(Text, nullable=True)
    connection_type = Column(String, default="http")
    request_body = Column(Text, default='{"message": "{{message}}"}')
    output_field = Column(String, default="response")
    created_at = Column(DateTime, default=datetime.utcnow)


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, default=1, index=True)
    title = Column(String, nullable=False)
    input = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)
    tags = Column(String, nullable=True)
    turns = Column(JSON, nullable=True)  # [{input, expected_output}] — null = single-turn
    created_at = Column(DateTime, default=datetime.utcnow)


class EvaluationProfile(Base):
    __tablename__ = "evaluation_profiles"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, default=1, index=True)
    name = Column(String, nullable=False)
    use_relevancy = Column(Boolean, default=True)
    relevancy_threshold = Column(Float, default=0.5)
    use_hallucination = Column(Boolean, default=False)
    hallucination_threshold = Column(Float, default=0.5)
    use_toxicity = Column(Boolean, default=False)
    toxicity_threshold = Column(Float, default=0.5)
    use_bias = Column(Boolean, default=False)
    bias_threshold = Column(Float, default=0.5)
    use_faithfulness = Column(Boolean, default=False)
    faithfulness_threshold = Column(Float, default=0.5)
    use_latency = Column(Boolean, default=False)
    latency_threshold_ms = Column(Integer, default=5000)
    criteria = Column(JSON, default=list)
    use_non_advice = Column(Boolean, default=False)
    non_advice_threshold = Column(Float, default=0.5)
    non_advice_types = Column(JSON, default=list)
    use_role_violation = Column(Boolean, default=False)
    role_violation_threshold = Column(Float, default=0.5)
    role_violation_role = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, default=1, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False)
    profile_id = Column(Integer, ForeignKey("evaluation_profiles.id"), nullable=False)
    test_case_ids = Column(JSON, nullable=False)
    status = Column(String, default="pending")
    overall_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    agent = relationship("Agent")
    profile = relationship("EvaluationProfile")
    results = relationship("TestResult", back_populates="run")


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("test_runs.id"), nullable=False)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)
    actual_output = Column(Text, nullable=True)
    scores = Column(JSON, default=dict)
    reasons = Column(JSON, default=dict)
    passed = Column(Boolean, nullable=True)
    error = Column(Text, nullable=True)
    turns_executed = Column(Integer, nullable=True)  # quantos turnos rodaram
    turn_outputs = Column(JSON, nullable=True)        # [{input, output}] por turno (multi-turn)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("TestRun", back_populates="results")
    test_case = relationship("TestCase")


# ---------------------------------------------------------------------------
# Dataset — conversas históricas importadas para avaliação offline
# ---------------------------------------------------------------------------

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, default=1, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    records = relationship("DatasetRecord", back_populates="dataset", cascade="all, delete-orphan")
    evaluations = relationship("DatasetEvaluation", back_populates="dataset", cascade="all, delete-orphan")


class DatasetRecord(Base):
    __tablename__ = "dataset_records"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    input = Column(Text, nullable=False)
    actual_output = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)
    session_id = Column(String, nullable=True)   # ID da sessão/conversa
    turn_order = Column(Integer, nullable=True)  # posição 1-based dentro da sessão
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="records")


class DatasetEvaluation(Base):
    __tablename__ = "dataset_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, default=1, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    profile_id = Column(Integer, ForeignKey("evaluation_profiles.id"), nullable=False)
    status = Column(String, default="pending")
    overall_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    dataset = relationship("Dataset", back_populates="evaluations")
    profile = relationship("EvaluationProfile")
    results = relationship("DatasetResult", back_populates="evaluation", cascade="all, delete-orphan")


class DatasetResult(Base):
    __tablename__ = "dataset_results"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("dataset_evaluations.id"), nullable=False)
    record_id = Column(Integer, ForeignKey("dataset_records.id"), nullable=False)
    scores = Column(JSON, default=dict)
    reasons = Column(JSON, default=dict)
    passed = Column(Boolean, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    evaluation = relationship("DatasetEvaluation", back_populates="results")
    record = relationship("DatasetRecord")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String, default="member", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace")
    user = relationship("User")
