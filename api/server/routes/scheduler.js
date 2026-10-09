/**
 * Scheduler API Routes
 * ====================
 * Rutas para gestionar tareas programadas
 *
 * Endpoints:
 * - GET /api/scheduler/tasks - Lista todas las tareas
 * - GET /api/scheduler/tasks/:id - Estado de una tarea
 * - DELETE /api/scheduler/tasks/:id - Elimina una tarea
 * - POST /api/scheduler/tasks/recurring - Crea tarea recurrente
 * - POST /api/scheduler/tasks/delayed - Crea tarea delayed
 * - GET /api/scheduler/history/:id - Historial de ejecuciones
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const { logger } = require('@librechat/data-schemas');
const { getSchedulerService } = require('../services/Scheduler');

/**
 * GET /api/scheduler/health
 * Estado del scheduler
 */
router.get('/health', requireJwtAuth, async (req, res) => {
  try {
    const scheduler = getSchedulerService();
    const tasks = scheduler.listTasks();
    res.json({ status: 'ok', isRunning: scheduler.isRunning, taskCount: tasks.length });
  } catch (error) {
    logger.error('[Scheduler] Health check failed', error);
    res.status(503).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/scheduler/tasks
 * Lista todas las tareas
 */
router.get('/tasks', requireJwtAuth, async (req, res) => {
  try {
    const scheduler = getSchedulerService();
    const tasks = scheduler.listTasks();
    res.json({ tasks });
  } catch (error) {
    logger.error('[Scheduler] List tasks failed', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * GET /api/scheduler/tasks/:id
 * Estado de una tarea específica
 */
router.get('/tasks/:id', requireJwtAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const scheduler = getSchedulerService();
    const status = scheduler.getTaskStatus(id);
    if (!status) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(status);
  } catch (error) {
    logger.error('[Scheduler] Get task status failed', error);
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

/**
 * DELETE /api/scheduler/tasks/:id
 * Elimina una tarea
 */
router.delete('/tasks/:id', requireJwtAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const scheduler = getSchedulerService();
    const removed = scheduler.removeTask(id);
    res.json({ success: removed });
  } catch (error) {
    logger.error('[Scheduler] Delete task failed', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * POST /api/scheduler/tasks/recurring
 * Crea una tarea recurrente
 */
router.post('/tasks/recurring', requireJwtAuth, async (req, res) => {
  const { id, cronExpression, handler, options } = req.body;

  if (!id || !cronExpression) {
    return res.status(400).json({ error: 'id and cronExpression are required' });
  }

  // Validate CRON expression format
  const cronParts = cronExpression.split(' ');
  if (cronParts.length !== 5) {
    return res.status(400).json({ error: 'Invalid CRON expression format' });
  }

  try {
    const scheduler = getSchedulerService();

    // Register handler (in real implementation, this would be a function reference)
    // For now, we just validate the expression
    scheduler.addRecurringTask(id, cronExpression, handler || (() => {}), options || {});

    res.json({ success: true, id, nextRun: scheduler.getTaskStatus(id)?.nextRun });
  } catch (error) {
    logger.error('[Scheduler] Create recurring task failed', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * POST /api/scheduler/tasks/delayed
 * Crea una tarea delayed
 */
router.post('/tasks/delayed', requireJwtAuth, async (req, res) => {
  const { id, delayMs, handler } = req.body;

  if (!id || !delayMs) {
    return res.status(400).json({ error: 'id and delayMs are required' });
  }

  try {
    const scheduler = getSchedulerService();
    scheduler.addDelayedTask(id, parseInt(delayMs), handler || (() => {}));

    res.json({ success: true, id, scheduledAt: scheduler.getTaskStatus(id)?.scheduledAt });
  } catch (error) {
    logger.error('[Scheduler] Create delayed task failed', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * POST /api/scheduler/tasks/:id/cancel
 * Cancela una tarea delayed
 */
router.post('/tasks/:id/cancel', requireJwtAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const scheduler = getSchedulerService();
    const cancelled = scheduler.cancelDelayedTask(id);
    res.json({ success: cancelled });
  } catch (error) {
    logger.error('[Scheduler] Cancel task failed', error);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

/**
 * GET /api/scheduler/history/:id
 * Historial de ejecuciones de una tarea
 */
router.get('/history/:id', requireJwtAuth, async (req, res) => {
  const { id } = req.params;
  const { limit = 100 } = req.query;

  try {
    const scheduler = getSchedulerService();
    const history = await scheduler.getExecutionHistory(id, parseInt(limit));
    res.json({ taskId: id, history });
  } catch (error) {
    logger.error('[Scheduler] Get history failed', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

module.exports = router;
