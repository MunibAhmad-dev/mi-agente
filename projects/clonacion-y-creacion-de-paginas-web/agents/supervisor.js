// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Supervisor Agent
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { genId, timestamp, createLogger, globalBus, projectDir, readJSON, writeJSON } from '../core/utils.js';
import { computeOverallScore, createEmptyScore } from '../core/utils.js';

const log = createLogger('supervisor');

export class SupervisorAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'supervisor',
      name: 'Supervisor Agent',
      capabilities: ['orchestration', 'planning', 'review', 'conflict-resolution'],
    });
    this.workerRegistry = config.workerRegistry;
    this.skillRegistry = config.skillRegistry;
    this.toolRegistry = config.toolRegistry;
    this.modelRouter = config.modelRouter;
    this.activeProjects = new Map();
  }

  async perform(task, context) {
    const { projectId, action } = task;
    this.log.info(`Supervisor action: ${action} for project ${projectId}`);

    switch (action) {
      case 'analyze':
        return this.analyzeTask(projectId, context);
      case 'plan':
        return this.createPlan(projectId, context);
      case 'execute':
        return this.executePlan(projectId, context);
      case 'review':
        return this.reviewResult(projectId, context);
      case 'repair':
        return this.initiateRepair(projectId, context);
      case 'full-cycle':
        return this.fullReconstructionCycle(projectId, context);
      default:
        throw new Error(`Unknown supervisor action: ${action}`);
    }
  }

  // ─── Task Analysis ──────────────────────────────────────────────────────

  async analyzeTask(projectId, context) {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    this.log.info('Analyzing task requirements...');

    const inputType = project.input.type;
    const requiredCapabilities = this.determineRequiredCapabilities(inputType);
    const requiredSkills = this.determineRequiredSkills(requiredCapabilities);
    const requiredTools = this.determineRequiredTools(requiredCapabilities);

    // Find available agents for each capability
    const agentAssignments = this.assignAgents(requiredCapabilities);

    const analysis = {
      inputType,
      requiredCapabilities,
      requiredSkills,
      requiredTools,
      agentAssignments,
      estimatedIterations: this.estimateIterations(project),
      estimatedDuration: this.estimateDuration(project),
      complexity: this.assessComplexity(project),
    };

    this.log.info(`Analysis complete: ${analysis.complexity} complexity, ${agentAssignments.length} agents needed`);
    return { evidence: [{ type: 'log', description: 'Task analysis completed', data: analysis }] };
  }

  determineRequiredCapabilities(inputType) {
    const base = ['code-generation', 'visual-comparison'];
    const inputCapabilities = {
      url: ['browser-automation', 'url-discovery', 'dom-extraction', 'screenshot-capture', 'css-extraction', 'asset-extraction'],
      screenshot: ['computer-vision', 'ocr', 'component-detection', 'design-forensics'],
      'multi-screenshot': ['computer-vision', 'ocr', 'component-detection', 'design-forensics', 'responsive-analysis'],
      video: ['computer-vision', 'frame-extraction', 'animation-analysis', 'interaction-discovery'],
      figma: ['design-token-extraction', 'component-mapping'],
      description: ['planning', 'code-generation'],
    };
    return [...base, ...(inputCapabilities[inputType] || inputCapabilities.description)];
  }

  determineRequiredSkills(capabilities) {
    return capabilities.map(c => {
      const skill = this.skillRegistry?.getBestForCapability(c);
      return skill ? { capability: c, skillId: skill.id, skillName: skill.name } : { capability: c, skillId: null };
    });
  }

  determineRequiredTools(capabilities) {
    const toolMap = {
      'browser-automation': 'playwright',
      'screenshot-capture': 'playwright',
      'computer-vision': 'sharp',
      'visual-comparison': 'pixelmatch',
      'code-generation': 'filesystem',
      'dom-extraction': 'playwright',
      'css-extraction': 'playwright',
    };
    return capabilities
      .filter(c => toolMap[c])
      .map(c => ({ capability: c, toolId: toolMap[c] }));
  }

  assignAgents(capabilities) {
    const agentTypeMap = {
      'browser-automation': 'browser',
      'url-discovery': 'discovery',
      'dom-extraction': 'browser',
      'css-extraction': 'browser',
      'screenshot-capture': 'browser',
      'asset-extraction': 'asset',
      'computer-vision': 'vision',
      'ocr': 'vision',
      'component-detection': 'vision',
      'design-forensics': 'design-forensics',
      'responsive-analysis': 'responsive',
      'animation-analysis': 'animation',
      'interaction-discovery': 'interaction',
      'code-generation': 'frontend',
      'visual-comparison': 'visual-qa',
      'auto-repair': 'auto-repair',
      'planning': 'ui-architect',
    };

    const needed = new Set();
    for (const cap of capabilities) {
      const agentType = agentTypeMap[cap];
      if (agentType) needed.add(agentType);
    }

    return [...needed].map(type => ({
      agentType: type,
      role: type,
      status: 'assigned',
      assignedAt: timestamp(),
    }));
  }

  estimateIterations(project) {
    const complexityMap = { simple: 3, medium: 5, complex: 8, very_complex: 12 };
    return complexityMap[this.assessComplexity(project)] || 5;
  }

  estimateDuration(project) {
    return this.estimateIterations(project) * 30000; // 30s per iteration estimate
  }

  assessComplexity(project) {
    const sources = project.input.sources?.length || 0;
    if (sources <= 1) return 'simple';
    if (sources <= 3) return 'medium';
    if (sources <= 6) return 'complex';
    return 'very_complex';
  }

  // ─── Plan Creation ───────────────────────────────────────────────────────

  async createPlan(projectId, context) {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const analysis = context.analysis || (await this.analyzeTask(projectId, context)).evidence?.[0]?.data;

    const plan = {
      phases: [
        { name: 'discovery', agents: ['browser', 'discovery'], parallel: true, status: 'pending' },
        { name: 'analysis', agents: ['vision', 'design-forensics'], parallel: true, status: 'pending' },
        { name: 'design-dna', agents: ['design-forensics', 'geometry', 'typography', 'color', 'shadow'], parallel: true, status: 'pending' },
        { name: 'architecture', agents: ['ui-architect'], parallel: false, status: 'pending' },
        { name: 'implementation', agents: ['frontend'], parallel: false, status: 'pending' },
        { name: 'asset-optimization', agents: ['asset'], parallel: false, status: 'pending' },
        { name: 'visual-qa', agents: ['visual-qa'], parallel: false, status: 'pending' },
        { name: 'repair', agents: ['auto-repair'], parallel: false, status: 'pending' },
      ],
      currentPhase: 0,
      startedAt: timestamp(),
    };

    project.agents = analysis?.agentAssignments || [];
    this.saveProject(project);
    this.log.info(`Plan created with ${plan.phases.length} phases`);

    return { evidence: [{ type: 'log', description: 'Execution plan created', data: plan }] };
  }

  // ─── Plan Execution ──────────────────────────────────────────────────────

  async executePlan(projectId, context) {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    this.log.info('Executing reconstruction plan...');
    const results = [];
    const maxIterations = project.config.maxIterations || 10;
    const threshold = project.config.qualityThreshold || 95;

    for (let iter = 1; iter <= maxIterations; iter++) {
      this.log.info(`\n═══ ITERATION ${iter}/${maxIterations} ═══`);

      const iteration = {
        number: iter,
        startedAt: timestamp(),
        changes: [],
        agentActions: [],
        errors: [],
        status: 'running',
      };

      try {
        // Phase 1: Browser/Discovery (if URL input)
        if (project.input.type === 'url') {
          const browserResult = await this.dispatchToAgent('browser', {
            action: 'capture',
            url: project.input.sources[0]?.url,
            viewport: project.config.browserConfig.viewport,
          }, projectId);
          iteration.agentActions.push({ agent: 'browser', action: 'capture', ...browserResult });
        }

        // Phase 2: Vision Analysis (if screenshot input)
        if (['screenshot', 'multi-screenshot'].includes(project.input.type)) {
          for (const source of project.input.sources) {
            const visionResult = await this.dispatchToAgent('vision', {
              action: 'analyze-screenshot',
              imagePath: source.path,
            }, projectId);
            iteration.agentActions.push({ agent: 'vision', action: 'analyze', ...visionResult });
          }
        }

        // Phase 3: Design Forensics
        const forensicsResult = await this.dispatchToAgent('design-forensics', {
          action: 'generate-report',
          screenshots: project.input.sources.map(s => s.path).filter(Boolean),
        }, projectId);
        iteration.agentActions.push({ agent: 'design-forensics', action: 'report', ...forensResult });

        // Phase 4: Code Generation
        const genResult = await this.dispatchToAgent('frontend', {
          action: 'generate',
          framework: project.config.targetFramework,
          designDNA: project.designDNA,
        }, projectId);
        iteration.agentActions.push({ agent: 'frontend', action: 'generate', ...genResult });

        // Phase 5: Visual QA
        const qaResult = await this.dispatchToAgent('visual-qa', {
          action: 'compare',
          original: project.input.sources[0]?.path,
          reconstruction: projectDir(projectId) + '/output/reconstruction.png',
        }, projectId);
        iteration.agentActions.push({ agent: 'visual-qa', action: 'compare', ...qaResult });

        // Evaluate score
        const score = qaResult.result?.score || createEmptyScore(iter);
        score.iteration = iter;
        project.scores.push(score);
        project.currentIteration = iter;

        iteration.score = score;
        iteration.completedAt = timestamp();
        iteration.status = 'completed';
        project.iterations.push(iteration);

        this.log.info(`Iteration ${iter} score: ${score.overall}%`);

        // Check if threshold reached
        if (score.overall >= threshold) {
          this.log.info(`✅ Quality threshold reached: ${score.overall}% >= ${threshold}%`);
          project.status = 'completed';
          this.saveProject(project);
          return {
            success: true,
            score,
            iteration: iter,
            evidence: [{ type: 'metric', description: `Final score: ${score.overall}%`, data: score }],
          };
        }

        // Phase 6: Auto Repair (if enabled and below threshold)
        if (project.config.enableAutoRepair && score.overall < threshold) {
          const repairResult = await this.dispatchToAgent('auto-repair', {
            action: 'repair',
            score,
            diffs: score.diffs,
          }, projectId);
          iteration.agentActions.push({ agent: 'auto-repair', action: 'repair', ...repairResult });
        }

        results.push(iteration);
      } catch (error) {
        iteration.errors.push({ agent: 'supervisor', error: error.message, recoverable: true });
        iteration.status = 'failed';
        project.iterations.push(iteration);
        this.log.error(`Iteration ${iter} failed: ${error.message}`);
      }
    }

    // Final evaluation
    const lastScore = project.scores[project.scores.length - 1];
    project.status = lastScore?.overall >= threshold ? 'completed' : 'failed';
    this.saveProject(project);

    return {
      success: project.status === 'completed',
      score: lastScore,
      totalIterations: project.currentIteration,
      evidence: [{ type: 'metric', description: `Final score after ${project.currentIteration} iterations: ${lastScore?.overall || 0}%` }],
    };
  }

  // ─── Agent Dispatch ──────────────────────────────────────────────────────

  async dispatchToAgent(agentType, taskPayload, projectId) {
    const startTime = Date.now();
    globalBus.emit('supervisor:dispatch', { agentType, taskId: taskPayload.action, projectId });

    try {
      // This would normally create/lookup the agent and execute
      // For now, emit a dispatch event that the agent system handles
      const taskId = genId('task');
      const task = { id: taskId, type: 'TASK', ...taskPayload };

      globalBus.emit('agent:execute', { agentType, task, projectId });
      const duration = Date.now() - startTime;
      return { success: true, result: { taskId, duration }, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      return { success: false, error: error.message, duration };
    }
  }

  // ─── Review ──────────────────────────────────────────────────────────────

  async reviewResult(projectId, context) {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const score = project.scores[project.scores.length - 1];
    if (!score) {
      return { approved: false, reason: 'No score available for review' };
    }

    const issues = score.diffs.filter(d => d.severity === 'major');
    const warnings = score.diffs.filter(d => d.severity === 'moderate');
    const minors = score.diffs.filter(d => d.severity === 'minor');

    const review = {
      overallScore: score.overall,
      approved: score.overall >= (project.config.qualityThreshold || 95),
      issues: issues.length,
      warnings: warnings.length,
      minors: minors.length,
      recommendations: [],
    };

    if (!review.approved) {
      if (issues.length > 0) {
        review.recommendations.push(`Fix ${issues.length} major issues`);
      }
      if (score.layout < 90) review.recommendations.push('Improve layout accuracy');
      if (score.color < 90) review.recommendations.push('Fix color mismatches');
      if (score.typography < 90) review.recommendations.push('Adjust typography');
    }

    this.log.info(`Review: ${review.approved ? 'APPROVED' : 'REJECTED'} (${score.overall}%)`);
    return { evidence: [{ type: 'metric', description: 'Supervisor review', data: review }] };
  }

  // ─── Full Cycle ──────────────────────────────────────────────────────────

  async fullReconstructionCycle(projectId, context) {
    this.log.info(`Starting full reconstruction cycle for project ${projectId}`);

    // 1. Analyze
    const analysis = (await this.analyzeTask(projectId, context)).evidence?.[0]?.data;

    // 2. Plan
    await this.createPlan(projectId, { ...context, analysis });

    // 3. Execute
    const executionResult = await this.executePlan(projectId, context);

    // 4. Review
    const review = await this.reviewResult(projectId, context);

    return {
      analysis,
      execution: executionResult,
      review,
      evidence: [
        { type: 'log', description: 'Full reconstruction cycle completed' },
        { type: 'metric', description: `Final score: ${executionResult.score?.overall || 0}%` },
      ],
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  getProject(projectId) {
    const dir = projectDir(projectId);
    return readJSON(`${dir}/project.json`);
  }

  saveProject(project) {
    const dir = projectDir(project.id);
    writeJSON(`${dir}/project.json`, project);
  }
}
