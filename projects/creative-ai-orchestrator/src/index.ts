// ============================================================================
// Creative AI Orchestrator (CAIO) - Main Entry Point
// ============================================================================

import { CaioServer } from "./api/server.js";

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║    Creative AI Orchestrator (CAIO) v0.1.0       ║");
  console.log("║    Universal Creative AI Operating Layer         ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();

  const server = new CaioServer();
  await server.initialize();

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await server.start();

  console.log();
  console.log("System ready. Endpoints:");
  console.log("  GET  /              - System info");
  console.log("  GET  /api/health    - Health check");
  console.log("  GET  /api/projects  - List projects");
  console.log("  POST /api/projects  - Create project");
  console.log("  GET  /api/models    - List models");
  console.log("  GET  /api/workflows - List workflows");
  console.log("  GET  /api/discovery - Search (GitHub, HF, Civitai)");
  console.log("  POST /api/agent/process - Creative agent");
  console.log("  WS   /              - Real-time events");
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
