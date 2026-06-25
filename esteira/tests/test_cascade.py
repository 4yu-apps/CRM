import json

from garimpo_esteira.cascade import enrich_batch, enrich_lead
from garimpo_esteira.models import Finding, Lead
from garimpo_esteira.sink import JsonFileSink
from garimpo_esteira.sources import AdLibrarySource, CnpjSource, InstagramSource, WebsiteSource

FAKE_CNPJ = {
    "11222333000144": {
        "ddd_telefone_1": "44 99999-0002",
        "email": "contato@studiobella.com.br",
        "qsa": [{"nome_socio": "Marina Alves"}],
    }
}


def _sources(ad_probe=None):
    return [
        CnpjSource(fetch=lambda c: FAKE_CNPJ.get(c)),
        InstagramSource(),
        WebsiteSource(reachable=lambda _u: True),
        AdLibrarySource(probe=ad_probe),
    ]


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def test_cascade_enriches_and_advances(tmp_path):
    sink = _sink(tmp_path)
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto",
                          business_name="Studio Bella", cnpj="11.222.333/0001-44",
                          instagram="instagram.com/studiobella"))
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto",
                          business_name="Pizzaria", phone="(44) 99999-0001"))

    results = enrich_batch(sink, _sources(), batch=20, delay=0)
    assert len(results) == 2
    assert all(r.new_status == "enriquecido" for r in results)
    assert sink.counts() == {"enriquecido": 2}

    # lead com CNPJ saiu com telefone + dono
    bella = next(r for r in results if "phone" in r.fields_filled)
    lead = sink.get_lead(bella.lead_id)
    assert lead.phone == "44999990002"
    assert lead.owner_name == "Marina Alves"
    assert bella.match_rate > 0.5


def test_cascade_records_provenance(tmp_path):
    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    enrich_batch(sink, _sources(), batch=20, delay=0)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    prov = [p for p in db["provenance"] if p["lead_id"] == lid]
    fields = {p["field_name"] for p in prov}
    assert {"phone", "owner_name", "email"} <= fields
    assert all(p["source"] == "cnpj_brasilapi" for p in prov)


def test_cascade_is_idempotent(tmp_path):
    sink = _sink(tmp_path)
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    enrich_batch(sink, _sources(), batch=20, delay=0)
    db1 = (tmp_path / "db.json").read_text("utf-8")

    # roda de novo: status já é enriquecido, não há 'bruto' -> nada muda
    second = enrich_batch(sink, _sources(), batch=20, delay=0)
    assert second == []
    db2 = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert len(db2["provenance"]) == len(json.loads(db1)["provenance"])


def test_dedup_blocks_same_cnpj(tmp_path):
    sink = _sink(tmp_path)
    first = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    dup = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11222333000144"))
    assert first is not None
    assert dup is None


def test_ad_library_signal_is_provenance_not_set_by_enrichment(tmp_path):
    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    enrich_batch(sink, _sources(ad_probe=lambda _lead: True), batch=20, delay=0)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    ads = [p for p in db["provenance"] if p["field_name"] == "ads_active"]
    assert ads and ads[0]["value"] == "sim"
    # ads_active virou coluna (B1), mas o enriquecimento NAO a preenche:
    # quem promove o sinal pra coluna do lead e o estagio de score.
    assert db["leads"][lid].get("ads_active") is None


def test_social_signals_agrega_instagram_e_anuncios_sem_apagar_existente(tmp_path):
    class SocialSource:
        name = "instagram"

        def enrich(self, lead):
            return [
                Finding("instagram_followers", "instagram", "1200", 0.8),
                Finding("instagram_last_post", "instagram", "2026-06-20T10:00:00+0000", 0.8),
                Finding("instagram_post_freq", "instagram", "3.5", 0.7),
                Finding("instagram_post_freq_label", "instagram", "≈4x/semana", 0.7),
                Finding("instagram_status", "instagram", "ativo", 0.7),
                Finding("ads_active", "meta_ad_library", "sim", 0.7),
                Finding("ads_count", "meta_ad_library", "8", 0.7),
            ]

    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(
        id="", owner_id="o", status="rascunho_pronto",
        social_signals={"ads_since": "2025-01-01"},
    ))
    enrich_lead(sink.get_lead(lid), [SocialSource()], sink, advance_status=False)

    social = sink.get_lead(lid).social_signals
    assert social["followers"] == 1200
    assert social["post_freq"] == 3.5
    assert social["post_freq_label"] == "≈4x/semana"
    assert social["ads_active"] is True
    assert social["ads_count"] == 8
    assert social["ads_since"] == "2025-01-01"
    assert social["ad_platforms"] == ["meta"]


