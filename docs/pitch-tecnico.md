# AgentEval — Pitch Técnico

## Contexto

Agentes de IA em produção enfrentam um problema de observabilidade que sistemas tradicionais não resolvem: a qualidade de uma resposta em linguagem natural não é binária, não tem schema fixo e não pode ser validada com assert simples.

O AgentEval resolve isso com uma abordagem de **LLM-as-a-Judge**: usa um modelo de linguagem para avaliar as saídas de outro modelo, de forma automática, consistente e auditável.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│         Next.js 14 + React 18 + Tailwind            │
│         Recharts + React Markdown + Lucide          │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                    Backend                           │
│              FastAPI + Uvicorn ASGI                  │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Routers │  │ Services │  │  Background Tasks │   │
│  │ 8 módulos│  │agent_caller│ │  (runs, evals)  │   │
│  │         │  │evaluator  │  │                  │   │
│  │         │  │judge_llm  │  │                  │   │
│  │         │  │importer   │  │                  │   │
│  └────┬────┘  └─────┬────┘  └────────┬─────────┘   │
│       │             │                 │              │
│  ┌────▼─────────────▼─────────────────▼──────────┐  │
│  │         SQLAlchemy ORM                        │  │
│  │         SQLite (dev) / PostgreSQL (prod)      │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              LLM Judge (Azure OpenAI)                │
│         DeepEval framework + Custom Judge            │
│         gpt-4 / gpt-4o / qualquer modelo OpenAI API │
└──────────────────────────────────────────────────────┘
```

---

## Stack Detalhada

### Backend

| Componente | Tecnologia | Versão |
|-----------|-----------|--------|
| Framework API | FastAPI | latest |
| Servidor | Uvicorn (ASGI) | latest |
| ORM | SQLAlchemy | latest |
| Banco (dev) | SQLite | built-in |
| Validação | Pydantic v2 | latest |
| Avaliação | DeepEval | latest |
| Cliente HTTP | httpx | latest |
| Upload | python-multipart | latest |
| IA Judge | Azure OpenAI SDK | 2024+ |

### Frontend

| Componente | Tecnologia | Versão |
|-----------|-----------|--------|
| Framework | Next.js App Router | 14.2.0 |
| UI | React | 18 |
| Estilo | Tailwind CSS | 3 |
| Gráficos | Recharts | 3.8.1 |
| Markdown | React Markdown + Remark GFM | latest |
| Ícones | Lucide React | latest |
| Notificações | Sonner | latest |
| Tabelas | TanStack React Table | 8 |

---

## Modelo de Dados

```
agents                    evaluation_profiles
  id                        id
  name                      name
  url                       use_relevancy / relevancy_threshold
  api_key                   use_hallucination / hallucination_threshold
  connection_type           use_toxicity / toxicity_threshold
  request_body              use_bias / bias_threshold
  output_field              use_faithfulness / faithfulness_threshold
                            use_latency / latency_threshold_ms
                            criteria[]  ← GEval custom


test_cases                test_runs                test_results
  id                        id                       id
  title                     agent_id ─────────────►  run_id
  input                     profile_id               test_case_id
  expected_output           test_case_ids[]          actual_output
  context[]                 status                   scores{}
  tags                      overall_score            reasons{}
                            created_at               passed
                            completed_at             error


datasets                  dataset_evaluations      dataset_results
  id                        id                       id
  name                      dataset_id               evaluation_id
  description               profile_id               record_id
                            status                   scores{}
dataset_records             overall_score            reasons{}
  id                        created_at               passed
  dataset_id                completed_at             error
  input
  actual_output
  context[]
```

---

## Pipeline de Avaliação

### Teste ao Vivo

```
1. POST /runs/ {agent_id, profile_id, test_case_ids}
   └─ Cria TestRun (status=running)
   └─ Dispara BackgroundTask

2. Para cada TestCase:
   a. agent_caller.call_agent()
      ├─ HTTP POST com template body {"message": "{{message}}"}
      ├─ Header: Authorization: Bearer {api_key}
      ├─ Extrai campo via dot-notation (ex: "data.response.text")
      └─ SSE: acumula chunks até fechamento do stream
   
   b. evaluator.evaluate_response()
      ├─ Monta LLMTestCase (input, actual_output, context, retrieval_context)
      ├─ Para cada métrica ativada no perfil:
      │   ├─ AnswerRelevancyMetric (threshold)
      │   ├─ HallucinationMetric (threshold) *requer context
      │   ├─ ToxicityMetric (threshold)
      │   ├─ BiasMetric (threshold)
      │   ├─ FaithfulnessMetric (threshold) *requer context
      │   ├─ Latência (cálculo próprio, degradação linear)
      │   └─ GEval (critérios customizados)
      ├─ _translate_reasons() → LLM traduz para PT-BR
      └─ Retorna (scores: dict[str,float], reasons: dict[str,str])
   
   c. compute_passed()
      ├─ LOWER_IS_BETTER = {hallucination, toxicity, bias}
      ├─ Lower-is-better: score <= threshold → pass
      └─ Higher-is-better: score >= threshold → pass
   
   d. Persiste TestResult no banco

