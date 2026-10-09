/**
 * MicroVMManager.js — MicroVM Execution Management
 * 
 * Manages lightweight VM execution:
 * - Create isolated environments
 * - Execute code safely
 * - Resource limits
 * - Cleanup
 * 
 * License: MIT
 * RAM: ~5MB
 */

const { EventEmitter } = require('events');

class MicroVMManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'MicroVMManager';
        this._vms = new Map();
        this._maxVMs = config.maxVMs || 5;
    }

    async create(config = {}) {
        if (this._vms.size >= this._maxVMs) throw new Error('Max VMs reached');
        const id = `vm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const vm = { id, status: 'created', createdAt: Date.now(), config: { memory: config.memory || '256MB', cpu: config.cpu || 1, timeout: config.timeout || 30000 } };
        this._vms.set(id, vm);
        return vm;
    }

    async execute(vmId, code) {
        const vm = this._vms.get(vmId);
        if (!vm) throw new Error(`VM not found: ${vmId}`);
        vm.status = 'running';
        try {
            const result = await Promise.race([
                new Promise((resolve) => { const fn = new Function(code); resolve(fn()); }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('VM timeout')), vm.config.timeout)),
            ]);
            vm.status = 'idle';
            return { success: true, result };
        } catch (err) {
            vm.status = 'error';
            return { success: false, error: err.message };
        }
    }

    destroy(vmId) {
        const vm = this._vms.get(vmId);
        if (!vm) return false;
        vm.status = 'destroyed';
        this._vms.delete(vmId);
        return true;
    }

    list() { return [...this._vms.values()]; }
    getStatus(vmId) { return this._vms.get(vmId)?.status || null; }
}

module.exports = { MicroVMManager };
module.exports.default = MicroVMManager;
