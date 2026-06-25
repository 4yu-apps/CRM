"""Fonte CNPJ por NOME (reverso) com validacao cruzada (Fase 5.5).

Quando o lead nao tem CNPJ (sem site, ou site sem CNPJ no rodape), tenta achar o
CNPJ por nome+cidade num provedor de lookup (injetavel: agregador JSON hoje;
Dados Abertos da Receita local depois). So DESCOBRE o CNPJ candidato — quem traz
dono/abertura/situacao continua sendo o BrasilAPI/ReceitaWS (autoritativo).

Seguranca (precision-first): CNPJ errado = nome do dono errado na mensagem = tiro
no pe. So aceita com validacao cruzada forte e quando UM unico CNPJ passa. Na
duvida, nao anexa nada.
"""
from __future__ import annotations

import unicodedata
from difflib import SequenceMatcher
from typing import Callable

from ..models import Finding, Lead
from ..normalize import normalize_cnpj, normalize_phone
from ..validation import is_present

# lookup(nome, cidade, uf) -> lista de candidatos. Cada candidato e um dict:
# {cnpj, nome, phone, city, neighborhood, street, uf}. Injetavel = testavel.
LookupFn = Callable[[str, str | None, str | None], list[dict]]

# Pisos de similaridade de nome: com telefone batendo o nome pode ser folgado
# (telefone e quase decisivo); sem telefone, a barra sobe (so cidade+local+nome).
_NAME_FLOOR_PHONE = 0.55
_NAME_FLOOR_STRICT = 0.78


def _norm(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().split())


def _name_sim(a: str | None, b: str | None) -> float:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _street_match(lead_address: str | None, cand_street: str | None) -> bool:
    cs = _norm(cand_street)
    if len(cs) < 5:
        return False
    return cs in _norm(lead_address)


def _match_one(lead: Lead, cand: dict) -> tuple[bool, float]:
    name_sim = _name_sim(lead.business_name, cand.get("nome"))
    lphone = normalize_phone(lead.phone)
    phone_ok = bool(lphone) and lphone == normalize_phone(cand.get("phone"))

    lcity = _norm(lead.city)
    city_ok = bool(lcity) and lcity == _norm(cand.get("city"))
    lbairro = _norm(lead.neighborhood)
    bairro_ok = bool(lbairro) and lbairro == _norm(cand.get("neighborhood"))
    local_ok = bairro_ok or _street_match(lead.address, cand.get("street"))

    # telefone bate (+ nome plausivel) = forte
    if phone_ok and name_sim >= _NAME_FLOOR_PHONE:
        return True, 0.9
    # sem telefone: exige cidade + (bairro ou rua) + nome alto
    if city_ok and local_ok and name_sim >= _NAME_FLOOR_STRICT:
        return True, 0.7
    return False, 0.0


def pick_cnpj(lead: Lead, candidates: list[dict]) -> tuple[str, float, str] | None:
    """Devolve (cnpj, confianca, motivo) so quando UM unico CNPJ valido passa a
    validacao cruzada. 0 ou 2+ passando (ambiguo) => None."""
    passed: dict[str, float] = {}
    for c in candidates or []:
        cnpj = normalize_cnpj(c.get("cnpj"))
        if not cnpj:
            continue
        ok, conf = _match_one(lead, c)
        if ok and conf > passed.get(cnpj, 0.0):
            passed[cnpj] = conf
    if len(passed) != 1:
        return None
    cnpj, conf = next(iter(passed.items()))
    motivo = "telefone+nome" if conf >= 0.9 else "cidade+local+nome"
    return cnpj, conf, motivo


class CnpjNameSource:
    name = "cnpj_lookup"

    def __init__(self, lookup: LookupFn, *, request_limit: int = 0):
        self._lookup = lookup
        # teto de chamadas por run (provedor gray/externo): 0 = sem teto.
        self._request_limit = request_limit
        self._requests = 0
        self._warned = False

    def enrich(self, lead: Lead) -> list[Finding]:
        # gatilho: so quando o lead ainda nao tem CNPJ (site nao deu) e ha nome+cidade.
        if is_present("cnpj", lead.cnpj):
            return []
        if not lead.business_name or not lead.city:
            return []
        if self._request_limit and self._requests >= self._request_limit:
            if not self._warned:
                print(f"cnpj_lookup: teto de {self._request_limit} buscas/run batido; pausando.")
                self._warned = True
            return []
        self._requests += 1
        try:
            candidates = self._lookup(lead.business_name, lead.city, lead.state) or []
        except Exception:
            return []  # provedor instavel nao derruba a cascata
        picked = pick_cnpj(lead, candidates)
        if not picked:
            return []
        cnpj, conf, _motivo = picked
        return [Finding("cnpj", self.name, cnpj, conf)]


# Provedor agregador (casadosdados): busca publica por nome/UF/municipio que
# devolve JSON. ToS-cinza => fica DESLIGADO por padrao (GARIMPO_CNPJ_LOOKUP=1).
#
# ATENCAO (verificado 2026-06-25): o endpoint esta atras do Cloudflare bot-check
# (responde 403 "Just a moment..." a request headless). Ou seja, NAO funciona do
# cron sem um navegador/proxy que resolva o desafio. Mantido como referencia do
# contrato e seam injetavel; o provider que de fato funciona e o Dados Abertos da
# Receita local (Fase 5.5b), que usa o MESMO validador (pick_cnpj) e a MESMA
# CnpjNameSource. Por isso a fonte ja nasce gated-off.
CASADOSDADOS_URL = "https://api.casadosdados.com.br/v2/public/cnpj/search"


def casadosdados_lookup(
    nome: str, city: str | None, uf: str | None, *, client=None, timeout: float = 15.0
) -> list[dict]:
    import httpx

    own = client is None
    client = client or httpx.Client(
        timeout=timeout,
        headers={"User-Agent": "garimpo-esteira", "Content-Type": "application/json"},
    )
    try:
        body = {
            "query": {
                "termo": [nome],
                "uf": [uf.upper()] if uf else [],
                "municipio": [_norm(city).upper()] if city else [],
            },
            "page": 1,
        }
        r = client.post(CASADOSDADOS_URL, json=body)
        if r.status_code != 200:
            return []
        rows = ((r.json().get("data") or {}).get("cnpj")) or []
        out: list[dict] = []
        for row in rows[:20]:
            out.append({
                "cnpj": row.get("cnpj"),
                "nome": (row.get("nome_fantasia") or row.get("razao_social")
                         or row.get("nomeFantasia") or row.get("razaoSocial")),
                "phone": (row.get("telefone_1") or row.get("telefone")
                          or row.get("ddd_telefone_1")),
                "city": row.get("municipio"),
                "neighborhood": row.get("bairro"),
                "street": row.get("logradouro"),
                "uf": row.get("uf"),
            })
        return out
    except (httpx.HTTPError, ValueError):
        return []
    finally:
        if own:
            client.close()
