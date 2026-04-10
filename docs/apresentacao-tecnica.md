# AgentEval — Apresentação Técnica

## Visão Geral

AgentEval é uma plataforma de avaliação contínua de agentes de IA construída com uma arquitetura moderna de aplicação web full-stack. A solução resolve o problema de observabilidade de qualidade em sistemas conversacionais de IA usando a técnica de **LLM-as-a-Judge** — um modelo de linguagem avalia a saída de outro modelo de forma automatizada.

---

## 1. Arquitetura do Sistema

### Visão de Alto Nível

```
┌──────────────────────────────────────────────────────────────────┐
│                        Usuário / Browser                         │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼─────────────────────────────────────┐
│                  FRONTEND — Next.js 14                           │
│                                                                  │
│  App Router (SSR/CSR híbrido)                                    │
│  ├─ Server Components: layout, navegação                         │
│  ├─ Client Components: formulários, gráficos, polling            │
│  └─ Tailwind CSS — design system utilitário                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST + JSON (fetch, no-store)
┌────────────────────────────▼─────────────────────────────────────┐
│                  BACKEND — FastAPI (Python)                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Routers    │  │   Services   │  │   Background Tasks     │ │
│  │  (8 módulos) │  │              │  │                        │ │
│  │              │  │ agent_caller │  │  _execute_run()        │ │
│  │  /agents     │  │ evaluator    │  │  _execute_evaluation() │ │
│  │  /test-cases │  │ judge_llm    │  │                        │ │
│  │  /profiles   │  │ importer     │  │  (async, não bloqueia) │ │
│  │  /runs       │  │ field_mapper │  │                        │ │
│  │  /datasets   │  └──────┬───────┘  └────────────────────────┘ │
│  │  /imports    │         │                                      │
│  │  /analytics  │         │                                      │
│  └──────┬───────┘         │                                      │
│         │                 │                                      │
│  ┌──────▼─────────────────▼──────────────────────────────────┐  │
│  │                  SQLAlchemy ORM                           │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                    │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │          SQLite (dev) / PostgreSQL (prod)                 │  │
│  │          8 tabelas, relacionamentos FK                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
┌─────────▼──────┐  ┌────────▼───────┐  ┌──────▼──────────────┐
│ Agente Testado │  │  LLM Judge     │  │  LLM Field Mapper   │
│ (HTTP / SSE)   │  │  (Azure OpenAI │  │  (sugestão de       │
│                │  │   + DeepEval)  │  │   mapeamento)       │
└────────────────┘  └────────────────┘  └─────────────────────┘
```

---

## 2. Stack Tecnológica Detalhada

### Backend (Python)

**FastAPI**
- Framework ASGI moderno, alta performance
- Validação automática via Pydantic v2
- OpenAPI/Swagger gerado automaticamente
- `BackgroundTasks` para execuções assíncronas sem bloquear a API

**SQLAlchemy + SQLite/PostgreSQL**
- ORM com modelos declarativos
- Migration incremental via `ALTER TABLE` (sem Alembic, por design de simplicidade)
- Suporte a qualquer banco SQL via `DATABASE_URL`

**DeepEval**
- Framework open-source de avaliação de LLMs
- Métricas built-in: `AnswerRelevancyMetric`, `HallucinationMetric`, `ToxicityMetric`, `BiasMetric`, `FaithfulnessMetric`
- `GEval`: avaliação por critérios customizados em linguagem natural
- Suporte a modelos customizados via `DeepEvalBaseLLM`

**Azure OpenAI SDK**
- Cliente para o LLM judge
- Suporte a structured output (`beta.chat.completions.parse`)
- Compatível com qualquer endpoint OpenAI-API-compatible

**httpx**
- Cliente HTTP async para chamadas aos agentes
- Suporte nativo a Server-Sent Events (SSE)

### Frontend (TypeScript/React)

**Next.js 14 com App Router**
- Roteamento baseado em sistema de arquivos
- Componentes Server e Client diferenciados
- Sem SSR de dados — todo fetch é client-side (`"use client"`) para suportar polling em tempo real

**Tailwind CSS**
- Design system utilitário, sem componentes UI externos
- Plugin `@tailwindcss/typography` para renderização de markdown

**Recharts**
- LineChart para timelines de evolução
- RadarChart para breakdown de métricas
- Totalmente baseado em SVG, responsivo

**React Markdown + Remark GFM**
- Renderização de respostas dos agentes em markdown
- Suporte a tabelas, listas, negrito, código, links

