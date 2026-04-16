from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from .database import engine, Base, SessionLocal
from .routers import agents, test_cases, profiles, runs, imports, datasets, dataset_evaluations, workspaces
from .routers import analytics, chat
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

        conn.commit()

_migrate()


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


@app.get("/health")
def health():
    return {"status": "ok"}
