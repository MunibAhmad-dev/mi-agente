"""
LiteLLM Client for LibreChat Integration
=========================================

Cliente Python completo para conectar LibreChat con LiteLLM Gateway.

Características:
- Retry logic con exponential backoff
- Circuit breaker pattern
- Rate limiting
- Streaming support
- Metrics y logging
- Error handling robusto

Autor: Mi LibreChat
Versión: 2.0.0
Licencia: MIT
"""

import os
import time
import json
import asyncio
import logging
from typing import List, Dict, Any, Optional, Union, Callable, AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
from datetime import datetime, timedelta
from functools import wraps
import aiohttp
from aiohttp import ClientWebSocketResponse

logger = logging.getLogger(__name__)


class ModelRole(Enum):
    """Roles de modelos."""
    CHAT = "chat"
    CODING = "coding"
    VISION = "vision"
    FAST = "fast"
    CHEAP = "cheap"
    LONG_CONTEXT = "long-context"


class CircuitState(Enum):
    """Estados del circuit breaker."""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class LLMResponse:
    """Respuesta de LLM."""
    content: str
    model: str
    usage: Dict[str, int]
    finish_reason: str
    raw_response: Dict[str, Any]
    latency_ms: Optional[float] = None


@dataclass
class StreamingChunk:
    """Chunk de respuesta streaming."""
    content: str
    delta: str
    is_complete: bool
    finish_reason: Optional[str] = None
    raw_chunk: Optional[Dict[str, Any]] = None


@dataclass
class CircuitBreakerConfig:
    """Configuración del circuit breaker."""
    failure_threshold: int = 5       # Fallos antes de abrir
    success_threshold: int = 2       # Éxitos para cerrar
    timeout: float = 60.0            # Segundos antes de media apertura
    half_open_max_calls: int = 3     # Llamadas permitidas en half-open


@dataclass
class RetryConfig:
    """Configuración de retry."""
    max_retries: int = 3
    base_delay: float = 1.0          # Delay base en segundos
    max_delay: float = 30.0          # Delay máximo
    exponential_base: float = 2.0    # Base para backoff exponencial
    retry_on_status: List[int] = field(default_factory=lambda: [429, 500, 502, 503, 504])


@dataclass
class RateLimitConfig:
    """Configuración de rate limiting."""
    requests_per_minute: int = 60
    requests_per_second: int = 10
    tokens_per_minute: int = 100000


@dataclass
class Metrics:
    """Métricas del cliente."""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_tokens: int = 0
    total_latency_ms: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0
    retries: int = 0
    circuit_breaker_opens: int = 0
    rate_limit_rejections: int = 0
    last_request_at: Optional[datetime] = None
    requests_by_model: Dict[str, int] = field(default_factory=dict)


class CircuitBreaker:
    """Circuit Breaker para manejar fallos en cascada."""
    
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.half_open_calls = 0
    
    def record_success(self):
        """Registra un éxito."""
        self.failure_count = 0
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.config.success_threshold:
                self.state = CircuitState.CLOSED
                self.success_count = 0
                self.half_open_calls = 0
                logger.info("Circuit breaker CLOSED")
    
    def record_failure(self):
        """Registra un fallo."""
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            self.half_open_calls = 0
            logger.warning("Circuit breaker OPEN (half-open failure)")
        elif self.failure_count >= self.config.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(f"Circuit breaker OPEN (failure threshold: {self.config.failure_threshold})")
    
    def can_execute(self) -> bool:
        """Verifica si se puede ejecutar."""
        if self.state == CircuitState.CLOSED:
            return True
        
        if self.state == CircuitState.OPEN:
            if self.last_failure_time:
                elapsed = (datetime.now() - self.last_failure_time).total_seconds()
                if elapsed >= self.config.timeout:
                    self.state = CircuitState.HALF_OPEN
                    self.half_open_calls = 0
                    logger.info("Circuit breaker HALF-OPEN")
                    return True
            return False
        
        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls < self.config.half_open_max_calls:
                self.half_open_calls += 1
                return True
            return False
        
        return False
    
    def get_state(self) -> str:
        """Obtiene el estado actual."""
        return self.state.value


