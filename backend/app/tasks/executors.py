import logging
import time
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import (
    Agent, EvaluationProfile, TestCase, TestRun, TestResult,
    Dataset, DatasetRecord, DatasetEvaluation, DatasetResult, Evaluation, Guardrail,
    Simulation, SimulationMessage,
)
from ..services.agent_caller import call_agent
from ..services.evaluator import evaluate_response, compute_passed, LOWER_IS_BETTER
from ..services.judge_llm import resolve_judge, resolve_task_judge, get_judge_from_provider


def _resolve_judge(db, profile, workspace_id):
    """Prioridade: provider do perfil → judge_llm_provider_id do workspace → primeiro disponível."""
    if getattr(profile, "llm_provider_id", None):
        return resolve_judge(db, profile.llm_provider_id)
    return resolve_task_judge(db, workspace_id, "judge")

logger = logging.getLogger(__name__)


def _sync_evaluation(db, *, source_run_id=None, source_eval_id=None, status, overall_score, completed_at):
    cond = (
        Evaluation.source_run_id == source_run_id if source_run_id is not None
        else Evaluation.source_eval_id == source_eval_id
    )
    ev = db.query(Evaluation).filter(cond).first()
    if ev:
        ev.status = status
        ev.overall_score = overall_score
        ev.completed_at = completed_at
        db.commit()


# ── Runs ──────────────────────────────────────────────────────────────────────

def execute_run_core(run_id: int):
    db: Session = SessionLocal()
    try:
        run = db.get(TestRun, run_id)
        agent = db.get(Agent, run.agent_id)
        profile = db.get(EvaluationProfile, run.profile_id)
        test_cases = db.query(TestCase).filter(TestCase.id.in_(run.test_case_ids)).all()
        tc_map = {tc.id: tc for tc in test_cases}
        ordered = [tc_map[i] for i in run.test_case_ids if i in tc_map]

        judge_override = _resolve_judge(db, profile, run.workspace_id)
        guardrails = _load_guardrails(db, profile)

        run.agent_metadata_snapshot = _agent_metadata_snapshot(agent)
        db.commit()

        logger.info("Run %d started: %d test cases", run_id, len(ordered))

        all_scores: list[float] = []
        error_count: int = 0
        cancelled = False
        for tc in ordered:
            current_status = db.get(TestRun, run_id).status
            if current_status in ("cancelled", "failed"):
                # "failed" = setado por _recover_stuck_runs() num restart; interrompe thread zumbi
                cancelled = current_status == "cancelled"
                break
            result = _evaluate_case(run_id, tc, agent, profile, judge_override=judge_override, guardrails=guardrails)
            if result.scores:
                for metric_name, score in result.scores.items():
                    normalized = (1.0 - score) if metric_name in LOWER_IS_BETTER else score
                    all_scores.append(normalized)
            elif result.error:
                error_count += 1
                logger.warning("Run %d / tc %d error: %s", run_id, tc.id, result.error[:200])

            # Upsert: garante apenas um resultado por test_case neste run
            db.query(TestResult).filter(
                TestResult.run_id == run_id, TestResult.test_case_id == tc.id
            ).delete(synchronize_session=False)
            db.add(result)
            db.commit()

        if not cancelled:
            run.status = "completed" if all_scores else "failed"
        run.overall_score = round(sum(all_scores) / len(all_scores), 4) if all_scores else None
        run.completed_at = datetime.utcnow()
        db.commit()

        logger.info(
            "Run %d finished: status=%s score=%s errors=%d",
            run_id, run.status, run.overall_score, error_count,
        )

        _sync_evaluation(db, source_run_id=run_id,
                         status=run.status, overall_score=run.overall_score, completed_at=run.completed_at)

    except Exception:
        logger.exception("Unexpected error in run %d", run_id)
        try:
            run = db.get(TestRun, run_id)
            if run:
                run.status = "failed"
                db.commit()
            _sync_evaluation(db, source_run_id=run_id,
                             status="failed", overall_score=None, completed_at=datetime.utcnow())
        except Exception:
            pass
    finally:
        db.close()


