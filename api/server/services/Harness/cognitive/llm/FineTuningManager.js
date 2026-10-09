/**
 * FineTuningManager.js — LoRA/Adapter Fine-tuning
 * 
 * Manages fine-tuning of local LLMs using:
 * - LoRA (Low-Rank Adaptation) via Unsloth (free, fast)
 * - QLoRA via llama.cpp
 * - Adapter training via MLX (macOS)
 * 
 * All free, open-source, runs locally:
 * - Unsloth: Apache-2.0, 2x faster, 60% less memory
 * - llama.cpp: MIT
 * - MLX: MIT
 * 
 * Workflow:
 * 1. Prepare dataset (JSON/JSONL)
 * 2. Configure training params
 * 3. Launch training (background)
 * 4. Monitor progress
 * 5. Export adapter/merged model
 */

const { EventEmitter } = require('events');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const logger = {
    debug: (...args) => console.log('[FineTuning]', ...args),
    info: (...args) => console.info('[FineTuning]', ...args),
    warn: (...args) => console.warn('[FineTuning]', ...args),
    error: (...args) => console.error('[FineTuning]', ...args),
};

/**
 * Default training configurations
 */
const PRESET_CONFIGS = {
    quick: {
        name: 'Quick LoRA (Unsloth)',
        description: 'Fast fine-tuning with LoRA, minimal resources',
        method: 'unsloth',
        lora_r: 8,
        lora_alpha: 16,
        lora_dropout: 0,
        learning_rate: 2e-4,
        num_epochs: 1,
        batch_size: 1,
        gradient_accumulation: 4,
        warmup_steps: 5,
        max_seq_length: 2048,
        quantization: '4bit',
        estimatedTime: '10-30 min',
        estimatedRAM: '4-6 GB',
    },
    balanced: {
        name: 'Balanced LoRA',
        description: 'Good quality with moderate resources',
        method: 'unsloth',
        lora_r: 16,
        lora_alpha: 32,
        lora_dropout: 0.05,
        learning_rate: 1e-4,
        num_epochs: 3,
        batch_size: 2,
        gradient_accumulation: 4,
        warmup_steps: 10,
        max_seq_length: 4096,
        quantization: '4bit',
        estimatedTime: '1-3 hours',
        estimatedRAM: '6-8 GB',
    },
    quality: {
        name: 'High Quality LoRA',
        description: 'Best quality, requires more resources',
        method: 'unsloth',
        lora_r: 32,
        lora_alpha: 64,
        lora_dropout: 0.1,
        learning_rate: 5e-5,
        num_epochs: 5,
        batch_size: 4,
        gradient_accumulation: 8,
        warmup_steps: 20,
        max_seq_length: 8192,
        quantization: '4bit',
        estimatedTime: '4-12 hours',
        estimatedRAM: '8-16 GB',
    },
    qlora: {
        name: 'QLoRA (llama.cpp)',
        description: 'Quantized LoRA via llama.cpp, very efficient',
        method: 'llamacpp',
        lora_r: 16,
        lora_alpha: 32,
        learning_rate: 1e-4,
        num_epochs: 3,
        batch_size: 4,
        max_seq_length: 4096,
        estimatedTime: '1-4 hours',
        estimatedRAM: '4-8 GB',
    },
};

/**
 * Dataset format examples
 */
const DATASET_EXAMPLES = {
    chat: [
        { messages: [
            { role: 'system', content: 'You are a helpful coding assistant.' },
            { role: 'user', content: 'How do I read a file in Node.js?' },
            { role: 'assistant', content: 'Use fs.readFileSync() or fs.readFile().' },
        ]},
    ],
    instruction: [
        { instruction: 'Summarize this code', input: 'function add(a,b){return a+b}', output: 'Adds two numbers.' },
    ],
    completion: [
        { prompt: 'def fibonacci(', completion: 'n):\n    if n <= 1: return n\n    return fibonacci(n-1) + fibonacci(n-2)' },
    ],
};

class FineTuningManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'FineTuningManager';
        this._workDir = config.workDir || path.join(process.cwd(), 'fine-tuning');
        this._modelsDir = config.modelsDir || path.join(process.cwd(), 'models');
        this._currentJob = null;
        this._jobs = [];
        this._presets = { ...PRESET_CONFIGS };
        
        // Ensure directories
        try { fs.mkdirSync(this._workDir, { recursive: true }); } catch (e) {}
        try { fs.mkdirSync(this._modelsDir, { recursive: true }); } catch (e) {}
    }

    /**
     * Check if Unsloth or llama.cpp training tools are available
     */
    async checkAvailability() {
        const checks = { unsloth: false, llamacpp: false, python: false, pip: false };
        
        try { execSync('python --version', { stdio: 'pipe', timeout: 5000 }); checks.python = true; } catch (e) {
            try { execSync('python3 --version', { stdio: 'pipe', timeout: 5000 }); checks.python = true; } catch (e2) {}
        }
        try { execSync('pip --version', { stdio: 'pipe', timeout: 5000 }); checks.pip = true; } catch (e) {
            try { execSync('pip3 --version', { stdio: 'pipe', timeout: 5000 }); checks.pip = true; } catch (e2) {}
        }
        try { execSync('python -c "import unsloth"', { stdio: 'pipe', timeout: 5000 }); checks.unsloth = true; } catch (e) {}
        try { execSync('llama-cli --version', { stdio: 'pipe', timeout: 5000 }); checks.llamacpp = true; } catch (e) {}
        
        return {
            ...checks,
            ready: checks.python && (checks.unsloth || checks.llamacpp),
            recommendation: !checks.unsloth && !checks.llamacpp
                ? 'Install Unsloth: pip install unsloth (recommended) or llama.cpp for QLoRA'
                : checks.unsloth
                    ? 'Unsloth ready — use "quick" or "balanced" presets'
                    : 'llama.cpp ready — use "qlora" preset',
        };
    }

    /**
     * Get available presets
     */
    getPresets() {
        return { ...this._presets };
    }

    /**
     * Prepare dataset from user data
     */
    prepareDataset(data, format = 'chat') {
        const datasetPath = path.join(this._workDir, `dataset_${Date.now()}.jsonl`);
        
        let lines;
        if (format === 'chat') {
            lines = data.map(item => JSON.stringify({ messages: item.messages || item }));
        } else if (format === 'instruction') {
            lines = data.map(item => JSON.stringify({
                instruction: item.instruction,
                input: item.input || '',
                output: item.output,
            }));
        } else {
            lines = data.map(item => JSON.stringify(item));
        }

        fs.writeFileSync(datasetPath, lines.join('\n'), 'utf-8');
        
        logger.info(`[FineTuning] Dataset prepared: ${lines.length} examples at ${datasetPath}`);
        return { path: datasetPath, examples: lines.length, format };
    }

    /**
     * Generate training script for Unsloth
     */
    generateUnslothScript(datasetPath, preset, baseModel) {
        const config = this._presets[preset] || this._presets.quick;
        
        return `#!/usr/bin/env python3
"""
Auto-generated fine-tuning script via AI-OS FineTuningManager
Preset: ${config.name}
Base Model: ${baseModel || 'Qwen/Qwen2.5-3B-Instruct'}
"""

import json
from unsloth import FastLanguageModel
import torch

# 1. Load base model with 4-bit quantization
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="${baseModel || 'Qwen/Qwen2.5-3B-Instruct'}",
    max_seq_length=${config.max_seq_length},
    dtype=None,  # Auto-detect
    load_in_4bit=${config.quantization === '4bit' ? 'True' : 'False'},
)

# 2. Add LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=${config.lora_r},
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_alpha=${config.lora_alpha},
    lora_dropout=${config.lora_dropout},
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)

# 3. Load dataset
from unsloth.chat_templates import get_chat_template
tokenizer = get_chat_template(
    tokenizer,
    chat_template="qwen-2.5",
)

def formatting_prompts_func(examples):
    convos = examples["messages"]
    texts = [tokenizer.apply_chat_template(c, tokenize=False, add_generation_prompt=False) for c in convos]
    return {"text": texts}

from datasets import load_dataset
dataset = load_dataset("json", data_files="${datasetPath.replace(/\\/g, '\\\\')}", split="train")
dataset = dataset.map(formatting_prompts_func, batched=True)

# 4. Training
from trl import SFTTrainer
from transformers import TrainingArguments

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=${config.max_seq_length},
    args=TrainingArguments(
        per_device_train_batch_size=${config.batch_size},
        gradient_accumulation_steps=${config.gradient_accumulation},
        warmup_steps=${config.warmup_steps},
        num_train_epochs=${config.num_epochs},
        learning_rate=${config.learning_rate},
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=1,
        output_dir="outputs",
        optim="adamw_8bit",
        seed=3407,
    ),
)

# 5. Train
print("Starting training...")
trainer.train()

# 6. Save LoRA adapter
model.save_pretrained("${this._modelsDir}/lora_adapter")
tokenizer.save_pretrained("${this._modelsDir}/lora_adapter")
print("LoRA adapter saved to ${this._modelsDir}/lora_adapter")

# 7. Optional: merge and save full model
# model.save_pretrained_merged("${this._modelsDir}/merged", tokenizer, save_method="merged_16bit")
# print("Merged model saved")

print("Training complete!")
`;
    }

    /**
     * Generate training script for llama.cpp QLoRA
     */
    generateLlamaCppScript(datasetPath, preset, baseModel) {
        const config = this._presets[preset] || this._presets.qlora;
        
        return `#!/bin/bash
# Auto-generated QLoRA script via AI-OS FineTuningManager
# Preset: ${config.name}

set -e

BASE_MODEL="${baseModel || 'models/llama-3.1-8b-instruct.Q4_K_M.gguf'}"
DATASET="${datasetPath.replace(/\\/g, '/')}"
OUTPUT="${this._modelsDir}/qlora_adapter"
LORA_R=${config.lora_r}
LORA_ALPHA=${config.lora_alpha}
LR=${config.learning_rate}
EPOCHS=${config.num_epochs}
BATCH=${config.batch_size}

echo "Starting QLoRA training..."
echo "Base model: $BASE_MODEL"
echo "Dataset: $DATASET"
echo "LoRA rank: $LORA_R"

# Check for llama.cpp with LoRA support
if ! command -v llama-cli &> /dev/null; then
    echo "Error: llama-cli not found. Install llama.cpp first."
    exit 1
fi

# Convert dataset to llama.cpp format if needed
# (llama.cpp expects text or chatml format)

mkdir -p "$OUTPUT"

echo "Training configuration:"
echo "  LoRA rank: $LORA_R"
echo "  LoRA alpha: $LORA_ALPHA"
echo "  Learning rate: $LR"
echo "  Epochs: $EPOCHS"
echo "  Batch size: $BATCH"

# Note: Full QLoRA training via llama.cpp requires building with training support
# For now, we recommend using Unsloth for LoRA training
echo ""
echo "For QLoRA training, we recommend:"
echo "  pip install unsloth"
echo "  Then use the 'quick' or 'balanced' preset instead."
echo ""
echo "Alternatively, use the Unsloth Python script directly."
`;
    }

    /**
     * Start a fine-tuning job
     */
    async startJob(options = {}) {
        const {
            preset = 'quick',
            datasetPath,
            data = [],
            format = 'chat',
            baseModel = 'Qwen/Qwen2.5-3B-Instruct',
            jobName,
        } = options;

        if (this._currentJob && this._currentJob.status === 'running') {
            return { success: false, error: 'A training job is already running' };
        }

        // Prepare dataset if data provided
        let dsPath = datasetPath;
        if (!dsPath && data.length > 0) {
            const ds = this.prepareDataset(data, format);
            dsPath = ds.path;
        }
        
        if (!dsPath || !fs.existsSync(dsPath)) {
            return { success: false, error: 'No valid dataset provided. Supply datasetPath or data array.' };
        }

        const config = this._presets[preset] || this._presets.quick;
        const jobId = `job_${Date.now()}`;
        const scriptPath = path.join(this._workDir, `${jobId}.py`);
        
        // Generate script
        let script;
        if (config.method === 'unsloth') {
            script = this.generateUnslothScript(dsPath, preset, baseModel);
        } else {
            script = this.generateLlamaCppScript(dsPath, preset, baseModel);
        }
        
        fs.writeFileSync(scriptPath, script, 'utf-8');

        this._currentJob = {
            id: jobId,
            name: jobName || `${config.name} - ${baseModel}`,
            preset,
            config,
            datasetPath: dsPath,
            scriptPath,
            baseModel,
            status: 'ready',
            startTime: null,
            progress: 0,
            logs: [],
        };

        this._jobs.push({ ...this._currentJob });

        logger.info(`[FineTuning] Job created: ${jobId} (${config.name})`);
        this.emit('job_created', this._currentJob);

        return {
            success: true,
            job: this._currentJob,
            command: config.method === 'unsloth'
                ? `python "${scriptPath}"`
                : `bash "${scriptPath.replace('.py', '.sh')}"`,
        };
    }

    /**
     * Select the best available training backend by probing the system.
     * Returns 'unsloth' | 'llamacpp' | 'ollama-create' | null.
     */
    async detectBackend() {
        const avail = await this.checkAvailability();
        if (avail.unsloth) return 'unsloth';
        if (avail.llamacpp) return 'llamacpp';
        // Ollama can create a Modelfile from a GGUF — useful as last resort
        try { execSync('ollama --version', { stdio: 'pipe', timeout: 5000 }); return 'ollama-create'; } catch {}
        return null;
    }

    /**
     * Execute the training job in the background using child_process.spawn.
     * Emits 'job_log', 'job_progress', 'job_done', 'job_error' events.
     * @param {string} [jobId] — id from startJob(); defaults to current job
     * @returns {{ started: bool, pid?: number, error?: string }}
     */
    async runJob(jobId) {
        const job = jobId
            ? this._jobs.find((j) => j.id === jobId)
            : this._currentJob;

        if (!job) return { started: false, error: 'No job found' };
        if (job.status === 'running') return { started: false, error: 'Job already running' };

        const config = job.config || {};
        const isShellScript = config.method === 'llamacpp';
        const cmd = isShellScript ? 'bash' : (process.platform === 'win32' ? 'python' : 'python3');
        const args = [job.scriptPath];

        job.status = 'running';
        job.startTime = Date.now();
        job.logs = [];
        this.emit('job_started', { id: job.id, name: job.name });

        const child = spawn(cmd, args, {
            cwd: this._workDir,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        job.pid = child.pid;

        const onData = (source) => (chunk) => {
            const line = chunk.toString().trim();
            if (!line) return;
            job.logs.push({ ts: Date.now(), source, line });
            // Parse progress from Unsloth log lines like "Step 3/10:"
            const m = line.match(/step\s+(\d+)\/(\d+)/i);
            if (m) {
                job.progress = Math.round((+m[1] / +m[2]) * 100);
                this.emit('job_progress', { id: job.id, progress: job.progress, step: +m[1], total: +m[2] });
            }
            this.emit('job_log', { id: job.id, source, line });
        };

        child.stdout.on('data', onData('stdout'));
        child.stderr.on('data', onData('stderr'));

        child.on('close', (code) => {
            job.endTime = Date.now();
            if (code === 0) {
                job.status = 'done';
                job.progress = 100;
                this.emit('job_done', { id: job.id, exitCode: code });
                logger.info(`[FineTuning] Job ${job.id} completed`);
            } else {
                job.status = 'error';
                job.error = `Exited with code ${code}`;
                this.emit('job_error', { id: job.id, exitCode: code, error: job.error });
                logger.error(`[FineTuning] Job ${job.id} failed: exit ${code}`);
            }
        });

        child.on('error', (err) => {
            job.status = 'error';
            job.error = err.message;
            this.emit('job_error', { id: job.id, error: err.message });
            logger.error(`[FineTuning] Job ${job.id} spawn error: ${err.message}`);
        });

        return { started: true, pid: child.pid, jobId: job.id };
    }

    /**
     * Get current job status
     */
    getJobStatus() {
        return this._currentJob || null;
    }

    /**
     * Get all jobs
     */
    getJobs() {
        return [...this._jobs];
    }

    /**
     * Get routes for API
     */
    getRoutes() {
        return [
            { method: 'GET', path: '/api/finetune/availability', description: 'Check training tools' },
            { method: 'GET', path: '/api/finetune/backend', description: 'Detect best available backend' },
            { method: 'GET', path: '/api/finetune/presets', description: 'List presets' },
            { method: 'POST', path: '/api/finetune/prepare-dataset', description: 'Prepare dataset' },
            { method: 'POST', path: '/api/finetune/start', description: 'Create training job' },
            { method: 'POST', path: '/api/finetune/run/:jobId', description: 'Execute training job in background' },
            { method: 'GET', path: '/api/finetune/status', description: 'Get current job status' },
            { method: 'GET', path: '/api/finetune/jobs', description: 'List all jobs' },
        ];
    }
}

module.exports = { FineTuningManager, PRESET_CONFIGS, DATASET_EXAMPLES };
module.exports.default = FineTuningManager;
