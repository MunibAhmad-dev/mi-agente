// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — API Server v2
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { ReconstructionEngine } from '../../core/engine.js';
import { registerAllSkills } from '../../skills/initial-skills.js';
import { globalBus, projectDir } from '../../core/utils.js';
import { DrawingAgent } from '../../agents/drawing-agent.js';
import { AnimationAgent } from '../../agents/animation-agent.js';
import { ManusAgent } from '../../agents/manus-agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// ─── Initialize Engine ────────────────────────────────────────────────────────

const engine = new ReconstructionEngine();
const drawingAgent = new DrawingAgent();
const animationAgent = new AnimationAgent();
const manusAgent = new ManusAgent();

// Wait for memory to be ready
await engine._memoryReady;

// Register skills
const skillStats = registerAllSkills(engine.skillRegistry);
console.log('Skills registered:', skillStats.total);

// Register tools
engine.toolRegistry.register({ id: 'playwright', name: 'Playwright', category: 'browser', capabilities: ['browser-automation', 'screenshot', 'dom-extraction'] });
engine.toolRegistry.register({ id: 'sharp', name: 'Sharp', category: 'image', capabilities: ['image-processing', 'resize', 'crop'] });
engine.toolRegistry.register({ id: 'pixelmatch', name: 'Pixelmatch', category: 'image', capabilities: ['pixel-comparison', 'diff'] });
engine.toolRegistry.register({ id: 'filesystem', name: 'Filesystem', category: 'filesystem', capabilities: ['read', 'write', 'delete'] });
engine.toolRegistry.register({ id: 'animejs', name: 'anime.js', category: 'animation', capabilities: ['animation', 'transitions', 'micro-interactions'] });
engine.toolRegistry.register({ id: 'pencil', name: 'Pencil Tool', category: 'drawing', capabilities: ['annotation', 'highlighting', 'visual-editing'] });

// Register models
engine.modelRouter.register({ id: 'local-vision', name: 'Local Vision', provider: 'local', capabilities: ['VISION', 'OCR', 'CLASSIFICATION'], contextWindow: 4096, costPerToken: 0, latency: 500, quality: 0.6, status: 'available' });
engine.modelRouter.register({ id: 'local-coding', name: 'Local Coding', provider: 'local', capabilities: ['CODING', 'REASONING', 'PLANNING'], contextWindow: 8192, costPerToken: 0, latency: 1000, quality: 0.5, status: 'available' });

// ─── Express Server ───────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve dashboard
app.use(express.static(join(__dirname, '..', 'dashboard', 'public')));
// Serve project outputs
app.use('/projects', express.static(join(ROOT, 'projects')));

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '0.2.0' });
});

// ─── Projects ─────────────────────────────────────────────────────────────────

