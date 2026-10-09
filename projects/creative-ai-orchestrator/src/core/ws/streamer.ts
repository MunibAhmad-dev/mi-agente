// ============================================================================
// WebSocket Streamer
// ============================================================================
// Real-time event streaming to connected clients.
// Used for: generation progress, model downloads, agent execution, health alerts.
// ============================================================================

import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "node:http";
import { EventBus } from "../events/index.js";
import type { CaioEvent } from "../types/index.js";

export type StreamChannel =
  | "agent"
  | "workflow"
  | "download"
  | "generation"
  | "health"
  | "experiment"
  | "log"
  | "*";

interface StreamMessage {
  type: "subscribe" | "unsubscribe" | "ping" | "pong";
  channel?: StreamChannel;
}

interface ClientInfo {
  ws: WebSocket;
  channels: Set<StreamChannel>;
  connectedAt: number;
  lastPing: number;
}

/**
 * WebSocket Streamer — broadcasts real-time events to connected clients.
 * Each client subscribes to one or more channels.
 * Messages are JSON-encoded with { channel, event, data, timestamp }.
 */
export class WSStreamer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ClientInfo>();
  private eventBus: EventBus;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private idCounter = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.setupEventForwarding();
  }

  /**
   * Attach to an existing HTTP server.
   */
  attach(server: Server, path = "/ws"): void {
    this.wss = new WebSocketServer({ server, path });

    this.wss.on("connection", (ws, req) => {
      const clientId = `ws_${++this.idCounter}_${Date.now()}`;
      const clientInfo: ClientInfo = {
        ws,
        channels: new Set(["*"]), // subscribe to all by default
        connectedAt: Date.now(),
        lastPing: Date.now(),
      };
      this.clients.set(clientId, clientInfo);

      // Send welcome
      this.send(ws, { channel: "system", event: "connected", data: { clientId }, timestamp: Date.now() });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as StreamMessage;
          this.handleMessage(clientId, msg);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
      });

      ws.on("pong", () => {
        clientInfo.lastPing = Date.now();
      });
    });

    // Heartbeat to detect dead connections
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, client] of this.clients) {
        if (now - client.lastPing > 60_000) {
          client.ws.terminate();
          this.clients.delete(id);
        } else {
          client.ws.ping();
        }
      }
    }, 30_000);
  }

  /**
   * Broadcast an event to all subscribed clients.
   */
  broadcast(channel: StreamChannel, event: string, data: unknown): void {
    const msg = { channel, event, data, timestamp: Date.now() };
    const payload = JSON.stringify(msg);

    for (const client of this.clients.values()) {
      if (client.channels.has("*") || client.channels.has(channel)) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(payload);
        }
      }
    }
  }

  /**
   * Get connected client count.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get stats about connected clients.
   */
  getStats(): { clients: number; channels: Record<string, number> } {
    const channelCounts: Record<string, number> = {};
    for (const client of this.clients.values()) {
      for (const ch of client.channels) {
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
      }
    }
    return { clients: this.clients.size, channels: channelCounts };
  }

  /**
   * Clean up.
   */
  destroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const client of this.clients.values()) {
      client.ws.close(1000, "Server shutting down");
    }
    this.clients.clear();
    this.wss?.close();
  }

  // === Private ===

  private handleMessage(clientId: string, msg: StreamMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
      case "subscribe":
        if (msg.channel) client.channels.add(msg.channel);
        break;
      case "unsubscribe":
        if (msg.channel) client.channels.delete(msg.channel);
        break;
      case "ping":
        this.send(client.ws, { type: "pong", timestamp: Date.now() });
        break;
    }
  }

  private send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Forward relevant EventBus events to WebSocket clients.
   */
  private setupEventForwarding(): void {
    const channelMap: Record<string, StreamChannel> = {
      "runtime.installed": "health",
      "runtime.started": "health",
      "runtime.failed": "health",
      "workflow.executed": "workflow",
      "workflow.failed": "workflow",
      "workflow.created": "workflow",
      "experiment.started": "experiment",
      "experiment.completed": "experiment",
      "model.installed": "download",
      "agent.step": "agent",
      "agent.completed": "agent",
      "agent.failed": "agent",
    };

    this.eventBus.on("*", (event: CaioEvent) => {
      const channel = channelMap[event.type] || "log";
      this.broadcast(channel, event.type, event.data);
    });
  }
}