def _build_thresholds(profile: EvaluationProfile, guardrails: list[dict] | None = None) -> dict:
    base = {
        "relevancy":         profile.relevancy_threshold,
        "hallucination":     profile.hallucination_threshold,
        "toxicity":          getattr(profile, "toxicity_threshold", 0.5),
        "bias":              getattr(profile, "bias_threshold", 0.5),
        "faithfulness":      getattr(profile, "faithfulness_threshold", 0.5),
        "latency":           0.5,
        "non_advice":        getattr(profile, "non_advice_threshold", 0.5),
        "role_violation":    getattr(profile, "role_violation_threshold", 0.5),
        "prompt_alignment":  getattr(profile, "prompt_alignment_threshold", 0.5),
        **{f"criterion_{i}": 0.5 for i in range(len(profile.criteria or []))},
    }
    for g in (guardrails or []):
        key = g.get("preset_key") or str(g.get("id", "custom"))
        mode = g.get("mode", "both")
        if mode in ("input", "both"):
            base[f"guardrail_input_{key}"] = 0.5
        if mode in ("output", "both"):
            base[f"guardrail_output_{key}"] = 0.5
    return base


def _load_guardrails(db, profile: EvaluationProfile) -> list[dict]:
    """Carrega os guardrails ativos no perfil como lista de dicts."""
    ids = getattr(profile, "guardrail_ids", None) or []
    if not ids:
        return []
    rows = db.query(Guardrail).filter(Guardrail.id.in_(ids)).all()
    return [
        {
            "id": g.id,
            "name": g.name,
            "preset_key": g.preset_key,
            "mode": g.mode,
            "criterion": g.criterion,
        }
        for g in rows
    ]


def _agent_metadata_snapshot(agent: Agent) -> dict:
    """Captura o estado completo do agente no momento da execução."""
    return {
        "model_provider": getattr(agent, "model_provider", None),
        "model_name": getattr(agent, "model_name", None),
        "temperature": getattr(agent, "temperature", None),
        "max_tokens": getattr(agent, "max_tokens", None),
        "environment": getattr(agent, "environment", None),
        "tags": getattr(agent, "tags", None) or [],
        "extra_metadata": getattr(agent, "extra_metadata", None) or {},
        "system_prompt": getattr(agent, "system_prompt", None),
        "agent_notes": getattr(agent, "agent_notes", None),
        "connection_type": getattr(agent, "connection_type", None),
        "request_body": getattr(agent, "request_body", None),
        "output_field": getattr(agent, "output_field", None),
    }


def _call_evaluate(input_text, actual_output, expected_output, context, response_time_ms, profile, system_prompt=None, judge_override=None, guardrails=None):
    return evaluate_response(
        input_text=input_text,
        actual_output=actual_output,
        expected_output=expected_output,
        context=context,
        response_time_ms=response_time_ms,
        use_relevancy=profile.use_relevancy,
        relevancy_threshold=profile.relevancy_threshold,
        use_hallucination=profile.use_hallucination,
        hallucination_threshold=profile.hallucination_threshold,
        use_toxicity=getattr(profile, "use_toxicity", False),
        toxicity_threshold=getattr(profile, "toxicity_threshold", 0.5),
        use_bias=getattr(profile, "use_bias", False),
        bias_threshold=getattr(profile, "bias_threshold", 0.5),
        use_faithfulness=getattr(profile, "use_faithfulness", False),
        faithfulness_threshold=getattr(profile, "faithfulness_threshold", 0.5),
        use_latency=getattr(profile, "use_latency", False),
        latency_threshold_ms=getattr(profile, "latency_threshold_ms", 5000),
        criteria=profile.criteria or [],
        use_non_advice=getattr(profile, "use_non_advice", False),
        non_advice_threshold=getattr(profile, "non_advice_threshold", 0.5),
        non_advice_types=getattr(profile, "non_advice_types", None) or [],
        use_role_violation=getattr(profile, "use_role_violation", False),
        role_violation_threshold=getattr(profile, "role_violation_threshold", 0.5),
        role_violation_role=getattr(profile, "role_violation_role", None) or "",
        use_prompt_alignment=getattr(profile, "use_prompt_alignment", False),
        prompt_alignment_threshold=getattr(profile, "prompt_alignment_threshold", 0.5),
        system_prompt=system_prompt,
        guardrails=guardrails,
        judge_override=judge_override,
    )


