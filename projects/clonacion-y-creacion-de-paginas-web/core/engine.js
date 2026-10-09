// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Core Engine (FIXED v2)
// ═══════════════════════════════════════════════════════════════════════════════

import { genId, timestamp, createLogger, globalBus, ensureDir, projectDir, writeJSON, readJSON, defaultProjectConfig, computeOverallScore, createEmptyScore } from './utils.js';
import { SkillRegistry, AgentRegistry, ToolRegistry, ModelRouter } from './registries.js';
import { SupervisorAgent } from '../agents/supervisor.js';
import { BrowserAgent } from '../agents/browser-agent.js';
import { VisionAgent } from '../agents/vision-agent.js';
import { DesignForensicsAgent } from '../agents/design-forensics-agent.js';
import { FrontendAgent } from '../agents/frontend-agent.js';
import { VisualQAAgent } from '../agents/visual-qa-agent.js';
import { AutoRepairAgent } from '../agents/auto-repair-agent.js';
import { FinalVerificationAgent } from '../agents/specialized-agents.js';
import { getMemoryStore, getMemoryStoreSync } from './memory.js';
import { existsSync } from 'node:fs';

const log = createLogger('engine');

export class ReconstructionEngine {
  constructor(config = {}) {
    // Registries
    this.skillRegistry = new SkillRegistry();
    this.agentRegistry = new AgentRegistry();
    this.toolRegistry = new ToolRegistry();
    this.modelRouter = new ModelRouter();

    // Core agents
    this.browserAgent = new BrowserAgent();
    this.visionAgent = new VisionAgent();
    this.designForensicsAgent = new DesignForensicsAgent();
    this.frontendAgent = new FrontendAgent();
    this.visualQAAgent = new VisualQAAgent();
    this.autoRepairAgent = new AutoRepairAgent();
    this.finalVerificationAgent = new FinalVerificationAgent();

    // Supervisor
    this.supervisor = new SupervisorAgent({
      workerRegistry: this.agentRegistry,
      skillRegistry: this.skillRegistry,
      toolRegistry: this.toolRegistry,
      modelRouter: this.modelRouter,
    });

    // State
    this.projects = new Map();
    this.activeReconstructions = new Map();

    // Persistent memory (async init, accessible via getMemoryStoreSync after ready)
    this.memory = null;
    this._memoryReady = getMemoryStore().then(m => { this.memory = m; return m; });

    this.setupEvents();
    log.info('Reconstruction Engine initialized');
  }

  // ─── Event System ────────────────────────────────────────────────────────

  setupEvents() {
    globalBus.on('agent:started', (data) => {
      log.info(`Agent started: ${data.type} (${data.agentId})`);
    });
    globalBus.on('agent:completed', (data) => {
      log.info(`Agent completed: ${data.type} in ${data.duration}ms`);
    });
    globalBus.on('agent:error', (data) => {
      log.error(`Agent error: ${data.type} - ${data.error}`);
    });
  }

  // ─── Project Management ──────────────────────────────────────────────────

  async createProject(input) {
    const projectId = genId('project');
    const projectPath = projectDir(projectId);
    ensureDir(projectPath);
    ensureDir(`${projectPath}/original`);
    ensureDir(`${projectPath}/screenshots`);
    ensureDir(`${projectPath}/analysis`);
    ensureDir(`${projectPath}/design-dna`);
    ensureDir(`${projectPath}/output`);
    ensureDir(`${projectPath}/diffs`);
    ensureDir(`${projectPath}/iterations`);
    ensureDir(`${projectPath}/reports`);

    const project = {
      id: projectId,
      name: input.name || `Project ${projectId}`,
      status: 'created',
      input: {
        type: input.type || 'url',
        sources: input.sources || [],
        viewport: input.viewport || { width: 1440, height: 900 },
      },
      config: { ...defaultProjectConfig(), ...input.config },
      designDNA: null,
      pageKnowledgeGraph: null,
      iterations: [],
      currentIteration: 0,
      maxIterations: input.config?.maxIterations || 10,
      scores: [],
      agents: [],
      memory: {
        projectId,
        lessons: [],
        decisions: [],
        errors: [],
        solutions: [],
        benchmarks: [],
      },
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };

    writeJSON(`${projectPath}/project.json`, project);
    this.projects.set(projectId, project);

    log.info(`Project created: ${projectId}`);
    return project;
  }

