import express from "express";
import { createServer, type Server } from "node:http";
import type { CaioConfig } from "../core/config/index.js";
import { CaioDatabase, initDatabase } from "../core/database/index.js";
import { EventBus, getEventBus } from "../core/events/index.js";
import { loadConfig } from "../core/config/index.js";
import { WSStreamer } from "../core/ws/streamer.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerRuntimeRoutes } from "./routes/runtimes.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import { registerModelRoutes } from "./routes/models.js";
import { registerDiscoveryRoutes } from "./routes/discovery.js";
import { registerVisionRoutes } from "./routes/vision.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerExperimentRoutes } from "./routes/experiments.js";
import { registerSnapshotRoutes } from "./routes/snapshots.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerProjectsV2Routes } from "./routes/projects-v2.js";
import { registerVisionV2Routes } from "./routes/vision-v2.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerResourceRoutes } from "./routes/resources.js";
import { registerDownloadRoutes } from "./routes/downloads.js";
import { registerGoToolRoutes } from "./routes/go-tool.js";
import { mcpRoutes } from "./routes/mcp.js";
import { iqaRoutes } from "./routes/iqa.js";

export class CaioServer {
  private app: express.Express;
  private httpServer: Server;
  private streamer: WSStreamer;
  private config: CaioConfig;
  private db!: CaioDatabase;
  private eventBus: EventBus;

  constructor() {
    this.config = loadConfig();
    this.eventBus = getEventBus();
    this.app = express();
    this.httpServer = createServer(this.app);
    this.streamer = new WSStreamer(this.eventBus);
  }

  async initialize(): Promise<void> {
    this.db = await initDatabase(this.config.dataDir);
    this.setupMiddleware();
    this.setupRoutes();
    this.streamer.attach(this.httpServer, "/ws");
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      next();
    });
  }

  private setupRoutes(): void {
    const api = express.Router();
    registerProjectRoutes(api, this.db, this.eventBus);
    registerRuntimeRoutes(api, this.db, this.eventBus);
    registerWorkflowRoutes(api, this.db, this.eventBus);
    registerModelRoutes(api, this.db);
    registerDiscoveryRoutes(api, this.config);
    registerVisionRoutes(api);
    registerAgentRoutes(api, this.db, this.config, this.eventBus);
    registerHealthRoutes(api, this.db, this.config);
    registerExperimentRoutes(api, this.db);
    registerSnapshotRoutes(api, this.db);
    registerSystemRoutes(api, this.db, this.config);
    registerProjectsV2Routes(api, this.db, this.config);
    registerVisionV2Routes(api, this.db, this.config);
    registerMemoryRoutes(api, this.db);
    registerResourceRoutes(api);
    registerDownloadRoutes(api, this.db, this.config);
    registerGoToolRoutes(api, this.config.dataDir);
    api.use("/mcp", mcpRoutes);
    api.use("/iqa", iqaRoutes);

    this.app.use("/api", api);

    this.app.get("/", (_req, res) => {
      res.json({
        name: "Creative AI Orchestrator",
        version: "0.1.0",
        status: "running",
        endpoints: ["/api/projects", "/api/runtimes", "/api/workflows", "/api/models", "/api/discovery", "/api/vision", "/api/agent", "/api/health"],
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(`CAIO server running at http://${this.config.host}:${this.config.port}`);
        console.log(`WebSocket streaming at ws://${this.config.host}:${this.config.port}/ws`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.streamer.destroy();
    if (this.db) this.db.close();
    return new Promise((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }

  getConfig(): CaioConfig { return this.config; }
  getDb(): CaioDatabase { return this.db; }
  getStreamer(): WSStreamer { return this.streamer; }
}
