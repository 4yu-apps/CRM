"""Configuração via ambiente + fábricas de sink e sources.

Espelha a ideia do front: um toggle decide se a esteira fala com o banco
(supabase) ou com um arquivo local (jsonfile); e se as fontes são reais
(rede) ou fixtures (offline, determinístico).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from .discovery import FixtureMapsSource, MapsSource
from .draft.base import DraftProvider
from .draft.mock import MockDraftProvider
from .sink.base import LeadSink
from .sink.jsonfile import JsonFileSink
from .sources import AdLibrarySource, CnpjSource, InstagramSource, Source, WebsiteSource

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"


@dataclass
class Config:
    sink: str = "jsonfile"            # jsonfile | supabase
    json_path: Path = Path("garimpo.json")
    supabase_url: str | None = None
    service_key: str | None = None
    owner_id: str | None = None
    sources_mode: str = "real"        # real | fixture
    batch: int = 20
    delay: float = 1.0
    ad_token: str | None = None
    llm: str = "mock"                 # mock | gemini | groq
    gemini_key: str | None = None
    gemini_model: str = "gemini-flash-latest"
    groq_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    # extracao de contato por LLM no enriquecimento (reforca o regex). Usa o Groq
    # (gratis); modelo rapido/barato basta. Liga sozinho quando ha GROQ_API_KEY.
    llm_extract: bool = True
    extract_model: str = "llama-3.1-8b-instant"
    maps_mode: str = "fixture"        # fixture | places
    maps_key: str | None = None
    maps_pages: int = 3               # paginas do Places por busca (~20 cada)
    extra_niches: int = 0             # nichos aleatorios extras por run (variedade)
    ig_business_id: str | None = None
    ig_token: str | None = None
    ig_stale_days: int = 60
    reviews_enabled: bool = False
    # PageSpeed Insights (Google, gratis): nota de performance do site. Liga
    # sozinho quando ha PAGESPEED_API_KEY (chave gratuita, sem cobranca); pode
    # forcar com GARIMPO_PAGESPEED=1 (modo sem chave, cota baixa).
    pagespeed_key: str | None = None
    pagespeed_enabled: bool = False

    @classmethod
    def from_env(cls) -> "Config":
        ps_key = os.getenv("PAGESPEED_API_KEY")
        ps_flag = os.getenv("GARIMPO_PAGESPEED")
        return cls(
            sink=os.getenv("GARIMPO_SINK", "jsonfile"),
            json_path=Path(os.getenv("GARIMPO_JSON", "garimpo.json")),
            supabase_url=os.getenv("SUPABASE_URL"),
            service_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            owner_id=os.getenv("OWNER_USER_ID"),
            sources_mode=os.getenv("GARIMPO_SOURCES", "real"),
            batch=int(os.getenv("GARIMPO_BATCH", "20")),
            delay=float(os.getenv("GARIMPO_DELAY", "1.0")),
            ad_token=os.getenv("META_AD_LIBRARY_TOKEN"),
            llm=os.getenv("GARIMPO_LLM", "mock"),
            gemini_key=os.getenv("GEMINI_API_KEY"),
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-flash-latest"),
            groq_key=os.getenv("GROQ_API_KEY"),
            groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            llm_extract=os.getenv("GARIMPO_LLM_EXTRACT", "1") not in ("0", "false", ""),
            extract_model=os.getenv("GARIMPO_EXTRACT_MODEL", "llama-3.1-8b-instant"),
            maps_mode=os.getenv("GARIMPO_MAPS", "fixture"),
            maps_key=os.getenv("GOOGLE_MAPS_API_KEY"),
            maps_pages=int(os.getenv("GARIMPO_MAPS_PAGES", "3")),
            extra_niches=int(os.getenv("GARIMPO_EXTRA_NICHES", "0")),
            ig_business_id=os.getenv("INSTAGRAM_BUSINESS_ID"),
            ig_token=os.getenv("INSTAGRAM_TOKEN") or os.getenv("META_AD_LIBRARY_TOKEN"),
            ig_stale_days=int(os.getenv("GARIMPO_IG_STALE_DAYS", "60")),
            reviews_enabled=os.getenv("GARIMPO_REVIEWS", "0") in ("1", "true", "True"),
            pagespeed_key=ps_key,
            pagespeed_enabled=(
                ps_flag in ("1", "true", "True") if ps_flag is not None else bool(ps_key)
            ),
        )


def build_sink(cfg: Config) -> LeadSink:
    if cfg.sink == "supabase":
        from .sink.supabase import SupabaseSink

        missing = [k for k, v in {
            "SUPABASE_URL": cfg.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": cfg.service_key,
            "OWNER_USER_ID": cfg.owner_id,
        }.items() if not v]
        if missing:
            raise SystemExit(f"sink=supabase exige: {', '.join(missing)}")
        return SupabaseSink(cfg.supabase_url, cfg.service_key, cfg.owner_id)  # type: ignore[arg-type]
    return JsonFileSink(cfg.json_path)


def _fixture_cnpj_fetch():
    data = json.loads((FIXTURES_DIR / "cnpj.json").read_text("utf-8"))
    return lambda cnpj: data.get(cnpj)


def build_sources(cfg: Config) -> list[Source]:
    if cfg.sources_mode == "fixture":
        # offline/determinístico: CNPJ por fixture, site "alcançável", sem ad probe
        return [
            CnpjSource(fetch=_fixture_cnpj_fetch()),
            InstagramSource(),
            # offline: confirma site sem rede e sem raspar (deterministico)
            WebsiteSource(reachable=lambda _url: True, fetch_html=lambda _url: None),
            AdLibrarySource(),
        ]
    # real: CNPJ via BrasilAPI (grátis), site via HTTP, Ad Library se houver token
    from .sources.ad_library import meta_ads_probe

    ad = AdLibrarySource(probe=meta_ads_probe(cfg.ad_token)) if cfg.ad_token else AdLibrarySource()

    # reforço de extracao por LLM (Groq, gratis) quando ha chave; senao so regex.
    llm_extract = None
    if cfg.llm_extract and cfg.groq_key:
        from .sources.extract_llm import make_groq_extractor

        llm_extract = make_groq_extractor(
            cfg.groq_key, "https://api.groq.com/openai/v1", cfg.extract_model
        )

    from .sources.instagram import business_discovery_probe

    ig = (
        InstagramSource(
            probe=business_discovery_probe(cfg.ig_business_id, cfg.ig_token),
            stale_days=cfg.ig_stale_days,
        )
        if cfg.ig_business_id and cfg.ig_token
        else InstagramSource(stale_days=cfg.ig_stale_days)
    )

    # PageSpeed (Google, gratis): performance real do site, mesclada no
    # site_signals. Liga quando ha chave (ou GARIMPO_PAGESPEED=1).
    pagespeed = None
    if cfg.pagespeed_enabled:
        from .sources.pagespeed import pagespeed_probe

        pagespeed = pagespeed_probe(cfg.pagespeed_key)

    return [
        CnpjSource(),
        ig,
        WebsiteSource(llm_extract=llm_extract, pagespeed=pagespeed),
        ad,
    ]


def build_provider(cfg: Config) -> DraftProvider:
    mock = MockDraftProvider()
    if cfg.llm == "gemini":
        if not cfg.gemini_key:
            raise SystemExit("GARIMPO_LLM=gemini exige GEMINI_API_KEY")
        from .draft.fallback import FallbackDraftProvider
        from .draft.gemini import GeminiDraftProvider

        return FallbackDraftProvider(GeminiDraftProvider(cfg.gemini_key, cfg.gemini_model), mock)
    if cfg.llm == "groq":
        if not cfg.groq_key:
            raise SystemExit("GARIMPO_LLM=groq exige GROQ_API_KEY (gratis em console.groq.com)")
        from .draft.fallback import FallbackDraftProvider
        from .draft.openai_compat import OpenAICompatDraftProvider

        prov = OpenAICompatDraftProvider(cfg.groq_key, "https://api.groq.com/openai/v1", cfg.groq_model)
        return FallbackDraftProvider(prov, mock)
    return mock


def build_reviews_source(cfg: Config):
    """Fabrica a ReviewsSource. Retorna None se desligada ou sem chave."""
    if not cfg.reviews_enabled or not cfg.maps_key:
        return None
    from .sources.reviews import ReviewsSource, place_details_reviews

    summarize = None
    if cfg.groq_key:
        from .sources.reviews import make_groq_review_summarizer

        summarize = make_groq_review_summarizer(
            cfg.groq_key, "https://api.groq.com/openai/v1", cfg.extract_model
        )
    return ReviewsSource(fetch=place_details_reviews(cfg.maps_key), summarize=summarize)


def build_maps_source(cfg: Config) -> MapsSource:
    if cfg.maps_mode == "places":
        if not cfg.maps_key:
            raise SystemExit("GARIMPO_MAPS=places exige GOOGLE_MAPS_API_KEY")
        from .discovery import PlacesMapsSource

        return PlacesMapsSource(cfg.maps_key, max_pages=cfg.maps_pages)
    return FixtureMapsSource(FIXTURES_DIR / "maps_results.json")
