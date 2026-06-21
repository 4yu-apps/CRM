"""Testes do extrator de contato por LLM (Groq) — reforço do regex."""
from garimpo_esteira.sources.extract_llm import condense, make_groq_extractor


def _fake_completion(payload_json: str):
    return {"choices": [{"message": {"content": payload_json}}]}


def test_condense_tira_script_e_tags():
    html = "<html><script>var x=1</script><p>Fale: contato</p></html>"
    out = condense(html)
    assert "var x" not in out
    assert "Fale: contato" in out


def test_extractor_limpa_e_normaliza():
    def post(_body):
        return _fake_completion(
            '{"instagram":"@Clinica.Bella","facebook":"facebook.com/clinicabella",'
            '"whatsapp":"https://wa.me/5544999990003","phone":null,"email":"oi@bella.com"}'
        )

    extract = make_groq_extractor("k", "http://x", "m", post=post)
    out = extract("<html>...</html>", "Clinica Bella")
    assert out["instagram"] == "@Clinica.Bella"  # clean preserva o caixa do handle
    assert out["facebook"] == "clinicabella"
    assert out["whatsapp"] == "44999990003"
    assert out["email"] == "oi@bella.com"
    assert "phone" not in out  # veio null


def test_extractor_falha_vira_dict_vazio():
    def post(_body):
        raise RuntimeError("rate limit")

    extract = make_groq_extractor("k", "http://x", "m", post=post)
    assert extract("<html>x</html>", "Negocio") == {}


def test_extractor_json_quebrado_vira_vazio():
    extract = make_groq_extractor("k", "http://x", "m", post=lambda _b: _fake_completion("nao e json"))
    assert extract("<html>x</html>", "Negocio") == {}


def test_extractor_sem_html_nao_chama():
    chamado = {"n": 0}

    def post(_b):
        chamado["n"] += 1
        return _fake_completion("{}")

    extract = make_groq_extractor("k", "http://x", "m", post=post)
    assert extract("", "Negocio") == {}
    assert chamado["n"] == 0
