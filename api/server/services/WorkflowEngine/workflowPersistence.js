/**
 * Thin persistence layer for WorkflowEngine.
 * Saves workflow snapshots to MongoDB so state survives server restarts.
 */

let WorkflowModel;
function getModel() {
  if (!WorkflowModel) {
    WorkflowModel = require('~/models/Workflow');
  }
  return WorkflowModel;
}

async function saveWorkflow(workflow, userId) {
  try {
    const Model = getModel();
    const json = workflow.toJSON();
    await Model.findOneAndUpdate(
      { workflowId: workflow.id },
      {
        workflowId: workflow.id,
        name: json.name,
        description: json.description,
        status: json.status,
        steps: json.steps,
        result: json.result,
        error: json.error,
        createdBy: userId || null,
        startedAt: json.startedAt,
        completedAt: json.completedAt,
        duration: json.duration,
      },
      { upsert: true, new: true },
    );
  } catch (err) {
    // Never let persistence errors crash the engine
    console.error('[workflowPersistence] saveWorkflow failed:', err.message);
  }
}

async function listWorkflows({ userId, limit = 50 } = {}) {
  try {
    const Model = getModel();
    const query = userId ? { createdBy: userId } : {};
    return await Model.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  } catch (err) {
    console.error('[workflowPersistence] listWorkflows failed:', err.message);
    return [];
  }
}

async function getWorkflow(workflowId) {
  try {
    const Model = getModel();
    return await Model.findOne({ workflowId }).lean();
  } catch (err) {
    console.error('[workflowPersistence] getWorkflow failed:', err.message);
    return null;
  }
}

module.exports = { saveWorkflow, listWorkflows, getWorkflow };