def test_site_signals_faz_merge_de_fontes_e_preserva_existente(tmp_path):
    class SiteSource:
        name = "website"

        def enrich(self, lead):
            return [Finding("site_signals", "website", json.dumps({"slow": True}), 0.8)]

    class BizSource:
        name = "biz_signals"

        def enrich(self, lead):
            return [
                Finding(
                    "site_signals",
                    "biz_signals",
                    json.dumps({"phone_type": "celular"}),
                    0.8,
                )
            ]

    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(
        id="", owner_id="o", status="rascunho_pronto",
        site_signals={"https": True},
    ))
    enrich_lead(
        sink.get_lead(lid),
        [SiteSource(), BizSource()],
        sink,
        advance_status=False,
    )

    signals = sink.get_lead(lid).site_signals
    assert signals == {"https": True, "slow": True, "phone_type": "celular"}


def _sources_offline(html=None, ad_probe=None):
    # WebsiteSource com fetch injetado pra nao tocar a rede nos testes.
    return [
        CnpjSource(fetch=lambda c: FAKE_CNPJ.get(c)),
        InstagramSource(),
        WebsiteSource(reachable=lambda _u: True, fetch_html=lambda _u: html),
        AdLibrarySource(probe=ad_probe),
    ]


def test_fetch_backfill_pega_quem_tem_site_e_falta_dado(tmp_path):
    sink = _sink(tmp_path)
    alvo = sink.insert_lead(Lead(id="", owner_id="o", status="rascunho_pronto",
                                 website="https://a.com", phone="44999990001"))
    # sem site: nao e alvo de backfill
    sink.insert_lead(Lead(id="", owner_id="o", status="rascunho_pronto", phone="44999990002"))
    # com site mas ja completo (facebook+instagram+whatsapp): nao e alvo
    sink.insert_lead(Lead(id="", owner_id="o", status="rascunho_pronto", website="https://b.com",
                          facebook="b", instagram="@b", whatsapp="44999990009"))
    alvos = sink.fetch_backfill(10)
    assert [l.id for l in alvos] == [alvo]


def test_fetch_backfill_rotaciona_pelo_carimbo(tmp_path):
    sink = _sink(tmp_path)
    velho = sink.insert_lead(Lead(id="", owner_id="o", website="https://a.com"))
    novo = sink.insert_lead(Lead(id="", owner_id="o", website="https://b.com"))
    # carimba o 'velho' como ja processado; o sem-carimbo (novo) vem primeiro
    sink.update_lead_fields(velho, {"backfilled_at": "2026-06-21T10:00:00+00:00"})
    alvos = sink.fetch_backfill(10)
    assert alvos[0].id == novo  # nulo (nunca carimbado) primeiro
    assert [l.id for l in alvos] == [novo, velho]


def test_backfill_enrich_lead_preenche_sem_mudar_status(tmp_path):
    sink = _sink(tmp_path)
    html = '<a href="https://facebook.com/negocioA">fb</a> <a href="https://wa.me/5544999990003">wa</a>'
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="rascunho_pronto", website="https://a.com"))
    lead = sink.get_lead(lid)

    res = enrich_lead(lead, _sources_offline(html=html, ad_probe=lambda _l: True), sink, advance_status=False)
    assert res.new_status == "rascunho_pronto"  # NAO mexe no status

    out = sink.get_lead(lid)
    assert out.status == "rascunho_pronto"
    assert out.facebook == "negocioa"
    assert out.whatsapp == "44999990003"
    # ads_active foi pra proveniencia (o backfill promove pra coluna no cmd)
    prov = sink.fetch_provenance(lid)
    assert any(p["field_name"] == "ads_active" and p["value"] == "sim" for p in prov)


def test_failing_source_does_not_break_cascade(tmp_path):
    class Boom:
        name = "boom"

        def enrich(self, lead):
            raise RuntimeError("fonte instavel")

    sink = _sink(tmp_path)
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    results = enrich_batch(sink, [Boom(), CnpjSource(fetch=lambda c: FAKE_CNPJ.get(c))], batch=20, delay=0)
    assert results[0].new_status == "enriquecido"
    assert sink.get_lead(results[0].lead_id).phone == "44999990002"
