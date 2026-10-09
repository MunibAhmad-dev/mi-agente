"""
🚀 Rate Limiter
============
Rate limiting con SlowAPI para FastAPI
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Obtener IP del cliente"""
    # Check for forwarded header
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Limiter instance
limiter = Limiter(key_func=get_client_ip)


# Rate limit decorator helper
def rate_limit(requests: int = 100, window: str = "minute"):
    """Decorator para rate limiting"""
    return limiter.limit(f"{requests}/{window}")


# Error handler
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Manejar errores de rate limit"""
    logger.warning(f"Rate limit exceeded for {get_client_ip(request)}")
    
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "detail": f"Maximum {exc.detail} requests per minute",
            "retry_after": exc.detail
        }
    )


# Default rate limits por endpoint
DEFAULT_LIMITS = {
    "default": "100/minute",
    "market_data": "200/minute",
    "trading": "10/minute",
    "auth": "5/minute",
}


# IP whitelist (sin rate limit)
WHITELIST_IPS = {
    "127.0.0.1",
    "::1",
}