class RateLimiter:
    """Rate limiter con sliding window."""
    
    def __init__(self, config: RateLimitConfig):
        self.config = config
        self.requests: List[datetime] = []
        self.token_usage: List[tuple] = []  # (timestamp, tokens)
        self._lock = asyncio.Lock()
    
    async def acquire(self, tokens: int = 0) -> bool:
        """Adquiere permiso para hacer una request."""
        async with self._lock:
            now = datetime.now()
            
            # Limpiar requests antiguos (1 minuto)
            cutoff = now - timedelta(minutes=1)
            self.requests = [r for r in self.requests if r > cutoff]
            
            # Limpiar uso de tokens antiguo
            self.token_usage = [(t, t_count) for t, t_count in self.token_usage if t > cutoff]
            
            # Verificar rate limit de requests por minuto
            if len(self.requests) >= self.config.requests_per_minute:
                logger.warning("Rate limit: requests per minute exceeded")
                return False
            
            # Verificar rate limit de tokens por minuto
            total_tokens = sum(t_count for _, t_count in self.token_usage)
            if total_tokens + tokens > self.config.tokens_per_minute:
                logger.warning("Rate limit: tokens per minute exceeded")
                return False
            
            # Verificar rate limit de requests por segundo
            cutoff_second = now - timedelta(seconds=1)
            recent_requests = len([r for r in self.requests if r > cutoff_second])
            if recent_requests >= self.config.requests_per_second:
                # Esperar hasta el siguiente segundo
                sleep_time = 1 - (now - max(self.requests)).total_seconds()
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
            
            # Registrar request
            self.requests.append(now)
            if tokens > 0:
                self.token_usage.append((now, tokens))
            
            return True
    
    def get_remaining(self) -> Dict[str, int]:
        """Obtiene los límites restantes."""
        now = datetime.now()
        cutoff = now - timedelta(minutes=1)
        
        requests_last_minute = len([r for r in self.requests if r > cutoff])
        tokens_last_minute = sum(t_count for t, t_count in self.token_usage if t > cutoff)
        
        return {
            "requests_remaining_minute": self.config.requests_per_minute - requests_last_minute,
            "tokens_remaining_minute": self.config.tokens_per_minute - tokens_last_minute,
        }