app.post('/api/projects', async (req, res) => {
  try {
    const project = await engine.createProject(req.body);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    const projectsDir = join(ROOT, 'projects');
    const projects = [];
    if (existsSync(projectsDir)) {
      for (const dir of readdirSync(projectsDir)) {
        if (dir.startsWith('project-')) {
          const projectFile = join(projectsDir, dir, 'project.json');
          if (existsSync(projectFile)) {
            projects.push(JSON.parse(readFileSync(projectFile, 'utf-8')));
          }
        }
      }
    }
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const project = engine.getProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/projects/:id/reconstruct', async (req, res) => {
  try {
    engine.startReconstruction(req.params.id).catch(err => console.error('Reconstruction error:', err));
    res.json({ success: true, message: 'Reconstruction started', projectId: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/status', (req, res) => {
  try {
    res.json({ success: true, data: engine.getStatus(req.params.id) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Quick Clone ──────────────────────────────────────────────────────────────

app.post('/api/clone', async (req, res) => {
  try {
    const { url, framework = 'auto', maxIterations = 5, qualityThreshold = 85 } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    const project = await engine.createProject({
      name: `Clone: ${url}`,
      type: 'url',
      sources: [{ type: 'url', url }],
      config: { targetFramework: framework, maxIterations, qualityThreshold, enableAutoRepair: true },
    });

    engine.startReconstruction(project.id).catch(err => console.error('Clone error:', err));
    res.json({ success: true, data: { projectId: project.id, status: 'started' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Drawing/Annotation ──────────────────────────────────────────────────────

app.post('/api/annotate', async (req, res) => {
  try {
    const { projectId, annotations } = req.body;
    const result = await drawingAgent.execute({ action: 'process-annotations', annotations }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/annotate/highlight', async (req, res) => {
  try {
    const { projectId, x, y, width, height, color, label } = req.body;
    const result = await drawingAgent.execute({ action: 'highlight-region', x, y, width, height, color, label }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/annotate/pencil', async (req, res) => {
  try {
    let projectId = req.body.projectId;
    if (!projectId) {
      const projects = engine.memory.listProjects(1);
      projectId = projects[0]?.id;
    }
    if (!projectId) return res.status(400).json({ success: false, error: 'No project available.' });
    const result = await drawingAgent.execute({ action: 'add-pencil-overlay' }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/annotate/tool', async (req, res) => {
  try {
    let projectId = req.body.projectId;
    if (!projectId) {
      const projects = engine.memory.listProjects(1);
      projectId = projects[0]?.id;
    }
    if (!projectId) return res.status(400).json({ success: false, error: 'No project available.' });
    const result = await drawingAgent.execute({ action: 'generate-annotation-ui' }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Animations ──────────────────────────────────────────────────────────────

app.post('/api/animations/generate', async (req, res) => {
  try {
    const { style = 'modern' } = req.body;
    let projectId = req.body.projectId;
    if (!projectId) {
      // Use most recent project
      const projects = engine.memory.listProjects(1);
      projectId = projects[0]?.id;
    }
    if (!projectId) return res.status(400).json({ success: false, error: 'No project available. Create a project first.' });
    const result = await animationAgent.execute({ action: 'generate', style }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/animations/transitions', async (req, res) => {
  try {
    const { projectId } = req.body;
    const result = await animationAgent.execute({ action: 'add-transitions' }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/animations/entrance', async (req, res) => {
  try {
    const { projectId, type = 'fade-up' } = req.body;
    const result = await animationAgent.execute({ action: 'add-entrance', type }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Manus Agent ─────────────────────────────────────────────────────────────

app.post('/api/manus/plan', async (req, res) => {
  try {
    const { goal, constraints } = req.body;
    const result = await manusAgent.execute({ action: 'plan', goal, constraints }, { projectId: req.body.projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/manus/execute', async (req, res) => {
  try {
    const { projectId } = req.body;
    const result = await manusAgent.execute({ action: 'execute' }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/manus/autonomous', async (req, res) => {
  try {
    const { url, targetScore = 85, projectId } = req.body;
    const result = await manusAgent.execute({ action: 'autonomous-reconstruct', url, targetScore }, { projectId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── System Status ───────────────────────────────────────────────────────────

app.get('/api/engine/status', (req, res) => {
  try {
    const status = engine.getStatus();
    res.json({
      success: true,
      data: {
        ...status,
        skills: engine.skillRegistry.stats(),
        tools: engine.toolRegistry.stats(),
        models: engine.modelRouter.stats(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills', (req, res) => {
  res.json({ success: true, data: engine.skillRegistry.list(req.query), stats: engine.skillRegistry.stats() });
});

app.get('/api/tools', (req, res) => {
  res.json({ success: true, data: engine.toolRegistry.list(req.query), stats: engine.toolRegistry.stats() });
});

app.get('/api/models', (req, res) => {
  res.json({ success: true, data: engine.modelRouter.list(req.query), stats: engine.modelRouter.stats() });
});

// ─── Memory ──────────────────────────────────────────────────────────────────

app.get('/api/memory', (req, res) => {
  try {
    res.json({ success: true, data: engine.memory.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/memory/projects', (req, res) => {
  try {
    res.json({ success: true, data: engine.memory.listProjects(parseInt(req.query.limit) || 50) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/memory/lessons', (req, res) => {
  try {
    res.json({ success: true, data: engine.memory.getLessons(req.query.category) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/memory/benchmarks', (req, res) => {
  try {
    res.json({ success: true, data: engine.memory.getBenchmarks(parseInt(req.query.limit) || 100) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/memory/repairs', (req, res) => {
  try {
    res.json({ success: true, data: engine.memory.getRepairHistory(parseInt(req.query.limit) || 50) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/memory/export', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=memory-export.json');
    res.send(engine.memory.exportMemory());
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/memory/lesson', (req, res) => {
  try {
    const lesson = engine.memory.addLesson(req.body);
    res.json({ success: true, data: lesson });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Event Log ────────────────────────────────────────────────────────────────

const eventLog = [];
globalBus.on('reconstruction:started', (data) => eventLog.push({ type: 'started', ...data, timestamp: Date.now() }));
globalBus.on('reconstruction:completed', (data) => eventLog.push({ type: 'completed', ...data, timestamp: Date.now() }));
globalBus.on('reconstruction:error', (data) => eventLog.push({ type: 'error', ...data, timestamp: Date.now() }));
globalBus.on('agent:started', (data) => eventLog.push({ type: 'agent:started', ...data, timestamp: Date.now() }));
globalBus.on('agent:completed', (data) => eventLog.push({ type: 'agent:completed', ...data, timestamp: Date.now() }));

app.get('/api/events', (req, res) => {
  res.json({ success: true, data: eventLog.slice(-(parseInt(req.query.limit) || 50)) });
});

// ─── Capability Router ─────────────────────────────────────────────────────

import { getCapabilityRouter } from '../../registry/capability-router.js';
import { getRepoStatus, getAllLicenses, searchCapabilities } from '../../registry/ui-capabilities.js';

const capRouter = getCapabilityRouter();

app.get('/api/capabilities', (req, res) => {
  res.json({ success: true, data: capRouter.getStats() });
});

app.post('/api/capabilities/route', (req, res) => {
  const { elementType, context } = req.body;
  if (!elementType) return res.status(400).json({ success: false, error: 'elementType required' });
  res.json({ success: true, data: capRouter.route(elementType, context) });
});

app.post('/api/capabilities/analyze', (req, res) => {
  const { elements } = req.body;
  if (!elements) return res.status(400).json({ success: false, error: 'elements array required' });
  res.json({ success: true, data: capRouter.analyzeElements(elements) });
});

app.get('/api/capabilities/search', (req, res) => {
  res.json({ success: true, data: searchCapabilities(req.query.q || '') });
});

app.get('/api/capabilities/template', (req, res) => {
  const { path, framework } = req.query;
  if (!path) return res.status(400).json({ success: false, error: 'path required' });
  const template = capRouter.getCodeTemplate(path, framework || 'html');
  if (!template) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: { template, path, framework } });
});

app.get('/api/capabilities/dashboards', (req, res) => {
  res.json({ success: true, data: capRouter.getDashboardTemplates() });
});

app.get('/api/capabilities/licenses', (req, res) => {
  res.json({ success: true, data: getAllLicenses() });
});

app.get('/api/capabilities/repos', (req, res) => {
  res.json({ success: true, data: getRepoStatus() });
});

app.post('/api/capabilities/animation', (req, res) => {
  const anims = capRouter.getAnimationForInteraction(req.body.interactionType || 'page-load');
  res.json({ success: true, data: anims });
});

// ─── SSE Stream (real-time updates) ────────────────────────────────────────

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data, timestamp: Date.now() })}\n\n`);
  send('connected', { message: 'Universal Engine stream active' });

  const off = [
    globalBus.on('reconstruction:started', (d) => send('reconstruction:started', d)),
    globalBus.on('reconstruction:completed', (d) => send('reconstruction:completed', d)),
    globalBus.on('reconstruction:error', (d) => send('reconstruction:error', d)),
    globalBus.on('agent:started', (d) => send('agent:started', d)),
    globalBus.on('agent:completed', (d) => send('agent:completed', d)),
  ];
  req.on('close', () => off.forEach(h => typeof h === 'function' && h()));
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3099;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   UNIVERSAL WEB RECONSTRUCTION ENGINE v2.0                   ║
║   API Server: http://localhost:${PORT}                         ║
║                                                              ║
║   Skills:   ${String(engine.skillRegistry.stats().total).padStart(3)} | Tools:  ${String(engine.toolRegistry.stats().total).padStart(3)} | Models: ${String(engine.modelRouter.stats().total).padStart(3)}         ║
║   Agents:   Browser, Vision, Forensics, Frontend, QA,       ║
║             Repair, Animation, Drawing, Manus                ║
╚═══════════════════════════════════════════════════════════════╝
`);
});
