"""Pipeline streaming lead-a-lead: cada lead passa enrich -> score -> draft
inteiro e cai na fila assim que fica pronto, em vez do batch por estagio.

Foco aqui e a ORQUESTRACAO (ordem lead-major, isolamento de erro por lead,
contagens/feed). A logica de enrich/score/draft em si ja e coberta por
test_cascade / test_score_stage / test_draft / test_pipeline; por isso estes
testes usam sources=[] e leads com dados completos, pra serem deterministas.
"""
from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.models import Lead
from garimpo_esteira.pipeline_stream import process_one_lead, run_pipeline_streaming
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def _forte(phone: str, name: str = "Forte") -> Lead:
    # rating 4.7 + 300 avaliacoes + telefone, sem site/IG -> trafego ~93 -> qualifica
    return Lead(id="", owner_id="o", status="bruto", business_name=name,
                phone=phone, rating=4.7, reviews_count=300)


def _fraco(phone: str, name: str = "Fraco") -> Lead:
    # nota baixa + poucas avaliacoes -> abaixo do corte (50) -> descarta
    return Lead(id="", owner_id="o", status="bruto", business_name=name,
                phone=phone, rating=3.4, reviews_count=8)


def _by_name(sink: JsonFileSink, name: str) -> dict:
    return next(r for r in sink._db["leads"].values() if r["business_name"] == name)


def test_cada_lead_termina_o_funil(tmp_path):
    """Todo lead bruto sai do bruto: forte vira rascunho_pronto, fraco descartado."""
    sink = _sink(tmp_path)
    sink.insert_lead(_forte("44999990001"))
    sink.insert_lead(_fraco("44999990002"))

    counts = run_pipeline_streaming(sink, [], MockDraftProvider(), owner_id="o")

    assert counts == {"enriched": 2, "discarded": 1, "drafted": 1}
    funil = sink.counts()
    assert funil.get("rascunho_pronto") == 1
    assert funil.get("descartado") == 1
    assert funil.get("bruto") is None  # nenhum lead ficou pra tras
    assert funil.get("enriquecido") is None
    assert funil.get("qualificado") is None


def test_streaming_lead_a_lead_nao_por_estagio(tmp_path):
    """Prova a ordem lead-major: o lead #1 chega a rascunho_pronto ANTES de o
    lead #2 comecar o enrich. Em batch por estagio, os 2 enriqueceriam primeiro."""
    sink = _sink(tmp_path)
    sink.insert_lead(_forte("44999990001", "Primeiro"))
    sink.insert_lead(_forte("44999990002", "Segundo"))

    run_pipeline_streaming(sink, [], MockDraftProvider(), owner_id="o")

    to_seq = [h["to_status"] for h in sink._db["history"]]
    first_rascunho = to_seq.index("rascunho_pronto")
    # antes do 1o rascunho, so UM lead enriqueceu (lead-major); em batch seriam 2
    assert to_seq[:first_rascunho].count("enriquecido") == 1


def test_erro_em_um_lead_nao_derruba_os_outros(tmp_path):
    """Um lead que estoura no meio do processamento nao impede os demais de
    entrarem na fila (try/except por lead)."""
    class FlakyProvider:
        model = "flaky"

        def generate(self, lead):
            if lead.business_name == "Bomba":
                raise RuntimeError("falha simulada no draft")
            return ("oi", "tudo bem?")

    sink = _sink(tmp_path)
    sink.insert_lead(_forte("44999990001", "Bomba"))   # processado primeiro, estoura
    sink.insert_lead(_forte("44999990002", "Bom"))     # tem que chegar na fila mesmo assim

    counts = run_pipeline_streaming(sink, [], FlakyProvider(), owner_id="o")

    assert _by_name(sink, "Bom")["status"] == "rascunho_pronto"
    assert _by_name(sink, "Bomba")["status"] == "qualificado"  # parou onde falhou
    assert counts["drafted"] == 1


def test_emite_eventos_de_atividade_com_totais(tmp_path):
    """Feed da home preservado: emite enriquecimento/descarte/rascunho com os
    ref_count agregados, igual ao pipeline batch de hoje."""
    sink = _sink(tmp_path)
    sink.insert_lead(_forte("44999990001"))
    sink.insert_lead(_fraco("44999990002"))

    run_pipeline_streaming(sink, [], MockDraftProvider(), owner_id="o")

    acts = {a["tipo"]: a for a in sink._db.get("activity", [])}
    assert acts["enriquecimento"]["ref_count"] == 2
    assert acts["descarte"]["ref_count"] == 1
    assert acts["rascunho"]["ref_count"] == 1


def test_idempotente_segunda_rodada_nao_reprocessa(tmp_path):
    """Rodar de novo nao duplica nem retrocede: sem bruto, nada a fazer."""
    sink = _sink(tmp_path)
    sink.insert_lead(_forte("44999990001"))
    sink.insert_lead(_fraco("44999990002"))

    run_pipeline_streaming(sink, [], MockDraftProvider(), owner_id="o")
    counts2 = run_pipeline_streaming(sink, [], MockDraftProvider(), owner_id="o")

    assert counts2 == {"enriched": 0, "discarded": 0, "drafted": 0}
    funil = sink.counts()
    assert funil.get("rascunho_pronto") == 1
    assert funil.get("descartado") == 1


def test_process_one_lead_retorna_resultado(tmp_path):
    """process_one_lead processa UM lead e reporta o que aconteceu."""
    sink = _sink(tmp_path)
    lead_id = sink.insert_lead(_forte("44999990001"))
    lead = sink.get_lead(lead_id)

    r = process_one_lead(lead, [], MockDraftProvider(), sink)

    assert r == {"enriched": True, "discarded": False, "drafted": True}
    assert sink.get_lead(lead_id).status == "rascunho_pronto"
