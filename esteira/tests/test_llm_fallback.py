"""Testes da rede de seguranca (fallback) e do provider OpenAI-compativel (Groq)."""
import garimpo_esteira.draft.openai_compat as oc
from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.draft.fallback import FallbackDraftProvider
from garimpo_esteira.draft.openai_compat import OpenAICompatDraftProvider
from garimpo_esteira.models import Lead


class _Boom:
    model = "boom"

    def generate(self, lead):
        raise RuntimeError("rate limit / sem credito")


class _Empty:
    model = "empty"

    def generate(self, lead):
        return "", ""


class _Good:
    model = "good"

    def generate(self, lead):
        return "abertura", "pitch"


def _lead():
    return Lead(id="l", owner_id="o", business_name="X", rating=4.7, reviews_count=200)


def test_fallback_usa_backup_quando_ia_quebra():
    fp = FallbackDraftProvider(_Boom(), MockDraftProvider())
    m1, m2 = fp.generate(_lead())
    assert m1 and m2  # nao quebrou, veio do mock


def test_fallback_usa_backup_quando_ia_volta_vazio():
    fp = FallbackDraftProvider(_Empty(), MockDraftProvider())
    m1, m2 = fp.generate(_lead())
    assert m1 and m2


def test_fallback_usa_a_ia_quando_funciona():
    fp = FallbackDraftProvider(_Good(), MockDraftProvider())
    assert fp.generate(_lead()) == ("abertura", "pitch")


def test_fallback_model_reflete_a_ia():
    assert FallbackDraftProvider(_Good(), MockDraftProvider()).model == "good"


# ---- provider OpenAI-compativel (Groq) ----

class _FakeResp:
    def __init__(self, content):
        self._c = content

    def raise_for_status(self):
        pass

    def json(self):
        return {"choices": [{"message": {"content": self._c}}]}


class _FakeClient:
    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, *a, **k):
        return _FakeResp('{"msg1": "Oi, vi a X", "msg2": "posso te mandar um exemplo?"}')


def test_openai_compat_parseia_o_json(monkeypatch):
    monkeypatch.setattr(oc.httpx, "Client", _FakeClient)
    p = OpenAICompatDraftProvider("chave", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile")
    m1, m2 = p.generate(_lead())
    assert m1 == "Oi, vi a X"
    assert m2 == "posso te mandar um exemplo?"
