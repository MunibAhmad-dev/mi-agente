/**
 * DAGScheduler.js — Directed Acyclic Graph Execution Engine
 * 
 * Executes tasks with dependencies:
 * - Build DAG from task definitions
 * - Detect cycles
 * - Resolve dependencies
 * - Execute independent tasks in parallel
 * - Track status per node
 * 
 * License: MIT
 * RAM: ~3MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[DAGScheduler]', ...args),
    info: (...args) => console.info('[DAGScheduler]', ...args),
    warn: (...args) => console.warn('[DAGScheduler]', ...args),
    error: (...args) => console.error('[DAGScheduler]', ...args),
};

const NodeStatus = {
    PENDING: 'pending',
    READY: 'ready',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
};

class DAGScheduler extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'DAGScheduler';
        this._maxConcurrency = config.maxConcurrency || 5;
        this._timeout = config.timeout || 300000; // 5 min per task
        this._graphs = new Map(); // graphId -> graph
    }

    /**
     * Create a DAG from task definitions.
     * @param {Object} config - { id, tasks: [{ id, handler, dependsOn: [] }] }
     * @returns {Object} graph
     */
    createGraph(config) {
        const { id, tasks } = config;
        const graphId = id || `dag_${Date.now()}`;

        const nodes = new Map();
        for (const task of tasks) {
            nodes.set(task.id, {
                id: task.id,
                handler: task.handler,
                dependsOn: task.dependsOn || [],
                status: NodeStatus.PENDING,
                result: null,
                error: null,
                startTime: null,
                endTime: null,
                duration: 0,
            });
        }

        // Validate dependencies exist
        for (const task of tasks) {
            for (const dep of (task.dependsOn || [])) {
                if (!nodes.has(dep)) {
                    throw new Error(`Dependency not found: ${dep} (required by ${task.id})`);
                }
            }
        }

        // Detect cycles
        if (this._hasCycle(nodes)) {
            throw new Error('DAG contains a cycle');
        }

        // Calculate levels (topological sort)
        const levels = this._topologicalSort(nodes);

        const graph = {
            id: graphId,
            nodes,
            levels,
            status: 'created',
            startTime: null,
            endTime: null,
            completedCount: 0,
            failedCount: 0,
            totalCount: tasks.length,
        };

        this._graphs.set(graphId, graph);
        logger.info(`[DAGScheduler] Created graph ${graphId}: ${tasks.length} tasks, ${levels.length} levels`);
        return graph;
    }

    /**
     * Execute a DAG.
     */
    async execute(graphId) {
        const graph = this._graphs.get(graphId);
        if (!graph) throw new Error(`Graph not found: ${graphId}`);

        graph.status = 'running';
        graph.startTime = Date.now();
        this.emit('graphStarted', { graphId });

        try {
            for (const level of graph.levels) {
                // Get ready nodes in this level
                const readyNodes = level.filter(id => {
                    const node = graph.nodes.get(id);
                    return node.status === NodeStatus.PENDING && this._allDependenciesMet(graph, id);
                });

                if (readyNodes.length === 0) continue;

                // Execute level (parallel)
                const promises = readyNodes.map(nodeId => this._executeNode(graph, nodeId));
                await Promise.allSettled(promises);

                // Check if any failed
                for (const nodeId of readyNodes) {
                    const node = graph.nodes.get(nodeId);
                    if (node.status === NodeStatus.FAILED) {
                        // Skip dependents
                        this._skipDependents(graph, nodeId);
                    }
                }
            }

            graph.status = graph.failedCount > 0 ? 'partial' : 'completed';
            graph.endTime = Date.now();

            const duration = graph.endTime - graph.startTime;
            logger.info(`[DAGScheduler] Graph ${graphId} completed: ${graph.completedCount}/${graph.totalCount} tasks (${duration}ms)`);
            this.emit('graphCompleted', { graphId, status: graph.status, duration });

            return {
                success: graph.status === 'completed',
                status: graph.status,
                completed: graph.completedCount,
                failed: graph.failedCount,
                total: graph.totalCount,
                duration,
            };
        } catch (err) {
            graph.status = 'failed';
            graph.endTime = Date.now();
            logger.error(`[DAGScheduler] Graph ${graphId} failed: ${err.message}`);
            this.emit('graphFailed', { graphId, error: err.message });
            throw err;
        }
    }

    /**
     * Get graph status.
     */
    getStatus(graphId) {
        const graph = this._graphs.get(graphId);
        if (!graph) return null;

        const nodes = {};
        for (const [id, node] of graph.nodes) {
            nodes[id] = {
                status: node.status,
                duration: node.duration,
                error: node.error ? node.error.message : null,
            };
        }

        return {
            id: graph.id,
            status: graph.status,
            completed: graph.completedCount,
            failed: graph.failedCount,
            total: graph.totalCount,
            nodes,
        };
    }

    /**
     * Cancel a graph.
     */
    cancel(graphId) {
        const graph = this._graphs.get(graphId);
        if (!graph) return false;

        for (const [id, node] of graph.nodes) {
            if (node.status === NodeStatus.PENDING || node.status === NodeStatus.RUNNING) {
                node.status = NodeStatus.SKIPPED;
            }
        }

        graph.status = 'cancelled';
        logger.info(`[DAGScheduler] Graph ${graphId} cancelled`);
        return true;
    }

    // ── Internal ──────────────────────────────────────────────

    async _executeNode(graph, nodeId) {
        const node = graph.nodes.get(nodeId);
        node.status = NodeStatus.RUNNING;
        node.startTime = Date.now();
        this.emit('nodeStarted', { graphId: graph.id, nodeId });

        try {
            const result = await Promise.race([
                node.handler(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Task timeout')), this._timeout)),
            ]);

            node.status = NodeStatus.COMPLETED;
            node.result = result;
            node.endTime = Date.now();
            node.duration = node.endTime - node.startTime;
            graph.completedCount++;

            this.emit('nodeCompleted', { graphId: graph.id, nodeId, duration: node.duration });
        } catch (err) {
            node.status = NodeStatus.FAILED;
            node.error = err;
            node.endTime = Date.now();
            node.duration = node.endTime - node.startTime;
            graph.failedCount++;

            logger.warn(`[DAGScheduler] Node ${nodeId} failed: ${err.message}`);
            this.emit('nodeFailed', { graphId: graph.id, nodeId, error: err.message });
        }
    }

    _allDependenciesMet(graph, nodeId) {
        const node = graph.nodes.get(nodeId);
        for (const depId of node.dependsOn) {
            const dep = graph.nodes.get(depId);
            if (!dep || dep.status !== NodeStatus.COMPLETED) {
                return false;
            }
        }
        return true;
    }

    _skipDependents(graph, failedNodeId) {
        for (const [id, node] of graph.nodes) {
            if (node.dependsOn.includes(failedNodeId) && node.status === NodeStatus.PENDING) {
                node.status = NodeStatus.SKIPPED;
                graph.completedCount++; // Count as handled
                this._skipDependents(graph, id);
            }
        }
    }

    _hasCycle(nodes) {
        const visited = new Set();
        const recursionStack = new Set();

        const dfs = (nodeId) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);

            const node = nodes.get(nodeId);
            if (!node) return false;

            for (const depId of node.dependsOn) {
                if (!visited.has(depId)) {
                    if (dfs(depId)) return true;
                } else if (recursionStack.has(depId)) {
                    return true;
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        for (const nodeId of nodes.keys()) {
            if (!visited.has(nodeId)) {
                if (dfs(nodeId)) return true;
            }
        }
        return false;
    }

    _topologicalSort(nodes) {
        const inDegree = new Map();
        const levels = [];

        // Calculate in-degree
        for (const [id, node] of nodes) {
            inDegree.set(id, node.dependsOn.length);
        }

        // Find nodes with 0 in-degree (level 0)
        let currentLevel = [...inDegree.entries()]
            .filter(([_, deg]) => deg === 0)
            .map(([id]) => id);

        while (currentLevel.length > 0) {
            levels.push(currentLevel);

            const nextLevel = [];
            for (const nodeId of currentLevel) {
                // Find nodes that depend on this one
                for (const [id, node] of nodes) {
                    if (node.dependsOn.includes(nodeId)) {
                        const newDeg = inDegree.get(id) - 1;
                        inDegree.set(id, newDeg);
                        if (newDeg === 0) {
                            nextLevel.push(id);
                        }
                    }
                }
            }

            currentLevel = nextLevel;
        }

        return levels;
    }
}

module.exports = { DAGScheduler };
module.exports.default = DAGScheduler;
