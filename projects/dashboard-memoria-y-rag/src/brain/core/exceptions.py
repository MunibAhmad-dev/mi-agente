"""Shared exception hierarchy for the Brain."""

from __future__ import annotations


class BrainError(Exception):
    """Base exception for all Brain errors."""

    def __init__(self, message: str = "Brain error", detail: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail


# === Database ===
class DatabaseError(BrainError):
    """Database operation error."""


class ConnectionError(DatabaseError):
    """Database connection error."""


class MigrationError(DatabaseError):
    """Migration execution error."""


# === Search ===
class SearchError(BrainError):
    """Search operation error."""


class EmbeddingError(SearchError):
    """Embedding generation error."""


class VectorSearchError(SearchError):
    """Vector search error."""


# === Ingestion ===
class IngestionError(BrainError):
    """Document ingestion error."""


class AdapterError(IngestionError):
    """Adapter selection or execution error."""


class ChunkingError(IngestionError):
    """Chunk splitting error."""


# === Memory ===
class MemoryError(BrainError):
    """Memory operation error."""


class DuplicateMemoryError(MemoryError):
    """Duplicate memory detected."""


# === Knowledge ===
class KnowledgeError(BrainError):
    """Knowledge operation error."""


class ExtractionError(KnowledgeError):
    """Entity/relationship extraction error."""


# === LLM ===
class LLMError(BrainError):
    """LLM provider error."""


class ProviderNotAvailableError(LLMError):
    """LLM provider not configured or unreachable."""


# === Auth ===
class AuthError(BrainError):
    """Authentication error."""


class TokenExpiredError(AuthError):
    """Token has expired."""


class InvalidTokenError(AuthError):
    """Token is invalid."""


class RateLimitError(BrainError):
    """Rate limit exceeded."""


# === API ===
class APIError(BrainError):
    """API request error."""


class NotFoundError(APIError):
    """Resource not found."""


class ValidationError(APIError):
    """Request validation error."""
