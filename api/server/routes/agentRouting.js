/**
 * AgentRouting Routes — FASE 23.
 *
 *   GET  /api/agents/routing/:agentId   → preferencia actual (manual por defecto)
 *   PUT  /api/agents/routing/:agentId   → guardar mode + niveles
 *
 * Requieren JWT y que el agente pertenezca al usuario.
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const {
  getRoutingController,
  putRoutingController,
} = require('~/server/controllers/AgentRoutingController');

router.get('/:agentId', requireJwtAuth, getRoutingController);
router.put('/:agentId', requireJwtAuth, putRoutingController);

module.exports = router;
