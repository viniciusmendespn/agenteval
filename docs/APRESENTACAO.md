# AgentEval - Script de Apresentação

## Roteiro de demonstração (~15 minutos)

> Abra http://localhost:3000 no navegador antes de começar.

---

### 1. Dashboard - Visão Geral (2 min)

**Página:** `/` (Dashboard)

**Fala:**
> "O AgentEval é uma plataforma de avaliação contínua de agentes de IA. No dashboard, temos uma visão consolidada: total de agentes cadastrados, casos de teste, execuções realizadas, e a tendência de score ao longo do tempo."

**Mostrar:**
- Totais no topo (agentes, test cases, runs, datasets)
- Gráfico de tendência de score
- Tabela de execuções recentes com status e scores

---

### 2. Agentes Cadastrados (1 min)

**Página:** `/agents`

**Fala:**
> "Aqui cadastramos os agentes que queremos avaliar. Cada agente tem uma URL de API, configuração de request/response, e tipo de conexão. Temos três agentes configurados: duas versões do assistente de suporte e um agente de vendas. Isso nos permite comparar versões e acompanhar a evolução."

**Mostrar:**
- Lista de agentes (Suporte v1, v2, Vendas)
- Clicar em um para mostrar os campos de configuração

---

### 3. Perfis de Avaliação (2 min)

**Página:** `/profiles`

**Fala:**
> "Os perfis definem QUAIS métricas aplicar e com que rigor. Temos três perfis:"
>
> - **Completo - Suporte**: avalia relevância, alucinação, toxicidade, viés, fidelidade, latência, e 3 critérios custom em linguagem natural
> - **Segurança Rigorosa**: foco em precisão factual e segurança com thresholds apertados
> - **Rápido - Vendas**: foco em relevância e latência, sem métricas pesadas

**Mostrar:**
- Clicar no perfil "Completo - Suporte" para abrir edição
- Mostrar os sliders de threshold
- Destacar os critérios em linguagem natural (ex: "O agente deve demonstrar empatia...")
- Mostrar como cada métrica tem labels claros: "Máximo de alucinação tolerável" vs "Score mínimo para aprovação"

---

### 4. Casos de Teste (1 min)

**Página:** `/test-cases`

**Fala:**
> "Os casos de teste representam cenários reais que o agente vai enfrentar: consulta de saldo, reclamação de cobrança, cliente irritado, fraude... Cada caso tem entrada, saída esperada e contexto que alimenta as métricas de alucinação e fidelidade."

**Mostrar:**
- Lista dos 10 casos de teste
- Clicar em um para ver entrada, saída esperada e contexto

---

### 5. Execuções - Resultados ao vivo (3 min)

**Página:** `/runs`

**Fala:**
> "Aqui vemos todas as execuções realizadas. O Assistente Suporte v1 foi testado 5 vezes ao longo de 30 dias, com score evoluindo de 46% para 65%."

**Mostrar:**
- Lista de runs com scores e status
- Mostrar a run #13 como "Falhou" (demonstra tratamento de erros)
- Clicar na **Run #5** (melhor do v1)

**Na página da Run #5:**
> "A tabela mostra cada caso de teste, status de aprovação, e os scores como pills coloridas. Tudo normalizado: 100% = ótimo, independente da métrica. Métricas como 'Precisão Factual' e 'Segurança' já são invertidas automaticamente."

- Mostrar pills verdes/amarelas/vermelhas
- Usar os filtros (Aprovados / Reprovados)
- Mostrar o breakdown por métrica com radar chart

**Clicar em "Detalhes" de um caso:**
> "Na tela de detalhes, vemos a entrada, a resposta do agente formatada em markdown, e cada métrica com barra de progresso, badge de score, e o motivo explicado em português."

- Mostrar a resposta do agente renderizada em markdown
- Destacar os motivos das métricas traduzidos para PT-BR
- Mostrar a seção "Saída esperada" para comparação

---

### 6. Comparação de Runs (2 min)

**Página:** `/runs/compare`

**Fala:**
> "Podemos comparar duas execuções lado a lado para identificar regressões e melhorias."

