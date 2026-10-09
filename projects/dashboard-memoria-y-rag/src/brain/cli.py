"""CLI entry point for Brain."""

from __future__ import annotations

import argparse
import asyncio
import sys


def main():
    """Brain CLI entry point."""
    parser = argparse.ArgumentParser(prog="brain", description="BRAIN — AI Knowledge & Memory System")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Start server
    start_parser = subparsers.add_parser("start", help="Start the Brain API server")
    start_parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    start_parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    start_parser.add_argument("--reload", action="store_true", help="Enable auto-reload")

    # Run migrations
    subparsers.add_parser("migrate", help="Run database migrations")

    # Create token
    token_parser = subparsers.add_parser("token", help="Create an API token")
    token_parser.add_argument("name", help="Token name")
    token_parser.add_argument("--days", type=int, default=30, help="Expiry in days")

    args = parser.parse_args()

    if args.command == "start":
        _start_server(args.host, args.port, args.reload)
    elif args.command == "migrate":
        _run_migrations()
    elif args.command == "token":
        _create_token(args.name, args.days)
    else:
        parser.print_help()


def _start_server(host: str, port: int, reload: bool) -> None:
    """Start the uvicorn server."""
    import uvicorn

    uvicorn.run(
        "brain.api.app:create_app",
        factory=True,
        host=host,
        port=port,
        reload=reload,
    )


def _run_migrations() -> None:
    """Run database migrations."""
    from brain.logging_config import configure_logging

    configure_logging(level="INFO", fmt="console")

    async def _run():
        from brain.core.db import get_pool, run_migrations

        await get_pool()
        await run_migrations()
        print("Migrations complete.")

    asyncio.run(_run())


def _create_token(name: str, expiry_days: int) -> None:
    """Create an API token."""
    from brain.logging_config import configure_logging

    configure_logging(level="INFO", fmt="console")

    async def _run():
        from brain.core.db import get_pool
        from brain.security.auth import create_token

        await get_pool()
        result = await create_token(name, expiry_days=expiry_days)
        print(f"Token created:")
        print(f"  ID:     {result['id']}")
        print(f"  Token:  {result['token']}")
        print(f"  Name:   {result['name']}")
        print(f"  Expires: {result['expires_at']}")
        print()
        print("⚠ Save this token — it will not be shown again!")

    asyncio.run(_run())


if __name__ == "__main__":
    main()
