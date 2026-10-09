import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { CaioConfig } from "../../core/config/index.js";
import type { EventBus } from "../../core/events/index.js";
import { CreativeAgent } from "../../agents/creative-agent/index.js";
import { MemorySystem } from "../../memory/index.js";
import { detectHardware } from "../../core/hardware/detector.js";

export function registerAgentRoutes(api: Router, db: CaioDatabase, config: CaioConfig, eventBus: EventBus): void {
  const memory = new MemorySystem(db);
  let cachedHardware = detectHardware();
  const llm = {
    complete: async (req: any, task?: any) => {
      const { LLMProviderManager } = await import("../../core/llm/provider.js");
      const manager = new LLMProviderManager(config);
      return manager.complete(req, task);
    },
  };
  const agent = new CreativeAgent(db, config, eventBus, memory, () => cachedHardware, llm);

  api.post("/agent/process", async (req, res) => {
    try {
      const { intent, projectId, mode } = req.body;
      if (!intent) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Intent is required" } });
      const result = await agent.processIntent(intent, projectId, { mode });
      res.json({ success: true, data: result, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "RESOURCE_ERROR", message: err.message } });
    }
  });

  api.get("/agent/hardware", (_req, res) => {
    cachedHardware = detectHardware();
    res.json({ success: true, data: cachedHardware, timestamp: new Date() });
  });

  api.get("/agent/memory", (req, res) => {      const projectId = req.query.projectId as any;

    const query = (req.query.q as string) || "";
    const entries = memory.recall(query, projectId);
    res.json({ success: true, data: entries, timestamp: new Date() });
  });
}
