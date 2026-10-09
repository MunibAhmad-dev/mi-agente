/**
 * AgentEngine — FASE 6: Multi-Agent Specialist Registry.
 *
 * Defines and manages all 18 specialist agents from the Face 7 spec (§13):
 *
 *   Planner, Executor, Researcher, Coder, Tester, Debugger, Reviewer,
 *   SecurityAgent, DocumentationAgent, Auditor, Critic, FactChecker,
 *   ExperimentAgent, SourceAnalyst, TimelineAnalyst, EntityResolver,
 *   ContradictionHunter, SynthesisAgent.
 *
 * Each agent definition includes:
 *   - id / name / role description
 *   - required capabilities (for ModelRouter FASE 3)
 *   - trigger keywords (for selectAgent auto-routing)
 *   - constitution fragment (injected into system prompt)
 *   - canDelegate: boolean (can spawn subagents)
 *
 * AgentEngine.selectAgent(task, requiredCaps) → best-fit agent spec.
 * AgentEngine.spawn(agentId, ctx) → execute agent on task.
 */

const { Capabilities } = require('../CapabilityOrchestrator/constants/Types');

/** Full 18-agent registry per Face 7 §13. */
const AGENT_REGISTRY = [
  {
    id: 'planner',
    name: 'Planner',
    role: 'Decomposes complex goals into phases, parts, tasks, subtasks and tests.',
    capabilities: [Capabilities.REASONING, Capabilities.ANALYSIS, Capabilities.CHAT],
    triggers: ['plan', 'decompose', 'break down', 'strategy', 'roadmap', 'phases'],
    canDelegate: true,
    constitution: 'You are the Planner. Divide work into PHASE > PART > TASK > SUBTASK > TEST. Never skip levels. Each item must have: state, dependencies, requirements, evidence, tests.',
  },
  {
    id: 'executor',
    name: 'Executor',
    role: 'Executes tasks from the Planner\'s plan, coordinating tools and subagents.',
    capabilities: [Capabilities.TOOL_CALLING, Capabilities.FUNCTION_CALLING, Capabilities.REASONING],
    triggers: ['execute', 'run', 'implement', 'apply', 'do it'],
    canDelegate: true,
    constitution: 'You are the Executor. Execute tasks from the plan using available tools and subagents. Report results accurately. Never claim completion without evidence.',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    role: 'Autonomous investigation: search → extract → compare → verify → synthesize.',
    capabilities: [Capabilities.REASONING, Capabilities.ANALYSIS, Capabilities.CHAT],
    triggers: ['research', 'investigate', 'find', 'search', 'look up', 'who is', 'what is'],
    canDelegate: true,
    constitution: 'You are the Researcher. Never invent facts. Never invent sources. If unknown: say so, then search. Classify every claim: FACT / INFERENCE / HYPOTHESIS / UNKNOWN.',
  },
  {
    id: 'coder',
    name: 'Coder',
    role: 'Writes, refactors, and reviews code in any language with security awareness.',
    capabilities: [Capabilities.CODE, Capabilities.REASONING, Capabilities.TOOL_CALLING],
    triggers: ['code', 'write a function', 'implement', 'bug', 'fix', 'refactor', 'script'],
    canDelegate: false,
    constitution: 'You are the Coder. Write secure, correct, minimal code. No hallucinated APIs. If unsure: research first. Never say tested without running tests.',
  },
  {
    id: 'tester',
    name: 'Tester',
    role: 'Writes and runs tests: unit, integration, E2E, API, security, visual.',
    capabilities: [Capabilities.CODE, Capabilities.ANALYSIS],
    triggers: ['test', 'unit test', 'integration test', 'coverage', 'E2E'],
    canDelegate: false,
    constitution: 'You are the Tester. Write tests before claiming something works. Cover happy path, edge cases, failure cases. Never mock what can be tested for real.',
  },
  {
    id: 'debugger',
    name: 'Debugger',
    role: 'Diagnoses root causes of failures, traces errors, proposes and verifies fixes.',
    capabilities: [Capabilities.CODE, Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['debug', 'error', 'crash', 'exception', 'fails', 'broken', 'trace'],
    canDelegate: false,
    constitution: 'You are the Debugger. Find root cause, not symptoms. Never guess without evidence. Reproduce before fixing. Verify fix did not introduce regression.',
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Code review: correctness, security, performance, style, architecture.',
    capabilities: [Capabilities.CODE, Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['review', 'code review', 'check', 'PR', 'pull request'],
    canDelegate: false,
    constitution: 'You are the Reviewer. Review for correctness, security, performance, maintainability. Be specific. Reference line numbers. Never approve without checking.',
  },
  {
    id: 'security',
    name: 'SecurityAgent',
    role: 'Audits for OWASP top 10, injection, auth bypass, exposed secrets, blast radius.',
    capabilities: [Capabilities.CODE, Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['security', 'vulnerability', 'CVE', 'injection', 'auth', 'permission', 'OWASP'],
    canDelegate: false,
    constitution: 'You are the SecurityAgent. Apply minimum privilege. Audit OWASP top 10. Flag blast radius. Never disable security checks. All agents run with permissions.',
  },
  {
    id: 'documentation',
    name: 'DocumentationAgent',
    role: 'Writes architecture docs, API docs, implementation status, changelogs.',
    capabilities: [Capabilities.CHAT, Capabilities.ANALYSIS, Capabilities.WRITING],
    triggers: ['document', 'docs', 'README', 'changelog', 'API doc', 'architecture doc'],
    canDelegate: false,
    constitution: 'You are the DocumentationAgent. Write what actually exists, not what was intended. Document current state. Keep ARCHITECTURE.md, IMPLEMENTATION_STATUS.md, AUDIT_REPORT.md updated.',
  },
  {
    id: 'auditor',
    name: 'Auditor',
    role: 'Forensic audit of code, features, connections — classifies everything as REAL/PARTIAL/MOCK.',
    capabilities: [Capabilities.CODE, Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['audit', 'verify', 'check status', 'is it implemented', 'forensic'],
    canDelegate: false,
    constitution: 'You are the Auditor. Do not trust files alone — verify connections, execution, integration, results, tests. Classify: IMPLEMENTED & FUNCTIONAL / PARTIAL / DISCONNECTED / PLACEHOLDER / MOCK.',
  },
  {
    id: 'critic',
    name: 'Critic',
    role: 'Finds flaws in proposals, designs, and implementations before they go to production.',
    capabilities: [Capabilities.REASONING, Capabilities.ANALYSIS],
    triggers: ['critique', 'find flaws', 'what could go wrong', 'critic', 'challenge'],
    canDelegate: false,
    constitution: 'You are the Critic. Try to prove the solution is wrong. Apply: PROPOSER → CRITIC → COUNTERARGUMENT → VERIFIER → SYNTHESIS. Never approve without adversarial check.',
  },
  {
    id: 'fact_checker',
    name: 'FactChecker',
    role: 'Verifies claims against sources. Classifies: CONFIRMED / PROBABLE / UNCERTAIN / CONTRADICTORY / FALSE.',
    capabilities: [Capabilities.REASONING, Capabilities.ANALYSIS, Capabilities.CHAT],
    triggers: ['fact check', 'verify claim', 'is this true', 'sources', 'confirm'],
    canDelegate: false,
    constitution: 'You are the FactChecker. Never assert certainty without sufficient evidence. Find primary sources. Detect when multiple pages share one original source.',
  },
  {
    id: 'experiment',
    name: 'ExperimentAgent',
    role: 'Forms hypotheses, runs experiments in sandbox, compares results.',
    capabilities: [Capabilities.CODE, Capabilities.REASONING, Capabilities.TOOL_CALLING],
    triggers: ['experiment', 'hypothesis', 'try', 'test different approaches', 'benchmark'],
    canDelegate: false,
    constitution: 'You are the ExperimentAgent. PROBLEM → HYPOTHESIS → EXPERIMENT → RESULT → ANALYSIS → NEW HYPOTHESIS. Never say "works" from one isolated test. Record everything.',
  },
  {
    id: 'source_analyst',
    name: 'SourceAnalyst',
    role: 'Builds source graph: primary/secondary/tertiary, independence, reliability.',
    capabilities: [Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['source', 'primary source', 'independent source', 'origin', 'where does this come from'],
    canDelegate: false,
    constitution: 'You are the SourceAnalyst. Determine source independence. 10 copies of one Reuters article = 1 source, not 10. Classify: PRIMARY / SECONDARY / TERTIARY / COPY / AGGREGATOR.',
  },
  {
    id: 'timeline_analyst',
    name: 'TimelineAnalyst',
    role: 'Builds temporal knowledge graphs, detects chronological inconsistencies.',
    capabilities: [Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['timeline', 'chronology', 'when did', 'history of', 'sequence of events'],
    canDelegate: false,
    constitution: 'You are the TimelineAnalyst. Each event: date, place, entities, description, sources, evidence, confidence. Detect timeline inconsistencies. Never assume a relation persisted forever.',
  },
  {
    id: 'entity_resolver',
    name: 'EntityResolver',
    role: 'Resolves entity disambiguation: distinguishes John Smith (A) from John Smith (B).',
    capabilities: [Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['who is this', 'same person', 'entity', 'identify', 'disambiguate'],
    canDelegate: false,
    constitution: 'You are the EntityResolver. Use: name, organization, dates, public location, relations, documents. Never mix different people. Verify before asserting identity.',
  },
  {
    id: 'contradiction_hunter',
    name: 'ContradictionHunter',
    role: 'Actively hunts for contradictions between sources, creates CONTRADICTION records.',
    capabilities: [Capabilities.ANALYSIS, Capabilities.REASONING],
    triggers: ['contradiction', 'conflict', 'inconsistency', 'different sources say', 'discrepancy'],
    canDelegate: false,
    constitution: 'You are the ContradictionHunter. If Source A = 2010, Source B = 2012: do NOT choose arbitrarily. Create CONTRADICTION, then search for primary document. Determine which has more evidence.',
  },
  {
    id: 'synthesis',
    name: 'SynthesisAgent',
    role: 'Combines multi-source, multi-agent findings into a coherent, cited output.',
    capabilities: [Capabilities.REASONING, Capabilities.ANALYSIS, Capabilities.WRITING],
    triggers: ['synthesize', 'combine', 'summarize', 'final report', 'conclusion'],
    canDelegate: false,
    constitution: 'You are the SynthesisAgent. Combine findings with evidence. Label: FACT / INFERENCE / HYPOTHESIS / UNKNOWN. Never present inference as fact. Cite sources for every claim.',
  },
];

/** Index by id for O(1) lookup. */
const AGENT_BY_ID = Object.fromEntries(AGENT_REGISTRY.map((a) => [a.id, a]));

class AgentEngine {
  /**
   * @param {object} [opts]
   * @param {object} [opts.registry] - ModelRegistry from FASE 3 (for model routing)
   */
  constructor(opts = {}) {
    this.registry = opts.registry || null;
  }

  /** List all registered agent specs. */
  listAgents() {
    return AGENT_REGISTRY.map(({ id, name, role, capabilities, canDelegate }) => ({
      id, name, role, capabilities, canDelegate,
    }));
  }

  /** Get a single agent spec by id. */
  getAgent(id) {
    return AGENT_BY_ID[id] || null;
  }

  /**
   * Select the best-fit agent for a task using keyword triggers.
   * Falls back to Executor if nothing matches.
   *
   * @param {string} task
   * @param {string[]} [requiredCaps]
   * @returns {object} agent spec
   */
  selectAgent(task, requiredCaps = []) {
    const taskLower = (task || '').toLowerCase();

    // Score by trigger match
    let bestAgent = null;
    let bestScore = 0;

    for (const agent of AGENT_REGISTRY) {
      let score = 0;
      for (const trigger of agent.triggers) {
        if (taskLower.includes(trigger)) score += 1;
      }
      // Required capability boost
      if (requiredCaps.length > 0) {
        const capMatch = requiredCaps.filter((c) => agent.capabilities.includes(c)).length;
        score += capMatch * 0.5;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent || AGENT_BY_ID['executor'];
  }

  /**
   * Spawn an agent — executes its task via the ExecutiveLoop or direct LLM call.
   * In FASE 6 this is a stub that returns the agent spec + context.
   * Full execution is wired through HarnessAdapter (FASE 7) or ExecutiveLoop (Face 8).
   *
   * @param {string} agentId
   * @param {object} ctx - { task, userId, projectId, model }
   * @returns {object}
   */
  async spawn(agentId, ctx = {}) {
    const spec = this.getAgent(agentId);
    if (!spec) throw new Error(`Unknown agent: ${agentId}`);

    return {
      agentId,
      agentName: spec.name,
      role: spec.role,
      constitution: spec.constitution,
      task: ctx.task,
      userId: ctx.userId,
      projectId: ctx.projectId,
      model: ctx.model || null,
      status: 'spawned',
      spawnedAt: new Date().toISOString(),
    };
  }

  /**
   * Delegate a subtask from one agent to another.
   * The source agent must have canDelegate=true.
   *
   * @param {string} fromAgentId - delegating agent id
   * @param {string} toAgentId   - receiving agent id
   * @param {string} task        - task description to hand off
   * @param {object} [ctx]       - { userId, projectId, model }
   * @returns {Promise<object>}
   */
  async delegate(fromAgentId, toAgentId, task, ctx = {}) {
    const fromAgent = this.getAgent(fromAgentId);
    if (!fromAgent) throw new Error(`Unknown agent: ${fromAgentId}`);
    if (!fromAgent.canDelegate) {
      throw new Error(`Agent '${fromAgentId}' does not have delegation authority (canDelegate=false)`);
    }

    const toAgent = this.getAgent(toAgentId);
    if (!toAgent) throw new Error(`Unknown agent: ${toAgentId}`);

    const spawnResult = await this.spawn(toAgentId, { ...ctx, task });

    return {
      delegation: {
        from: { id: fromAgentId, name: fromAgent.name },
        to:   { id: toAgentId,   name: toAgent.name },
        task,
        delegatedAt: new Date().toISOString(),
      },
      result: spawnResult,
    };
  }
}

module.exports = { AgentEngine, AGENT_REGISTRY, AGENT_BY_ID };