  getProject(projectId) {
    const project = this.projects.get(projectId);
    if (project) return project;
    const loaded = readJSON(projectDir(projectId) + '/project.json');
    if (loaded) this.projects.set(projectId, loaded);
    return loaded;
  }

  // ─── Reconstruction Pipeline (FIXED) ─────────────────────────────────────

  async startReconstruction(projectId) {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    project.status = 'analyzing';
    this.projects.set(projectId, project);
    writeJSON(projectDir(projectId) + '/project.json', project);

    this.activeReconstructions.set(projectId, { startedAt: timestamp(), phase: 'initializing' });
    globalBus.emit('reconstruction:started', { projectId });

    try {
      const result = await this.runFullPipeline(project);
      return result;
    } catch (error) {
      project.status = 'failed';
      writeJSON(projectDir(projectId) + '/project.json', project);
      this.memory.saveProject(project);
      globalBus.emit('reconstruction:error', { projectId, error: error.message });
      throw error;
    }
  }

  async runFullPipeline(project) {
    const projectId = project.id;
    const reconState = this.activeReconstructions.get(projectId);

    // ═══ PHASE 1: DISCOVERY & CAPTURE ═════════════════════════════════════
    reconState.phase = 'discovery';
    log.info('\n╔══ PHASE 1: DISCOVERY & CAPTURE ══╗');
    project.status = 'analyzing';

    let captureResult = null;
    if (project.input.type === 'url' && project.input.sources[0]?.url) {
      captureResult = await this.browserAgent.execute({
        action: 'capture',
        url: project.input.sources[0].url,
        projectId,
        viewport: project.config.browserConfig.viewport,
      });
      log.info(`URL captured: ${project.input.sources[0].url}`);
    }

    // ═══ PHASE 2: VISION ANALYSIS ═════════════════════════════════════════
    reconState.phase = 'vision';
    log.info('\n╔══ PHASE 2: VISION ANALYSIS ══╗');

    const screenshots = project.input.sources
      .filter(s => s.path)
      .map(s => s.path);

    if (captureResult?.result) {
      screenshots.push(projectDir(projectId) + '/screenshots/viewport.png');
    }

    if (screenshots.length > 0) {
      for (const ss of screenshots) {
        if (ss && existsSync(ss)) {
          await this.visionAgent.execute({ action: 'analyze-screenshot', imagePath: ss }, { projectId });
          await this.visionAgent.execute({ action: 'extract-colors', imagePath: ss }, { projectId });
          await this.visionAgent.execute({ action: 'analyze-layout', imagePath: ss }, { projectId });
        }
      }
    }

    // ═══ PHASE 3: DESIGN FORENSICS ════════════════════════════════════════
    reconState.phase = 'forensics';
    log.info('\n╔══ PHASE 3: DESIGN FORENSICS ══╗');

    await this.designForensicsAgent.execute({
      action: 'generate-report',
      screenshots,
      projectId,
    }, { projectId });

    project.designDNA = readJSON(projectDir(projectId) + '/design-dna/design-dna.json');

    // ═══ PHASE 4: DOM & CSS EXTRACTION ════════════════════════════════════
    reconState.phase = 'extraction';
    log.info('\n╔══ PHASE 4: DOM & CSS EXTRACTION ══╗');

    if (project.input.type === 'url' && this.browserAgent.page) {
      await this.browserAgent.execute({ action: 'extract-dom' }, { projectId });
      await this.browserAgent.execute({ action: 'extract-css' }, { projectId });
      await this.browserAgent.execute({ action: 'extract-assets' }, { projectId });
      await this.browserAgent.execute({ action: 'explore' }, { projectId });
    }

    // ═══ PHASE 5: CODE GENERATION ═════════════════════════════════════════
    reconState.phase = 'generation';
    log.info('\n╔══ PHASE 5: CODE GENERATION ══╗');
    project.status = 'building';

    // Pass DOM/CSS data to frontend agent for better code generation
    const domData = readJSON(projectDir(projectId) + '/analysis/dom.json');
    const cssData = readJSON(projectDir(projectId) + '/analysis/computed-styles.json');

    await this.frontendAgent.execute({
      action: 'generate',
      framework: project.config.targetFramework,
      designDNA: project.designDNA,
      domData,
      cssData,
    }, { projectId });

    // Close browser after extraction
    if (this.browserAgent.browser) {
      await this.browserAgent.execute({ action: 'close' });
    }

    // ═══ PHASE 6: RENDER & SCREENSHOT ═════════════════════════════════════
    reconState.phase = 'rendering';
    log.info('\n╔══ PHASE 6: RENDER & SCREENSHOT ══╗');

    const reconScreenshot = await this.renderAndCapture(projectId);

    // ═══ PHASE 7: VISUAL COMPARISON ═══════════════════════════════════════
    reconState.phase = 'comparison';
    log.info('\n╔══ PHASE 7: VISUAL COMPARISON ══╗');
    project.status = 'testing';

    const originalScreenshot = screenshots[0] || projectDir(projectId) + '/screenshots/viewport.png';

    let currentScore = null;
    if (existsSync(originalScreenshot) && reconScreenshot) {
      const comparisonResult = await this.visualQAAgent.execute({
        action: 'compare',
        original: originalScreenshot,
        reconstruction: reconScreenshot,
      }, { projectId });

      // FIXED: Properly extract score from agent result
      // Agent returns { success, result: { score, diffPath, ... }, evidence }
      currentScore = comparisonResult?.result?.score;
      log.info(`Phase 7 score extracted: overall=${currentScore?.overall}%, pixel=${currentScore?.pixel}%`);
    }

    if (!currentScore) {
      currentScore = createEmptyScore(1);
      currentScore.overall = 0;
      log.warn('No comparison result, using empty score');
    }

    currentScore.iteration = 1;
    project.scores.push(currentScore);
    project.currentIteration = 1;

    log.info(`Iteration 1 complete: overall=${currentScore.overall}%`);

    // ═══ PHASE 8: AUTO REPAIR LOOP ════════════════════════════════════════
    const threshold = project.config.qualityThreshold || 95;

    if (currentScore.overall < threshold && project.config.enableAutoRepair) {
      for (let iter = 2; iter <= project.maxIterations; iter++) {
        reconState.phase = `repair-iteration-${iter}`;
        log.info(`\n╔══ REPAIR ITERATION ${iter}/${project.maxIterations} (Current Score: ${currentScore.overall}%) ══╗`);
        project.status = 'repairing';

        // Repair using actual diff data from the comparison
        await this.autoRepairAgent.execute({
          action: 'repair',
          score: currentScore,
          diffs: currentScore.diffs || [],
        }, { projectId });

        // Re-render
        const newReconScreenshot = await this.renderAndCapture(projectId, `iter-${iter}`);

        // Re-compare
        if (existsSync(originalScreenshot) && newReconScreenshot) {
          const newComparison = await this.visualQAAgent.execute({
            action: 'compare',
            original: originalScreenshot,
            reconstruction: newReconScreenshot,
          }, { projectId });

          const newScore = newComparison?.result?.score;
          if (newScore) {
            newScore.iteration = iter;
            project.scores.push(newScore);
            project.currentIteration = iter;
            currentScore = newScore;

            log.info(`Iteration ${iter} score: overall=${newScore.overall}%, pixel=${newScore.pixel}%`);

            if (newScore.overall >= threshold) {
              log.info(`✅ Threshold reached at iteration ${iter}: ${newScore.overall}%`);
              break;
            }
          }
        }
      }
    }

    // ═══ PHASE 9: FINAL VERIFICATION ══════════════════════════════════════
    reconState.phase = 'verification';
    log.info('\n╔══ PHASE 9: FINAL VERIFICATION ══╗');

    await this.finalVerificationAgent.execute(
      { action: 'verify' },
      { projectId }
    );

    // ═══ PHASE 10: SAVE & REPORT ══════════════════════════════════════════
    reconState.phase = 'complete';
    const lastScore = project.scores[project.scores.length - 1];
    project.status = lastScore?.overall >= threshold ? 'completed' : 'failed';
    project.updatedAt = timestamp();

    // Close browser
    if (this.browserAgent.browser) {
      await this.browserAgent.execute({ action: 'close' });
    }

    // Save final project state
    writeJSON(projectDir(projectId) + '/project.json', project);

    // Save to persistent memory
    this.memory.saveProject(project);
    if (lastScore) {
      this.memory.addBenchmark({
        target: project.input.sources?.[0]?.url || project.name,
        score: lastScore.overall,
        pixelScore: lastScore.pixel,
        iteration: project.currentIteration,
        inputType: project.input.type,
      });
    }
    if (project.designDNA) {
      this.memory.saveDesignDNA(projectId, project.designDNA);
    }

    // Generate final report
    const report = this.generateReport(project, lastScore);
    writeJSON(projectDir(projectId) + '/reports/final-report.json', report);

    this.activeReconstructions.delete(projectId);
    globalBus.emit('reconstruction:completed', { projectId, score: lastScore?.overall });

    log.info(`\n═══════════════════════════════════════════════════════════`);
    log.info(`RECONSTRUCTION COMPLETE`);
    log.info(`Project: ${projectId}`);
    log.info(`Iterations: ${project.currentIteration}`);
    log.info(`Final Score: ${lastScore?.overall || 0}%`);
    log.info(`Status: ${project.status}`);
    log.info(`═══════════════════════════════════════════════════════════`);

    return {
      projectId,
      status: project.status,
      score: lastScore,
      iterations: project.currentIteration,
      outputDir: projectDir(projectId) + '/output',
      report,
    };
  }

