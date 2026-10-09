"""
API-Key Manager - Intelligent Router
=====================================

Intelligent request routing with automatic failover.

This service acts as the central dispatcher for AI API requests.
It selects the best available provider/key based on:
  - Provider priority
  - Remaining quota (proactive detection)
  - Cost per token
  - Latency (rolling average)
  - Error rate (historical)
  - User preferences

Autor: Mi LibreChat
Versión: 1.0.0
Licencia: MIT
"""

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Callable
from enum import Enum

import httpx

logger = logging.getLogger(__name__)

# HTTP status codes that indicate quota/rate-limit exhaustion
QUOTA_ERROR_CODES = {429, 402, 403}
# HTTP status codes that indicate transient error (retry)
TRANSIENT_ERROR_CODES = {500, 502, 503, 504}
# HTTP status codes that indicate authentication error
AUTH_ERROR_CODES = {401, 403}


class SelectionStrategy(Enum):
    """Selection strategy for routing."""
    PRIORITY = "priority"           # By provider priority only
    COST = "cost"                  # By cost efficiency
    LATENCY = "latency"           # By historical latency
    AVAILABILITY = "availability"  # By remaining quota
    HYBRID = "hybrid"             # Multi-factor scoring


@dataclass
class RouteRequest:
    """Encapsulates a user's AI request with routing preferences."""
    messages: List[Dict[str, Any]]
    model: Optional[str] = None
    preferred_providers: List[str] = field(default_factory=list)
    excluded_providers: List[str] = field(default_factory=list)
    max_tokens: Optional[int] = None
    temperature: float = 0.7
    stream: bool = False
    user_id: Optional[str] = None
    extra_params: Dict[str, Any] = field(default_factory=dict)
    selection_strategy: SelectionStrategy = SelectionStrategy.HYBRID
    timeout: int = 60


@dataclass
class RouteResult:
    """Result of a routed AI request."""
    success: bool
    provider_name: str
    key_id: int
    model_used: str
    response: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[int] = None
    latency_ms: int = 0
    tokens_used: int = 0
    cost_used: float = 0
    fallback_count: int = 0
    from_cache: bool = False


@dataclass
class ProviderHealth:
    """Health metrics for a provider."""
    provider_id: int
    provider_name: str
    priority: int
    active_keys: int
    avg_latency_ms: float
    error_rate: float
    remaining_quota: float
    estimated_cost_per_token: float
    health_score: float  # 0-1


