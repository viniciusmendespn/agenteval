import json as _json
from pathlib import Path as _Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from .database import engine, Base, SessionLocal
from .routers import agents, test_cases, profiles, runs, imports, datasets, dataset_evaluations, workspaces
from .routers import analytics, chat, llm_providers
from .workspace import ensure_local_workspaces, ensure_user, remove_legacy_default_workspace

Base.metadata.create_all(bind=engine)

# Migração incremental: adiciona colunas novas sem perder dados existentes
def _migrate():
    insp = inspect(engine)
    existing = {c["name"] for c in insp.get_columns("evaluation_profiles")}
    new_cols = [
        ("use_toxicity",        "BOOLEAN DEFAULT 0 NOT NULL"),
        ("toxicity_threshold",  "FLOAT DEFAULT 0.5 NOT NULL"),
        ("use_bias",            "BOOLEAN DEFAULT 0 NOT NULL"),
        ("bias_threshold",      "FLOAT DEFAULT 0.5 NOT NULL"),
        ("use_faithfulness",    "BOOLEAN DEFAULT 0 NOT NULL"),
        ("faithfulness_threshold", "FLOAT DEFAULT 0.5 NOT NULL"),
        ("use_latency",             "BOOLEAN DEFAULT 0 NOT NULL"),
        ("latency_threshold_ms",    "INTEGER DEFAULT 5000 NOT NULL"),
        ("use_non_advice",          "BOOLEAN DEFAULT 0 NOT NULL"),
        ("non_advice_threshold",    "FLOAT DEFAULT 0.5 NOT NULL"),
        ("non_advice_types",        "JSON"),
        ("use_role_violation",      "BOOLEAN DEFAULT 0 NOT NULL"),
        ("role_violation_threshold","FLOAT DEFAULT 0.5 NOT NULL"),
        ("role_violation_role",     "TEXT"),
    ]
    with engine.connect() as conn:
        for col, definition in new_cols:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE evaluation_profiles ADD COLUMN {col} {definition}"))
        scoped_tables = [
            "agents",
            "test_cases",
            "evaluation_profiles",
            "test_runs",
            "datasets",
            "dataset_evaluations",
        ]
        for table in scoped_tables:
            table_cols = {c["name"] for c in insp.get_columns(table)}
            if "workspace_id" not in table_cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN workspace_id INTEGER DEFAULT 1 NOT NULL"))

        # agents: system_prompt para geração de cenários
        ag_cols = {c["name"] for c in insp.get_columns("agents")}
        if "system_prompt" not in ag_cols:
            conn.execute(text("ALTER TABLE agents ADD COLUMN system_prompt TEXT"))

        # test_cases: suporte a multi-turn
        tc_cols = {c["name"] for c in insp.get_columns("test_cases")}
        if "turns" not in tc_cols:
            conn.execute(text("ALTER TABLE test_cases ADD COLUMN turns JSON"))

        # test_results: contagem de turnos e histórico multi-turn
        tr_cols = {c["name"] for c in insp.get_columns("test_results")}
        if "turns_executed" not in tr_cols:
            conn.execute(text("ALTER TABLE test_results ADD COLUMN turns_executed INTEGER"))
        if "turn_outputs" not in tr_cols:
            conn.execute(text("ALTER TABLE test_results ADD COLUMN turn_outputs JSON"))

        # dataset_records: agrupamento por sessão
        dr_cols = {c["name"] for c in insp.get_columns("dataset_records")}
        if "session_id" not in dr_cols:
            conn.execute(text("ALTER TABLE dataset_records ADD COLUMN session_id TEXT"))
        if "turn_order" not in dr_cols:
            conn.execute(text("ALTER TABLE dataset_records ADD COLUMN turn_order INTEGER"))

        # agents: chamada em dois passos (token pré-chamada)
        ag_cols = {c["name"] for c in insp.get_columns("agents")}
        if "token_url" not in ag_cols:
            conn.execute(text("ALTER TABLE agents ADD COLUMN token_url TEXT"))
        if "token_request_body" not in ag_cols:
            conn.execute(text("ALTER TABLE agents ADD COLUMN token_request_body TEXT"))
        if "token_output_field" not in ag_cols:
            conn.execute(text("ALTER TABLE agents ADD COLUMN token_output_field TEXT"))
        if "token_header_name" not in ag_cols:
            conn.execute(text("ALTER TABLE agents ADD COLUMN token_header_name TEXT"))

        # test_cases: variáveis de substituição de placeholders
        tc_cols = {c["name"] for c in insp.get_columns("test_cases")}
        if "variables" not in tc_cols:
            conn.execute(text("ALTER TABLE test_cases ADD COLUMN variables JSON"))

        # evaluation_profiles: prompt alignment + llm provider
        ep_cols = {c["name"] for c in insp.get_columns("evaluation_profiles")}
        if "use_prompt_alignment" not in ep_cols:
            conn.execute(text("ALTER TABLE evaluation_profiles ADD COLUMN use_prompt_alignment BOOLEAN DEFAULT 0 NOT NULL"))
        if "prompt_alignment_threshold" not in ep_cols:
            conn.execute(text("ALTER TABLE evaluation_profiles ADD COLUMN prompt_alignment_threshold FLOAT DEFAULT 0.5 NOT NULL"))
        if "llm_provider_id" not in ep_cols:
            conn.execute(text("ALTER TABLE evaluation_profiles ADD COLUMN llm_provider_id INTEGER REFERENCES llm_providers(id)"))

        # datasets: system_prompt como contexto de avaliação
        ds_cols = {c["name"] for c in insp.get_columns("datasets")}
        if "system_prompt" not in ds_cols:
            conn.execute(text("ALTER TABLE datasets ADD COLUMN system_prompt TEXT"))

        conn.commit()