def _evaluate_case(run_id: int, tc: TestCase, agent: Agent, profile: EvaluationProfile, judge_override=None, guardrails=None) -> TestResult:
    session_id = str(uuid.uuid4())
    turns = tc.turns if (tc.turns and len(tc.turns) > 0) else None

    _call_kwargs = dict(
        url=agent.url,
        api_key=agent.api_key,
        request_body=agent.request_body or '{"message": "{{message}}"}',
        output_field=agent.output_field,
        connection_type=agent.connection_type,
        session_id=session_id,
        variables=tc.variables or {},
        token_url=getattr(agent, "token_url", None),
        token_request_body=getattr(agent, "token_request_body", None),
        token_output_field=getattr(agent, "token_output_field", None),
        token_header_name=getattr(agent, "token_header_name", None),
        system_prompt=agent.system_prompt or "",
        ssl_verify=getattr(agent, "ssl_verify", False) or False,
    )

    if turns is None:
        t0 = time.time()
        try:
            actual_output = call_agent(message=tc.input, **_call_kwargs)
        except Exception as e:
            return TestResult(run_id=run_id, test_case_id=tc.id, passed=False,
                              error=f"Agente: {e}")
        response_time_ms = (time.time() - t0) * 1000
        try:
            scores, reasons = _call_evaluate(tc.input, actual_output, tc.expected_output, tc.context,
                                             response_time_ms, profile, system_prompt=agent.system_prompt,
                                             judge_override=judge_override, guardrails=guardrails)
            thresholds = _build_thresholds(profile, guardrails)
            passed = compute_passed(scores, thresholds) if scores else True
            return TestResult(run_id=run_id, test_case_id=tc.id, actual_output=actual_output,
                              scores=scores, reasons=reasons, passed=passed, turns_executed=1)
        except Exception as e:
            return TestResult(run_id=run_id, test_case_id=tc.id, actual_output=actual_output,
                              passed=False, error=f"Avaliação: {e}", turns_executed=1)
    else:
        last_output = last_input = last_expected = None
        total_time_ms = 0.0
        turn_outputs_list: list[dict] = []
        for i, turn in enumerate(turns):
            t0 = time.time()
            try:
                output = call_agent(message=turn["input"], **_call_kwargs)
            except Exception as e:
                return TestResult(run_id=run_id, test_case_id=tc.id,
                                  passed=False, error=f"Agente turno {i + 1}: {e}",
                                  turns_executed=i + 1,
                                  turn_outputs=turn_outputs_list or None)
            total_time_ms += (time.time() - t0) * 1000
            turn_outputs_list.append({"input": turn["input"], "output": output})
            last_output = output
            last_input = turn["input"]
            last_expected = turn.get("expected_output")

        try:
            scores, reasons = _call_evaluate(last_input, last_output, last_expected, tc.context,
                                             total_time_ms, profile, system_prompt=agent.system_prompt,
                                             judge_override=judge_override, guardrails=guardrails)
            thresholds = _build_thresholds(profile, guardrails)
            passed = compute_passed(scores, thresholds) if scores else True
            return TestResult(run_id=run_id, test_case_id=tc.id, actual_output=last_output,
                              scores=scores, reasons=reasons, passed=passed,
                              turns_executed=len(turns), turn_outputs=turn_outputs_list)
        except Exception as e:
            return TestResult(run_id=run_id, test_case_id=tc.id, actual_output=last_output,
                              passed=False, error=f"Avaliação: {e}",
                              turns_executed=len(turns), turn_outputs=turn_outputs_list)


