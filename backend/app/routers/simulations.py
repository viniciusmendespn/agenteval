import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Agent, Dataset, DatasetRecord, Simulation, SimulationMessage
from ..schemas import SimulationCreate, SimulationOut, SimulationUpdate
from ..queue import get_task_queue
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/simulations", tags=["simulations"])


def _enrich(sim: Simulation, db: Session) -> dict:
    data = {c.name: getattr(sim, c.name) for c in Simulation.__table__.columns}
    agent = db.get(Agent, sim.agent_id)
    data["agent_name"] = agent.name if agent else None
    data["messages"] = sorted(sim.messages, key=lambda m: m.turn_order)
    return data


@router.post("/", response_model=SimulationOut, status_code=201)
def create_simulation(
    body: SimulationCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    agent = db.query(Agent).filter(Agent.id == body.agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")

    name = body.name or f"Simulação {agent.name} {datetime.utcnow().strftime('%d/%m %H:%M')}"
    sim = Simulation(
        workspace_id=workspace.workspace_id,
        agent_id=body.agent_id,
        name=name,
        instructions=body.instructions,
        llm_provider_id=body.llm_provider_id,
        max_messages=body.max_messages,
        message_interval_seconds=body.message_interval_seconds,
        status="idle",
        total_turns=0,
        created_at=datetime.utcnow(),
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)
    return _enrich(sim, db)


@router.get("/", response_model=list[SimulationOut])
def list_simulations(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    sims = (
        db.query(Simulation)
        .filter(Simulation.workspace_id == workspace.workspace_id)
        .order_by(Simulation.created_at.desc())
        .all()
    )
    return [_enrich(s, db) for s in sims]


@router.get("/{sim_id}", response_model=SimulationOut)
def get_simulation(
    sim_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    return _enrich(sim, db)


@router.patch("/{sim_id}", response_model=SimulationOut)
def update_simulation(
    sim_id: int,
    body: SimulationUpdate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    if sim.status == "running":
        raise HTTPException(400, "Não é possível editar uma simulação em execução")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(sim, field, value)
    db.commit()
    db.refresh(sim)
    return _enrich(sim, db)


@router.delete("/{sim_id}", status_code=204)
def delete_simulation(
    sim_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    if sim.status == "running":
        raise HTTPException(400, "Pare a simulação antes de deletar")
    db.query(SimulationMessage).filter(SimulationMessage.simulation_id == sim_id).delete()
    db.delete(sim)
    db.commit()


@router.post("/{sim_id}/start", response_model=SimulationOut)
def start_simulation(
    sim_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    if sim.status == "running":
        raise HTTPException(400, "Simulação já está em execução")
    if sim.status in ("completed", "failed"):
        raise HTTPException(400, f"Simulação já finalizada (status: {sim.status}). Use reset para reiniciar.")

    if not sim.session_id:
        sim.session_id = str(uuid.uuid4())

    task_id = get_task_queue().enqueue("execute_simulation", {"simulation_id": sim.id})
    sim.task_id = task_id
    db.commit()
    db.refresh(sim)
    return _enrich(sim, db)


@router.post("/{sim_id}/pause", response_model=SimulationOut)
def pause_simulation(
    sim_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    if sim.status != "running":
        raise HTTPException(400, f"Simulação não está em execução (status: {sim.status})")
    sim.status = "paused"
    db.commit()
    db.refresh(sim)
    return _enrich(sim, db)


@router.post("/{sim_id}/stop", response_model=SimulationOut)
def stop_simulation(
    sim_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    if sim.status not in ("running", "paused"):
        raise HTTPException(400, f"Simulação não pode ser parada (status: {sim.status})")
    sim.status = "stopped"
    sim.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(sim)
    return _enrich(sim, db)


@router.post("/{sim_id}/reset", response_model=SimulationOut)
def reset_simulation(
    sim_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    if sim.status == "running":
        raise HTTPException(400, "Pare a simulação antes de resetar")
    db.query(SimulationMessage).filter(SimulationMessage.simulation_id == sim_id).delete()
    sim.status = "idle"
    sim.total_turns = 0
    sim.session_id = str(uuid.uuid4())
    sim.started_at = None
    sim.completed_at = None
    sim.task_id = None
    db.commit()
    db.refresh(sim)
    return _enrich(sim, db)


@router.post("/{sim_id}/save-as-dataset")
def save_as_dataset(
    sim_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.workspace_id == workspace.workspace_id).first()
    if not sim:
        raise HTTPException(404, "Simulação não encontrada")
    if sim.total_turns == 0:
        raise HTTPException(400, "Simulação sem turnos para salvar")

    messages = sorted(sim.messages, key=lambda m: m.turn_order)
    pairs: list[tuple] = []
    i = 0
    while i + 1 < len(messages):
        sim_msg = messages[i]
        agent_msg = messages[i + 1]
        if sim_msg.role == "simulator" and agent_msg.role == "agent":
            pairs.append((sim_msg, agent_msg))
        i += 2

    if not pairs:
        raise HTTPException(400, "Nenhum par simulador/agente encontrado")

    agent = db.get(Agent, sim.agent_id)
    dataset = Dataset(
        workspace_id=workspace.workspace_id,
        name=sim.name or f"Dataset Simulação {sim_id}",
        description=f"Gerado pela simulação #{sim_id}",
        agent_id=sim.agent_id,
        system_prompt=agent.system_prompt if agent else None,
        created_at=datetime.utcnow(),
    )
    db.add(dataset)
    db.flush()

    for idx, (user_msg, agent_msg) in enumerate(pairs, start=1):
        record = DatasetRecord(
            dataset_id=dataset.id,
            input=user_msg.content,
            actual_output=agent_msg.content,
            session_id=sim.session_id,
            turn_order=idx,
            created_at=datetime.utcnow(),
        )
        db.add(record)

    sim.saved_dataset_id = dataset.id
    db.commit()
    return {"dataset_id": dataset.id}