  // ─── Render & Capture ────────────────────────────────────────────────────

  async renderAndCapture(projectId, suffix = '') {
    const htmlPath = projectDir(projectId) + '/output/reconstruction.html';
    const outDir = projectDir(projectId) + '/screenshots';
    const screenshotName = suffix ? `reconstruction-${suffix}.png` : 'reconstruction.png';
    const screenshotPath = outDir + '/' + screenshotName;

    if (!existsSync(htmlPath)) {
      log.warn('No reconstruction HTML to render');
      return null;
    }

    ensureDir(outDir);

    const renderAgent = new BrowserAgent();
    try {
      const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
      await renderAgent.execute({
        action: 'launch',
        viewport: { width: 1440, height: 900 },
      });

      await renderAgent.page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 10000 });
      await renderAgent.page.waitForTimeout(1000);

      await renderAgent.page.screenshot({ path: screenshotPath, fullPage: true });
      log.info(`Reconstruction rendered: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      log.error(`Render failed: ${error.message}`);
      return null;
    } finally {
      await renderAgent.close();
    }
  }

  // ─── Report Generation ──────────────────────────────────────────────────

  generateReport(project, score) {
    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      input: project.input,
      iterations: project.currentIteration,
      finalScore: score,
      scores: project.scores.map(s => ({
        iteration: s.iteration,
        overall: s.overall,
        pixel: s.pixel,
        visual: s.visual,
        layout: s.layout,
        color: s.color,
        typography: s.typography,
      })),
      timestamp: timestamp(),
    };
  }

  // ─── Status ─────────────────────────────────────────────────────────────

  getStatus(projectId) {
    if (projectId) {
      const recon = this.activeReconstructions.get(projectId);
      const project = this.getProject(projectId);
      return { project: project?.status, phase: recon?.phase };
    }

    return {
      activeReconstructions: [...this.activeReconstructions.entries()].map(([id, state]) => ({
        projectId: id,
        ...state,
      })),
      totalProjects: this.projects.size,
    };
  }
}
