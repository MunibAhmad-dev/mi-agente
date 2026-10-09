# AGENT.md — Project Configuration for AI Agent

This file is automatically read by the agent at the start of every session.

## Project Overview
This is a Universal AI Agent platform built on LibreChat v0.8.7.
It provides multi-LLM support, cognitive engine, self-learning, and 54+ tools.

## Code Style
- Use `const` over `let` when possible
- Use early returns
- Use template literals over string concatenation
- Use async/await over callbacks
- Log with structured logger (not console.log directly)
- Error messages should be descriptive and actionable

## Architecture Rules
- Tools go in `api/server/services/Harness/tools/`
- Cognitive modules go in `api/server/services/Harness/cognitive/`
- Learning modules go in `api/server/services/Harness/cognitive/learning/`
- Each tool must have `getToolDefinitions()` and `execute()` methods
- Each tool must validate inputs and handle errors gracefully
- Use lazy loading for optional dependencies (try/catch require)

## Testing
- Run `node verify_all_final.js` to verify all modules load
- Tests use simple assertion pattern (no Jest for new modules)
- Each module should be independently testable

## Important Notes
- NEVER hardcode API keys
- NEVER modify .env directly
- ALWAYS create backups before destructive file operations
- ALWAYS validate file paths before operations
- Use the existing logger pattern (not console.log)
- Prefer editing existing files over creating new ones
- Follow the project's existing conventions

## Key Files
- `HarnessManager.js` - Central orchestrator
- `AgentLoop.js` - Core agent loop
- `DSHToolAdapter.js` - Tool registry
- `tools/index.js` - All tools exported
- `cognitive/index.js` - All cognitive modules

## Dependencies
- Node.js 20+
- MongoDB 7+
- Redis 7+
- Docker (optional, for sandbox)
- Ollama (optional, for local LLM)
