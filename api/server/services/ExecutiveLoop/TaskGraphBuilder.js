/**
 * TaskGraphBuilder — Face 8 Phase 6: Planner steps → DAG with dependency analysis.
 *
 * Converts a flat Planner step list into a dependency graph where:
 * - Independent steps (parallel search/research) execute concurrently
 * - Aggregator steps (Synthesize, Integrate, Verify) wait on their prerequisites
 * - Sequential steps wait on the previous step
 *
 * Uses DAGScheduler for execution.
 */

'use strict';

const { DAGScheduler } = require('../Harness/cognitive/DAGScheduler');
const { assessStep } = require('./PolicyEngine');

const _scheduler = new DAGScheduler({ maxConcurrency: 3, timeout: 120000 });

// Step name patterns that can run in parallel (sibling searches)
const PARALLEL_PATTERNS = [/^research:/i, /^search:/i, /^search\b/i, /^execute sub-task/i];

// Steps that must wait for ALL predecessors to finish
const AGGREGATOR_PATTERNS = [
  /^synthesize/i, /^integrate/i, /^verify/i, /^check/i, /^validate/i,
  /^cite/i, /^final/i,
];

function isParallel(name) {
  return PARALLEL_PATTERNS.some((re) => re.test(name.trim()));
}

function isAggregator(name) {
  return AGGREGATOR_PATTERNS.some((re) => re.test(name.trim()));
}

/**
 * Assign dependency edges to each step.
 * Returns array of { id, name, dependsOn[], riskPolicy }.
 */
function buildDependencies(steps) {
  const nodes = steps.map((name, i) => ({
    id: `s${i}`,
    name,
    dependsOn: [],
    riskPolicy: assessStep(name),
    parallel: isParallel(name),
    aggregator: isAggregator(name),
  }));

  // Track the last "barrier" index (non-parallel, non-aggregator completed)
  let lastBarrier = -1;
  // Track all parallel nodes in the current parallel block
  let parallelBlock = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.aggregator) {
      // Aggregator: depends on everything in the current parallel block + last barrier
      const deps = new Set();
      parallelBlock.forEach((j) => deps.add(`s${j}`));
      if (lastBarrier >= 0) deps.add(`s${lastBarrier}`);
      node.dependsOn = [...deps];
      parallelBlock = [];
      lastBarrier = i;
    } else if (node.parallel) {
      // Parallel: depends only on the last barrier (not siblings in same block)
      if (lastBarrier >= 0) node.dependsOn = [`s${lastBarrier}`];
      parallelBlock.push(i);
    } else {
      // Sequential: depends on last barrier OR all parallel siblings if the block just ended
      const deps = new Set();
      parallelBlock.forEach((j) => deps.add(`s${j}`));
      if (lastBarrier >= 0 && parallelBlock.length === 0) deps.add(`s${lastBarrier}`);
      node.dependsOn = [...deps];
      parallelBlock = [];
      lastBarrier = i;
    }
  }

  return nodes;
}

/**
 * Build a DAG graph from a Planner step list.
 *
 * @param {object} params
 * @param {string} params.graphId
 * @param {string[]} params.steps        - step names from Planner
 * @param {Function} params.executor     - async (stepDef) => result
 * @returns {{ scheduler, graph, stepDefs }}
 */
function buildGraph({ graphId, steps, executor }) {
  const stepDefs = buildDependencies(steps);

  const tasks = stepDefs.map((def) => ({
    id: def.id,
    dependsOn: def.dependsOn,
    handler: () => executor(def),
  }));

  const graph = _scheduler.createGraph({ id: graphId, tasks });
  return { scheduler: _scheduler, graph, stepDefs };
}

module.exports = { buildGraph, buildDependencies };
