"""
🚀 FastAPI Main Application
=========================
Crypto AI Trading System API

Documentación: http://localhost:8000/docs
"""

from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import FastAPI
from strawberry import StrawberryAPI
from contextlib import asynccontextmanager
import logging
import asyncio

from core.config import settings, engine, Base
from routers import market, trading, portfolio, strategies, performance, auth
from routers.cache import redis_cache, init_redis_cache, close_redis_cache
from routers.rate_limit import limiter, rate_limit_exceeded_handler
from routers.graphql import schema as graphql_schema
from websocket import ws_manager

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events"""
    # Startup
    logger.info("🚀 Starting Crypto AI Trading System API...")
    
    # Initialize database
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Database initialized")
    
    # Initialize Redis cache
    try:
        await init_redis_cache()
        logger.info("✅ Redis cache initialized")
    except Exception as e:
        logger.warning(f"⚠️ Redis not available: {e}")
    
    # Start WebSocket server in background
    asyncio.create_task(ws_manager.start())
    logger.info("✅ WebSocket server started")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down...")
    await close_redis_cache()
    ws_manager.stop()


# Create FastAPI app
app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    description="""
## Sistema de Trading con IA Autónoma

### Características
- 🤖 Agentes IA para análisis de mercado
- 📊 Gestión de portafolio
- ⚡ Ejecución de trades
- 📈 Métricas de rendimiento
- 🔒 Gestión de riesgo

### Arquitectura
- **Backend**: FastAPI + PostgreSQL + Redis
- **ML**: TensorTrade + Stable-Baselines3
- **Datos**: CCXT + TimescaleDB
- **Memoria**: Qdrant Vector DB
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(
    market.router,
    prefix=f"{settings.api_prefix}/market",
    tags=["Market Data"]
)

app.include_router(
    trading.router,
    prefix=f"{settings.api_prefix}/trading",
    tags=["Trading"]
)

app.include_router(
    portfolio.router,
    prefix=f"{settings.api_prefix}/portfolio",
    tags=["Portfolio"]
)

app.include_router(
    strategies.router,
    prefix=f"{settings.api_prefix}/strategies",
    tags=["Strategies"]
)

app.include_router(
    performance.router,
    prefix=f"{settings.api_prefix}/performance",
    tags=["Performance"]
)

app.include_router(
    auth.router,
    prefix=f"{settings.api_prefix}/auth",
    tags=["Auth"]
)

# GraphQL (Strawberry)
app.include_router(
    StrawberryAPI.as_router(graphql_schema),
    prefix="/graphql",
    tags=["GraphQL"]
)


# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.project_name,
        "version": settings.version,
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "market": f"{settings.api_prefix}/market",
            "trading": f"{settings.api_prefix}/trading",
            "portfolio": f"{settings.api_prefix}/portfolio",
            "strategies": f"{settings.api_prefix}/strategies",
            "performance": f"{settings.api_prefix}/performance",
        }
    }


@app.get("/health")
async def health_check():
    """Health check"""
    return {
        "status": "healthy",
        "version": settings.version,
        "services": {
            "database": "ok",
            "redis": "ok",
            "qdrant": "ok",
        }
    }


@app.get(f"{settings.api_prefix}")
async def api_root():
    """API root"""
    return {
        "message": "Crypto AI Trading System API",
        "version": settings.version,
        "documentation": "/docs",
    }


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "message": str(exc),
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