**Mostrar:**
- Selecionar Run #1 (primeira do v1, score ~46%) vs Run #5 (última do v1, score ~65%)
- Clicar "Comparar"
- Mostrar os cards de resumo: delta de score, regressões, melhorias
- Mostrar a tabela de métricas: Run A vs Run B com variação
- Filtrar por "Melhorias" na tabela de casos

> "Isso é essencial para validar se uma mudança de prompt ou modelo realmente melhorou o agente, ou se introduziu regressões."

---

### 7. Datasets - Avaliação de Histórico (2 min)

**Página:** `/datasets`

**Fala:**
> "Nem sempre precisamos chamar o agente ao vivo. Com datasets, importamos conversas históricas de produção e avaliamos a qualidade retroativamente."

**Mostrar:**
- Dataset "Atendimento Financeiro" (8 registros)
- Dataset "Conversas de Vendas" (5 registros)
- Clicar no "Atendimento Financeiro"

**Na página do dataset:**
> "Vemos os registros com entrada e resposta real do agente. Podemos avaliar com qualquer perfil."

- Mostrar lista de avaliações já executadas
- Clicar na **Avaliação #4** (última, melhor score)

**Na avaliação:**
> "Mesma experiência das execuções: tabela com status, pills de score, e botão de detalhes."

- Clicar em "Detalhes" de um registro
- Mostrar o modal com resposta em markdown + métricas + motivos

---

### 8. Evolução Temporal (2 min)

**Página:** `/evolution`

**Fala:**
> "A tela de Evolução é onde tudo se conecta. Selecionamos um agente ou dataset e vemos a linha do tempo completa de como as métricas evoluíram."

**Mostrar - Agente "Assistente Suporte v1":**
- Selecionar o agente
- Gráfico de linhas mostrando 5 pontos com métricas subindo
- Gráfico de score geral subindo de ~46% para ~65%
- Cards: 5 avaliações, score atual, variação total positiva
- Toggle de métricas: desligar/ligar métricas individuais
- Tabela de histórico com deltas entre runs consecutivas

> "Conseguimos ver claramente que após 5 iterações de ajuste de prompt, a relevância subiu de ~55% para ~80%, e a precisão factual foi de ~60% para ~90%."

**Mostrar - Dataset "Atendimento Financeiro":**
- Trocar para o dataset
- Mesmo gráfico mas com 4 avaliações
- Mostrar a evolução das métricas de segurança

> "Para o dataset, vemos a mesma evolução. Útil quando o agente muda mas os dados de teste são fixos."

---

### 9. Encerramento (1 min)

**Fala:**
> "Recapitulando as funcionalidades do AgentEval:"
>
> 1. **Cadastro de agentes** com conexão HTTP/SSE configurável
> 2. **Perfis de avaliação** com métricas automáticas + critérios em linguagem natural
> 3. **Execução ao vivo** com avaliação por LLM judge
> 4. **Avaliação de histórico** com datasets importados
> 5. **Scores normalizados** onde 100% = ótimo, eliminando confusão
> 6. **Motivos em português** para cada métrica
> 7. **Comparação A/B** entre execuções
> 8. **Timeline de evolução** com gráficos de tendência por métrica
> 9. **Respostas em markdown** renderizadas corretamente
>
> "A plataforma permite acompanhar a qualidade de agentes de IA de forma contínua, identificando regressões antes que cheguem a produção."

---

## Dados de demo disponíveis

| Item | Quantidade | Detalhes |
|------|-----------|---------|
| Agentes | 3 | Suporte v1, Suporte v2, Vendas |
| Perfis | 3 | Completo, Segurança, Rápido |
| Casos de teste | 10 | Cenários bancários variados |
| Execuções | 13 | 5 + 4 + 3 completas + 1 failed |
| Datasets | 2 | Atendimento (8 reg) + Vendas (5 reg) |
| Avaliações dataset | 7 | 4 + 3 com evolução temporal |

## Para rodar

```bash
# Backend
cd backend
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm run dev

# Recriar dados de demo
cd backend
python seed_demo.py
```
