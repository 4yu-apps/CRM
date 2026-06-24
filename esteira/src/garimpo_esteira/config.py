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
    # leads processados em paralelo no pipeline streaming (I/O-bound). >1 acelera
    # ~Nx; o SupabaseSink e thread-safe. JsonFileSink (offline) exige workers=1.
    workers: int = 4
    ad_token: str | None = None
    llm: str = "mock"                 # mock | gemini | groq
    gemini_key: str | None = None
    # varias chaves Gemini (free tier e POR PROJETO): "k1,k2,k3". A copy tenta
    # uma, se bater no limite do dia cai na proxima, depois no Groq, depois mock.
    gemini_keys: str | None = None
    gemini_model: str = "gemini-2.5-flash"
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
    # Places Details (telefone/site das capturas via place_id). Custa (SKU
    # Enterprise: 1.000 gratis/mes ~= 30/dia), entao limita por DIA e bloqueia ao
    # bater. DESLIGADO por padrao (0): o dono liga via GARIMPO_PLACES_DAILY_LIMIT
    # depois de confirmar folga de cota no Google Cloud Console.
    places_daily_limit: int = 0

    @classmethod
    def from_env(cls) -> "Config":
        # aceita PAGESPEED_API_KEY (padrao) ou PAGESPEED_API (apelido curto)
        ps_key = os.getenv("PAGESPEED_API_KEY") or os.getenv("PAGESPEED_API")
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
            workers=int(os.getenv("GARIMPO_WORKERS", "4")),
            ad_token=os.getenv("META_AD_LIBRARY_TOKEN"),
            llm=os.getenv("GARIMPO_LLM", "mock"),
            gemini_key=os.getenv("GEMINI_API_KEY") or os.getenv("gemini_API"),
            gemini_keys=os.getenv("GEMINI_API_KEYS"),
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
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
            places_daily_limit=int(os.getenv("GARIMPO_PLACES_DAILY_LIMIT", "0")),
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


def gemini_keys(cfg: Config) -> list[str]:
    """Junta as chaves Gemini (GEMINI_API_KEYS separada por virgula + a singular),
    sem duplicar e na ordem. Cada chave e de um projeto != (free tier por projeto),
    entao somam cota."""
    out: list[str] = []
    for raw in (cfg.gemini_keys, cfg.gemini_key):
        for k in (raw or "").split(","):
            k = k.strip()
            if k and k not in out:
                out.append(k)
    return out


def _chain_fallback(providers: list[DraftProvider]) -> DraftProvider:
    """Encadeia provedores: tenta o 1o, se falhar/limite cai no proximo, ate o
    ultimo (que deve ser o mock, infalivel). Reusa o FallbackDraftProvider."""
    from .draft.fallback import FallbackDraftProvider

    result = providers[-1]
    for p in reversed(providers[:-1]):
        result = FallbackDraftProvider(p, result)
    return result


def build_provider(cfg: Config) -> DraftProvider:
    mock = MockDraftProvider()
    if cfg.llm == "gemini":
        keys = gemini_keys(cfg)
        if not keys:
            raise SystemExit("GARIMPO_LLM=gemini exige GEMINI_API_KEY ou GEMINI_API_KEYS")
        from .draft.gemini import GeminiDraftProvider

        # cadeia: gemini(k1) -> gemini(k2) -> ... -> groq (se houver) -> mock.
        chain: list[DraftProvider] = [GeminiDraftProvider(k, cfg.gemini_model) for k in keys]
        if cfg.groq_key:
            from .draft.openai_compat import OpenAICompatDraftProvider

            chain.append(
                OpenAICompatDraftProvider(cfg.groq_key, "https://api.groq.com/openai/v1", cfg.groq_model)
            )
        chain.append(mock)
        return _chain_fallback(chain)
    if cfg.llm == "groq":
        if not cfg.groq_key:
            raise SystemExit("GARIMPO_LLM=groq exige GROQ_API_KEY (gratis em console.groq.com)")
        from .draft.openai_compat import OpenAICompatDraftProvider

        prov = OpenAICompatDraftProvider(cfg.groq_key, "https://api.groq.com/openai/v1", cfg.groq_model)
        return _chain_fallback([prov, mock])
    return mock


def build_places_source(cfg: Config, sink):
    """Fonte Places Details (telefone/site via place_id), com cota diaria. Retorna
    None se nao ha chave do Maps, se o limite e 0, ou se o sink nao sabe contar a
    cota. So vale com banco real (o contador da cota vive no banco)."""
    if not cfg.maps_key or cfg.places_daily_limit <= 0:
        return None
    if not hasattr(sink, "count_places_detailed_today"):
        return None
    from .sources.places_details import PlacesDetailsSource, place_details_fetch

    return PlacesDetailsSource(
        place_details_fetch(cfg.maps_key),
        daily_limit=cfg.places_daily_limit,
        count_today=sink.count_places_detailed_today,
    )


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
