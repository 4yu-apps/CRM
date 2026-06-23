"""Cadeia de provedores de rascunho: varias chaves Gemini -> Groq -> mock."""
import pytest

from garimpo_esteira.config import Config, build_provider, gemini_keys, _chain_fallback
from garimpo_esteira.draft.fallback import FallbackDraftProvider
from garimpo_esteira.draft.gemini import GeminiDraftProvider
from garimpo_esteira.draft.mock import MockDraftProvider
from garimpo_esteira.models import Lead


def _lead() -> Lead:
    return Lead(id="1", owner_id="o", business_name="Teste", phone="11999999999")


class _Boom:
    model = "boom"

    def generate(self, lead):
        raise RuntimeError("limite/erro")


class _Empty:
    model = "empty"

    def generate(self, lead):
        return "", ""


class _Ok:
    model = "ok"

    def __init__(self, a="a", b="b"):
        self._a, self._b = a, b

    def generate(self, lead):
        return self._a, self._b


# --- gemini_keys: junta e dedup ---

def test_gemini_keys_junta_lista_e_singular_sem_duplicar():
    cfg = Config(gemini_keys="k1, k2 , k3", gemini_key="k1")
    assert gemini_keys(cfg) == ["k1", "k2", "k3"]


def test_gemini_keys_vazio():
    assert gemini_keys(Config()) == []


def test_gemini_keys_so_singular():
    assert gemini_keys(Config(gemini_key="abc")) == ["abc"]


# --- _chain_fallback: cai pro proximo ---

def test_chain_cai_no_proximo_quando_primeiro_explode():
    chain = _chain_fallback([_Boom(), _Boom(), _Ok("x", "y")])
    assert chain.generate(_lead()) == ("x", "y")


def test_chain_cai_quando_retorno_vazio():
    chain = _chain_fallback([_Empty(), _Ok("z", "w")])
    assert chain.generate(_lead()) == ("z", "w")


def test_chain_um_so_provider():
    chain = _chain_fallback([_Ok("a", "b")])
    assert chain.generate(_lead()) == ("a", "b")


# --- build_provider: monta a cadeia certa ---

def _leaves(p):
    if isinstance(p, FallbackDraftProvider):
        return [p._primary] + _leaves(p._backup)
    return [p]


def test_build_provider_gemini_encadeia_chaves_groq_e_mock():
    cfg = Config(llm="gemini", gemini_keys="k1,k2,k3", groq_key="g")
    prov = build_provider(cfg)
    leaves = _leaves(prov)
    # 3 gemini + 1 groq + 1 mock
    assert sum(isinstance(p, GeminiDraftProvider) for p in leaves) == 3
    assert isinstance(leaves[-1], MockDraftProvider)
    assert len(leaves) == 5


def test_build_provider_gemini_sem_groq_cai_direto_no_mock():
    cfg = Config(llm="gemini", gemini_keys="k1,k2")
    leaves = _leaves(build_provider(cfg))
    assert sum(isinstance(p, GeminiDraftProvider) for p in leaves) == 2
    assert isinstance(leaves[-1], MockDraftProvider)
    assert len(leaves) == 3


def test_build_provider_gemini_sem_chave_explode():
    with pytest.raises(SystemExit):
        build_provider(Config(llm="gemini"))


def test_build_provider_groq_cai_no_mock():
    leaves = _leaves(build_provider(Config(llm="groq", groq_key="g")))
    assert isinstance(leaves[-1], MockDraftProvider)


def test_build_provider_mock_default():
    assert isinstance(build_provider(Config(llm="mock")), MockDraftProvider)
