"""Testes da fonte ReviewsSource (Place Details New)."""
import json

import pytest

from garimpo_esteira.models import Lead
from garimpo_esteira.sources.reviews import (
    ReviewsSource,
    make_groq_review_summarizer,
    place_details_reviews,
)


def _lead_pid(pid="p1"):
    return Lead(id="l", owner_id="o", maps_place_id=pid)


def test_reviews_respeita_teto_por_run():
    # Fase 5: Reviews usa o SKU pago do Places Details. Teto por-run evita estouro
    # se a fonte for ligada (GARIMPO_REVIEWS=1).
    calls = {"n": 0}

    def fetch(pid):
        calls["n"] += 1
        return [{"rating": 5, "text": "otimo"}]

    src = ReviewsSource(fetch=fetch, request_limit=2)
    src.enrich(_lead_pid())
    src.enrich(_lead_pid())
    src.enrich(_lead_pid())  # 3a barrada pelo teto
    assert calls["n"] == 2


def test_reviews_sem_teto_quando_zero():
    calls = {"n": 0}

    def fetch(pid):
        calls["n"] += 1
        return []

    src = ReviewsSource(fetch=fetch, request_limit=0)
    src.enrich(_lead_pid())
    src.enrich(_lead_pid())
    assert calls["n"] == 2


class FakeResp:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = payload or {}

    def json(self):
        return self._payload


class FakeClient:
    """Client httpx falso: registra a chamada e devolve FakeResp configurada."""

    def __init__(self, resp: FakeResp):
        self._resp = resp
        self.calls: list[dict] = []
        self.closed = False

    def get(self, url, *, headers=None, **kw):
        self.calls.append({"url": url, "headers": headers or {}})
        return self._resp

    def close(self):
        self.closed = True


def _lead(**kw):
    base = dict(id="l1", owner_id="o", business_name="Pizzaria Central", maps_place_id="ChI123")
    base.update(kw)
    return Lead(**base)


# --- place_details_reviews ---

def test_monta_header_fieldmask_reviews():
    resp = FakeResp(200, {"reviews": []})
    cli = FakeClient(resp)
    fetch = place_details_reviews("key-abc", client=cli)
    fetch("ChI123")
    assert cli.calls[0]["headers"]["X-Goog-FieldMask"] == "reviews"
    assert cli.calls[0]["headers"]["X-Goog-Api-Key"] == "key-abc"


def test_parseia_reviews_com_text():
    payload = {
        "reviews": [
            {"rating": 5, "text": {"text": "Otima pizza!"}},
            {"rating": 3, "originalText": {"text": "Demora muito."}},
        ]
    }
    fetch = place_details_reviews("k", client=FakeClient(FakeResp(200, payload)))
    result = fetch("p1")
    assert len(result) == 2
    assert result[0] == {"rating": 5, "text": "Otima pizza!"}
    assert result[1] == {"rating": 3, "text": "Demora muito."}


def test_status_nao_200_retorna_lista_vazia():
    fetch = place_details_reviews("k", client=FakeClient(FakeResp(403, {})))
    assert fetch("p1") == []


def test_excecao_retorna_lista_vazia():
    class BoomClient:
        def get(self, *a, **k):
            raise ConnectionError("boom")
        def close(self):
            pass

    fetch = place_details_reviews("k", client=BoomClient())
    assert fetch("p1") == []


def test_sem_reviews_retorna_lista_vazia():
    fetch = place_details_reviews("k", client=FakeClient(FakeResp(200, {"reviews": []})))
    assert fetch("p1") == []


def test_review_sem_text_ignorado():
    payload = {"reviews": [{"rating": 4}]}
    fetch = place_details_reviews("k", client=FakeClient(FakeResp(200, payload)))
    assert fetch("p1") == []


# --- ReviewsSource ---

def test_sem_fetch_retorna_vazio():
    src = ReviewsSource()
    assert src.enrich(_lead()) == []


def test_sem_place_id_retorna_vazio():
    src = ReviewsSource(fetch=lambda _: [{"rating": 5, "text": "ok"}])
    lead = _lead(maps_place_id=None)
    assert src.enrich(lead) == []


def test_com_fetch_sem_summarizer_emite_review_sample():
    reviews = [
        {"rating": 5, "text": "Excelente atendimento!"},
        {"rating": 4, "text": "Muito bom."},
    ]
    src = ReviewsSource(fetch=lambda _: reviews)
    findings = src.enrich(_lead())
    assert len(findings) == 1
    f = findings[0]
    assert f.field_name == "review_sample"
    assert f.source == "google_maps"
    data = json.loads(f.value)
    assert len(data) == 2
    assert data[0]["rating"] == 5


def test_com_summarizer_que_retorna_elogio_emite_dois_findings():
    reviews = [{"rating": 5, "text": "Otimo!"}]
    themes = {"elogio": "o atendimento", "reclamacao": "", "resumo": "Otimo lugar."}

    src = ReviewsSource(fetch=lambda _: reviews, summarize=lambda _: themes)
    findings = src.enrich(_lead())
    names = [f.field_name for f in findings]
    assert "review_sample" in names
    assert "review_themes" in names
    tf = next(f for f in findings if f.field_name == "review_themes")
    assert json.loads(tf.value)["elogio"] == "o atendimento"
    assert tf.source == "google_maps"


def test_summarizer_retorna_none_emite_so_sample():
    src = ReviewsSource(fetch=lambda _: [{"rating": 4, "text": "ok"}], summarize=lambda _: None)
    findings = src.enrich(_lead())
    assert len(findings) == 1
    assert findings[0].field_name == "review_sample"


def test_summarizer_sem_elogio_emite_so_sample():
    src = ReviewsSource(
        fetch=lambda _: [{"rating": 4, "text": "ok"}],
        summarize=lambda _: {"elogio": "", "reclamacao": "fila longa", "resumo": "ok"},
    )
    findings = src.enrich(_lead())
    assert len(findings) == 1
    assert findings[0].field_name == "review_sample"


def test_sample_trunca_texto_em_240():
    longo = "x" * 300
    src = ReviewsSource(fetch=lambda _: [{"rating": 5, "text": longo}])
    findings = src.enrich(_lead())
    data = json.loads(findings[0].value)
    assert len(data[0]["text"]) == 240


def test_sample_limita_3_reviews():
    reviews = [{"rating": i, "text": f"review {i}"} for i in range(1, 6)]
    src = ReviewsSource(fetch=lambda _: reviews)
    findings = src.enrich(_lead())
    data = json.loads(findings[0].value)
    assert len(data) == 3
