# AgentEval — Roadmap de Melhorias

> Visão de onde a plataforma pode chegar. Organizado em ondas de entrega.

---

## Onda 1 — Estabilidade e Produção (1-2 meses)

Transformar o MVP em uma solução pronta para uso real em times e empresas.

### 1.1 Autenticação e Autorização
- Login com usuário/senha (JWT)
- OAuth2 / SSO (Google, Microsoft, Okta)
- Controle de acesso por papel: Admin, Avaliador, Leitor
- **Por que**: hoje qualquer pessoa com acesso à URL pode ver e modificar tudo

### 1.2 Multi-tenancy
- Isolamento por organização (workspace)
- Usuários pertencem a um ou mais workspaces
- Dados completamente separados entre organizações
- **Por que**: permite oferecer como SaaS ou uso interno por múltiplos times

### 1.3 Banco de Dados para Produção
- Migração de SQLite → PostgreSQL
- Migrations versionadas com Alembic
- Connection pooling (SQLAlchemy + asyncpg)
- Backup automatizado
- **Por que**: SQLite não suporta escrita concorrente de múltiplos workers

### 1.4 Infraestrutura de Fila
- Celery + Redis para execuções assíncronas
- Substituir BackgroundTasks do FastAPI (limitado a 1 worker)
- Retry automático em caso de falha do agente ou do judge
- Prioridade de filas (execuções urgentes vs batch)
- **Por que**: hoje uma falha do servidor cancela execuções em andamento

### 1.5 Alertas e Notificações
- Webhook configurável por perfil
- Disparo quando score cai abaixo do threshold definido
- Integração nativa: Slack, Teams, e-mail
- Digest diário/semanal com resumo de qualidade
- **Por que**: monitoramento só tem valor se alerta quando algo errar

---

## Onda 2 — Experiência e Produtividade (2-4 meses)

Tornar a ferramenta mais poderosa e fácil de usar no dia a dia.

### 2.1 Execução Paralela de Casos
- Rodar múltiplos casos de teste em paralelo (asyncio)
- Configurável: N workers por execução
- Estimativa de tempo antes de iniciar
- **Impacto**: runs de 100 casos passariam de 30min para ~5min

### 2.2 Versionamento de Agentes
- Snapshots de configuração do agente (URL, body, prompt)
- Comparação automática entre versões
- Tag semântica: v1.0, v1.1-hotfix, v2.0-beta
- **Por que**: hoje não há rastreabilidade de qual configuração gerou qual resultado

### 2.3 Importação Expandida
- Suporte a CSV
- Suporte a Parquet
- Integração direta com S3/GCS/Azure Blob
- Webhook para receber dados em tempo real (ingestão contínua)
- **Por que**: datasets reais vêm de fontes diversas, não só JSON manual

### 2.4 Editor de Casos de Teste em Bulk
- Import de casos via CSV/JSON
- Editor de tabela inline (tipo planilha)
- Duplicar e modificar casos existentes
- Geração de casos com IA: "gere 10 variações deste cenário"
- **Por que**: criar 100+ casos manualmente é inviável hoje

### 2.5 Relatórios Exportáveis
- Export de resultados para PDF com gráficos
- Export para CSV/Excel para análise ad-hoc
- Relatório de auditoria: quem avaliou o quê, quando, com qual resultado
- **Por que**: equipes precisam apresentar resultados para stakeholders

### 2.6 Histórico de Motivos Agregados
- Agrupar reasons similares para identificar padrões recorrentes
- "85% das reprovações de Relevância têm a mesma causa raiz"
- Clustering de explicações com LLM
- **Por que**: hoje os motivos são por caso individual, sem visão agregada

---

## Onda 3 — Inteligência e Automação (4-8 meses)

Fazer a plataforma gerar insights e agir de forma autônoma.

### 3.1 Diagnóstico Automático com IA
- Análise automática de padrões de falha após cada run
- "Os 3 principais problemas desta execução foram..."
- Sugestões de melhoria de prompt baseadas nos erros encontrados
- **Por que**: hoje o usuário precisa interpretar os dados manualmente

### 3.2 Geração de Casos de Teste com IA
- Input: descrição do agente + exemplos de conversas reais
- Output: bateria de casos de teste cobrindo edge cases, casos negativos, variações
- Cobertura de categorias: feliz, borda, adversarial, ambíguo
- **Por que**: criar casos de teste de qualidade é o maior gargalo de adoção

### 3.3 Avaliação Contínua em Produção
- SDK leve para instrumentar o agente em produção
- Sample de conversas reais: avaliar X% do tráfego automaticamente
- Dashboard de qualidade em tempo real (não batch)
- Detecção de drift: alerta quando distribuição de scores muda
- **Por que**: hoje só avalia quando o usuário solicita — não monitora produção