3. overall_score = média de todos scores (0-1)
4. Run marcada como completed
```

### Avaliação de Histórico

```
Mesmo pipeline, mas:
- Sem step 2a (actual_output já existe no DatasetRecord)
- Sem medição de latência (não há chamada ao agente)
- Input vem de DatasetRecord, não de TestCase
```

---

## LLM Judge

```python
# judge_llm.py — Adapter entre DeepEval e Azure OpenAI
class CustomJudgeLLM(DeepEvalBaseLLM):
    def generate(self, prompt, schema=None):
        if schema:  # Structured output
            return client.beta.chat.completions.parse(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                response_format=schema,
            )
        return client.chat.completions.create(...)
```

DeepEval gerencia internamente os prompts de cada métrica. O judge customizado só precisa expor `generate()` e `a_generate()`.

**Configuração via env:**
```ini
JUDGE_BASE_URL=https://fusion-llm.brq.com   # qualquer endpoint OpenAI-compatible
JUDGE_API_KEY=...
JUDGE_MODEL=gpt-5.2
JUDGE_API_VERSION=2025-03-01-preview
```

---

## Normalização de Métricas no Frontend

O DeepEval retorna scores onde a semântica varia por métrica. No frontend, `lib/metrics.ts` padroniza:

```typescript
// 100% = ótimo sempre, independente da métrica
const METRIC_MAP = {
  hallucination: { invertScore: true, label: "Precisão Factual" },
  toxicity:      { invertScore: true, label: "Segurança" },
  bias:          { invertScore: true, label: "Imparcialidade" },
  relevancy:     { invertScore: false, label: "Relevância" },
  // ...
}

function normalizeScore(key: string, rawScore: number): number {
  const info = getMetricInfo(key)
  const pct = Math.round(rawScore * 100)
  return info.invertScore ? 100 - pct : pct
}
```

Essa camada de abstração garante que **toda a UI** mostra scores no mesmo sentido, eliminando ambiguidade.

---

## Importação de Datasets

```
Upload (JSON / JSONL / JSONL.GZ)
         │
         ▼
  importer.py
  ├─ Detecta formato
  ├─ Extrai sample (primeiros 5 registros)
  └─ Mapeia todos os caminhos do JSON

         │
         ▼
  field_mapper.py (LLM)
  ├─ Recebe sample + todos os paths
  └─ Sugere: input_path, output_path, context_paths

         │
         ▼
  Preview (frontend mostra mapeamento)

         │
         ▼
  /imports/confirm
  └─ Cria Dataset + DatasetRecord em batch
```

---

## Analytics e Timeline

O endpoint `/analytics/timeline/agents/{id}` agrega:
- Todos os runs completos do agente em ordem cronológica
- Para cada run: média por métrica, taxa de aprovação, score geral
- Métricas lower-is-better são **invertidas no backend** antes de retornar (para timeline consistente)

O frontend usa Recharts `LineChart` com múltiplas `Line` (uma por métrica) + toggle de visibilidade.

---

## Extensibilidade

### Adicionar nova métrica
1. Criar classe que estende `BaseMetric` do DeepEval (ou implementar cálculo próprio)
2. Adicionar flag `use_X` + threshold em `models.py` e `schemas.py`
3. Rodar migration manual ou via `_migrate()` em `main.py`
4. Plugar em `evaluate_response()` com a mesma assinatura dos outros
5. Se lower-is-better: adicionar ao set `LOWER_IS_BETTER`
6. Adicionar entry em `metrics.ts` no frontend

### Adicionar novo tipo de agente
Atualmente suportados: HTTP POST e SSE. Para adicionar WebSocket ou outro protocolo:
1. Implementar handler em `agent_caller.py`
2. Adicionar opção no select de `connection_type`
3. Adicionar ao enum de `AgentCreate` schema

### Troca de banco
Basta alterar `DATABASE_URL` no `.env`. O SQLAlchemy abstrai o dialeto.
Para produção, recomendado PostgreSQL:
```ini
DATABASE_URL=postgresql://user:pass@host:5432/agenteval
```

---

## Segurança

- API keys de agentes armazenadas em texto simples no SQLite atual
- **Recomendação para produção**: criptografar com KMS ou usar secrets manager
- CORS configurado para `localhost:3000` por padrão — ajustar para domínio real
- Sem autenticação implementada — adicionar OAuth2/JWT antes de expor externamente
- Uploads de arquivo validados por extensão (.json, .jsonl, .gz); adicionar validação de MIME type

---

## Roadmap de Produção (não implementado ainda)

Ver `docs/roadmap.md` para lista completa.

Principais itens para produção:
1. Autenticação (OAuth2 / SSO)
2. Multi-tenancy (isolamento por empresa/equipe)
3. PostgreSQL em vez de SQLite
4. Alertas via webhook quando score cai abaixo do threshold
5. Rate limiting na API
6. Métricas de infra (Prometheus)
