"""Grade de busca do Maps — contorna o teto de ~120 resultados por busca.

O Google Maps devolve no máximo ~120 lugares por busca. Buscar "pizzaria em
Maringá" de uma vez esconde a maioria. Solução: quebrar em células e varrer
bloco a bloco; subdividir adaptativamente as células que batem no teto.

Lógica pura (sem rede) — vale tanto pra Places API quanto pra varredura via
extensão. Quem conta resultados é injetado (count_fn).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable

CAP = 120  # teto do Maps por busca


@dataclass(frozen=True)
class BBox:
    min_lat: float
    min_lng: float
    max_lat: float
    max_lng: float

    @property
    def center(self) -> tuple[float, float]:
        return ((self.min_lat + self.max_lat) / 2, (self.min_lng + self.max_lng) / 2)


def quad_split(b: BBox) -> list[BBox]:
    """Divide a célula em 4 (quadtree)."""
    mlat, mlng = b.center
    return [
        BBox(b.min_lat, b.min_lng, mlat, mlng),
        BBox(b.min_lat, mlng, mlat, b.max_lng),
        BBox(mlat, b.min_lng, b.max_lat, mlng),
        BBox(mlat, mlng, b.max_lat, b.max_lng),
    ]


def subdivide(b: BBox, rows: int, cols: int) -> list[BBox]:
    """Grade fixa rows×cols (varredura uniforme)."""
    if rows < 1 or cols < 1:
        raise ValueError("rows e cols >= 1")
    dlat = (b.max_lat - b.min_lat) / rows
    dlng = (b.max_lng - b.min_lng) / cols
    cells = []
    for r in range(rows):
        for c in range(cols):
            cells.append(
                BBox(
                    b.min_lat + r * dlat,
                    b.min_lng + c * dlng,
                    b.min_lat + (r + 1) * dlat,
                    b.min_lng + (c + 1) * dlng,
                )
            )
    return cells


def adaptive_grid(
    b: BBox,
    count_fn: Callable[[BBox], int],
    cap: int = CAP,
    max_depth: int = 4,
) -> list[BBox]:
    """Subdivide só onde precisa: célula que bate no teto vira 4, recursivamente.

    Garante cobertura sem estourar varreduras onde a densidade é baixa
    (em Maringá a maioria das células nem chega perto do teto).
    """
    leaves: list[BBox] = []

    def walk(cell: BBox, depth: int) -> None:
        n = count_fn(cell)
        if n < cap or depth >= max_depth:
            leaves.append(cell)
            return
        for sub in quad_split(cell):
            walk(sub, depth + 1)

    walk(b, 0)
    return leaves


def neighborhood_queries(term: str, neighborhoods: Iterable[str], city: str) -> list[str]:
    """Alternativa por bairro quando não há bbox: 'term, bairro, cidade'."""
    return [f"{term}, {n}, {city}" for n in neighborhoods]
