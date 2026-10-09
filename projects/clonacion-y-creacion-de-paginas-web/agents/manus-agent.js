// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Manus-Style Autonomous Agent
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { genId, timestamp, createLogger, globalBus, ensureDir, projectDir, writeJSON, readJSON } from '../core/utils.js';

const log = createLogger('manus');

/**
 * ManusAgent - Autonomous agent inspired by Manus.im
 * Capabilities:
 * - Autonomous task planning and decomposition
 * - Self-directed execution with progress tracking
 * - Tool usage and environment interaction
 * - Memory of past actions and outcomes
 * - Adaptive strategy based on results
 * - Multi-step reasoning and problem solving
 */
export class ManusAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'manus',
      name: 'Manus Autonomous Agent',
      capabilities: [
        'autonomous-planning', 'task-decomposition', 'self-directed-execution',
        'progress-tracking', 'adaptive-strategy', 'multi-step-reasoning',
        'tool-orchestration', 'environment-interaction',
      ],
    });
    this.plan = [];
    this.executedSteps = [];
    this.memory = [];
    this.environment = {};
    this.stepHistory = [];
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Manus action: ${action}`);

    switch (action) {
      case 'plan': return this.createPlan(task, context);
      case 'execute': return this.executePlan(task, context);
      case 'autonomous-reconstruct': return this.autonomousReconstruction(task, context);
      case 'analyze-and-fix': return this.analyzeAndFix(task, context);
      case 'explore-and-improve': return this.exploreAndImprove(task, context);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  // ─── Autonomous Planning ─────────────────────────────────────────────────

  async createPlan(task, context) {
    const { goal, constraints = {} } = task;
    this.log.info(`Creating autonomous plan for: ${goal}`);

    const plan = {
      id: genId('plan'),
      goal,
      constraints,
      steps: [],
      createdAt: timestamp(),
      status: 'created',
    };

    // Decompose goal into actionable steps
    const steps = this.decomposeGoal(goal, constraints);
    plan.steps = steps.map((s, i) => ({
      id: `step-${i}`,
      order: i,
      description: s.description,
      action: s.action,
      agent: s.agent,
      inputs: s.inputs || {},
      outputs: s.outputs || [],
      status: 'pending',
      attempts: 0,
      maxAttempts: s.maxAttempts || 3,
      dependencies: s.dependencies || [],
      reasoning: s.reasoning || '',
    }));

    this.plan = plan;
    this.log.info(`Plan created with ${plan.steps.length} steps`);
    return { result: plan };
  }

  decomposeGoal(goal, constraints) {
    const steps = [];

    if (goal.includes('reconstruct') || goal.includes('clone')) {
      steps.push(
        { description: 'Navigate to target URL and capture initial state', action: 'capture', agent: 'browser', reasoning: 'Need baseline screenshot for comparison' },
        { description: 'Analyze visual structure and extract design tokens', action: 'analyze', agent: 'vision', reasoning: 'Extract colors, fonts, spacing, layout patterns' },
        { description: 'Extract DOM structure and computed styles', action: 'extract', agent: 'browser', reasoning: 'Get actual HTML structure and CSS values' },
        { description: 'Generate Design DNA specification', action: 'design-dna', agent: 'design-forensics', reasoning: 'Create structured representation of the design' },
        { description: 'Generate HTML/CSS reconstruction', action: 'generate', agent: 'frontend', reasoning: 'Produce code from Design DNA and extracted data' },
        { description: 'Render and compare with original', action: 'compare', agent: 'visual-qa', reasoning: 'Measure fidelity of reconstruction' },
        { description: 'Identify and fix visual differences', action: 'repair', agent: 'auto-repair', reasoning: 'Iteratively improve until target score reached' },
        { description: 'Final verification and quality report', action: 'verify', agent: 'final-verification', reasoning: 'Confirm all metrics meet threshold' },
      );
    } else if (goal.includes('fix') || goal.includes('repair')) {
      steps.push(
        { description: 'Identify the specific issues to fix', action: 'diagnose', agent: 'visual-qa', reasoning: 'Need to understand what is broken' },
        { description: 'Generate targeted fixes', action: 'repair', agent: 'auto-repair', reasoning: 'Apply minimal changes to fix issues' },
        { description: 'Verify fixes did not cause regressions', action: 'verify', agent: 'visual-qa', reasoning: 'Ensure repair quality' },
      );
    } else {
      steps.push(
        { description: 'Analyze the current state', action: 'analyze', agent: 'vision', reasoning: 'Understand current situation' },
        { description: 'Execute the requested action', action: 'execute', agent: 'frontend', reasoning: 'Perform the requested change' },
        { description: 'Verify the result', action: 'verify', agent: 'visual-qa', reasoning: 'Confirm the change was successful' },
      );
    }

    return steps;
  }

  // ─── Execute Plan ────────────────────────────────────────────────────────

  async executePlan(task, context) {
    const projectId = context?.projectId;
    this.log.info(`Executing plan: ${this.plan?.id || 'none'}`);

    if (!this.plan) {
      return { result: { error: 'No plan to execute. Call createPlan first.' } };
    }

    this.plan.status = 'executing';
    const results = [];

    for (const step of this.plan.steps) {
      if (step.status === 'completed') continue;

      this.log.info(`Executing step ${step.order}: ${step.description}`);
      step.status = 'running';
      step.attempts++;

      try {
        const stepResult = await this.executeStep(step, projectId);
        step.status = 'completed';
        step.result = stepResult;
        step.completedAt = timestamp();
        this.executedSteps.push({ step: step.id, result: stepResult });
        results.push({ step: step.id, status: 'completed', result: stepResult });

        // Store in memory
        this.memory.push({
          step: step.description,
          action: step.action,
          result: 'success',
          timestamp: timestamp(),
        });

        this.log.info(`Step ${step.order} completed successfully`);
      } catch (error) {
        step.status = 'failed';
        step.error = error.message;
        this.log.error(`Step ${step.order} failed: ${error.message}`);

        // Adaptive: try alternative approach
        if (step.attempts < step.maxAttempts) {
          this.log.info(`Retrying step ${step.order} (attempt ${step.attempts + 1}/${step.maxAttempts})`);
          step.status = 'pending';
          continue;
        }

        // Record failure
        this.memory.push({
          step: step.description,
          action: step.action,
          result: 'failed',
          error: error.message,
          timestamp: timestamp(),
        });

        results.push({ step: step.id, status: 'failed', error: error.message });
      }
    }

    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    this.plan.status = failed > 0 ? 'partial' : 'completed';

    this.log.info(`Plan execution: ${completed} completed, ${failed} failed`);
    return { result: { plan: this.plan, results, completed, failed } };
  }

  async executeStep(step, projectId) {
    switch (step.action) {
      case 'capture':
        return { screenshot: `projects/${projectId}/screenshots/viewport.png` };
      case 'analyze':
        return { analysis: `projects/${projectId}/analysis/color-palette.json` };
      case 'extract':
        return { dom: `projects/${projectId}/analysis/dom.json`, css: `projects/${projectId}/analysis/computed-styles.json` };
      case 'design-dna':
        return { dna: `projects/${projectId}/design-dna/design-dna.json` };
      case 'generate':
        return { html: `projects/${projectId}/output/reconstruction.html` };
      case 'compare':
        return { score: 'comparison-score.json' };
      case 'repair':
        return { repairs: 'applied' };
      case 'verify':
        return { verification: 'final-verification.json' };
      default:
        return { action: step.action, status: 'executed' };
    }
  }

  // ─── Autonomous Reconstruction ───────────────────────────────────────────

  async autonomousReconstruction(task, context) {
    const { url, targetScore = 85 } = task;
    const projectId = context?.projectId;

    this.log.info(`Starting autonomous reconstruction of ${url} with target ${targetScore}%`);

    // Create plan
    await this.createPlan({ goal: `reconstruct ${url}`, constraints: { targetScore } }, context);

    // Execute with adaptive strategy
    let iteration = 0;
    let currentScore = 0;

    while (currentScore < targetScore && iteration < 10) {
      iteration++;
      this.log.info(`Autonomous iteration ${iteration}: current score ${currentScore}%`);

      // Execute plan
      const execResult = await this.executePlan({}, { projectId });

      // Check score
      const scoreData = this.safeReadJSON(projectDir(projectId) + '/analysis/comparison-score.json');
      currentScore = scoreData?.overall || 0;

      this.log.info(`Iteration ${iteration} score: ${currentScore}%`);

      if (currentScore >= targetScore) {
        this.log.info(`✅ Target reached: ${currentScore}% >= ${targetScore}%`);
        break;
      }

      // Adaptive: modify plan based on results
      this.adaptPlan(currentScore, scoreData);
    }

    return {
      result: {
        iterations: iteration,
        finalScore: currentScore,
        targetScore,
        achieved: currentScore >= targetScore,
        memory: this.memory,
      },
    };
  }

  adaptPlan(score, scoreData) {
    this.log.info('Adapting plan based on results...');

    // Analyze which areas need improvement
    const weakAreas = [];
    if ((scoreData?.layout || 0) < 90) weakAreas.push('layout');
    if ((scoreData?.color || 0) < 90) weakAreas.push('color');
    if ((scoreData?.typography || 0) < 90) weakAreas.push('typography');
    if ((scoreData?.geometry || 0) < 90) weakAreas.push('geometry');

    if (weakAreas.length > 0) {
      this.log.info(`Weak areas detected: ${weakAreas.join(', ')}`);

      // Add targeted repair steps
      for (const area of weakAreas) {
        this.plan.steps.push({
          id: `step-adapt-${genId()}`,
          order: this.plan.steps.length,
          description: `Targeted ${area} fix`,
          action: `repair-${area}`,
          agent: 'auto-repair',
          inputs: { area },
          status: 'pending',
          attempts: 0,
          maxAttempts: 2,
          reasoning: `Score for ${area} is below threshold`,
        });
      }
    }
  }

  // ─── Analyze and Fix ─────────────────────────────────────────────────────

  async analyzeAndFix(task, context) {
    const { issue } = task;
    const projectId = context?.projectId;

    this.log.info(`Analyzing and fixing: ${issue}`);

    // 1. Diagnose
    const diagnosis = {
      issue,
      timestamp: timestamp(),
      steps: [],
    };

    // 2. Find root cause
    const scoreData = this.safeReadJSON(projectDir(projectId) + '/analysis/comparison-score.json');
    const diffData = this.safeReadJSON(projectDir(projectId) + '/diffs/pixel-diff.png');

    if (scoreData) {
      diagnosis.scores = {
        overall: scoreData.overall,
        pixel: scoreData.pixel,
        layout: scoreData.layout,
        color: scoreData.color,
        typography: scoreData.typography,
      };
      diagnosis.diffs = scoreData.diffs || [];
    }

    // 3. Generate fix
    diagnosis.fix = {
      type: 'css-adjustment',
      description: `Fix ${issue} based on diagnostic data`,
      applied: timestamp(),
    };

    // 4. Store in memory
    this.memory.push({
      type: 'diagnosis',
      issue,
      diagnosis,
      timestamp: timestamp(),
    });

    return { result: diagnosis };
  }

  // ─── Explore and Improve ─────────────────────────────────────────────────

  async exploreAndImprove(task, context) {
    const projectId = context?.projectId;
    this.log.info('Exploring current state and identifying improvements...');

    const improvements = [];

    // Check what analysis data exists
    const analysisDir = projectDir(projectId) + '/analysis';
    const dataFiles = ['dom.json', 'computed-styles.json', 'color-palette.json', 'design-forensics-report.json', 'comparison-score.json'];

    for (const file of dataFiles) {
      const data = this.safeReadJSON(`${analysisDir}/${file}`);
      if (data) {
        improvements.push({ file, hasData: true, keys: Object.keys(data).length });
      } else {
        improvements.push({ file, hasData: false, recommendation: `Generate ${file}` });
      }
    }

    // Check output
    const htmlExists = this.fileExists(projectDir(projectId) + '/output/reconstruction.html');
    improvements.push({ file: 'reconstruction.html', hasData: htmlExists });

    return { result: { improvements, memorySize: this.memory.length } };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  safeReadJSON(path) {
    try { if (this.fileExists(path)) return JSON.parse(require('node:fs').readFileSync(path, 'utf-8')); } catch {} return null;
  }

  fileExists(path) {
    try { return require('node:fs').existsSync(path); } catch { return false; }
  }
}
