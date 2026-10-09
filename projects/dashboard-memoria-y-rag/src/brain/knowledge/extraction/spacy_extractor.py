"""spaCy NER + dependency-based entity and relationship extraction."""

from __future__ import annotations

import re
from typing import Any

from brain.config import get_settings
from brain.logging_config import get_logger

logger = get_logger("brain.knowledge.extraction.spacy")

# Lazy-loaded spaCy model
_nlp = None


def _load_nlp():
    """Load spaCy model (lazy, singleton)."""
    global _nlp
    if _nlp is not None:
        return _nlp

    settings = get_settings()
    try:
        import spacy

        _nlp = spacy.load(settings.nlp.model)
        logger.info("spacy_model_loaded", model=settings.nlp.model)
        return _nlp
    except Exception as e:
        logger.warning("spacy_load_failed", error=str(e))
        return None


def extract_entities(text: str, min_confidence: float = 0.3) -> list[dict[str, Any]]:
    """Extract named entities from text using spaCy NER.

    Returns list of {name, type, start, end, confidence}.
    """
    nlp = _load_nlp()
    if nlp is None:
        return []

    doc = nlp(text)

    entities = []
    seen_names = {}  # name_lower -> best entity type

    for ent in doc.ents:
        name = ent.text.strip()
        if not name or len(name) < 2:
            continue

        # Deduplicate by name (keep best type)
        name_lower = name.lower()
        if name_lower in seen_names:
            continue
        seen_names[name_lower] = ent.label_

        # Map spaCy labels to Brain entity types
        type_map = {
            "PERSON": "Person",
            "ORG": "Organization",
            "GPE": "Location",
            "LOC": "Location",
            "EVENT": "Event",
            "PRODUCT": "Tool",
            "TECH": "Technology",
            "WORK_OF_ART": "Concept",
            "NORP": "Organization",
            "FAC": "Location",
            "MONEY": "Concept",
            "QUANTITY": "Concept",
        }

        entity_type = type_map.get(ent.label_, "Concept")

        entities.append({
            "name": name,
            "type": entity_type,
            "start": ent.start_char,
            "end": ent.end_char,
            "spacy_label": ent.label_,
            "context": text[max(0, ent.start_char - 50):min(len(text), ent.end_char + 50)],
        })

    # Also extract noun phrases as concepts (only if not already found by NER)
    for chunk in doc.noun_chunks:
        name = chunk.text.strip()
        if len(name) < 3 or len(name) > 100:
            continue

        name_lower = name.lower()
        if name_lower in seen_names:
            continue
        seen_names[name_lower] = "NOUN_CHUNK"

        entities.append({
            "name": name,
            "type": "Concept",
            "start": chunk.start_char,
            "end": chunk.end_char,
            "spacy_label": "NOUN_CHUNK",
            "context": text[max(0, chunk.start_char - 50):min(len(text), chunk.end_char + 50)],
        })

    return entities


def extract_relationships(
    text: str,
    entities: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Extract relationships between entities using co-occurrence and dependency parsing.

    Returns list of {source, target, type, confidence}.
    """
    nlp = _load_nlp()
    if nlp is None or not entities:
        return []

    doc = nlp(text)
    relationships = []

    # 1. Co-occurrence relationships (entities in same sentence)
    for sent in doc.sents:
        sent_entities = [
            e for e in entities
            if e["start"] >= sent.start_char and e["end"] <= sent.end_char
        ]

        # Create related_to between entities in same sentence
        for i in range(len(sent_entities)):
            for j in range(i + 1, len(sent_entities)):
                e1, e2 = sent_entities[i], sent_entities[j]
                relationships.append({
                    "source": e1["name"],
                    "target": e2["name"],
                    "type": "related_to",
                    "confidence": 0.6,
                    "evidence": sent.text[:200],
                })

    # 2. Verb-based relationships
    for token in doc:
        if token.pos_ == "VERB" and token.dep_ in ("ROOT", "advcl"):
            subjects = [child for child in token.children if child.dep_ in ("nsubj", "nsubjpass")]
            objects = [child for child in token.children if child.dep_ in ("dobj", "pobj", "attr")]

            for subj in subjects:
                for obj in objects:
                    # Find matching entities
                    subj_ent = _find_entity_at(subj, entities)
                    obj_ent = _find_entity_at(obj, entities)

                    if subj_ent and obj_ent:
                        relationships.append({
                            "source": subj_ent["name"],
                            "target": obj_ent["name"],
                            "type": "related_to",
                            "confidence": 0.7,
                            "evidence": f"{subj_ent['name']} {token.text} {obj_ent['name']}",
                        })

    return relationships


def _find_entity_at(token, entities: list[dict]) -> dict | None:
    """Find an entity that overlaps with a token's position."""
    for ent in entities:
        if ent["start"] <= token.idx < ent["end"]:
            return ent
    return None


def extract_from_text(
    text: str,
    chunk_id: str | None = None,
) -> dict[str, Any]:
    """Full extraction pipeline for a text chunk.

    Returns {entities, relationships}.
    """
    entities = extract_entities(text)
    relationships = extract_relationships(text, entities)

    logger.info(
        "extraction_complete",
        chunk_id=chunk_id,
        entities=len(entities),
        relationships=len(relationships),
    )

    return {
        "entities": entities,
        "relationships": relationships,
    }