**lib/metrics.ts** *(camada de abstração proprietária)*
- Normaliza todos os scores para escala 100% = ótimo
- Gerencia inversão semântica de métricas lower-is-better
- Fonte única de verdade para labels, cores e direção de métricas

---

## 3. Fluxo de Dados — Teste ao Vivo

```
Usuário seleciona: Agente + Perfil + Casos de Teste
                 │
                 ▼
POST /runs/ → Cria TestRun (status=running)
            → Dispara BackgroundTask
                 │
                 ▼ (background, paralelo ao retorno da API)
Para cada TestCase:
    │
    ├─ 1. agent_caller.call_agent()
    │      ├─ Monta request body com template {{message}}
    │      ├─ Header: Authorization: Bearer {api_key}
    │      ├─ HTTP: POST → extrai campo por dot-notation
    │      └─ SSE: acumula chunks → texto final
    │
    ├─ 2. evaluator.evaluate_response()
    │      ├─ LLMTestCase(input, output, context, retrieval_context)
    │      ├─ Executa métricas ativadas no perfil
    │      ├─ _translate_reasons() → PT-BR via LLM
    │      └─ compute_passed() com direção por métrica
    │
    └─ 3. Persiste TestResult (scores, reasons, passed)

Após todos os casos:
    └─ overall_score = média de todos scores
    └─ status = "completed"

Frontend polling a cada 2s:
    GET /runs/{id} → exibe progresso em tempo real
```

---

## 4. Sistema de Métricas

### Métricas Automáticas (DeepEval)

| Métrica | Algoritmo | Requisito | Direção |
|---------|-----------|-----------|---------|
| Relevância | Cosine similarity semântica | Input + Output | Higher |
| Precisão Factual | Cross-check Output vs Context | Context obrigatório | Lower |
| Segurança | Classificação de toxicidade | Output | Lower |
| Imparcialidade | Detecção de viés | Output | Lower |
| Fidelidade | NLI: afirmações suportadas | Context obrigatório | Higher |

### Métrica de Latência (Própria)

```python
if response_time_ms <= threshold_ms:
    score = 1.0
else:
    # Degradação linear: 2x o limite = score 0
    score = max(0.0, 1.0 - (response_time - threshold) / threshold)
```

### Critérios GEval (Customizados)

```
"O agente nunca deve mencionar concorrentes pelo nome"
           │
           ▼ DeepEval GEval
           │
LLM Judge avalia: input + output vs critério
           │
           ▼
score: 0.0 a 1.0 + reason em texto
```

Cada critério vira uma métrica independente (`criterion_0`, `criterion_1`, ...) — sem limite de quantidade.

### Normalização Frontend

```
Score bruto DeepEval        Score exibido na UI
─────────────────────────────────────────────
hallucination: 0.0    →     Precisão Factual: 100% 🟢
hallucination: 0.5    →     Precisão Factual: 50%  🟡
hallucination: 1.0    →     Precisão Factual: 0%   🔴
relevancy: 0.85       →     Relevância: 85%         🟢
```

---

## 5. Importação de Datasets

### Formatos Suportados

- `JSON` — array de objetos ou objeto único
- `JSONL` — um objeto por linha
- `JSONL.GZ` — JSONL comprimido com gzip

### Pipeline de Importação

```
Upload do arquivo
      │
      ▼
importer.py
  ├─ Detecta formato (extensão + magic bytes)
  ├─ Parseia sem carregar tudo em memória
  ├─ Extrai sample (primeiros 5 registros)
  └─ Lista todos os caminhos JSON disponíveis
        ex: ["data.input", "data.response", "metadata.context[0]"]

      │
      ▼
field_mapper.py (LLM)
  ├─ Prompt: "dado este sample e estes paths, qual é input/output/context?"
  └─ Retorna sugestão + raciocínio

      │
      ▼
Frontend mostra preview do mapeamento
  └─ Usuário confirma ou ajusta

      │
      ▼
/imports/confirm
  └─ Cria Dataset + DatasetRecord em batch (insert eficiente)
```

---

## 6. Analytics e Visualizações

### Endpoints de Análise

| Endpoint | O que faz |
|----------|-----------|
| `/analytics/overview` | KPIs globais: totais, score médio, pass rate, tendência |
| `/analytics/runs/{id}/breakdown` | Por run: avg/min/max por métrica, passed_count |
| `/analytics/runs/compare` | Diff entre 2 runs: regressions, improvements, delta |
| `/analytics/timeline/agents/{id}` | Evolução histórica de um agente (todos runs) |
| `/analytics/timeline/datasets/{id}` | Evolução histórica de um dataset |

