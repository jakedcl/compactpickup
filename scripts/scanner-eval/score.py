"""Score held-out scanner queries against DB fingerprints with the same matching as src/lib/binder/scan.ts.

  python scripts/scanner-eval/score.py db.f32 db_labels.txt queries.f32 query_labels.txt [makes.json]

*.f32: float32, 768 per row (from embed.mjs, or exported from photos.embedding_siglip).
*_labels.txt: one truck slug per row, same order as the vectors.
makes.json (optional): {"slug": "make"} for make accuracy.
Needs numpy only.
"""
import json, sys
from collections import defaultdict
import numpy as np

CUTOFF, MARGIN, NEIGHBORS, PER_TRUCK = 0.80, 0.02, 40, 3  # keep in sync with scan.ts


def load(vec_path, label_path):
    labels = [line.strip() for line in open(label_path) if line.strip()]
    vectors = np.fromfile(vec_path, dtype=np.float32).reshape(-1, 768)
    assert len(vectors) == len(labels), f'{vec_path}: {len(vectors)} vectors vs {len(labels)} labels'
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True), np.array(labels)


def rank(sims, labels):
    """nearestApproved (top 40 by cosine) + aggregateTruckScores (mean of best 3, padded with the 40th score)."""
    idx = np.argsort(-sims)[:NEIGHBORS]
    floor = sims[idx].min()
    groups = defaultdict(list)
    for i in idx:
        groups[labels[i]].append(sims[i])
    scores = {k: sum((sorted(v, reverse=True)[:PER_TRUCK] + [floor] * PER_TRUCK)[:PER_TRUCK]) / PER_TRUCK for k, v in groups.items()}
    return sorted(scores, key=lambda k: (-scores[k], k)), scores


def main():
    db, db_y = load(sys.argv[1], sys.argv[2])
    q, q_y = load(sys.argv[3], sys.argv[4])
    makes = json.load(open(sys.argv[5])) if len(sys.argv) > 5 else None
    hits = {1: 0, 3: 0, 5: 0}
    make_hits = fired = fired_right = 0
    for vector, truth in zip(q, q_y):
        ranked, scores = rank(db @ vector, db_y)
        for k in hits:
            hits[k] += truth in ranked[:k]
        if makes:
            make_hits += makes.get(ranked[0]) == makes.get(truth)
        second = scores[ranked[1]] if len(ranked) > 1 else -1
        if scores[ranked[0]] >= CUTOFF and scores[ranked[0]] - second >= MARGIN:
            fired += 1
            fired_right += ranked[0] == truth
    n = len(q_y)
    print(f'{n} queries  top-1 {hits[1] / n:.1%}  top-3 {hits[3] / n:.1%}  top-5 {hits[5] / n:.1%}' + (f'  make {make_hits / n:.1%}' if makes else ''))
    print(f'confident match ({CUTOFF}/{MARGIN}): fires {fired}/{n} ({fired / n:.0%}), right {fired_right / max(fired, 1):.1%}')


if __name__ == '__main__':
    main()
