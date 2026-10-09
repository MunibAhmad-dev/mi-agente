/**
 * AI Creative OS - Creative Director
 * 
 * The central orchestrator that coordinates:
 * - Intent interpretation
 * - Ambiguity detection
 * - Planning
 * - Provider selection
 * - Resource management
 * - Execution
 * - Evaluation
 * - Correction
 */

import type {
  CreativeSpecification, ProductionGraph, UniqueId, TaskStatus,
} from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";
import { CreativeCompiler } from "../creative-compiler/index.js";
import { ProductionPlanner, type ProductionPlan } from "../production-graph/index.js";

export interface CreativeSession {
  id: UniqueId;
  intent: string;
  specification?: CreativeSpecification;
  plan?: ProductionPlan;
  graph?: ProductionGraph;
  status: "analyzing" | "planning" | "executing" | "evaluating" | "correcting" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  errors: string[];
}

export class CreativeDirector {
  private logger = new Logger("CreativeDirector");
  private eventBus: EventBus;
  private compiler: CreativeCompiler;
  private planner: ProductionPlanner;
  private sessions = new Map<UniqueId, CreativeSession>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.compiler = new CreativeCompiler(eventBus);
    this.planner = new ProductionPlanner(eventBus);
  }

  /**
   * Process a creative request from the user.
   */
  async processRequest(
    intent: string,
    options: Partial<CreativeSpecification> = {},
  ): Promise<CreativeSession> {
    const session: CreativeSession = {
      id: generateId(),
      intent,
      status: "analyzing",
      startedAt: Date.now(),
      errors: [],
    };
    this.sessions.set(session.id, session);

    try {
      // Phase 1: Compile intent
      this.logger.info("Phase 1: Compiling creative intent...");
      await this.eventBus.emit("SESSION_STARTED", "CreativeDirector", { sessionId: session.id });

      const { specification, analysis } = await this.compiler.compile(intent, options);
      session.specification = specification;

      if (analysis.ambiguities.length > 0) {
        this.logger.info("Ambiguities detected:", analysis.ambiguities);
      }

      // Phase 2: Plan production
      session.status = "planning";
      this.logger.info("Phase 2: Planning production...");
      const plan = await this.planner.plan(specification);
      session.plan = plan;
      session.graph = plan.graph;

      if (plan.warnings.length > 0) {
        session.errors.push(...plan.warnings);
      }

      await this.eventBus.emit("PLAN_CREATED", "CreativeDirector", {
        sessionId: session.id,
        duration: plan.estimatedDuration,
        nodes: plan.graph.nodes.length,
      });

      // Phase 3: Execution (would be triggered by user approval)
      this.logger.info("Phase 3: Plan ready for execution");
      session.status = "executing"; // Ready to execute

      await this.eventBus.emit("PLAN_READY", "CreativeDirector", {
        sessionId: session.id,
        estimatedDuration: plan.estimatedDuration,
      });

      return session;
    } catch (err) {
      session.status = "failed";
      session.errors.push(err instanceof Error ? err.message : String(err));
      this.logger.error("Creative Director error:", err);
      return session;
    }
  }

  /**
   * Get a session by ID.
   */
  getSession(id: UniqueId): CreativeSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get all sessions.
   */
  getSessions(): CreativeSession[] {
    return [...this.sessions.values()];
  }

  /**
   * Request clarification for ambiguities.
   */
  getClarificationQuestions(session: CreativeSession): string[] {
    const questions: string[] = [];
    if (!session.specification) return questions;

    const spec = session.specification;
    if (spec.platform === "generic") {
      questions.push("Which platform is this for? (TikTok, YouTube, Instagram, etc.)");
    }
    if (spec.duration === 30000 && session.intent.length < 30) {
      questions.push("What duration would you like? (e.g., 30 seconds, 2 minutes)");
    }
    return questions;
  }
}
