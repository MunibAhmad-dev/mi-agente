"""Database connection pool, query helpers, and migration runner."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from brain.config import get_settings
from brain.core.exceptions import ConnectionError, DatabaseError, MigrationError
from brain.logging_config import get_logger

logger = get_logger("brain.core.db")

# Global connection pool (lazy-init)
_pool: AsyncConnectionPool | None = None


async def get_pool() -> AsyncConnectionPool:
    """Get or create the global async connection pool."""
    global _pool
    if _pool is not None:
        return _pool

    settings = get_settings()
    try:
        _pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=settings.db.pool_min,
            max_size=settings.db.pool_max,
            kwargs={"row_factory": dict_row, "autocommit": False},
        )
        logger.info("database_pool_created", pool_min=settings.db.pool_min, pool_max=settings.db.pool_max)
        return _pool
    except Exception as e:
        raise ConnectionError(f"Failed to create database pool: {e}") from e


async def close_pool() -> None:
    """Close the global connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("database_pool_closed")


async def fetch_one(query: str, params: tuple[Any, ...] | None = None) -> dict[str, Any] | None:
    """Fetch a single row."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchone()


async def fetch_all(query: str, params: tuple[Any, ...] | None = None) -> list[dict[str, Any]]:
    """Fetch all matching rows."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchall()


async def execute(query: str, params: tuple[Any, ...] | None = None) -> str | None:
    """Execute a statement and return the first column of the first row (e.g., INSERT ... RETURNING id).
    Returns None for statements without RETURNING (UPDATE, DELETE)."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            try:
                result = await cur.fetchone()
                if result:
                    return result.get("id") or result.get(list(result.keys())[0])
            except Exception:
                pass
            return None


async def execute_many(query: str, params_list: list[tuple[Any, ...]]) -> int:
    """Execute a statement for many parameter sets. Returns affected row count."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(query, params_list)
            return cur.rowcount


async def execute_raw(query: str, params: tuple[Any, ...] | None = None) -> psycopg.Cursor:
    """Execute raw query without dict_row (for DDL, migrations)."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return cur


# === Migration Runner ===


async def run_migrations() -> None:
    """Run all SQL migration files from the migrations directory."""
    settings = get_settings()
    migrations_dir = settings.migrations_dir

    if not migrations_dir.exists():
        logger.warning("migrations_dir_not_found", path=str(migrations_dir))
        return

    # Ensure migration tracker table exists
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS _migration_tracker (
                    id SERIAL PRIMARY KEY,
                    filename TEXT NOT NULL UNIQUE,
                    applied_at TIMESTAMPTZ DEFAULT now()
                )
            """)
            await conn.commit()

    # Get already-applied migrations
    applied = set()
    rows = await fetch_all("SELECT filename FROM _migration_tracker ORDER BY id")
    for row in rows:
        applied.add(row["filename"])

    # Find migration files
    migration_files = sorted(migrations_dir.glob("*.sql"))

    for filepath in migration_files:
        if filepath.name.startswith("_"):
            continue
        if filepath.name in applied:
            continue

        logger.info("migration_applying", filename=filepath.name)
        sql = filepath.read_text(encoding="utf-8")

        try:
            pool = await get_pool()
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(sql)
                    await cur.execute(
                        "INSERT INTO _migration_tracker (filename) VALUES (%s)",
                        (filepath.name,),
                    )
                    await conn.commit()
            logger.info("migration_applied", filename=filepath.name)
        except Exception as e:
            logger.error("migration_failed", filename=filepath.name, error=str(e))
            raise MigrationError(f"Failed to apply migration {filepath.name}: {e}") from e

    logger.info("migrations_complete", total=len(migration_files), applied=len(migration_files))
