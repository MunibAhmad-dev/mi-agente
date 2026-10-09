/**
 * Sandbox API Routes
 *
 * Endpoints para gestión de sandboxes de aislamiento
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { sandboxManager, SandboxStatus } = require('../services/SandboxManager');
const { requireJwtAuth } = require('../middleware');
const crypto = require('crypto');

// EventBus integration
let eventBus = null;
try {
  const eventBusModule = require('../services/EventBus');
  eventBus = eventBusModule.getEventBus();
} catch (err) {
  console.warn('[Sandbox Routes] EventBus not available:', err.message);
}

// ============ Funciones auxiliares ============

/**
 * Obtener userId del request
 */
function getUserId(req) {
  return req.user?.id || req.user?._id?.toString() || 'anonymous';
}

/**
 * Verificar que el sandbox pertenece al usuario
 */
function checkSandboxAccess(sandbox, userId) {
  return sandbox.userId === userId;
}

/**
 * Helper para publicar eventos de API al EventBus
 */
function publishApiEvent(eventType, payload, req) {
  if (!eventBus) return;

  try {
    eventBus.publish(
      eventType,
      {
        ...payload,
        userId: getUserId(req),
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
      'SandboxAPI',
      {
        metadata: {
          endpoint: req.path,
          method: req.method,
        },
      },
    );
  } catch (err) {
    console.error('[Sandbox Routes] Failed to publish event:', err.message);
  }
}

// ============ Rutas ============

/**
 * @route GET /api/sandbox/health
 * @desc Verificar estado del servicio de sandbox
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    dockerAvailable: sandboxManager.docker !== null,
    sandboxes: sandboxManager.sandboxes.size,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @route POST /api/sandbox/create
 * @desc Crear un nuevo sandbox
 */
router.post('/create', requireJwtAuth, async (req, res) => {
  try {
    const { sessionId, workspacePath, resources } = req.body;
    const userId = getUserId(req);

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const sandbox = await sandboxManager.createSandbox({
      sessionId,
      userId,
      workspacePath: workspacePath || null,
      resources: resources || {},
    });

    // Publicar evento de API
    publishApiEvent(
      'api.sandbox.created',
      {
        sandboxId: sandbox.id,
        sessionId,
      },
      req,
    );

    res.status(201).json({
      success: true,
      sandbox,
    });
  } catch (error) {
    console.error('[Sandbox] Error creating sandbox:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sandbox/list
 * @desc Listar sandboxes del usuario
 */
router.get('/list', requireJwtAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const sandboxes = await sandboxManager.listSandboxes(userId);

    res.json({
      success: true,
      sandboxes,
      count: sandboxes.length,
    });
  } catch (error) {
    console.error('[Sandbox] Error listing sandboxes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sandbox/:sandboxId
 * @desc Obtener detalles de un sandbox
 */
router.get('/:sandboxId', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const userId = getUserId(req);

    const statusResult = await sandboxManager.getSandboxStatus(sandboxId);

    if (!statusResult.found) {
      return res.status(404).json({
        success: false,
        error: 'Sandbox not found',
      });
    }

    // Obtener sandbox real para verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    const sandbox = sandboxes.find((s) => s.id === sandboxId);

    if (!sandbox) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    res.json({
      success: true,
      sandbox: {
        ...sandbox,
        status: statusResult.status,
        containerId: statusResult.containerId,
        uptime: statusResult.uptime,
      },
    });
  } catch (error) {
    console.error('[Sandbox] Error getting sandbox:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/sandbox/:sandboxId/execute
 * @desc Ejecutar comando en el sandbox
 */
router.post('/:sandboxId/execute', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { command, options } = req.body;
    const userId = getUserId(req);

    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    const sandbox = sandboxes.find((s) => s.id === sandboxId);

    if (!sandbox) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const result = await sandboxManager.executeInSandbox(sandboxId, command, options);

    res.json({
      success: result.success,
      execution: result,
    });
  } catch (error) {
    console.error('[Sandbox] Error executing command:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sandbox/:sandboxId/files
 * @desc Listar archivos modificados
 */
router.get('/:sandboxId/files', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { type, staged } = req.query;
    const userId = getUserId(req);

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const options = {};
    if (type) options.type = type;
    if (staged !== undefined) options.staged = staged === 'true';

    const files = await sandboxManager.getModifiedFiles(sandboxId, options);

    res.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error) {
    console.error('[Sandbox] Error getting files:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sandbox/:sandboxId/files/*path
 * @desc Leer archivo del sandbox
 */
router.get('/:sandboxId/files/*path', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const filePath = req.params[0];
    const userId = getUserId(req);

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const result = await sandboxManager.readFile(sandboxId, filePath);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      file: result,
    });
  } catch (error) {
    console.error('[Sandbox] Error reading file:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/sandbox/:sandboxId/files/*path
 * @desc Escribir archivo en el sandbox
 */
router.put('/:sandboxId/files/*path', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const filePath = req.params[0];
    const { content } = req.body;
    const userId = getUserId(req);

    if (content === undefined) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const result = await sandboxManager.writeFile(sandboxId, filePath, content);

    res.json({
      success: result.success,
      file: result,
    });
  } catch (error) {
    console.error('[Sandbox] Error writing file:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/sandbox/:sandboxId/stage
 * @desc Preparar archivos para promoción
 */
router.post('/:sandboxId/stage', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { filePaths } = req.body;
    const userId = getUserId(req);

    if (!filePaths || !Array.isArray(filePaths)) {
      return res.status(400).json({ error: 'filePaths array is required' });
    }

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const result = await sandboxManager.stageChange(sandboxId, filePaths);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Sandbox] Error staging files:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/sandbox/:sandboxId/promote
 * @desc Promover cambios al workspace real
 */
router.post('/:sandboxId/promote', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { filePaths, targetPath } = req.body;
    const userId = getUserId(req);

    if (!filePaths || !Array.isArray(filePaths)) {
      return res.status(400).json({ error: 'filePaths array is required' });
    }

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const result = await sandboxManager.promoteChanges(sandboxId, filePaths, { targetPath });

    res.json({
      success: result.success,
      ...result,
    });
  } catch (error) {
    console.error('[Sandbox] Error promoting changes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/sandbox/:sandboxId/discard
 * @desc Descartar cambios
 */
router.post('/:sandboxId/discard', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { filePaths } = req.body;
    const userId = getUserId(req);

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const result = await sandboxManager.discardChanges(sandboxId, filePaths);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Sandbox] Error discarding changes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sandbox/:sandboxId/terminal
 * @desc Obtener historial de terminal
 */
router.get('/:sandboxId/terminal', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const userId = getUserId(req);

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const history = await sandboxManager.getTerminalHistory(sandboxId);

    res.json({
      success: true,
      history,
      count: history.length,
    });
  } catch (error) {
    console.error('[Sandbox] Error getting terminal history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route DELETE /api/sandbox/:sandboxId
 * @desc Destruir sandbox
 */
router.delete('/:sandboxId', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const userId = getUserId(req);

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const result = await sandboxManager.destroySandbox(sandboxId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Sandbox] Error destroying sandbox:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sandbox/:sandboxId/diff/:filePath
 * @desc Obtener diff de un archivo
 */
router.get('/:sandboxId/diff/*path', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const filePath = req.params[0];
    const { format } = req.query;
    const userId = getUserId(req);

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Obtener sandbox real
    const sandbox = sandboxManager.sandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).json({
        success: false,
        error: 'Sandbox not found',
      });
    }

    // Importar servicio de diff
    const DiffService = require('../services/SandboxManager/DiffService');

    const sandboxFilePath = path.join(sandbox.workspacePath, filePath);
    const originalFilePath = sandbox.files.tracked.has(filePath)
      ? path.join(sandbox.workspacePath, filePath) // Usar el original del tracking
      : null;

    // Leer archivo del sandbox
    let sandboxContent;
    try {
      sandboxContent = await fs.readFile(sandboxFilePath, 'utf-8');
    } catch {
      return res.status(404).json({
        success: false,
        error: 'File not found in sandbox',
      });
    }

    // Obtener contenido original
    let originalContent = '';
    if (sandbox.files.tracked.has(filePath)) {
      const trackedFile = sandbox.files.tracked.get(filePath);
      originalContent = trackedFile.content || '';
    }

    if (format === 'unified') {
      // Devolver en formato unified
      const unified = DiffService.generateUnifiedDiff(
        originalContent,
        sandboxContent,
        filePath,
        `${filePath} (sandbox)`,
      );
      res.type('text/plain').send(unified);
    } else {
      // Devolver en formato JSON
      const diff = DiffService.diffContents(originalContent, sandboxContent);
      res.json({
        success: true,
        filePath,
        ...diff,
      });
    }
  } catch (error) {
    console.error('[Sandbox] Error getting diff:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sandbox/:sandboxId/diff-all
 * @desc Obtener diff de todos los archivos modificados
 */
router.get('/:sandboxId/diff-all', requireJwtAuth, async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { format } = req.query;
    const userId = getUserId(req);

    // Verificar acceso
    const sandboxes = await sandboxManager.listSandboxes(userId);
    if (!sandboxes.find((s) => s.id === sandboxId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const sandbox = sandboxManager.sandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).json({
        success: false,
        error: 'Sandbox not found',
      });
    }

    const DiffService = require('../services/SandboxManager/DiffService');
    const diffs = [];

    for (const [filePath, change] of sandbox.files.modified) {
      const sandboxFilePath = path.join(sandbox.workspacePath, filePath);

      try {
        let sandboxContent = await fs.readFile(sandboxFilePath, 'utf-8');
        const originalContent = change.oldContent || '';

        if (format === 'unified') {
          diffs.push({
            filePath,
            type: change.type,
            unified: DiffService.generateUnifiedDiff(
              originalContent,
              sandboxContent,
              filePath,
              `${filePath} (sandbox)`,
            ),
          });
        } else {
          const diff = DiffService.diffContents(originalContent, sandboxContent);
          diffs.push({
            filePath,
            type: change.type,
            ...diff,
          });
        }
      } catch {
        // Archivo podría no existir
        diffs.push({
          filePath,
          type: change.type,
          error: 'Could not read file',
        });
      }
    }

    res.json({
      success: true,
      files: diffs,
      count: diffs.length,
    });
  } catch (error) {
    console.error('[Sandbox] Error getting all diffs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