# ── Dataset evaluations ───────────────────────────────────────────────────────

def execute_evaluation_core(eval_id: int):
    db: Session = SessionLocal()
    try:
        ev = db.get(DatasetEvaluation, eval_id)
        profile = db.get(EvaluationProfile, ev.profile_id)
        dataset = db.get(Dataset, ev.dataset_id)
        records = (
            db.query(DatasetRecord)
            .filter(DatasetRecord.dataset_id == ev.dataset_id)
            .all()
        )

        dataset_system_prompt = getattr(dataset, "system_prompt", None)
        judge_override = _resolve_judge(db, profile, ev.workspace_id)
        guardrails = _load_guardrails(db, profile)

        logger.info("Dataset evaluation %d started: %d records", eval_id, len(records))

        all_scores: list[float] = []
        error_count: int = 0
        for record in records:
            result = _evaluate_record(eval_id, record, profile, system_prompt=dataset_system_prompt, judge_override=judge_override, guardrails=guardrails)
            if result.scores:
                for metric_name, score in result.scores.items():
                    normalized = (1.0 - score) if metric_name in LOWER_IS_BETTER else score
                    all_scores.append(normalized)
            elif result.error:
                error_count += 1
                logger.warning("Eval %d / record %d error: %s", eval_id, record.id, result.error[:200])
            db.add(result)
            db.commit()

        ev.status = "completed" if all_scores else "failed"
        ev.overall_score = round(sum(all_scores) / len(all_scores), 4) if all_scores else None
        ev.completed_at = datetime.utcnow()
        db.commit()

        logger.info(
            "Dataset evaluation %d finished: status=%s score=%s errors=%d",
            eval_id, ev.status, ev.overall_score, error_count,
        )

        _sync_evaluation(db, source_eval_id=eval_id,
                         status=ev.status, overall_score=ev.overall_score, completed_at=ev.completed_at)

    except Exception:
        logger.exception("Unexpected error in dataset evaluation %d", eval_id)
        try:
            ev = db.get(DatasetEvaluation, eval_id)
            if ev:
                ev.status = "failed"
                db.commit()
            _sync_evaluation(db, source_eval_id=eval_id,
                             status="failed", overall_score=None, completed_at=datetime.utcnow())
        except Exception:
            pass
    finally:
        db.close()


# ── Simulation ────────────────────────────────────────────────────────────────

