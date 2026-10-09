"""FastAPI application factory — lifespan, middleware, routers."""

from __future__ import annotations

import gc
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.middleware.cors import CORSMiddleware

from brain.config import get_settings
from brain.core.db import close_pool, get_pool, run_migrations
from brain.logging_config import configure_logging, get_logger
from brain.api.middleware import RequestIDMiddleware, RateLimitMiddleware
from brain.api.routers import health, memory, search, admin, chat, graph, knowledge, documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    settings = get_settings()
    configure_logging(level=settings.logging.level, fmt=settings.logging.format)
    logger = get_logger("brain.api.app")

    logger.info("brain_starting", version="0.1.0")

    # Configure GC for lower memory
    gc.set_threshold(700, 10, 10)

    # Initialize database pool
    await get_pool()
    logger.info("database_pool_ready")

    # Run migrations
    await run_migrations()
    logger.info("migrations_complete")

    # Collect initial garbage
    gc.collect()

    logger.info("brain_ready")
    yield

    # Shutdown
    logger.info("brain_shutting_down")
    await close_pool()
    logger.info("brain_stopped")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="BRAIN",
        description="A living, inspectable, explainable AI knowledge and memory system",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Middleware (order matters — outermost first)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIDMiddleware)

    # Routers
    app.include_router(health.router)
    app.include_router(memory.router)
    app.include_router(search.router)
    app.include_router(admin.router)
    app.include_router(chat.router)
    app.include_router(graph.router)
    app.include_router(knowledge.router)
    app.include_router(documents.router)

    # Serve dashboard
    from brain.dashboard import DASHBOARD_HTML

    @app.get("/dashboard", response_class=HTMLResponse)
    async def dashboard():
        return DASHBOARD_HTML

    return app
