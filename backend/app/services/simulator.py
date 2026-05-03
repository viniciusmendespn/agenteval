import logging

logger = logging.getLogger(__name__)

_SYSTEM_CONTEXT = (
    "Você é um usuário brasileiro real trocando mensagens de texto com um assistente virtual. "
    "Regras OBRIGATÓRIAS:\n"
    "- Escreva mensagens CURTAS, como em WhatsApp: 1 a 2 frases no máximo.\n"
    "- Nunca escreva parágrafos longos ou listas. Pessoas reais não fazem isso.\n"
    "- Use linguagem informal e direta. Pode usar abreviações comuns (vc, tá, pq, né).\n"
    "- Não se identifique como IA. Não use saudações genéricas repetidas.\n"
    "- Varie o tom conforme o contexto: urgente, confuso, tranquilo, impaciente."
)


class ConversationSimulator:
    def __init__(self, judge, agent_info: dict):
        self._judge = judge
        self._agent_name = agent_info.get("name", "Assistente")
        self._agent_system_prompt = agent_info.get("system_prompt", "")

    def generate_first_message(self, instructions: str) -> str:
        prompt = (
            f"{_SYSTEM_CONTEXT}\n\n"
            f"Instruções para a simulação:\n{instructions or 'Inicie uma conversa natural com o assistente.'}\n\n"
            f"O assistente se chama '{self._agent_name}'."
            + (f"\nContexto do assistente: {self._agent_system_prompt}" if self._agent_system_prompt else "")
            + "\n\nEscreva APENAS a primeira mensagem do usuário. Máximo 2 frases curtas. Sem explicações."
        )
        result, _ = self._judge.generate(prompt)
        return str(result).strip()

    def generate_next_message(self, instructions: str, history: list[dict]) -> str:
        history_text = "\n".join(
            f"{'Usuário' if m['role'] == 'simulator' else self._agent_name}: {m['content']}"
            for m in history
        )
        prompt = (
            f"{_SYSTEM_CONTEXT}\n\n"
            f"Instruções para a simulação:\n{instructions or 'Continue a conversa de forma natural.'}\n\n"
            f"Histórico da conversa até agora:\n{history_text}\n\n"
            "Com base no histórico e nas instruções, escreva a próxima mensagem do usuário. "
            "Máximo 2 frases curtas, como WhatsApp. Apenas a mensagem, sem explicações."
        )
        result, _ = self._judge.generate(prompt)
        return str(result).strip()
