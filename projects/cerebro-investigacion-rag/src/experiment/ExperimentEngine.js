'use strict';

/**
 * Face 35 — ExperimentEngine (plan §49, §52, §53).
 *
 * experiment → environment → configuration → code → benchmark → metrics →
 * artifacts → result. Reproducibility: git commit, deps, versions, OS,
 * hardware, dataset hash, config, seed, code hash. Failures are stored as
 * first-class knowledge (FailureMemory): rejected hypotheses are never
 * silently retried.
 */

const { uid, nowIso, sha256 } = require('../core/ids');
const os = require('os');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');

const EXPERIMENTS = () => collection('experiments');

function reproducibility(code, datasetHash, seed, configObj) {
  return {
    os: `${os.platform()} ${os.release()}`,
    node: process.version,
    cpu_model: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
    total_ram_mb: Math.round(os.totalmem() / 1e6),
    git_commit: process.env.GIT_COMMIT || null,
    dependencies: 'none (engine is dependency-free)',
    dataset_hash: datasetHash || null,
    code_hash: sha256(code || ''),
    random_seed: seed,
    configuration: configObj,
  };
}

/**
 * Plan + run an experiment for a hypothesis inside the sandbox.
 * @param {object} input { hypothesis, code, dataset_hash, seed, config, timeout_ms }
 */
async function runExperiment(input) {
  const SandboxProvider = require('./SandboxProvider');
  const seed = input.seed || 42;
  const code = input.code || input.hypothesis.experiment_plan.test || 'console.log("no code")';

  const rec = await EXPERIMENTS().insert({
    id: uid('exp'),
    session_id: input.session_id || null,
    hypothesis_id: input.hypothesis.id,
    technique: input.hypothesis.technique,
    environment: 'sandbox',
    configuration: input.config || {},
    dataset_hash: input.dataset_hash || null,
    reproducibility: reproducibility(code, input.dataset_hash, seed, input.config || {}),
    status: 'RUNNING',
    created_at: nowIso(),
  });
  eventbus.emit('ExperimentStarted', { experiment_id: rec.id, hypothesis_id: input.hypothesis.id });

  const result = await SandboxProvider.run({ code, timeout_ms: input.timeout_ms, files: input.files });

  const completed = await EXPERIMENTS().update(rec._id, {
    status: result.status,
    result: { stdout: result.stdout.slice(0, 4000), stderr: result.stderr.slice(0, 2000), artifacts: result.artifacts },
    finished_at: nowIso(),
  });
  eventbus.emit('ExperimentFinished', { experiment_id: rec.id, status: result.status });

  // Failure memory: a failed experiment REJECTS the hypothesis with reason.
  if (result.status !== 'COMPLETED' && input.hypothesis.id) {
    const HypothesisEngine = require('./HypothesisEngine');
    await HypothesisEngine.reject(input.hypothesis.id, `experiment ${result.status}: ${result.stderr.slice(0, 200)}`, { experiment_id: rec.id });
  }
  return completed;
}

/** Failure memory query: has this technique already failed? (plan §53) */
async function techniqueFailed(technique) {
  const rows = await EXPERIMENTS().find((e) => e.technique === technique && e.status !== 'COMPLETED');
  return rows.length > 0 ? { failed: true, experiments: rows.map((r) => ({ id: r.id, status: r.status, reason: r.result && r.result.stderr ? r.result.stderr.slice(0, 200) : null })) } : { failed: false };
}

module.exports = { runExperiment, techniqueFailed, reproducibility };
