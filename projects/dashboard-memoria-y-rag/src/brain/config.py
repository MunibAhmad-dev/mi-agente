"""Brain configuration — frozen settings loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database configuration."""

    model_config = SettingsConfigDict(env_prefix="DATABASE_")

    url: str = Field(default="postgresql://brain:brain@localhost:5432/brain")
    pool_min: int = Field(default=2)
    pool_max: int = Field(default=10)


class EmbeddingSettings(BaseSettings):
    """Embedding model configuration."""

    model_config = SettingsConfigDict(env_prefix="EMBEDDING_")

    model: str = Field(default="all-MiniLM-L6-v2")
    device: str = Field(default="cpu")
    dimension: int = Field(default=384)
    batch_size: int = Field(default=32)


class LLMSettings(BaseSettings):
    """LLM provider configuration."""

    model_config = SettingsConfigDict(env_prefix="LLM_")

    provider: str = Field(default="ollama")
    model: str = Field(default="llama3.2")
    base_url: str = Field(default="http://localhost:11434")
    api_key: str = Field(default="")
    temperature: float = Field(default=0.7)
    max_tokens: int = Field(default=4096)


class RerankerSettings(BaseSettings):
    """Reranker configuration."""

    model_config = SettingsConfigDict(env_prefix="RERANKER_")

    enabled: bool = Field(default=True)
    model: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2")
    device: str = Field(default="cpu")


class SearchSettings(BaseSettings):
    """Search configuration."""

    model_config = SettingsConfigDict(env_prefix="SEARCH_")

    max_results: int = Field(default=30)
    similarity_threshold: float = Field(default=0.3)
    rrf_k: int = Field(default=60)
    expansion_enabled: bool = Field(default=True)


class MemorySettings(BaseSettings):
    """Memory lifecycle configuration."""

    model_config = SettingsConfigDict(env_prefix="MEMORY_")

    forget_retention_days: int = Field(default=30)
    purge_min_age_days: int = Field(default=90)
    dedup_similarity_threshold: float = Field(default=0.95)


class APISettings(BaseSettings):
    """API configuration."""

    model_config = SettingsConfigDict(env_prefix="API_")

    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    cors_origins: list[str] = Field(default=["http://localhost:3000", "http://localhost:5173"])


class AuthSettings(BaseSettings):
    """Authentication configuration."""

    model_config = SettingsConfigDict(env_prefix="AUTH_")

    token_expiry_days: int = Field(default=30)
    rate_limit_per_minute: int = Field(default=120)


class LoggingSettings(BaseSettings):
    """Logging configuration."""

    model_config = SettingsConfigDict(env_prefix="LOG_")

    level: str = Field(default="INFO")
    format: str = Field(default="json")


class MCPSettings(BaseSettings):
    """MCP server configuration."""

    model_config = SettingsConfigDict(env_prefix="MCP_")

    enabled: bool = Field(default=True)
    transport: str = Field(default="stdio")


class NLSettings(BaseSettings):
    """NLP configuration."""

    model_config = SettingsConfigDict(env_prefix="SPACY_")

    model: str = Field(default="en_core_web_sm")


class Settings(BaseSettings):
    """Root Brain settings — composed from all sub-settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    db: DatabaseSettings = Field(default_factory=DatabaseSettings)
    embedding: EmbeddingSettings = Field(default_factory=EmbeddingSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    reranker: RerankerSettings = Field(default_factory=RerankerSettings)
    search: SearchSettings = Field(default_factory=SearchSettings)
    memory: MemorySettings = Field(default_factory=MemorySettings)
    api: APISettings = Field(default_factory=APISettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    mcp: MCPSettings = Field(default_factory=MCPSettings)
    nlp: NLSettings = Field(default_factory=NLSettings)

    @property
    def database_url(self) -> str:
        return self.db.url

    @property
    def migrations_dir(self) -> Path:
        return Path(__file__).parent / "migrations"


@lru_cache
def get_settings() -> Settings:
    """Get cached singleton settings instance."""
    return Settings()
