# AgentEval — Instruções para Claude

## O que é este projeto

Plataforma de avaliação contínua de agentes de IA. Permite testar agentes ao vivo e avaliar histórico de conversas, usando LLM como juiz das respostas.

## Stack

**Backend**: Python + FastAPI + SQLAlchemy + SQLite + DeepEval
**Frontend**: Next.js 14 + React 18 + Tailwind CSS + Recharts

## Estrutura

```
backend/app/
  main.py          — FastAPI app, CORS, migrations
  models.py        — SQLAlchemy ORM (8 tabelas)
  schemas.py       — Pydantic schemas
  database.py      — Engine SQLite / DATABASE_URL
  routers/         — agents, test_cases, profiles, runs,
                     datasets, dataset_evaluations, imports, analytics
  services/
    agent_caller.py  — Chama agentes HTTP/SSE
    evaluator.py     — DeepEval + compute_passed + tradução PT-BR
    judge_llm.py     — Custom Azure OpenAI judge
    importer.py      — Parse JSON/JSONL/GZ
    field_mapper.py  — IA sugere mapeamento de campos

frontend/src/
  app/             — Páginas Next.js App Router
  components/      — Sidebar, ScoreDetail, ProfileForm, DeleteButton
  lib/
    api.ts         — Tipos TypeScript + todas as funções fetch
    metrics.ts     — Normalização de scores (100% = ótimo)
    cn.ts          — Utility clsx
```

## Regras críticas do domínio

### Métricas com direção invertida
`hallucination`, `toxicity`, `bias` são **lower-is-better**:
- Score 0.0 do DeepEval = zero problema = **ótimo**
- Score 1.0 = problema grave = **péssimo**

A lib `frontend/src/lib/metrics.ts` normaliza TUDO para 100% = ótimo antes de exibir.
O backend usa `LOWER_IS_BETTER = {"hallucination", "toxicity", "bias"}` em `evaluator.py`.

Ao calcular `passed`:
```python
# Em runs.py e dataset_evaluations.py
if metric in LOWER_IS_BETTER:
    passed = score <= threshold   # menor = melhor
else:
    passed = score >= threshold   # maior = melhor
```

### Score geral
O `overall_score` de runs/avaliações é a **média bruta** de todos os scores individuais (0-1).
NÃO é normalizado — a normalização só acontece no frontend para exibição.

### Tradução de motivos
`evaluator.py/_translate_reasons()` traduz reasons para PT-BR via LLM após cada avaliação.
Fallback: OpenAI direto se judge customizado falhar.

## Como rodar

```bash
# Backend
cd backend
cp .env.example .env   # configurar JUDGE_BASE_URL, JUDGE_API_KEY, JUDGE_MODEL
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Seed de dados demo
cd backend
python seed_demo.py
```

## Variáveis de ambiente (backend/.env)

```ini
JUDGE_BASE_URL=https://fusion-llm.brq.com       # endpoint Azure OpenAI compatível
JUDGE_API_KEY=sua-chave
JUDGE_MODEL=gpt-5.2
JUDGE_API_VERSION=2025-03-01-preview
DATABASE_URL=sqlite:///./agenteval.db            # opcional, default SQLite
OPENAI_API_KEY=sk-...                            # fallback se JUDGE_BASE_URL não definido
```

## Convenções de código

- **Backend**: snake_case, type hints em todas as funções
- **Frontend**: componentes em PascalCase, funções e variáveis camelCase
- **API**: prefixo de rota no router (`prefix="/agents"`), não repetir no path
- **Background tasks**: execuções e avaliações rodam em `BackgroundTasks` do FastAPI
- **Scores**: sempre armazenar como float 0-1 no banco; normalizar só no display

## Páginas do frontend

| Rota | Propósito |
|------|-----------|
| `/` | Dashboard com KPIs e tendências |
| `/evolution` | Timeline de evolução por agente ou dataset |
| `/runs/compare` | Comparação A/B entre execuções |
| `/agents` | CRUD de agentes |
| `/profiles` | CRUD de perfis de avaliação |
| `/test-cases` | CRUD de casos de teste |
| `/runs` | Histórico de execuções |
| `/runs/[id]` | Detalhes da execução + tabela de resultados |
| `/runs/[id]/results/[tcId]` | Detalhe de um resultado com markdown + métricas |
| `/datasets` | Lista de datasets |
| `/datasets/import` | Wizard de importação em 4 etapas |
| `/datasets/[id]` | Registros + avaliações do dataset |
| `/datasets/[id]/evaluations/[evalId]` | Resultados de avaliação de dataset |
| `/evaluations` | Todas avaliações de datasets |

## Endpoints da API

```
GET/POST  /agents/
GET       /agents/test-connection
GET       /agents/preview
GET/PUT/DELETE /agents/{id}

GET/POST  /test-cases/
GET/PUT/DELETE /test-cases/{id}

GET/POST  /profiles/
GET/PUT/DELETE /profiles/{id}

GET/POST  /runs/
GET       /runs/{id}

GET/POST  /datasets/
GET/DELETE /datasets/{id}
GET/POST  /datasets/{id}/evaluations/
GET       /datasets/{id}/evaluations/{evalId}

POST      /imports/analyze
POST      /imports/upload
POST      /imports/preview
POST      /imports/confirm

GET       /analytics/overview
GET       /analytics/dataset-evaluations
GET       /analytics/runs/{id}/breakdown
POST      /analytics/runs/compare
GET       /analytics/timeline/agents/{id}
GET       /analytics/timeline/datasets/{id}
GET       /health
```

## Pontos de atenção

1. **Migração incremental**: `main.py/_migrate()` adiciona colunas novas sem dropar a tabela
2. **SSE**: `agent_caller.py` suporta Server-Sent Events para agentes streaming
3. **Import**: suporte a JSON, JSONL, JSONL.GZ; field_mapper.py usa LLM para sugerir mapeamento
4. **Múltiplas instâncias Python no Windows**: usar `taskkill //F //IM python.exe` para matar processos anteriores antes de subir novo servidor
