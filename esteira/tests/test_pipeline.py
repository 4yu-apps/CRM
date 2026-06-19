"""E2E da esteira inteira: bruto -> enriquecido -> qualificado/descartado -> rascunho_pronto."""
from garimpo_esteira.cascade import enrich_batch
from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.draft_stage import draft_batch
from garimpo_esteira.models import Lead
from garimpo_esteira.score_stage import score_batch
from garimpo_esteira.sink import JsonFileSink
from garimpo_esteira.sources import CnpjSource, InstagramSource, WebsiteSource

FAKE_CNPJ = {
    "11222333000144": {"ddd_telefone_1": "44 99999-0002", "qsa": [{"nome_socio": "Marina"}]},
}


def _sources():
    return [
        CnpjSource(fetch=lambda c: FAKE_CNPJ.get(c)),
        InstagramSource(),
        WebsiteSource(reachable=lambda _u: True),
    ]


def test_full_pipeline(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    # forte (qualifica): nota alta, volume ideal, CNPJ -> ganha telefone, sem site
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto", business_name="Forte",
                          cnpj="11.222.333/0001-44", rating=4.7, reviews_count=300))
    # fraco (descarta): nota baixa, poucas avaliacoes
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto", business_name="Fraco",
                          phone="44999990003", rating=3.4, reviews_count=8))

    enrich_batch(sink, _sources(), batch=20, delay=0)
    score_batch(sink, batch=20)
    drafts = draft_batch(sink, MockDraftProvider(), batch=20)

    counts = sink.counts()
    assert counts.get("rascunho_pronto") == 1
    assert counts.get("descartado") == 1
    assert len(drafts) == 1

    # o lead forte chegou com telefone (via CNPJ), score e rascunho
    forte_id = drafts[0][0]
    forte = sink.get_lead(forte_id)
    assert forte.phone == "44999990002"
    assert forte.score is not None
    assert forte.draft_msg1