### 3.4 A/B Testing Nativo
- Distribuir tráfego entre versões do agente (ex: 50/50)
- Avaliar automaticamente ambas as versões
- Análise estatística: diferença é significativa? (p-value, confidence interval)
- Recomendação automática: "versão B é estatisticamente melhor em Relevância"
- **Por que**: hoje a comparação é manual e sem significância estatística

### 3.5 Regression Guard (CI/CD Integration)
- CLI/API para rodar avaliação em pipeline de CI/CD
- `agenteval run --profile prod --fail-below 0.80`
- GitHub Actions, GitLab CI, Azure DevOps nativos
- Bloquear deploy automaticamente se score cair
- **Por que**: validação de qualidade deve ser parte do ciclo de desenvolvimento

### 3.6 Golden Dataset
- Marcar casos de teste como "golden" (conjunto canônico de referência)
- Comparar automaticamente toda nova versão contra o golden dataset
- Score de regressão: % do golden que passou vs versão anterior
- **Por que**: permite baseline estável para comparação ao longo do tempo

---

## Onda 4 — Escala e Ecossistema (8-18 meses)

Transformar em plataforma de referência para avaliação de IA.

### 4.1 Marketplace de Perfis e Critérios
- Biblioteca pública de perfis por setor (bancário, saúde, varejo, RH)
- Compartilhamento de critérios GEval entre organizações
- Perfis certificados por especialistas do setor
- **Por que**: cada empresa reinventa as mesmas métricas; melhor compartilhar

### 4.2 Suporte Multi-Modelo de Judge
- Configurar diferentes judges para diferentes métricas
- Ex: toxicidade com modelo especializado, relevância com GPT-4o
- Comparação entre judges: quanto os modelos concordam?
- **Por que**: nenhum modelo é ótimo para todas as métricas

### 4.3 Avaliação Multimodal
- Suporte a agentes com entrada/saída de imagem
- Avaliação de qualidade de imagens geradas
- Transcrição e avaliação de áudio (agentes de voz)
- **Por que**: agentes modernos são multimodais

### 4.4 Benchmarks Públicos
- Integração com benchmarks estabelecidos (MMLU, HumanEval, BIG-Bench)
- Posicionamento do agente vs modelos conhecidos
- Score relativo: "seu agente está no percentil 70 vs GPT-4 baseline"
- **Por que**: clientes querem saber como seu agente se compara ao mercado

### 4.5 SDK Multi-linguagem
- SDK Python (pip install agenteval)
- SDK TypeScript/Node.js
- SDK Java
- Permite integrar avaliação diretamente no código do agente
- **Por que**: reduz o atrito de adoção em times de engenharia

### 4.6 Plataforma de Dados de Qualidade
- Federar dados de avaliação entre organizações (com consentimento)
- Modelos de benchmark treinados em dados reais de avaliação
- Predição de qualidade sem chamar o judge (modelo leve, rápido)
- **Por que**: com dados suficientes, é possível avaliar sem LLM judge em 80% dos casos

---

## Resumo Visual

```
Hoje (MVP)          Onda 1              Onda 2              Onda 3              Onda 4
─────────────       ─────────────       ─────────────       ─────────────       ─────────────
✅ Avaliação        🔐 Auth/SSO         ⚡ Paralelo          🤖 IA Diagnóstico   🌐 Marketplace
   ao vivo          🏢 Multi-tenant     📦 Import CSV       🧪 Geração casos    📡 SDK nativo
✅ Avaliação        🐘 PostgreSQL       📄 Relatórios        🔄 CI/CD Guard      🎯 Benchmarks
   histórica        📢 Alertas          📊 Bulk editor       📈 A/B Testing      🎙️ Multimodal
✅ 6 métricas       🔁 Filas/Celery     🔖 Versioning        ⚡ Prod monitor     🏆 Rankings
✅ GEval custom
✅ Timeline
✅ Comparação A/B
✅ Import JSON
✅ Dashboard
```

---

## Impacto Esperado por Onda

| Onda | Usuário beneficiado | Principal ganho |
|------|-------------------|----------------|
| 1 | Times de engenharia | Confiabilidade em produção |
| 2 | Analistas de qualidade | Produtividade 5x |
| 3 | Gestores de produto | Decisões baseadas em dados |
| 4 | Toda a indústria | Padrão de qualidade para agentes IA |

---

## O Maior Salto Potencial

**Avaliação Contínua em Produção (Onda 3.3)** combinada com **Geração de Casos com IA (Onda 3.2)** cria um ciclo virtuoso:

```
Conversas de produção
         │
         ▼
  Avaliação automática
  (sample de 10% do tráfego)
         │
         ▼
  Identificar padrões de falha
         │
         ▼
  IA gera casos de teste
  baseados nos erros reais
         │
         ▼
  Casos entram na suíte de regressão
         │
         ▼
  Próxima versão do agente
  é validada antes do deploy
         │
         └──── ciclo se repete
```

Esse loop fecha o ciclo de melhoria contínua de agentes de IA, que hoje é manual, lento e dependente de expertise humana.
