/**
 * Workflow REST API
 * Mounted at /api/workflows (see api/server/index.js)
 * All routes require JWT auth.
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const { getWorkflowEngine } = require('~/server/services/WorkflowEngine/WorkflowEngine');
const { listWorkflows, getWorkflow } = require('~/server/services/WorkflowEngine/workflowPersistence');

router.use(requireJwtAuth);

/** GET /api/workflows — list active + recent completed for this user */
router.get('/', async (req, res) => {
  try {
    const engine = getWorkflowEngine();
    const inMemory = engine.listWorkflows();
    const persisted = await listWorkflows({ userId: req.user.id, limit: 50 });

    // Merge: prefer in-memory for active workflows (most up-to-date status)
    const activeIds = new Set(inMemory.active.map((w) => w.id));
    const dbFiltered = persisted.filter((w) => !activeIds.has(w.workflowId));

    res.json({
      active: inMemory.active,
      completed: [
        ...inMemory.completed,
        ...dbFiltered.map((w) => ({
          id: w.workflowId,
          name: w.name,
          description: w.description,
          status: w.status,
          steps: w.steps,
          result: w.result,
          error: w.error,
          createdAt: w.createdAt,
          startedAt: w.startedAt,
          completedAt: w.completedAt,
          duration: w.duration,
        })),
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/workflows/:id — single workflow */
router.get('/:id', async (req, res) => {
  try {
    const engine = getWorkflowEngine();
    const inMemory = engine.getWorkflow(req.params.id);
    if (inMemory) {
      return res.json(inMemory.toJSON ? inMemory.toJSON() : inMemory);
    }
    const persisted = await getWorkflow(req.params.id);
    if (!persisted) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json(persisted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/workflows — create and start a workflow */
router.post('/', async (req, res) => {
  try {
    const { name, description, steps } = req.body;
    if (!name || !steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: 'name and steps[] are required' });
    }
    const engine = getWorkflowEngine();
    const workflow = engine.createWorkflow({ name, description, steps });
    workflow._createdBy = req.user.id;

    // Start async — respond immediately with the workflow id
    engine.execute(workflow, new Map()).catch((err) => {
      console.error('[workflows] execute error:', err.message);
    });

    res.status(202).json({ id: workflow.id, name: workflow.name, status: workflow.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/workflows/:id — cancel a running workflow */
router.delete('/:id', async (req, res) => {
  try {
    const engine = getWorkflowEngine();
    const cancelled = engine.cancelWorkflow(req.params.id);
    if (!cancelled) {
      return res.status(404).json({ error: 'Active workflow not found' });
    }
    res.json({ id: req.params.id, status: 'cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
