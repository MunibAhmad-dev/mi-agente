// ============================================================================
// UI Dev Server
// ============================================================================
// Serves the React GUI with esbuild and proxies API calls to the main server.
// Usage: npx tsx ui/serve.ts
// ============================================================================

import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { CaioServer } from "../src/api/server.js";

async function main() {
  const PORT = 3456;
  const UI_PORT = 3457;

  // Start the API server
  const apiServer = new CaioServer();
  await apiServer.initialize();

  const apiApp = express();
  apiApp.use(express.json({ limit: "10mb" }));

  // Serve the GUI static files
  apiApp.use("/ui", express.static("ui"));

  // API routes (from the main server)
  const apiRouter = express.Router();
  apiApp.use("/api", apiRouter);

  // Forward API requests to the internal server
  // For simplicity, we mount the same routes
  const { registerProjectRoutes } = await import("../src/api/routes/projects.js");
  const { registerRuntimeRoutes } = await import("../src/api/routes/runtimes.js");
  const { registerWorkflowRoutes } = await import("../src/api/routes/workflows.js");
  const { registerModelRoutes } = await import("../src/api/routes/models.js");
  const { registerDiscoveryRoutes } = await import("../src/api/routes/discovery.js");
  const { registerVisionRoutes } = await import("../src/api/routes/vision.js");
  const { registerAgentRoutes } = await import("../src/api/routes/agent.js");
  const { registerHealthRoutes } = await import("../src/api/routes/health.js");
  const { registerExperimentRoutes } = await import("../src/api/routes/experiments.js");
  const { registerSnapshotRoutes } = await import("../src/api/routes/snapshots.js");
  const { registerSystemRoutes } = await import("../src/api/routes/system.js");
  const { getEventBus } = await import("../src/core/events/index.js");

  const config = apiServer.getConfig();
  const db = apiServer.getDb();
  const eventBus = getEventBus();

  registerProjectRoutes(apiRouter, db, eventBus);
  registerRuntimeRoutes(apiRouter, db, eventBus);
  registerWorkflowRoutes(apiRouter, db, eventBus);
  registerModelRoutes(apiRouter, db);
  registerDiscoveryRoutes(apiRouter, config);
  registerVisionRoutes(apiRouter);
  registerAgentRoutes(apiRouter, db, config, eventBus);
  registerHealthRoutes(apiRouter, db, config);
  registerExperimentRoutes(apiRouter, db);
  registerSnapshotRoutes(apiRouter, db);
  registerSystemRoutes(apiRouter, db, config);

  // Root redirect to GUI
  apiApp.get("/", (_req, res) => res.redirect("/ui/index.html"));

  // WebSocket for real-time events
  const server = createServer(apiApp);
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });
  eventBus.on("*", (event) => {
    const msg = JSON.stringify({ type: "event", data: event });
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    }
  });

  server.listen(UI_PORT, "127.0.0.1", () => {
    console.log(`GUI: http://127.0.0.1:${UI_PORT}/ui/`);
    console.log(`API: http://127.0.0.1:${UI_PORT}/api/`);
  });
}

main().catch(console.error);
