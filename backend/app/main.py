from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from .database import engine, Base
from .routers import agents, test_cases, profiles, runs, imports, datasets, dataset_evaluations
from .routers import analytics

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
        ("use_latency",         "BOOLEAN DEFAULT 0 NOT NULL"),
        ("latency_threshold_ms","INTEGER DEFAULT 5000 NOT NULL"),
    ]
    with engine.connect() as conn:
        for col, definition in new_cols:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE evaluation_profiles ADD COLUMN {col} {definition}"))
        conn.commit()

_migrate()

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
app.include_router(test_cases.router)
app.include_router(profiles.router)
app.include_router(runs.router)
app.include_router(imports.router)
app.include_router(datasets.router)
app.include_router(dataset_evaluations.router)
app.include_router(analytics.router)


@app.get("/health")
def health():
    return {"status": "ok"}