class IntelligentRouter:
    """
    Intelligent AI request router with automatic failover.
    
    Features:
    - Multi-criteria selection (priority, quota, cost, latency, error rate)
    - Proactive depletion detection
    - Automatic key rotation on failure
    - Comprehensive error handling
    - Usage tracking and analytics
    
    Example usage:
        router = IntelligentRouter(db)
        result = router.route(RouteRequest(
            messages=[{"role": "user", "content": "Hello!"}],
            preferred_providers=["groq", "openrouter"],
        ))
    """

    def __init__(
        self,
        db,
        cache: Optional[Any] = None,
        metrics_enabled: bool = True
    ):
        self.db = db
        self.cache = cache
        self.metrics_enabled = metrics_enabled
        
        # Import models here to avoid circular imports
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus, Provider, ProviderStatus
        from api.server.services.APIKeyManager.models.usage_log import UsageLog

    def route(self, request: RouteRequest) -> RouteResult:
        """
        Route an AI request through the best available provider.
        
        Args:
            request: RouteRequest with request details and preferences
            
        Returns:
            RouteResult with the response or error details
        """
        candidates = self._build_candidate_list(request)
        
        if not candidates:
            return RouteResult(
                success=False,
                provider_name="none",
                key_id=0,
                model_used="",
                error="No active providers or API keys available",
            )

        fallback_count = 0
        last_error = None
        last_error_code = None
        
        for provider, key in candidates:
            result = self._try_provider(provider, key, request)
            result.fallback_count = fallback_count
            
            if result.success:
                return result
            
            last_error = result.error
            last_error_code = result.error_code
            fallback_count += 1
            
            logger.warning(
                f"[IntelligentRouter] Provider '{provider.name}' failed "
                f"(attempt {fallback_count}): {result.error}"
            )
            
            # Handle specific error codes
            self._handle_error(provider, key, result)

        return RouteResult(
            success=False,
            provider_name="none",
            key_id=0,
            model_used="",
            error=f"All {fallback_count} providers failed: {last_error}",
            error_code=last_error_code,
            fallback_count=fallback_count,
        )

    def _build_candidate_list(
        self,
        request: RouteRequest
    ) -> List[tuple]:
        """
        Build an ordered list of (Provider, ApiKey) tuples to try.
        
        Uses multi-criteria scoring for optimal selection.
        """
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus, Provider, ProviderStatus
        
        # Base query for active keys
        query = (
            self.db.query(ApiKey)
            .join(Provider, ApiKey.provider_id == Provider.id)
            .filter(
                ApiKey.status == KeyStatus.ACTIVE,
                Provider.status != ProviderStatus.OFFLINE,
            )
        )
        
        # Filter out excluded providers
        if request.excluded_providers:
            query = query.filter(
                ~Provider.name.in_(request.excluded_providers)
            )
        
        # Filter by preferred providers if specified
        if request.preferred_providers:
            query = query.order_by(
                Provider.name.in_(request.preferred_providers).desc(),
                Provider.priority.asc(),
                ApiKey.id.asc()
            )
        else:
            query = query.order_by(
                Provider.priority.asc(),
                ApiKey.id.asc()
            )
        
        active_keys = query.all()
        
        if not active_keys:
            return []
        
        # Score and rank candidates
        scored_candidates = []
        for key in active_keys:
            provider = key.provider
            health = self._calculate_provider_health(provider, key)
            score = self._calculate_selection_score(health, request.selection_strategy)
            
            scored_candidates.append((provider, key, score))
        
        # Sort by score (higher is better)
        scored_candidates.sort(key=lambda x: x[2], reverse=True)
        
        return [(p, k) for p, k, _ in scored_candidates]

    def _calculate_provider_health(
        self,
        provider,
        key
    ) -> ProviderHealth:
        """Calculate health metrics for a provider/key pair."""
        from api.server.services.APIKeyManager.models.usage_log import UsageLog
        
        # Calculate average latency from recent logs
        recent_cutoff = datetime.utcnow() - timedelta(hours=1)
        recent_logs = (
            self.db.query(UsageLog)
            .filter(
                UsageLog.api_key_id == key.id,
                UsageLog.created_at >= recent_cutoff,
            )
            .all()
        )
        
        if recent_logs:
            avg_latency = sum(log.latency_ms for log in recent_logs) / len(recent_logs)
            error_count = sum(1 for log in recent_logs if not log.is_success)
            error_rate = error_count / len(recent_logs)
        else:
            avg_latency = 1000  # Default 1s if no data
            error_rate = 0
        
        # Calculate health score (0-1)
        latency_score = max(0, 1 - (avg_latency / 10000))  # Normalize to 10s max
        health_score = (1 - error_rate) * 0.7 + latency_score * 0.3
        
        return ProviderHealth(
            provider_id=provider.id,
            provider_name=provider.name,
            priority=provider.priority,
            active_keys=1,
            avg_latency_ms=avg_latency,
            error_rate=error_rate,
            remaining_quota=key.remaining_quota or 100,
            estimated_cost_per_token=key.cost_per_token or 0,
            health_score=health_score,
        )

    def _calculate_selection_score(
        self,
        health: ProviderHealth,
        strategy: SelectionStrategy
    ) -> float:
        """Calculate selection score based on strategy."""
        if strategy == SelectionStrategy.PRIORITY:
            # Inverse of priority (lower priority number = higher score)
            return 1000 - health.priority
        
        elif strategy == SelectionStrategy.COST:
            # Lower cost = higher score
            return 100 - (health.estimated_cost_per_token * 1000)
        
        elif strategy == SelectionStrategy.LATENCY:
            # Lower latency = higher score
            return 10000 - health.avg_latency_ms
        
        elif strategy == SelectionStrategy.AVAILABILITY:
            # More quota = higher score
            return health.remaining_quota
        
        else:  # HYBRID
            # Multi-factor scoring
            priority_score = (1000 - health.priority) / 1000
            latency_score = max(0, 1 - (health.avg_latency_ms / 5000))
            error_score = 1 - health.error_rate
            quota_score = min(1, health.remaining_quota / 100)
            
            # Weighted average
            score = (
                priority_score * 0.2 +
                latency_score * 0.3 +
                error_score * 0.3 +
                quota_score * 0.2
            )
            
            return score * 100

    def _try_provider(
        self,
        provider,
        key,
        request: RouteRequest
    ) -> RouteResult:
        """Attempt to fulfil the request via a specific provider/key."""
        start_time = time.monotonic()
        
        # Determine model to use
        model = request.model or self._get_default_model(provider)
        
        # Prepare payload
        payload = {
            "model": model,
            "messages": request.messages,
            "temperature": request.temperature,
            **request.extra_params,
        }
        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens

        # Decrypt the API key
        api_key_value = self._decrypt_key(key.key)
        
        headers = {
            "Authorization": f"Bearer {api_key_value}",
            "Content-Type": "application/json"
        }

        try:
            with httpx.Client(timeout=request.timeout) as client:
                resp = client.post(
                    f"{provider.api_base}/chat/completions",
                    json=payload,
                    headers=headers,
                )

            latency_ms = int((time.monotonic() - start_time) * 1000)
            
            # Handle different status codes
            if resp.status_code in QUOTA_ERROR_CODES:
                self._mark_key_exhausted(key, provider)
                return RouteResult(
                    success=False,
                    provider_name=provider.name,
                    key_id=key.id,
                    model_used=model,
                    error=f"Quota exceeded (HTTP {resp.status_code})",
                    error_code=resp.status_code,
                    latency_ms=latency_ms,
                )
            
            if resp.status_code in AUTH_ERROR_CODES:
                self._mark_key_invalid(key, resp.text)
                return RouteResult(
                    success=False,
                    provider_name=provider.name,
                    key_id=key.id,
                    model_used=model,
                    error=f"Authentication failed (HTTP {resp.status_code})",
                    error_code=resp.status_code,
                    latency_ms=latency_ms,
                )
            
            if resp.status_code >= 400:
                self._log_usage(key, provider, model, 0, resp.status_code, resp.text, latency_ms)
                return RouteResult(
                    success=False,
                    provider_name=provider.name,
                    key_id=key.id,
                    model_used=model,
                    error=f"HTTP {resp.status_code}: {resp.text[:200]}",
                    error_code=resp.status_code,
                    latency_ms=latency_ms,
                )

            # Success
            data = resp.json()
            usage = data.get("usage", {})
            total_tokens = usage.get("total_tokens", 0)
            cost = self._estimate_cost(total_tokens, key.cost_per_token)
            
            self._log_usage(key, provider, model, total_tokens, resp.status_code, None, latency_ms)
            self._record_success(key, total_tokens, cost)

            return RouteResult(
                success=True,
                provider_name=provider.name,
                key_id=key.id,
                model_used=model,
                response=data,
                latency_ms=latency_ms,
                tokens_used=total_tokens,
                cost_used=cost,
            )

        except httpx.TimeoutException:
            latency_ms = int((time.monotonic() - start_time) * 1000)
            return RouteResult(
                success=False,
                provider_name=provider.name,
                key_id=key.id,
                model_used=model,
                error="Request timed out",
                error_code=408,
                latency_ms=latency_ms,
            )
        except Exception as exc:
            latency_ms = int((time.monotonic() - start_time) * 1000)
            logger.error(f"[IntelligentRouter] Unexpected error with {provider.name}: {exc}")
            return RouteResult(
                success=False,
                provider_name=provider.name,
                key_id=key.id,
                model_used=model,
                error=str(exc),
                error_code=500,
                latency_ms=latency_ms,
            )

    def _handle_error(
        self,
        provider,
        key,
        result: RouteResult
    ):
        """Handle errors and trigger appropriate actions."""
        if result.error_code in QUOTA_ERROR_CODES:
            self._mark_key_exhausted(key, provider)
            # Trigger key rotation
            self._trigger_rotation(provider.id, key.id)
            
        elif result.error_code in AUTH_ERROR_CODES:
            self._mark_key_invalid(key, result.error)
            
        elif result.error_code in TRANSIENT_ERROR_CODES:
            # Temporary error - just log it
            self._log_error(key, provider, result.error)

    def _mark_key_exhausted(self, key, provider):
        """Mark key as exhausted."""
        key.mark_exhausted(provider.cooldown_seconds)
        self.db.commit()
        logger.info(f"Key {key.id} marked as exhausted (cooldown {provider.cooldown_seconds}s)")

    def _mark_key_invalid(self, key, error: str):
        """Mark key as invalid."""
        key.mark_invalid(error)
        self.db.commit()
        logger.warning(f"Key {key.id} marked as invalid: {error}")

    def _log_usage(
        self,
        key,
        provider,
        model: str,
        total_tokens: int,
        status_code: int,
        error_message: Optional[str],
        latency_ms: int,
    ):
        """Log usage to database."""
        from api.server.services.APIKeyManager.models.usage_log import UsageLog
        
        try:
            log = UsageLog(
                api_key_id=key.id,
                provider_id=provider.id,
                model=model,
                total_tokens=total_tokens,
                status_code=status_code,
                error_message=error_message,
                latency_ms=latency_ms,
            )
            self.db.add(log)
            self.db.commit()
        except Exception as exc:
            logger.warning(f"[IntelligentRouter] Failed to log usage: {exc}")

    def _log_error(self, key, provider, error: str):
        """Log an error without changing key status."""
        key.record_error(error)
        self.db.commit()

    def _record_success(self, key, tokens_used: int, cost: float):
        """Record successful usage."""
        key.record_success(tokens_used, cost)
        self.db.commit()

    def _trigger_rotation(self, provider_id: int, exclude_key_id: int):
        """Trigger key rotation task."""
        # In production, this would enqueue a Celery task
        # For now, just log it
        logger.info(f"Triggering key rotation for provider {provider_id}, excluding key {exclude_key_id}")

    def _get_default_model(self, provider) -> str:
        """Get default model for a provider."""
        # Provider-specific defaults
        DEFAULT_MODELS = {
            "groq": "groq/llama-3.3-70b-versatile",
            "openrouter": "openrouter/auto",
            "gemini": "gemini/gemini-1.5-flash",
            "deepseek": "deepseek-chat",
            "anthropic": "claude-3-haiku-20240307",
        }
        
        if provider.name in DEFAULT_MODELS:
            return DEFAULT_MODELS[provider.name]
        
        # Try to get from supported models
        if provider.supported_models:
            try:
                models = json.loads(provider.supported_models)
                if models:
                    return models[0]
            except Exception:
                pass
        
        return f"{provider.name}/default"

    def _decrypt_key(self, encrypted_key: str) -> str:
        """
        Decrypt an API key.
        
        In production, this uses Fernet symmetric encryption.
        For development, returns the key as-is.
        """
        # In production, implement actual decryption:
        # from cryptography.fernet import Fernet
        # return Fernet(settings.ENCRYPTION_KEY).decrypt(encrypted_key)
        
        # For now, return as-is (keys are stored encrypted in production)
        return encrypted_key

    def _estimate_cost(self, tokens: int, cost_per_token: Optional[float]) -> float:
        """Estimate cost of a request."""
        if cost_per_token:
            return tokens * cost_per_token
        return 0.0

    def get_available_models(
        self,
        provider_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return a list of available models across all (or a specific) provider."""
        from api.server.services.APIKeyManager.models import Provider, ProviderStatus, ApiKey, KeyStatus
        
        query = (
            self.db.query(Provider)
            .filter(Provider.status != ProviderStatus.OFFLINE)
        )
        
        if provider_name:
            query = query.filter(Provider.name == provider_name)

        models = []
        for provider in query.all():
            active_keys = (
                self.db.query(ApiKey)
                .filter(
                    ApiKey.provider_id == provider.id,
                    ApiKey.status == KeyStatus.ACTIVE,
                )
                .count()
            )
            
            if active_keys == 0:
                continue
            
            supported = []
            if provider.supported_models:
                try:
                    supported = json.loads(provider.supported_models)
                except Exception:
                    pass
            
            models.append({
                "provider": provider.name,
                "display_name": provider.display_name,
                "status": provider.status.value,
                "priority": provider.priority,
                "active_keys": active_keys,
                "models": supported,
            })

        return models
