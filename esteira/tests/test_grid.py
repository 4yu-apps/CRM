from garimpo_esteira.grid import BBox, adaptive_grid, neighborhood_queries, quad_split, subdivide

BOX = BBox(0.0, 0.0, 1.0, 1.0)


def test_quad_split_covers_box():
    quads = quad_split(BOX)
    assert len(quads) == 4
    assert BBox(0.0, 0.0, 0.5, 0.5) in quads
    assert BBox(0.5, 0.5, 1.0, 1.0) in quads


def test_subdivide_grid_size():
    cells = subdivide(BOX, rows=2, cols=3)
    assert len(cells) == 6


def test_adaptive_grid_splits_only_dense_cells():
    # célula grande estoura o teto; subcélulas (<=0.5) ficam abaixo
    def count(b: BBox) -> int:
        return 200 if (b.max_lat - b.min_lat) > 0.5 else 10

    leaves = adaptive_grid(BOX, count, cap=120)
    assert len(leaves) == 4  # dividiu uma vez
    assert all(count(c) < 120 for c in leaves)


def test_adaptive_grid_respects_max_depth():
    leaves = adaptive_grid(BOX, lambda _b: 1000, cap=120, max_depth=2)
    # depth 0 -> 4 -> 16 folhas, e para (max_depth)
    assert len(leaves) == 16


def test_neighborhood_queries():
    qs = neighborhood_queries("pizzaria", ["Zona 7", "Centro"], "Maringa")
    assert qs == ["pizzaria, Zona 7, Maringa", "pizzaria, Centro, Maringa"]