_migrate()


def _bootstrap_llm_provider():
    """Se JUDGE_BASE_URL ou JUDGE_API_KEY existem e não há providers no workspace 1, migra automaticamente."""
    import os
    base_url = os.getenv("JUDGE_BASE_URL")
    api_key = os.getenv("JUDGE_API_KEY", "")
    model_name = os.getenv("JUDGE_MODEL", "gpt-4")
    api_version = os.getenv("JUDGE_API_VERSION", "2024-02-01")

    if not base_url and not api_key:
        return

    from .models import LLMProvider
    db = SessionLocal()
    try:
        if db.query(LLMProvider).first():
            return
        provider_type = "openai" if not base_url else "azure"
        db.add(LLMProvider(
            name="Judge LLM (migrado do .env)",
            provider_type=provider_type,
            base_url=base_url,
            api_key=api_key,
            model_name=model_name,
            api_version=api_version if provider_type == "azure" else None,
        ))
        db.commit()
    finally:
        db.close()


_bootstrap_llm_provider()


def _bootstrap_local_workspaces():
    db = SessionLocal()
    try:
        user = ensure_user(db)
        ensure_local_workspaces(db, user)
        remove_legacy_default_workspace(db)
        db.commit()
    finally:
        db.close()


_bootstrap_local_workspaces()


def _recover_stuck_runs():
    """Marca como 'failed' qualquer run/avaliação que ficou presa como 'running' após um restart."""
    from .models import TestRun, DatasetEvaluation
    db = SessionLocal()
    try:
        stuck_runs = db.query(TestRun).filter(TestRun.status == "running").all()
        for r in stuck_runs:
            r.status = "failed"
        stuck_evals = db.query(DatasetEvaluation).filter(DatasetEvaluation.status == "running").all()
        for e in stuck_evals:
            e.status = "failed"
        if stuck_runs or stuck_evals:
            db.commit()
    finally:
        db.close()


_recover_stuck_runs()

app = FastAPI(
    title="AgentEval API",
    description="Plataforma de avaliação e testes de agentes de IA",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(workspaces.router)
app.include_router(test_cases.router)
app.include_router(profiles.router)
app.include_router(runs.router)
app.include_router(imports.router)
app.include_router(datasets.router)
app.include_router(dataset_evaluations.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(llm_providers.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/version")
def get_version():
    vf = _Path(__file__).parent.parent.parent / "version.json"
    try:
        return _json.loads(vf.read_text(encoding="utf-8"))
    except Exception:
        return {"version": "unknown", "build": 0, "updated_at": None}
