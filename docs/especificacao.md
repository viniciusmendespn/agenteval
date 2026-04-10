# 🧪 AgentEval — Sistema de Avaliação e Testes de Agentes de IA

## Visão Geral

O **AgentEval** é uma plataforma web voltada para usuários não técnicos que precisam validar, monitorar e melhorar a qualidade de agentes de IA em produção. O sistema permite criar casos de teste sintéticos, importar dados reais de produção (logs, traces, conversas), e avaliar automaticamente métricas de qualidade como relevância, alucinação, fidelidade e critérios customizados em linguagem natural — tudo sem exigir conhecimento de programação.

---

## Problema que Resolve

Times de produto, QA e negócio precisam garantir que agentes de IA estão respondendo corretamente, sem alucinar, dentro do tom esperado e com boa performance — mas não têm como fazer isso de forma sistemática sem depender de times técnicos. O AgentEval resolve isso com uma interface acessível, relatórios claros e integração com ferramentas de observabilidade já existentes.

---

## Perfil de Usuário

- **Primário**: Analistas de produto, QA, operações — sem conhecimento técnico profundo
- **Secundário**: Engenheiros de IA que querem automatizar avaliações e criar regressões

---

## Módulos do Sistema

### 1. Configuração do Agente

Onde o usuário conecta o agente que será avaliado.

- Cadastro via endpoint de API (URL + chave de autenticação)
- Seleção de modelo (OpenAI, Anthropic, Gemini, ou customizado)
- Definição do system prompt / persona esperada
- Teste de conexão com ping simples
- Suporte a múltiplos agentes (ex: v1 vs v2 para comparação)

---

### 2. Perfis de Avaliação (Configuração de Métricas)

O coração do sistema. O usuário define **o que significa uma boa resposta** para o seu agente.

#### Métricas Prontas (ativar/desativar com slider de limiar)
- **Relevância da resposta** — a resposta é pertinente à pergunta?
- **Fidelidade ao contexto** — o agente usou apenas o que sabia?
- **Score de alucinação** — o agente inventou informações?
- **Toxicidade** — a resposta contém conteúdo ofensivo?
- **Latência** — tempo de resposta dentro do esperado?

#### Critérios em Linguagem Natural (GEval)
O usuário descreve o comportamento esperado em texto livre:
> *"O agente nunca deve mencionar concorrentes"*
> *"Deve sempre sugerir falar com um humano quando o usuário estiver frustrado"*
> *"Deve responder sempre em português formal"*

O sistema converte automaticamente esses critérios em métricas avaliadas por LLM judge.

#### Respostas Esperadas (Golden Answers)
- Import de pares `pergunta → resposta esperada`
- Comparação semântica (não exige resposta idêntica, apenas equivalente)
- Usado para criar datasets de regressão

#### Perfis Salvos
- O usuário salva conjuntos de métricas como perfis reutilizáveis
- Ex: `Perfil Suporte ao Cliente`, `Perfil Vendas`, `Perfil RH`
- Cada perfil pode ser vinculado a um agente ou conjunto de testes

---

### 3. Casos de Teste Sintéticos

Criação manual de cenários de teste do zero.

- Editor visual de casos: pergunta, contexto opcional, resposta esperada
- Import em massa via Excel/CSV
- Biblioteca de templates por verticais (suporte, vendas, onboarding, FAQ...)
- Controle de repetição (ex: rodar o mesmo caso 10x para testar consistência)
- Organização por tags e categorias

---

### 4. Importação de Dados de Produção

Permite avaliar o que **já aconteceu** em produção, sem precisar rodar o agente novamente.

#### Upload de Arquivos
- Formatos suportados: `.json`, `.jsonl`, `.csv`, `.txt`, `.log`
- Parser inteligente que identifica automaticamente campos de pergunta, resposta, contexto e metadata
- Mapeamento manual quando o parser não reconhece o formato

#### Integração com Plataformas de Observabilidade
- LangSmith, LangFuse, Phoenix, Helicone (via API key)
- Sync automático ou importação sob demanda
- Filtros na importação: período, usuário, tags, score de confiança

#### Ingestão de Traces
- Suporte a traces completos com steps intermediários
- Visualização da cadeia de raciocínio (tool calls, retrievals, etc.)

---

### 5. Visualizador de Logs e Conversas

Interface para explorar e analisar dados importados.

- Visualizador de conversas completas com histórico
- Filtros por: data, latência, score, rating do usuário, tags
- Detecção automática de padrões problemáticos:
  - Respostas muito curtas ou evasivas
  - Recusas indevidas
  - Loops de conversa
  - Mudanças abruptas de tom
- Agrupamento semântico de perguntas similares (clustering)
- Curadoria: promover uma conversa real para caso de teste oficial com 1 clique
- Anotação manual: marcar respostas como correto / incorreto / parcial

---

### 6. Execução de Testes

Orquestração das avaliações.

- Dois modos:
  - **Sintético**: roda os casos de teste criados no módulo 3 chamando o agente ao vivo
  - **Retroativo**: avalia dados já importados sem chamar o agente novamente
- Execução individual ou em lote
- Progresso em tempo real com status por caso
- Seleção de subconjuntos (ex: "avaliar só conversas com rating negativo")
- Seleção de perfil de avaliação antes de rodar

---

### 7. Dashboard de Resultados

Visão consolidada dos resultados para tomada de decisão.

- **Score geral de qualidade** (0–100) com semáforo visual (🟢🟡🔴)
- Breakdown por métrica e por categoria de teste
- Destaque automático das respostas que falharam
- Comparação entre versões de agente (v1 vs v2)
- Histórico de execuções ao longo do tempo (evolução da qualidade)
- Drill-down: clicar em qualquer métrica para ver os casos que falharam

---

### 8. Relatórios Exportáveis

Saída acessível para stakeholders não técnicos.

- Export em PDF com linguagem simples
  - Ex: *"O agente respondeu corretamente em 87% dos casos testados"*
  - Ex: *"Em 12% das respostas, o agente usou um tom inadequado para o contexto"*
- Sugestões automáticas de melhoria geradas por IA com base nos resultados
- Compartilhamento por link ou envio por e-mail

---

## Stack Técnica Sugerida

| Camada | Tecnologia sugerida |
|---|---|
| Frontend | Next.js + Tailwind CSS |
| Backend | FastAPI (Python) |
| Avaliação | DeepEval (métricas + GEval) |
| Banco de dados | PostgreSQL + pgvector (busca semântica) |
| Filas | Celery + Redis (execução assíncrona de testes) |
| Observabilidade | LangFuse (opcional, para traces internos) |
| Auth | Clerk ou NextAuth |

---

## Fluxo Principal do Usuário
```
1. Cadastra o agente (endpoint + chave)
2. Cria ou importa casos de teste / logs de produção
3. Define um Perfil de Avaliação (métricas + critérios em texto)
4. Executa a avaliação (sintética ou retroativa)
5. Visualiza o dashboard com scores e falhas
6. Exporta relatório ou promove casos para golden dataset
```

---

## Diferenciais

- ✅ Configuração de métricas em **linguagem natural**, sem código
- ✅ Avaliação **retroativa** de dados de produção reais
- ✅ Interface acessível para **usuários não técnicos**
- ✅ **Curadoria** de logs reais como casos de teste reutilizáveis
- ✅ **Comparação de versões** de agente lado a lado
- ✅ Relatórios com **linguagem de negócio**, não técnica