"""Máquina de estados — espelha lead_status_transitions (Fase 0).

O banco é a fonte da verdade (trigger valida). Aqui replicamos só o que a
esteira precisa: avançar bruto -> enriquecido (e descartar quando for o caso).
"""
from __future__ import annotations

from .models import LeadStatus

TRANSITIONS: dict[LeadStatus, tuple[LeadStatus, ...]] = {
    "bruto": ("enriquecido", "descartado"),
    "enriquecido": ("qualificado", "descartado"),
    "qualificado": ("rascunho_pronto", "descartado"),
    "rascunho_pronto": ("aprovado", "descartado"),
    "aprovado": ("enviado",),
    "enviado": ("respondeu", "sem_resposta", "descartado"),
    "sem_resposta": ("enviado", "descartado"),
    "respondeu": ("interessado", "sem_interesse", "reuniao"),
    "interessado": ("reuniao", "proposta", "perdido"),
    "reuniao": ("proposta", "perdido"),
    "proposta": ("fechado", "perdido"),
    "descartado": ("enriquecido",),  # reativavel pelo dono (volta pro funil)
    "sem_interesse": (),
    "fechado": (),
    "perdido": (),
}

CONTACT_STATUSES: frozenset[LeadStatus] = frozenset({"rascunho_pronto", "aprovado", "enviado"})


def can_transition(src: LeadStatus, dst: LeadStatus, opt_out: bool = False) -> bool:
    if dst not in TRANSITIONS.get(src, ()):
        return False
    if opt_out and dst in CONTACT_STATUSES:
        return False
    return True