def execute_simulation_core(simulation_id: int):
    from ..services.simulator import ConversationSimulator
    db: Session = SessionLocal()
    sim = None
    try:
        sim = db.get(Simulation, simulation_id)
        if not sim:
            return

        agent = db.get(Agent, sim.agent_id)
        if not agent:
            sim.status = "failed"
            db.commit()
            return

        # Resolve judge
        if sim.llm_provider_id:
            from ..models import LLMProvider
            provider = db.get(LLMProvider, sim.llm_provider_id)
            judge = get_judge_from_provider(provider)
        else:
            judge = resolve_task_judge(db, sim.workspace_id, "judge")

        if judge is None:
            logger.error("Simulation %d: nenhum LLM provider disponível", simulation_id)
            sim.status = "failed"
            db.commit()
            return

        simulator = ConversationSimulator(judge, {
            "name": agent.name,
            "system_prompt": agent.system_prompt or "",
        })

        # session_id fixo por simulação
        if not sim.session_id:
            sim.session_id = str(uuid.uuid4())

        sim.status = "running"
        sim.started_at = sim.started_at or datetime.utcnow()
        db.commit()

        logger.info("Simulation %d started (session=%s)", simulation_id, sim.session_id)

        _call_kwargs = dict(
            url=agent.url,
            api_key=agent.api_key,
            request_body=agent.request_body or '{"message": "{{message}}"}',
            output_field=agent.output_field,
            connection_type=agent.connection_type,
            session_id=sim.session_id,
            variables={},
            token_url=getattr(agent, "token_url", None),
            token_request_body=getattr(agent, "token_request_body", None),
            token_output_field=getattr(agent, "token_output_field", None),
            token_header_name=getattr(agent, "token_header_name", None),
            system_prompt=agent.system_prompt or "",
            ssl_verify=getattr(agent, "ssl_verify", False) or False,
        )

        while True:
            db.refresh(sim)
            if sim.status in ("paused", "stopped"):
                break
            if sim.total_turns >= sim.max_messages:
                break

            existing_msgs = (
                db.query(SimulationMessage)
                .filter(SimulationMessage.simulation_id == simulation_id)
                .order_by(SimulationMessage.turn_order)
                .all()
            )
            next_turn_order = len(existing_msgs) + 1
            history = [{"role": m.role, "content": m.content} for m in existing_msgs]

            # Gera mensagem do simulador
            try:
                if not history:
                    user_msg = simulator.generate_first_message(sim.instructions or "")
                else:
                    user_msg = simulator.generate_next_message(sim.instructions or "", history)
            except Exception as e:
                logger.error("Simulation %d: error generating message: %s", simulation_id, e)
                sim.status = "failed"
                db.commit()
                return

            sim_msg = SimulationMessage(
                simulation_id=simulation_id,
                role="simulator",
                content=user_msg,
                turn_order=next_turn_order,
                created_at=datetime.utcnow(),
            )
            db.add(sim_msg)
            db.commit()

            # Chama agente
            try:
                agent_response = call_agent(message=user_msg, **_call_kwargs)
            except Exception as e:
                logger.error("Simulation %d: agent call error: %s", simulation_id, e)
                agent_msg = SimulationMessage(
                    simulation_id=simulation_id,
                    role="agent",
                    content=f"[Erro: {e}]",
                    turn_order=next_turn_order + 1,
                    created_at=datetime.utcnow(),
                )
                db.add(agent_msg)
                sim.total_turns += 1
                sim.status = "failed"
                db.commit()
                return

            agent_msg = SimulationMessage(
                simulation_id=simulation_id,
                role="agent",
                content=agent_response,
                turn_order=next_turn_order + 1,
                created_at=datetime.utcnow(),
            )
            db.add(agent_msg)
            sim.total_turns += 1
            db.commit()

            logger.debug("Simulation %d turn %d complete", simulation_id, sim.total_turns)

            # Aguarda intervalo com checks a cada 0.5s para permitir pause durante espera
            interval = sim.message_interval_seconds or 3.0
            elapsed = 0.0
            while elapsed < interval:
                time.sleep(0.5)
                elapsed += 0.5
                db.refresh(sim)
                if sim.status in ("paused", "stopped"):
                    break

            if sim.status in ("paused", "stopped"):
                break

        db.refresh(sim)
        if sim.status == "running":
            sim.status = "completed"
            sim.completed_at = datetime.utcnow()
            db.commit()
            logger.info("Simulation %d completed (%d turns)", simulation_id, sim.total_turns)

    except Exception:
        logger.exception("Unexpected error in simulation %d", simulation_id)
        try:
            if sim:
                db.refresh(sim)
                sim.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _evaluate_record(eval_id: int, record: DatasetRecord, profile: EvaluationProfile, system_prompt=None, judge_override=None, guardrails=None) -> DatasetResult:
    try:
        if not record.actual_output:
            raise ValueError("Registro sem resposta — não é possível avaliar")

        scores, reasons = _call_evaluate(
            record.input, record.actual_output, None, record.context, None,
            profile, system_prompt=system_prompt, judge_override=judge_override, guardrails=guardrails,
        )
        thresholds = _build_thresholds(profile, guardrails)
        passed = compute_passed(scores, thresholds) if scores else True
        return DatasetResult(evaluation_id=eval_id, record_id=record.id, scores=scores, reasons=reasons, passed=passed)
    except Exception as e:
        return DatasetResult(evaluation_id=eval_id, record_id=record.id, passed=False, error=str(e))
