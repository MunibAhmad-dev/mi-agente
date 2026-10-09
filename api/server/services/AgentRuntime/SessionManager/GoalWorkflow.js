/**
 * GoalWorkflow — persisted long-running goals so an agent can track multi-day
 * tasks across sessions (Codex /goal and Grok Build pattern). Each goal is a
 * JSON file with description, status, subtasks, and progress log.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const GOAL_DIR = process.env.HARNESS_GOAL_DIR || path.join(os.homedir(), '.harness', 'goals');

/**
 * Create a new persisted goal.
 * @param {object} session
 * @param {string} description
 * @returns {Promise<object>}
 */
async function create(session, description) {
  const id = crypto
    .createHash('sha1')
    .update(description + session.id)
    .digest('hex')
    .slice(0, 12);
  const goal = {
    id,
    sessionId: session.id,
    description,
    status: 'active',
    subtasks: [],
    progress: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(GOAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(GOAL_DIR, `${id}.json`), JSON.stringify(goal, null, 2));
  } catch {
    // best-effort
  }
  return goal;
}

/**
 * Load a goal by ID.
 * @param {string} id
 * @returns {object|null}
 */
function load(id) {
  try {
    const file = path.join(GOAL_DIR, `${id}.json`);
    if (!fs.existsSync(file)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Update a goal's progress.
 * @param {string} id
 * @param {string} note
 * @param {string} status
 */
function update(id, note, status) {
  const goal = load(id);
  if (!goal) {
    return null;
  }
  if (note) {
    goal.progress.push({ note, at: new Date().toISOString() });
  }
  if (status) {
    goal.status = status;
  }
  goal.updatedAt = new Date().toISOString();
  try {
    fs.writeFileSync(path.join(GOAL_DIR, `${id}.json`), JSON.stringify(goal, null, 2));
  } catch {
    // best-effort
  }
  return goal;
}

/**
 * List all goals.
 * @returns {object[]}
 */
function list() {
  try {
    if (!fs.existsSync(GOAL_DIR)) {
      return [];
    }
    return fs
      .readdirSync(GOAL_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(GOAL_DIR, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { create, load, update, list, GOAL_DIR };
