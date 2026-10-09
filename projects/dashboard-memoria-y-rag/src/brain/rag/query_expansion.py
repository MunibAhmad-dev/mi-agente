"""Query expansion — generate variations for multi-variation retrieval.

Generates 3 query variations:
1. Original query
2. Keyword-focused extraction
3. Broad context reformulation
"""

from __future__ import annotations

import re


def extract_keywords(query: str) -> str:
    """Extract key terms from a query by removing stop words."""
    stop_words = {
        "what", "is", "are", "the", "a", "an", "how", "does", "do",
        "can", "could", "would", "should", "tell", "me", "about",
        "that", "this", "it", "in", "on", "at", "to", "for", "of",
        "and", "or", "not", "with", "from", "by", "as", "be", "was",
        "were", "been", "being", "have", "has", "had", "will", "shall",
        "may", "might", "must", "need", "please", "explain", "describe",
    }
    words = re.findall(r'\b\w+\b', query.lower())
    keywords = [w for w in words if w not in stop_words and len(w) > 1]
    return " ".join(keywords) if keywords else query


def expand_query(query: str) -> list[str]:
    """Generate query variations for multi-variation search.

    Returns list of [original, keywords, broad_context].
    """
    keywords = extract_keywords(query)
    broad = f"{keywords} overview explanation details"

    # Deduplicate while preserving order
    variations = [query]
    if keywords != query.lower():
        variations.append(keywords)
    if broad != query.lower():
        variations.append(broad)

    # Ensure exactly 3 variations (pad if needed)
    while len(variations) < 3:
        variations.append(variations[0])

    return variations[:3]


async def expanded_search(
    query: str,
    search_fn,
    space: str | None = None,
    limit: int = 10,
) -> dict:
    """Run search with expanded queries and merge results.

    Args:
        query: Original user query
        search_fn: async function(query, embedding) -> list[dict]
        space: Optional space filter
        limit: Final result count
    """
    from brain.embedding.service import embed_one

    variations = expand_query(query)
    all_results = {}

    for i, var in enumerate(variations):
        embedding = await embed_one(var)
        results = await search_fn(var, embedding)

        for r in results:
            cid = str(r["chunk_id"])
            if cid not in all_results:
                all_results[cid] = {**r, "matched_variations": [], "best_variation_score": 0}

            all_results[cid]["matched_variations"].append({
                "variation_index": i,
                "variation": var,
                "score": r.get("similarity", 0),
            })

            score = r.get("similarity", 0)
            if score > all_results[cid]["best_variation_score"]:
                all_results[cid]["best_variation_score"] = score

    # Boost results that appear in multiple variations
    for cid, r in all_results.items():
        match_count = len(r["matched_variations"])
        r["multi_variation_boost"] = 1.0 + (0.1 * (match_count - 1))
        r["boosted_score"] = r["best_variation_score"] * r["multi_variation_boost"]

    ranked = sorted(all_results.values(), key=lambda x: x["boosted_score"], reverse=True)

    return {
        "results": ranked[:limit],
        "variations": variations,
        "total_candidates": len(all_results),
    }
