"""Leitura do perfil do dono (search_profile) num lugar so.

Antes cada entrada da esteira remontava esse dicionario na mao, e cada copia
esquecia um campo diferente: o autopilot e o drain nao liam `legal_areas` nem a
OAB, entao o mesmo lead saia com score 36 pontos menor e com o e-mail sem
assinatura da OAB — justamente o que a publicidade informativa exige. Uma funcao
so, usada por todos os caminhos, e o campo novo chega em todos de uma vez.

O nome do modulo e `owner_profile` e nao `profile` porque `profile` e modulo da
biblioteca padrao.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class OwnerProfile:
    """O que a esteira precisa saber sobre o dono pra pontuar e escrever."""

    profession: str | None = None
    professions: list[str] = field(default_factory=list)
    legal_areas: list[str] = field(default_factory=list)
    oab: str | None = None
    min_score: int = 0
    sender_name: str | None = None
    # Flexao do substantivo da profissao na copy: "f" | "m" | None.
    # Escolha explicita do dono; None mantem o masculino, que era o
    # comportamento antes do campo existir. Nunca inferido pelo nome.
    professional_gender: str | None = None


def oab_label(prof: dict) -> str | None:
    """"123456" + "PR" -> "123456/PR". Assina o e-mail da area de advocacia.
    Sem numero, devolve None (o prompt entao proibe inventar)."""
    num = (prof.get("oab_number") or "").strip()
    if not num:
        return None
    uf = (prof.get("oab_uf") or "").strip().upper()
    return f"{num}/{uf}" if uf else num


def read_profile(prof: dict | None) -> OwnerProfile:
    """Le o dicionario cru do sink. Perfil vazio/ausente devolve o default."""
    prof = prof or {}
    profession = prof.get("profession")
    return OwnerProfile(
        profession=profession,
        professions=list(prof.get("professions") or ([profession] if profession else [])),
        legal_areas=list(prof.get("legal_areas") or []),
        oab=oab_label(prof),
        min_score=int(prof.get("min_score") or 0),
        sender_name=prof.get("sender_name"),
        professional_gender=(prof.get("professional_gender") or None),
    )


def fetch_profile(sink, owner_id: str | None) -> OwnerProfile:
    """Busca no sink e le. Sink sem `fetch_profile` (o offline) e erro de rede
    devolvem o default — a esteira segue com a leitura neutra."""
    if not owner_id or not hasattr(sink, "fetch_profile"):
        return OwnerProfile()
    try:
        return read_profile(sink.fetch_profile(owner_id))
    except Exception:
        return OwnerProfile()
