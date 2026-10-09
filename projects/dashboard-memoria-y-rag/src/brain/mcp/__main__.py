"""MCP server v2 — extended with full Brain capabilities.

Runs on SSE transport (port 3000) for Docker compatibility.

Tools: recall, remember, forget, search_graph, ingest_text, get_relationships,
       provenance, memory_status, graph_stats, move_memory
Resources: brain://spaces, brain://stats, brain://graph
"""

from __future__ import annotations

import os
import sys


def main():
    """Start the Brain MCP server."""
    from brain.logging_config import configure_logging

    configure_logging(level="WARNING", fmt="console")

    try:
        from mcp.server.mcpserver import MCPServer

        mcp = MCPServer(
            "brain",
            instructions="Brain MCP server — AI memory, knowledge graph, and RAG.",
        )

        # === TOOLS ===

        @mcp.tool()
        async def recall(query: str, space: str | None = None, limit: int = 10) -> str:
            """Search the Brain's memory using hybrid vector + full-text search."""
            from brain.core.db import get_pool
            from brain.rag.search import hybrid_search

            await get_pool()
            result = await hybrid_search(query=query, space=space, limit=limit)

            if not result["results"]:
                return "No memories found."

            lines = []
            for i, r in enumerate(result["results"], 1):
                score = r.get("final_score", r.get("similarity", 0))
                lines.append(f"[{i}] (score: {score:.3f}, space: {r.get('space', 'default')}) {r['content'][:200]}")
            return "\n".join(lines)

        @mcp.tool()
        async def remember(content: str, space: str = "default", category: str = "fact") -> str:
            """Store a new memory in the Brain."""
            from brain.core.db import get_pool
            from brain.memory.service import create_memory

            await get_pool()
            result = await create_memory(content=content, space=space, category=category)
            return f"Memory stored: {result['id']}"

        @mcp.tool()
        async def forget(chunk_id: str) -> str:
            """Soft-delete (forget) a memory by ID."""
            from brain.core.db import get_pool
            from brain.memory.service import forget_memory

            await get_pool()
            result = await forget_memory(chunk_id)
            return f"Memory forgotten: {result['id']}"

        @mcp.tool()
        async def search_graph(query: str, entity_type: str | None = None, limit: int = 20) -> str:
            """Search the knowledge graph for entities matching a query."""
            from brain.core.db import get_pool
            from brain.knowledge.service import list_entities

            await get_pool()
            entities = await list_entities(entity_type=entity_type, limit=limit)

            if not entities:
                return "No entities found."

            lines = []
            for e in entities:
                lines.append(f"[{e['type']}] {e['name']} (mentions: {e['mention_count']})")
            return "\n".join(lines)

        @mcp.tool()
        async def ingest_text(content: str, space: str = "default", source_name: str = "mcp") -> str:
            """Ingest text into the Brain — creates chunks, embeddings, and extracts entities."""
            from brain.core.db import get_pool
            from brain.documents.pipeline import ingest_text as _ingest

            await get_pool()
            result = await _ingest(content=content, space=space, source_name=source_name)
            return (
                f"Ingested: {result['chunks_created']} chunks, "
                f"{result['entities_found']} entities, "
                f"{result['relationships_found']} relationships"
            )

        @mcp.tool()
        async def get_relationships(entity_name: str | None = None, limit: int = 20) -> str:
            """Get relationships between entities in the knowledge graph."""
            from brain.core.db import get_pool
            from brain.knowledge.service import list_relationships

            await get_pool()
            rels = await list_relationships(limit=limit)

            if not rels:
                return "No relationships found."

            lines = []
            for r in rels:
                lines.append(f"{r['source_name']} --[{r['type']}]--> {r['target_name']} (strength: {r['strength']:.2f})")
            return "\n".join(lines)

        @mcp.tool()
        async def provenance(chunk_id: str) -> str:
            """Trace the source of a memory — why does the Brain know this?"""
            from brain.core.db import get_pool
            from brain.knowledge.service import trace_provenance

            await get_pool()
            try:
                result = await trace_provenance(chunk_id)
                lines = [f"Content: {result['content'][:200]}"]
                if result.get("source"):
                    lines.append(f"Source: {result['source']['name']} ({result['source']['type']})")
                if result.get("entities"):
                    lines.append(f"Entities: {', '.join(e['name'] for e in result['entities'])}")
                return "\n".join(lines)
            except Exception as e:
                return f"Error: {e}"

        @mcp.tool()
        async def memory_status() -> str:
            """Get Brain memory statistics."""
            from brain.core.db import get_pool
            from brain.memory.service import get_memory_stats

            await get_pool()
            stats = await get_memory_stats()
            return (
                f"Total: {stats['total']}, Active: {stats['active']}, "
                f"Forgotten: {stats['forgotten']}, Spaces: {stats['spaces']}\n"
                f"States: {stats['by_state']}\n"
                f"Categories: {stats['by_category']}"
            )

        @mcp.tool()
        async def graph_stats() -> str:
            """Get knowledge graph statistics."""
            from brain.core.db import get_pool, fetch_one

            await get_pool()
            entity_count = (await fetch_one("SELECT count(*) as cnt FROM entities"))["cnt"]
            rel_count = (await fetch_one("SELECT count(*) as cnt FROM relationships"))["cnt"]
            mention_count = (await fetch_one("SELECT count(*) as cnt FROM entity_mentions"))["cnt"]
            return f"Entities: {entity_count}, Relationships: {rel_count}, Mentions: {mention_count}"

        @mcp.tool()
        async def move_memory(chunk_id: str, target_space: str) -> str:
            """Move a memory to a different space (e.g., ai_learning or knowledge_ram)."""
            from brain.core.db import get_pool
            from brain.memory.service import move_memory as _move

            await get_pool()
            result = await _move(chunk_id, target_space)
            return f"Memory {chunk_id} moved to space '{target_space}'"

        # === RESOURCES ===

        @mcp.resource("brain://spaces")
        async def list_spaces() -> str:
            """List all memory spaces."""
            from brain.core.db import get_pool
            from brain.memory.service import list_spaces

            await get_pool()
            spaces = await list_spaces()
            lines = [f"{s['name']}: {s.get('chunk_count', 0)} memories" for s in spaces]
            return "\n".join(lines) if lines else "No spaces."

        @mcp.resource("brain://stats")
        async def system_stats() -> str:
            """Get system statistics."""
            from brain.core.db import get_pool
            from brain.memory.service import get_memory_stats

            await get_pool()
            stats = await get_memory_stats()
            return (
                f"Brain v0.1.0\n"
                f"Memories: {stats['total']} (active: {stats['active']})\n"
                f"Spaces: {stats['spaces']}\n"
                f"States: {stats['by_state']}\n"
                f"Categories: {stats['by_category']}"
            )

        # Run with SSE transport for Docker compatibility
        port = int(os.environ.get("MCP_PORT", "3000"))
        print(f"Starting Brain MCP server on SSE port {port}...")
        mcp.run(transport="sse", host="0.0.0.0", port=port)

    except ImportError as e:
        print(f"MCP SDK error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"MCP server error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
