"""Leitura da IA (Gemini-first) — lê o que JÁ coletamos e devolve, em JSON:
  segment       : micro-segmento legível ("barbearia masculina premium")
  maturity      : maturidade digital 1-5 (1 = sem presença, 5 = bem estruturado)
  maturity_note : 1 frase explicando a nota
  pain          : dor/gancho principal pra abordagem
  hours_struct  : horário normalizado pra calcular "aberto agora?" no front

NÃO re-baixa nada (lê campos guardados) e NÃO mexe na copy (a mensagem já é boa).
Cadeia: Gemini(3 chaves) -> Groq -> None. Tudo free; degrada com graça (None).
"""
from __future__ import annotations

import json
from typing import Any, Callable

import httpx

from .models import Lead

_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

SYSTEM = (
    "Voce e um analista de prospeccao. Le os FATOS de um negocio local brasileiro "
    "e devolve SOMENTE um JSON com as chaves: segment (string curta), maturity "
    "(inteiro 1 a 5), maturity_note (1 frase), pain (1 frase, o gancho principal "
    "pra abordagem), hours (objeto ou null). NUNCA invente dado que nao esta nos "
    "fatos. maturity: 1=sem site/sem redes, 3=presenca basica, 5=site bom + redes "
    "ativas + anuncia. Para hours: normalize o texto de horario em "
    '{"tz":"America/Sao_Paulo","days":{"mon":[["0900","1800"]],...}} usando as '
    "chaves mon,tue,wed,thu,fri,sat,sun e horas HHMM 24h; se nao houver horario "
    "claro nos fatos, use null. Responda em portugues, sem emojis."
)


def _facts(lead: Lead) -> str:
    sig = lead.site_signals or {}
    soc = lead.social_signals or {}
    def yn(v):
        return "sim" if v else ("nao" if v is False else "?")
    linhas = [
        f"nome: {lead.business_name or '-'}",
        f"categoria/CNAE: {lead.category or '-'}",
        f"cidade/UF: {(lead.city or '-')}/{(lead.state or '-')}",
        f"nota google: {lead.rating if lead.rating is not None else '-'} ({lead.reviews_count or 0} avaliacoes)",
        f"abertura: {lead.opened_on or '-'} | porte: {lead.porte or '-'} | capital: {lead.capital_social or '-'}",
        f"tem site: {yn(bool(lead.website))} | site lento: {yn(sig.get('slow'))} | mobile ok: {yn(sig.get('mobile_ready'))}",
        f"agendamento online: {yn(sig.get('has_online_booking'))} | e-commerce: {yn(sig.get('has_ecommerce'))}",
        f"instagram: {lead.instagram or '-'} | seguidores: {soc.get('followers') or '-'} | status: {soc.get('ig_status') or '-'} | engajamento: {soc.get('engagement') or '-'}",
        f"ja anuncia: {yn(soc.get('ads_active') if soc.get('ads_active') is not None else lead.ads_active)}",
        f"horario (texto bruto, pode estar vazio): {lead.opening_hours or '-'}",
    ]
    return "\n".join(linhas)


def build_ai_prompt(lead: Lead) -> str:
    return f"{SYSTEM}\n\nFATOS:\n{_facts(lead)}"


def _norm_hours(h: Any) -> dict | None:
    """Valida/limpa o hours_struct do modelo. Fora do formato -> None."""
    if not isinstance(h, dict):
        return None
    days = h.get("days")
    if not isinstance(days, dict):
        return None
    out: dict[str, list] = {}
    for d in _DAYS:
        spans = days.get(d)
        if not isinstance(spans, list):
            continue
        clean = []
        for sp in spans:
            if isinstance(sp, (list, tuple)) and len(sp) == 2 and all(isinstance(x, str) and x.isdigit() and len(x) == 4 for x in sp):
                clean.append([sp[0], sp[1]])
        if clean:
            out[d] = clean
    if not out:
        return None
    return {"tz": "America/Sao_Paulo", "days": out}


