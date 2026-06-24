"""PlacesDetailsSource: preenche telefone/site das capturas e RESPEITA a cota
diaria do Maps (telefone = SKU Enterprise, 1.000 gratis/mes ~= 30/dia)."""
from garimpo_esteira.models import Lead
from garimpo_esteira.sources.places_details import PlacesDetailsSource


def _lead(**kw) -> Lead:
    base = dict(id="l", owner_id="o", status="bruto", maps_place_id="ChIJ123")
    base.update(kw)
    return Lead(**base)


def test_preenche_telefone_e_site():
    src = PlacesDetailsSource(
        lambda pid: {"phone": "44 99999-0001", "website": "https://x.com"},
        daily_limit=10, count_today=lambda: 0,
    )
    fields = {f.field_name: f.value for f in src.enrich(_lead())}
    assert fields.get("phone") == "44 99999-0001"
    assert fields.get("website") == "https://x.com"
    assert "places_detailed_at" in fields  # carimbo da cota


def test_nao_gasta_cota_se_ja_tem_telefone():
    calls = []
    src = PlacesDetailsSource(
        lambda pid: (calls.append(pid), {"phone": "x"})[1],
        daily_limit=10, count_today=lambda: 0,
    )
    assert src.enrich(_lead(phone="44999990000")) == []
    assert calls == []  # nao chamou a API


def test_nao_gasta_cota_sem_place_id():
    calls = []
    src = PlacesDetailsSource(
        lambda pid: (calls.append(pid), {})[1],
        daily_limit=10, count_today=lambda: 0,
    )
    assert src.enrich(_lead(maps_place_id=None)) == []
    assert calls == []


def test_para_quando_bate_a_cota_diaria():
    calls = []
    src = PlacesDetailsSource(
        lambda pid: (calls.append(pid), {"phone": "44 99999-0002"})[1],
        daily_limit=2, count_today=lambda: 0,
    )
    # 3 leads sem telefone: so 2 chamam (limite=2), o 3o para
    r1 = src.enrich(_lead(id="1"))
    r2 = src.enrich(_lead(id="2"))
    r3 = src.enrich(_lead(id="3"))
    assert len(calls) == 2
    assert r1 and r2 and r3 == []


def test_para_quando_bate_o_teto_mensal():
    calls = []
    # ja gastou 1000 no mes (teto), mesmo com o dia livre => nao chama
    src = PlacesDetailsSource(
        lambda pid: (calls.append(pid), {"phone": "x"})[1],
        daily_limit=25, count_today=lambda: 0,
        monthly_limit=1000, count_month=lambda: 1000,
    )
    assert src.enrich(_lead()) == []
    assert calls == []


def test_teto_mensal_limita_abaixo_do_diario():
    calls = []
    # so resta 1 no mes (999/1000), mesmo com o dia livre => so 1 chamada
    src = PlacesDetailsSource(
        lambda pid: (calls.append(pid), {"phone": "x"})[1],
        daily_limit=25, count_today=lambda: 0,
        monthly_limit=1000, count_month=lambda: 999,
    )
    src.enrich(_lead(id="1"))
    src.enrich(_lead(id="2"))
    assert len(calls) == 1


def test_respeita_uso_ja_feito_hoje():
    calls = []
    # ja gastou 30 hoje, limite 30 => zero sobra, nao chama
    src = PlacesDetailsSource(
        lambda pid: (calls.append(pid), {"phone": "x"})[1],
        daily_limit=30, count_today=lambda: 30,
    )
    assert src.enrich(_lead()) == []
    assert calls == []