def with_retry(config: RetryConfig):
    """Decorador para retry con exponential backoff."""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(config.max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except aiohttp.ClientResponseError as e:
                    if e.status not in config.retry_on_status:
                        raise
                    last_exception = e
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    last_exception = e
                
                if attempt < config.max_retries:
                    delay = min(
                        config.base_delay * (config.exponential_base ** attempt),
                        config.max_delay
                    )
                    # Jitter aleatorio
                    import random
                    delay = delay * (0.5 + random.random())
                    logger.warning(f"Retry {attempt + 1}/{config.max_retries} after {delay:.2f}s: {last_exception}")
                    await asyncio.sleep(delay)
            
            raise last_exception
        return wrapper
    return decorator


class LiteLLMClient:
    """
    Cliente completo para LiteLLM Gateway.
    
    Proporciona una interfaz robusta para interactuar con
    el gateway de LiteLLM.
    
    Características:
    - Retry logic con exponential backoff
    - Circuit breaker pattern
    - Rate limiting
    - Streaming support
    - Metrics
    - Error handling robusto
    """
    
    def __init__(
        self,
        base_url: str = "http://localhost:4000",
        api_key: Optional[str] = None,
        timeout: int = 120,
        circuit_breaker_config: Optional[CircuitBreakerConfig] = None,
        retry_config: Optional[RetryConfig] = None,
        rate_limit_config: Optional[RateLimitConfig] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or os.environ.get("LITELLM_MASTER_KEY", "")
        self.timeout = timeout
        
        # Circuit breaker
        self.circuit_breaker = CircuitBreaker(
            circuit_breaker_config or CircuitBreakerConfig()
        )
        
        # Retry config
        self.retry_config = retry_config or RetryConfig()
        
        # Rate limiter
        self.rate_limiter = RateLimiter(
            rate_limit_config or RateLimitConfig()
        )
        
        # Metrics
        self.metrics = Metrics()
        
        # Session pool
        self._session: Optional[aiohttp.ClientSession] = None
        self._session_lock = asyncio.Lock()
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Obtiene o crea una sesión HTTP."""
        if self._session is None or self._session.closed:
            async with self._session_lock:
                if self._session is None or self._session.closed:
                    connector = aiohttp.TCPConnector(
                        limit=100,
                        limit_per_host=30,
                        ttl_dns_cache=300,
                    )
                    timeout = aiohttp.ClientTimeout(
                        total=self.timeout,
                        connect=30,
                        sock_read=30,
                    )
                    self._session = aiohttp.ClientSession(
                        connector=connector,
                        timeout=timeout,
                    )
        return self._session
    
    def _get_headers(self) -> Dict[str, str]:
        """Obtiene headers para requests."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        return headers
    
    @with_retry(RetryConfig(max_retries=3, base_delay=1.0))
    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        stream: bool = False,
    ) -> Union[Dict[str, Any], AsyncIterator[str]]:
        """Hace un request con retry y circuit breaker."""
        if not self.circuit_breaker.can_execute():
            raise CircuitBreakerOpenError("Circuit breaker is open")
        
        start_time = time.time()
        session = await self._get_session()
        
        try:
            async with session.request(
                method,
                f"{self.base_url}{endpoint}",
                json=data,
                headers=self._get_headers(),
            ) as response:
                self.metrics.total_requests += 1
                self.metrics.last_request_at = datetime.now()
                
                if response.status >= 400:
                    error_text = await response.text()
                    
                    if response.status == 429:
                        self.metrics.rate_limit_rejections += 1
                    
                    raise LiteLLMError(
                        f"LiteLLM Error {response.status}: {error_text}",
                        status_code=response.status,
                        error_data=error_text,
                    )
                
                if stream:
                    return response.content
                
                result = await response.json()
                
                # Registrar éxito
                self.circuit_breaker.record_success()
                
                # Actualizar métricas
                latency_ms = (time.time() - start_time) * 1000
                self.metrics.successful_requests += 1
                self.metrics.total_latency_ms += latency_ms
                
                if "usage" in result:
                    tokens = result["usage"].get("total_tokens", 0)
                    self.metrics.total_tokens += tokens
                
                model = result.get("model", "unknown")
                self.metrics.requests_by_model[model] = self.metrics.requests_by_model.get(model, 0) + 1
                
                return result
                
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            self.circuit_breaker.record_failure()
            self.metrics.failed_requests += 1
            raise
    
    async def chat(
        self,
        model: Union[str, ModelRole],
        messages: List[Dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Union[str, Dict]] = None,
        stream: bool = False,
        **kwargs
    ) -> Union[LLMResponse, AsyncIterator[StreamingChunk]]:
        """
        Chat completion.
        
        Args:
            model: Modelo a usar
            messages: Lista de mensajes
            temperature: Temperatura de generación
            max_tokens: Máximo de tokens
            tools: Herramientas disponibles
            tool_choice: Selección de herramienta
            stream: Si True, retorna un async iterator
            **kwargs: Parámetros adicionales
        
        Returns:
            LLMResponse o AsyncIterator[StreamingChunk]
        """
        model_str = model.value if isinstance(model, ModelRole) else model
        
        # Rate limiting
        tokens_estimate = sum(len(m.get("content", "")) // 4 for m in messages)
        if not await self.rate_limiter.acquire(tokens_estimate):
            raise RateLimitError("Rate limit exceeded")
        
        data = {
            "model": model_str,
            "messages": messages,
            "temperature": temperature,
        }
        
        if max_tokens:
            data["max_tokens"] = max_tokens
        if tools:
            data["tools"] = tools
        if tool_choice:
            data["tool_choice"] = tool_choice
        
        data.update(kwargs)
        
        if stream:
            return self._stream_chat(data)
        
        result = await self._make_request("POST", "/v1/chat/completions", data)
        
        return LLMResponse(
            content=result["choices"][0]["message"].get("content", ""),
            model=result.get("model", model_str),
            usage=result.get("usage", {}),
            finish_reason=result["choices"][0].get("finish_reason", "stop"),
            raw_response=result,
        )
    
    async def _stream_chat(self, data: Dict[str, Any]) -> AsyncIterator[StreamingChunk]:
        """Chat completion streaming."""
        data["stream"] = True
        content = ""
        finish_reason = None
        
        try:
            async for line in self._stream_request("POST", "/v1/chat/completions", data):
                if line.startswith("data: "):
                    chunk = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                delta_content = delta.get("content", "")
                content += delta_content
                
                finish_reason = chunk.get("choices", [{}])[0].get("finish_reason")
                
                yield StreamingChunk(
                    content=content,
                    delta=delta_content,
                    is_complete=False,
                    finish_reason=finish_reason,
                    raw_chunk=chunk,
                )
            
            yield StreamingChunk(
                content=content,
                delta="",
                is_complete=True,
                finish_reason=finish_reason,
                raw_chunk=None,
            )
            
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            raise
    
    async def _stream_request(
        self,
        method: str,
        endpoint: str,
        data: Dict[str, Any],
    ) -> AsyncIterator[str]:
        """Hace un request streaming."""
        if not self.circuit_breaker.can_execute():
            raise CircuitBreakerOpenError("Circuit breaker is open")
        
        session = await self._get_session()
        
        try:
            async with session.request(
                method,
                f"{self.base_url}{endpoint}",
                json=data,
                headers=self._get_headers(),
            ) as response:
                self.metrics.total_requests += 1
                
                if response.status >= 400:
                    error_text = await response.text()
                    raise LiteLLMError(
                        f"LiteLLM Error {response.status}: {error_text}",
                        status_code=response.status,
                    )
                
                async for line in response.content:
                    yield line.decode("utf-8")
                    
        except Exception as e:
            self.circuit_breaker.record_failure()
            raise
    
    async def list_models(self) -> List[Dict[str, Any]]:
        """Lista todos los modelos disponibles."""
        result = await self._make_request("GET", "/v1/models")
        return result.get("data", [])
    
    async def get_model_info(self, model_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene información de un modelo específico."""
        models = await self.list_models()
        for model in models:
            if model.get("id") == model_id:
                return model
        return None
    
    async def health_check(self) -> Dict[str, Any]:
        """Verifica el estado del gateway."""
        try:
            session = await self._get_session()
            async with session.get(
                f"{self.base_url}/health",
                headers=self._get_headers(),
            ) as response:
                if response.ok:
                    return await response.json()
                return {"status": "error", "code": response.status}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    async def get_metrics(self) -> Metrics:
        """Obtiene métricas del cliente."""
        return self.metrics
    
    async def get_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas resumidas."""
        metrics = self.metrics
        avg_latency = (
            metrics.total_latency_ms / metrics.successful_requests
            if metrics.successful_requests > 0 else 0
        )
        
        return {
            "total_requests": metrics.total_requests,
            "successful_requests": metrics.successful_requests,
            "failed_requests": metrics.failed_requests,
            "success_rate": (
                metrics.successful_requests / metrics.total_requests * 100
                if metrics.total_requests > 0 else 0
            ),
            "total_tokens": metrics.total_tokens,
            "avg_latency_ms": avg_latency,
            "circuit_breaker_state": self.circuit_breaker.get_state(),
            "rate_limits": self.rate_limiter.get_remaining(),
            "requests_by_model": metrics.requests_by_model,
        }
    
    async def reset_metrics(self):
        """Resetea las métricas."""
        self.metrics = Metrics()
    
    async def close(self):
        """Cierra el cliente y limpia recursos."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None


class LiteLLMError(Exception):
    """Error de LiteLLM."""
    
    def __init__(self, message: str, status_code: Optional[int] = None, error_data: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.error_data = error_data


class CircuitBreakerOpenError(Exception):
    """Error cuando el circuit breaker está abierto."""
    pass


class RateLimitError(Exception):
    """Error cuando se excede el rate limit."""
    pass


# Factory function
def create_litellm_client(
    base_url: str = "http://localhost:4000",
    api_key: Optional[str] = None,
    **kwargs
) -> LiteLLMClient:
    """Crea un cliente LiteLLM."""
    return LiteLLMClient(
        base_url=base_url,
        api_key=api_key,
        **kwargs
    )