### Gráficos no Frontend

**Dashboard**
- `AreaChart` ou `LineChart` — tendência de score (últimas 15 execuções)
- Contadores com variação absoluta

**Execução Individual**
- `RadarChart` — breakdown de métricas em forma de radar
- Barras de progresso por métrica com passed_count/total

**Evolução**
- `LineChart` multi-série — uma linha por métrica ao longo do tempo
- Toggle de visibilidade por métrica (filtro interativo)
- Tabela de histórico com deltas entre avaliações consecutivas

---

## 7. Conectividade com Agentes

### HTTP (Padrão)

```
POST {agent_url}
Headers:
  Authorization: Bearer {api_key}
  Content-Type: application/json

Body (template customizável):
  {"message": "{{message}}"}  →  {"message": "Texto do caso de teste"}

Response:
  Extrai campo via dot-notation: "response" → obj["response"]
                                 "data.text" → obj["data"]["text"]
```

### SSE (Server-Sent Events)

```
GET/POST {agent_url}
Headers: Authorization, Accept: text/event-stream

Recebe stream de eventos:
  data: {"token": "Ol"}
  data: {"token": "á, "}
  data: {"token": "como posso ajudar?"}
  data: [DONE]

Acumula tokens → texto final
```

Suporte a SSE permite avaliar agentes que respondem em streaming (como ChatGPT, Claude, etc.) sem modificação no agente.

---

## 8. Diferenciais de Implementação

**Migração sem downtime**
```python
# main.py — adiciona colunas novas sem perder dados
def _migrate():
    existing = {c["name"] for c in insp.get_columns("evaluation_profiles")}
    for col, definition in new_cols:
        if col not in existing:
            conn.execute(text(f"ALTER TABLE ... ADD COLUMN {col} {definition}"))
```

**Compute_passed robusto**
```python
# Respeita direção de cada métrica
LOWER_IS_BETTER = {"hallucination", "toxicity", "bias"}
for metric, score in scores.items():
    threshold = thresholds.get(metric, 0.5)
    if metric in LOWER_IS_BETTER:
        if score > threshold: return False  # falhou (muito problema)
    else:
        if score < threshold: return False  # falhou (pouca qualidade)
return True
```

**Polling em tempo real sem WebSocket**
```typescript
// Frontend — polling simples funciona bem para este caso
timer = setInterval(fetchRun, 2000)  // atualiza a cada 2s
if (r.status !== "running") clearInterval(timer)  // para quando completa
```

**Abstração de métricas centralizada**
```typescript
// lib/metrics.ts — única fonte de verdade
// Toda tela importa getMetricInfo(), normalizeScore(), scoreColorClasses()
// Garante consistência visual em 100% da UI
```

---

## 9. Como Contribuir / Estender

### Adicionar nova métrica

1. **Backend** — `evaluator.py`:
   ```python
   from deepeval.metrics import MinhaMetrica
   if use_minha_metrica:
       metric = MinhaMetrica(threshold=X)
       metric.measure(test_case)
       scores["minha_metrica"] = metric.score
       reasons["minha_metrica"] = metric.reason
   ```

2. **Banco** — `models.py` + `_migrate()`:
   ```python
   ("use_minha_metrica", "BOOLEAN DEFAULT 0 NOT NULL"),
   ("minha_metrica_threshold", "FLOAT DEFAULT 0.5 NOT NULL"),
   ```

3. **Frontend** — `lib/metrics.ts`:
   ```typescript
   minha_metrica: {
     label: "Minha Métrica",
     shortLabel: "Métrica",
     invertScore: false,  // ou true se lower-is-better
   }
   ```

### Trocar o banco

```ini
# .env
DATABASE_URL=postgresql://user:pass@host/agenteval
```

### Deploy em produção

```dockerfile
# Backend
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Frontend
FROM node:20-alpine
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

---

## 10. Métricas do Sistema

### Performance
- Cada avaliação via LLM: 2-8 segundos por métrica (depende do modelo)
- Run com 10 casos e 5 métricas: ~2-5 minutos (paralelo futuro)
- Polling a cada 2s com payloads leves (~5KB): sem impacto perceptível

### Escalabilidade Atual
- SQLite suporta bem até ~100 usuários simultâneos e milhares de avaliações
- Gargalo principal: latência do LLM judge (não do banco ou API)
- Para escala: PostgreSQL + Celery + Redis (ver Roadmap)
