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

app = FastAPI(
    title="AgentEval API",
    description="Plataforma de avaliação e testes de agentes de IA",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
