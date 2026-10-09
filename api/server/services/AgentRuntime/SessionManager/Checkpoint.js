/**
 * Checkpoint — persists session state so an agent can be resumed later
 * (Codex session resume / Claude Code pattern). Uses a JSON file on disk so
 * no external dependency is required.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CHECKPOINT_DIR =
  process.env.HARNESS_CHECKPOINT_DIR || path.join(os.homedir(), '.harness', 'checkpoints');

/**
 * Save a session checkpoint.
 * @param {object} session
 * @param {object} goal optional goal context
 * @param {string} userId owner of this checkpoint (required)
 * @returns {Promise<object>} { id, path, saved }
 */
async function save(session, goal, userId) {
  if (!userId) throw new Error('[Checkpoint] userId is required to save a checkpoint');
  const id = crypto.createHash('sha1').update(session.id).digest('hex').slice(0, 12);
  const dir = CHECKPOINT_DIR;
  const data = {
    id,
    sessionId: session.id,
    userId,
    agentId: session.agentId,
    model: session.model,
    state: session.state,
    toolCalls: session.toolCalls,
    flags: session.flags,
    goal: goal ? { id: goal.id, description: goal.description } : null,
    savedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return { id, path: file, saved: true };
  } catch (e) {
    return { id, path: null, saved: false, error: e.message };
  }
}

/**
 * Load a checkpoint by session ID.
 * @param {string} sessionId
 * @param {string} userId — must match the checkpoint's owner or load is refused
 * @returns {Promise<object|null>}
 */
async function load(sessionId, userId) {
  if (!userId) throw new Error('[Checkpoint] userId is required to load a checkpoint');
  const id = crypto.createHash('sha1').update(sessionId).digest('hex').slice(0, 12);
  const file = path.join(CHECKPOINT_DIR, `${id}.json`);
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.userId && data.userId !== userId) {
      throw new Error('[Checkpoint] Access denied — session belongs to a different user');
    }
    return data;
  } catch (e) {
    if (e.message.includes('Access denied')) throw e;
    return null;
  }
}

/**
 * List saved checkpoints belonging to the given user.
 * @param {string} userId
 * @returns {object[]}
 */
function list(userId) {
  if (!userId) return [];
  try {
    if (!fs.existsSync(CHECKPOINT_DIR)) return [];
    return fs
      .readdirSync(CHECKPOINT_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, f), 'utf8'));
          return { id: d.id, sessionId: d.sessionId, userId: d.userId, savedAt: d.savedAt, goal: d.goal };
        } catch { return null; }
      })
      .filter((d) => d && d.userId === userId);
  } catch {
    return [];
  }
}

module.exports = { save, load, list, CHECKPOINT_DIR };
