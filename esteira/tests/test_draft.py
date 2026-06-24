from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.draft_stage import draft_batch, draft_one
from garimpo_esteira.models import Lead
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def _qualificado(sink, **kw):
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", **kw))
    sink.set_status(lid, "enriquecido")
    sink.set_status(lid, "qualificado")
    return lid


def test_mock_provider_returns_two_messages():
    p = MockDraftProvider()
    m1, m2 = p.generate(Lead(id="l", owner_id="o", business_name="Studio Bella", rating=4.8, reviews_count=200))
    assert "Studio Bella" in m1
    assert m1 and m2 and m1 != m2
    assert p.model == "mock"


def _gen(service_target, **kw):
    base = dict(id="l", owner_id="o", business_name="Negocio X", rating=4.6,
                reviews_count=200, service_target=service_target)
    base.update(kw)
    return MockDraftProvider().generate(Lead(**base))


def test_copy_por_servico_difere():
    assert _gen("trafego") != _gen("automacao")


def test_trafego_copy_fala_de_anuncio():
    m1, m2 = _gen("trafego")
    assert "Negocio X" in m1
    assert "anúncio" in m1.lower() or "tráfego" in m2.lower() or "trafego" in m2.lower()


def test_automacao_copy_fala_de_atendimento():
    m1, m2 = _gen("automacao", category="Clínica odontológica")
    assert "Negocio X" in m1
    blob = (m1 + " " + m2).lower()
    assert "atendimento" in blob or "agend" in blob
    assert "autom" in blob


def test_ambos_cita_o_outro_servico():
    m1, m2 = _gen("ambos")
    assert "autom" in (m1 + " " + m2).lower()


def test_sem_travessao_em_nenhum_servico():
    for st in ("trafego", "automacao", "ambos", "indefinido"):
        m1, m2 = _gen(st, category="Clínica")
        assert "—" not in (m1 + m2)
        assert "–" not in (m1 + m2)


def test_draft_stage_advances_to_rascunho_pronto(tmp_path):
    sink = _sink(tmp_path)
    lid = _qualificado(sink, business_name="Forte", phone="44999990001", rating=4.7, reviews_count=200)
    draft_batch(sink, MockDraftProvider(), batch=20)
    lead = sink.get_lead(lid)
    assert lead.status == "rascunho_pronto"
    assert lead.draft_msg1 and lead.draft_msg2
    assert lead.draft_model == "mock"
    assert lead.draft_generated_at is not None


def test_draft_respects_opt_out_lgpd(tmp_path):
    sink = _sink(tmp_path)
    lid = _qualificado(sink, business_name="X", phone="44999990001", rating=4.7, reviews_count=200)
    sink.update_lead_fields(lid, {"opt_out": True})
    lead = sink.get_lead(lid)
    assert draft_one(lead, MockDraftProvider(), sink) is None
    assert sink.get_lead(lid).status == "qualificado"  # não avançou


def test_draft_idempotent(tmp_path):
    sink = _sink(tmp_path)
    _qualificado(sink, phone="44999990001", rating=4.7, reviews_count=200)
    draft_batch(sink, MockDraftProvider(), batch=20)
    assert draft_batch(sink, MockDraftProvider(), batch=20) == []  # nada em 'qualificado'


# ---- Novos testes: frases proibidas e angulo iFood ----

_BANNED = [
    "espero que esteja bem",
    "sem compromisso",
    "revolucionar",
    "alavancar",
    "prezado",
    "venho por meio desta",
    "aproveitar esta oportunidade",
]


def test_mock_sem_frases_proibidas_trafego():
    m1, m2 = _gen("trafego", category="Salao de Beleza")
    blob = (m1 + " " + m2).lower()
    for frase in _BANNED:
        assert frase.lower() not in blob, f"frase proibida '{frase}' encontrada no roteiro trafego"


def test_mock_sem_frases_proibidas_automacao():
    m1, m2 = _gen("automacao", category="Clinica Odontologica")
    blob = (m1 + " " + m2).lower()
    for frase in _BANNED:
        assert frase.lower() not in blob, f"frase proibida '{frase}' encontrada no roteiro automacao"


def test_mock_sem_frases_proibidas_design():
    m1, m2 = _gen("design", category="Loja de Roupas")
    blob = (m1 + " " + m2).lower()
    for frase in _BANNED:
        assert frase.lower() not in blob, f"frase proibida '{frase}' encontrada no roteiro design"


def test_mock_sem_frases_proibidas_marketing():
    m1, m2 = _gen("marketing", category="Academia")
    blob = (m1 + " " + m2).lower()
    for frase in _BANNED:
        assert frase.lower() not in blob, f"frase proibida '{frase}' encontrada no roteiro marketing"


def test_food_trafego_menciona_ifood():
    """Categoria alimentacao no roteiro de trafego deve perguntar sobre iFood."""
    m1, m2 = _gen("trafego", category="Pizzaria")
    assert "iFood" in (m1 + m2), (
        "Esperado pergunta sobre iFood pra categoria alimentacao, mas nao encontrado. "
        f"m1={m1!r}"
    )


def test_food_trafego_ifood_e_pergunta_nao_afirmacao():
    """A mensagem com iFood deve ter ponto de interrogacao (e pergunta, nao afirmacao)."""
    m1, m2 = _gen("trafego", category="Hamburgueria")
    assert "?" in m1, f"Esperado '?' em msg1 com iFood mas nao encontrado: {m1!r}"


# ---- #3: copy guiada por sinais, humanizada, sem "regiao" ----

def test_copy_nunca_fala_em_regiao():
    """A busca cobre o Brasil todo: NUNCA dizer 'na regiao' nem 'aqui perto'."""
    for st in ("trafego", "automacao", "ambos", "design", "marketing", "indefinido"):
        m1, m2 = _gen(st, category="Salao de Beleza")
        blob = (m1 + " " + m2).lower()
        assert "regi" not in blob, f"{st}: copy fala em regiao: {m1!r}"
        assert "aqui perto" not in blob, f"{st}: copy fala 'aqui perto': {m1!r}"


def test_copy_diz_que_encontrou_no_google():
    m1, _ = _gen("trafego")
    assert "google" in m1.lower()


def test_copy_varia_por_sinal_de_anuncio():
    """Mesmo servico, sinais diferentes => abertura diferente (copy por situacao)."""
    anuncia = _gen("ambos", category="Estética", ads_active=True,
                   website="x.com", instagram="@x")[0]
    sem = _gen("ambos", category="Estética", website=None, instagram=None)[0]
    assert anuncia != sem


def test_copy_abertura_tem_pergunta_aberta():
    m1, _ = _gen("ambos", category="Academia")
    assert "?" in m1