def parse_ai(raw: dict) -> dict | None:
    """Pega o JSON do modelo e devolve só os campos válidos. None se vazio."""
    if not isinstance(raw, dict):
        return None
    out: dict[str, Any] = {}
    seg = raw.get("segment")
    if isinstance(seg, str) and seg.strip():
        out["segment"] = seg.strip()[:80]
    mat = raw.get("maturity")
    try:
        mi = int(mat)
        if 1 <= mi <= 5:
            out["maturity"] = mi
    except (TypeError, ValueError):
        pass
    note = raw.get("maturity_note")
    if isinstance(note, str) and note.strip():
        out["maturity_note"] = note.strip()[:200]
    pain = raw.get("pain")
    if isinstance(pain, str) and pain.strip():
        out["pain"] = pain.strip()[:200]
    hours = _norm_hours(raw.get("hours"))
    if hours:
        out["hours"] = hours
    return out or None


# --- chamadas LLM (injetáveis pra teste) -----------------------------------

def _gemini_json(api_key: str, model: str, prompt: str, timeout: float) -> dict:
    with httpx.Client(timeout=timeout) as c:
        r = c.post(
            _GEMINI_URL.format(model=model),
            params={"key": api_key},
            json={"contents": [{"parts": [{"text": prompt}]}],
                  "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3}},
        )
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def _groq_json(api_key: str, base_url: str, model: str, prompt: str, timeout: float) -> dict:
    with httpx.Client(timeout=timeout) as c:
        r = c.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}],
                  "response_format": {"type": "json_object"}, "temperature": 0.3},
        )
        r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


# read(lead) -> dict de ai_signals | None
AIReader = Callable[[Lead], "dict | None"]


def make_ai_reader(
    *,
    gemini_keys: list[str] | None = None,
    gemini_model: str = "gemini-2.5-flash",
    groq_key: str | None = None,
    groq_model: str = "llama-3.3-70b-versatile",
    timeout: float = 30.0,
    call: Callable[[str], dict] | None = None,
) -> AIReader | None:
    """Monta o leitor da IA com a cadeia Gemini(chaves) -> Groq. `call` injetável
    pra teste. Devolve None se não há nenhuma chave (stage fica desligado)."""
    keys = [k for k in (gemini_keys or []) if k]
    if call is None and not keys and not groq_key:
        return None

    def _chain(prompt: str) -> dict:
        for k in keys:  # Gemini primário (3 chaves = 3 projetos free)
            try:
                return _gemini_json(k, gemini_model, prompt, timeout)
            except Exception:
                continue
        if groq_key:  # Groq só se todas as Gemini estourarem
            return _groq_json(groq_key, "https://api.groq.com/openai/v1", groq_model, prompt, timeout)
        raise RuntimeError("sem LLM disponivel")

    _call = call or _chain

    def read(lead: Lead) -> dict | None:
        try:
            raw = _call(build_ai_prompt(lead))
        except Exception:
            return None  # rede/limite/JSON quebrado: segue sem IA
        return parse_ai(raw)

    return read


def apply_ai(reader: "AIReader | None", lead: Lead, sink) -> None:
    """Roda o leitor (se houver) e grava ai_signals + hours_struct no lead/sink.
    horario só preenche se o lead ainda não tem um estruturado. Não quebra nada
    se a IA falhar (reader devolve None)."""
    if reader is None:
        return
    ai = reader(lead)
    if not ai:
        return
    hours = ai.pop("hours", None)
    fields: dict[str, Any] = {}
    if ai:
        fields["ai_signals"] = ai
        setattr(lead, "ai_signals", ai)
    if hours and not getattr(lead, "hours_struct", None):
        fields["hours_struct"] = hours
        setattr(lead, "hours_struct", hours)
    if fields:
        sink.update_lead_fields(lead.id, fields)
