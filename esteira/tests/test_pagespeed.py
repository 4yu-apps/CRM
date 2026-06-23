"""Testes do PageSpeed (Google, gratis) — parsing offline + merge no site_signals."""
import json

from garimpo_esteira.models import Lead
from garimpo_esteira.sources.pagespeed import fetch_pagespeed, pagespeed_probe
from garimpo_esteira.sources.website import WebsiteSource

_PSI = {
    "lighthouseResult": {
        "categories": {"performance": {"score": 0.34}},
        "audits": {"largest-contentful-paint": {"numericValue": 5800.4}},
    },
    "loadingExperience": {"overall_category": "SLOW"},
}


class _FakeResp:
    def __init__(self, data, status=200):
        self._data = data
        self.status_code = status

    def json(self):
        return self._data


class _FakeClient:
    def __init__(self, data, status=200):
        self._data = data
        self._status = status

    def get(self, *a, **k):
        return _FakeResp(self._data, self._status)

    def close(self):
        pass


def test_fetch_pagespeed_parses_score_lcp_and_category():
    out = fetch_pagespeed("https://x.com", client=_FakeClient(_PSI))
    assert out["perf_score"] == 34
    assert out["perf_slow"] is True
    assert out["lcp_ms"] == 5800
    assert out["speed_category"] == "SLOW"


def test_fetch_pagespeed_fast_site_not_slow():
    data = {"lighthouseResult": {"categories": {"performance": {"score": 0.92}}, "audits": {}}}
    out = fetch_pagespeed("https://x.com", client=_FakeClient(data))
    assert out["perf_score"] == 92
    assert out["perf_slow"] is False


def test_fetch_pagespeed_http_error_returns_none():
    assert fetch_pagespeed("https://x.com", client=_FakeClient({}, status=500)) is None


def test_fetch_pagespeed_empty_url_returns_none():
    assert fetch_pagespeed("") is None


def test_pagespeed_probe_uses_injected_fetch():
    probe = pagespeed_probe(fetch=lambda _u: {"perf_score": 80})
    assert probe("https://x.com") == {"perf_score": 80}


def test_website_merges_pagespeed_into_site_signals():
    html = '<html>fbq("init")</html>'
    src = WebsiteSource(
        fetch_html=lambda _u: html,
        pagespeed=lambda _u: {"perf_score": 22, "perf_slow": True},
    )
    findings = src.enrich(Lead(id="1", owner_id="o", website="https://x.com"))
    sig = next(json.loads(f.value) for f in findings if f.field_name == "site_signals")
    assert sig["perf_score"] == 22
    assert sig["perf_slow"] is True


def test_website_pagespeed_failure_is_silent():
    html = '<html>fbq("init")</html>'

    def boom(_u):
        raise RuntimeError("psi down")

    src = WebsiteSource(fetch_html=lambda _u: html, pagespeed=boom)
    findings = src.enrich(Lead(id="1", owner_id="o", website="https://x.com"))
    sig = next(json.loads(f.value) for f in findings if f.field_name == "site_signals")
    # site_signals sai normal, sem perf, e o pixel ainda deriva ads_active
    assert "perf_score" not in sig
    assert any(f.field_name == "ads_active" for f in findings)
