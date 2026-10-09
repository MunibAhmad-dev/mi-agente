"""
API-Key Manager - Main Package
=============================

Native gateway for AI API key management, rotation, and intelligent routing.

Autor: Mi LibreChat
Versión: 1.0.0
Licencia: MIT
"""

from .models import (
    Base,
    TimestampMixin,
    Provider,
    ProviderStatus,
    ApiKey,
    KeyStatus,
    UsageLog,
    Account,
    AccountStatus,
)

from .services import (
    IntelligentRouter,
    RouteRequest,
    RouteResult,
    SelectionStrategy,
    KeyManagerService,
    KeyStats,
    ProviderStats,
)

__version__ = "1.0.0"

__all__ = [
    # Models
    "Base",
    "TimestampMixin",
    "Provider",
    "ProviderStatus",
    "ApiKey",
    "KeyStatus",
    "UsageLog",
    "Account",
    "AccountStatus",
    # Services
    "IntelligentRouter",
    "RouteRequest",
    "RouteResult",
    "SelectionStrategy",
    "KeyManagerService",
    "KeyStats",
    "ProviderStats",
]
