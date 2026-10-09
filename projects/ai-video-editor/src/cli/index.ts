#!/usr/bin/env node

/**
 * AI Creative OS - Command Line Interface
 */

import { Command } from "commander";
import { AICreativeOS } from "../index.js";

const program = new Command();
const os = new AICreativeOS();

program
  .name("ai-creative-os")
  .description("AI Creative OS - Universal Local-First Creative Automation Platform")
  .version("0.1.0");

// ─── Status ──────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show system status")
  .action(async () => {
    await os.initialize();
    const status = os.getStatus();
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║           AI CREATIVE OS - STATUS                ║");
    console.log("╚══════════════════════════════════════════════════╝\n");
    console.log(`  Capabilities:   ${status.capabilities}`);
    console.log(`  Providers:      ${status.providers}`);
    console.log(`  Adapters:       ${status.adapters} total, ${status.installedAdapters} installed`);
    console.log(`  Projects:       ${(status.projects as any).total}`);
    console.log(`  Assets:         ${(status.assets as any).total}`);
    console.log(`  Plugins:        ${status.plugins}`);
    console.log("");
  });

// ─── Detect ──────────────────────────────────────────────────────────────────

program
  .command("detect")
  .description("Detect installed hardware and tools")
  .action(async () => {
    const result = await os.initialize();

    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║         HARDWARE & TOOL DETECTION                ║");
    console.log("╚══════════════════════════════════════════════════╝\n");

    console.log("  Hardware:");
    console.log(`    CPU:    ${result.hardware.cpu.model}`);
    console.log(`    Cores:  ${result.hardware.cpu.cores} cores / ${result.hardware.cpu.threads} threads`);
    console.log(`    RAM:    ${Math.round(result.hardware.totalRAM / (1024 * 1024 * 1024))} GB`);
    for (const gpu of result.hardware.gpus) {
      console.log(`    GPU:    ${gpu.name} (${Math.round(gpu.vram / (1024 * 1024 * 1024))} GB)`);
    }
    console.log(`    CUDA:   ${result.hardware.cudaAvailable}`);
    console.log(`    AI Score: ${result.hardware.aiScore}/100`);

    console.log("\n  Adapters Detected:");
    for (const adapter of result.adapters) {
      const icon = adapter.detected ? "✓" : "✗";
      console.log(`    ${icon} ${adapter.name}${adapter.version ? ` (v${adapter.version})` : ""}`);
    }

    console.log("");
  });

// ─── Create ──────────────────────────────────────────────────────────────────

program
  .command("create <name>")
  .description("Create a new project")
  .action(async (name: string) => {
    await os.initialize();
    const project = os.projects.create({ name });
    console.log(`\n  Project created: ${project.name}`);
    console.log(`  ID: ${project.id}`);
    console.log(`  Status: ${project.status}\n`);
  });

// ─── Projects ────────────────────────────────────────────────────────────────

program
  .command("projects")
  .description("List all projects")
  .action(async () => {
    await os.initialize();
    const projects = os.projects.list();
    console.log("\n  Projects:");
    if (projects.length === 0) {
      console.log("    (none)");
    }
    for (const p of projects) {
      console.log(`    - ${p.name} [${p.status}] (v${p.version})`);
    }
    console.log("");
  });

// ─── Generate ────────────────────────────────────────────────────────────────

program
  .command("generate <intent>")
  .description("Process a creative intent (AI-driven production)")
  .action(async (intent: string) => {
    await os.initialize();
    console.log(`\n  Processing: "${intent}"\n`);

    const session = await os.processCreativeRequest(intent);

    console.log("  Result:");
    console.log(`    Status: ${session.status}`);
    if (session.specification) {
      console.log(`    Platform: ${session.specification.platform}`);
      console.log(`    Duration: ${session.specification.duration / 1000}s`);
      console.log(`    Style: ${session.specification.style}`);
      console.log(`    Pacing: ${session.specification.pacing}`);
      console.log(`    Aspect Ratio: ${session.specification.aspectRatio}`);
    }
    if (session.plan) {
      console.log(`    Graph Nodes: ${session.plan.graph.nodes.length}`);
      console.log(`    Estimated Duration: ${session.plan.estimatedDuration / 1000}s`);
      console.log(`    Parallel Groups: ${session.plan.parallelizableGroups.length}`);
    }
    if (session.errors.length > 0) {
      console.log(`    Warnings: ${session.errors.join(", ")}`);
    }
    console.log("");
  });

// ─── Capabilities ────────────────────────────────────────────────────────────

program
  .command("capabilities")
  .description("List all registered capabilities")
  .option("-d, --domain <domain>", "Filter by domain")
  .action(async (opts: { domain?: string }) => {
    await os.initialize();
    const caps = opts.domain
      ? os.capabilityRegistry.getByDomain(opts.domain as any)
      : os.capabilityRegistry.getAll();

    console.log("\n  Capabilities:");
    for (const cap of caps) {
      console.log(`    [${cap.domain}] ${cap.name} - ${cap.description}`);
      console.log(`      Sub: ${cap.subcapabilities.join(", ")}`);
    }
    console.log(`\n  Total: ${caps.length}\n`);
  });

// ─── Adapters ────────────────────────────────────────────────────────────────

program
  .command("adapters")
  .description("List all adapters and their status")
  .action(async () => {
    await os.initialize();
    const results = await os.adapterRegistry.detectAll();

    console.log("\n  Adapters:");
    for (const r of results) {
      const icon = r.detected ? "✓" : "✗";
      console.log(`    ${icon} ${r.name}${r.version ? ` (v${r.version})` : ""}`);
      if (r.error) console.log(`      Error: ${r.error}`);
    }
    console.log("");
  });

// ─── Analyze Style ───────────────────────────────────────────────────────────

program
  .command("style-analyze")
  .description("Analyze a style from parameters")
  .option("--shot-length <n>", "Average shot length in seconds", "3")
  .option("--cut-freq <n>", "Cut frequency 0-1", "0.5")
  .option("--contrast <n>", "Contrast 0-1", "0.5")
  .action(async (opts: { shotLength: string; cutFreq: string; contrast: string }) => {
    await os.initialize();
    const dna = os.styleAnalyzer.createFromParameters({
      averageShotLength: parseFloat(opts.shotLength),
      cutFrequency: parseFloat(opts.cutFreq),
      contrast: parseFloat(opts.contrast),
    });

    const params = os.styleLearning.styleToParameters(dna);
    console.log("\n  Style Parameters:");
    for (const [key, value] of Object.entries(params)) {
      console.log(`    ${key}: ${value}`);
    }
    console.log("");
  });

// ─── Compare Styles ──────────────────────────────────────────────────────────

program
  .command("style-compare")
  .description("Compare two style profiles")
  .action(async () => {
    await os.initialize();

    const dnaA = os.styleAnalyzer.createFromParameters({ averageShotLength: 1.5, cutFrequency: 0.8, contrast: 0.7 });
    const dnaB = os.styleAnalyzer.createFromParameters({ averageShotLength: 4.0, cutFrequency: 0.3, contrast: 0.4 });

    const comparison = os.styleComparator.compare(dnaA, dnaB);

    console.log("\n  Style Comparison:");
    console.log(`    Overall Score:   ${comparison.overallScore}/100`);
    console.log(`    Pacing Score:    ${comparison.pacingScore}/100`);
    console.log(`    Editing Score:   ${comparison.editingScore}/100`);
    console.log(`    Color Score:     ${comparison.colorScore}/100`);
    console.log(`    Motion Score:    ${comparison.motionScore}/100`);
    console.log(`    Typography:      ${comparison.typographyScore}/100`);
    console.log(`    Audio Score:     ${comparison.audioScore}/100`);
    console.log(`    Narrative Score: ${comparison.narrativeScore}/100`);
    if (comparison.deviations.length > 0) {
      console.log(`    Deviations: ${comparison.deviations.join("; ")}`);
    }
    console.log("");
  });

// ─── Parse Command ───────────────────────────────────────────────────────────

program
  .command("parse <intent>")
  .description("Parse a creative intent into specification")
  .action(async (intent: string) => {
    await os.initialize();
    const { specification, analysis } = await os.creativeCompiler.compile(intent);

    console.log("\n  Intent Analysis:");
    console.log(`    Platform: ${analysis.detectedPlatform}`);
    console.log(`    Duration: ${analysis.detectedDuration / 1000}s`);
    console.log(`    Pacing: ${analysis.detectedPacing}`);
    console.log(`    Style: ${analysis.detectedStyle}`);
    console.log(`    Mood: ${analysis.detectedMood}`);
    console.log(`    Confidence: ${analysis.confidence}%`);
    console.log(`    Keywords: ${analysis.keywords.slice(0, 10).join(", ")}`);
    if (analysis.ambiguities.length > 0) {
      console.log(`    Ambiguities: ${analysis.ambiguities.join("; ")}`);
    }

    console.log("\n  Specification:");
    console.log(`    Resolution: ${specification.resolution.width}x${specification.resolution.height}`);
    console.log(`    Aspect Ratio: ${specification.aspectRatio}`);
    console.log(`    FPS: ${specification.fps}`);
    console.log(`    Scenes: ${specification.storyStructure.scenes.length}`);
    console.log(`    Effects: ${specification.effects.join(", ") || "none"}`);
    console.log("");
  });

// ─── Simulate ────────────────────────────────────────────────────────────────

program
  .command("simulate <intent>")
  .description("Simulate a production run without executing")
  .action(async (intent: string) => {
    await os.initialize();
    const session = await os.processCreativeRequest(intent);

    if (session.plan) {
      const sim = os.workflowExecutor.simulate({ id: "sim", name: "sim", version: "1", nodes: session.plan.graph.nodes as any, edges: session.plan.graph.edges.map(e => ({ from: e.from, fromPort: "out", to: e.to, toPort: "in" })) as any, provider: "", models: [], inputs: [], outputs: [], hardware: {}, license: { softwareLicense: "unknown" as any, softwareLicenseScope: "unknown" as any, commercialUse: true, redistribution: false, modification: false }, dependencies: [], quality: 0, speed: 0, status: "planned" as any });
      console.log("\n  Simulation:");
      console.log(`    Valid: ${sim.valid}`);
      console.log(`    Estimated Time: ${sim.estimatedTime / 1000}s`);
      console.log(`    VRAM Required: ${Math.round(sim.vramRequired / (1024 * 1024 * 1024))} GB`);
      console.log(`    RAM Required: ${Math.round(sim.ramRequired / (1024 * 1024 * 1024))} GB`);
      if (sim.risks.length > 0) console.log(`    Risks: ${sim.risks.join(", ")}`);

      console.log("\n  Production Graph:");
      const levels = os.productionGraph.getExecutionOrder(session.plan.graph);
      for (let i = 0; i < levels.length; i++) {
        const levelNames = levels[i].map((id) => {
          const node = session.plan!.graph.nodes.find((n) => n.id === id);
          return node?.name ?? id;
        });
        console.log(`    Stage ${i + 1}: ${levelNames.join(" → ")}`);
      }
    }
    console.log("");
  });

// ─── Models ─────────────────────────────────────────────────────────────────

program
  .command("models")
  .description("List all registered AI models")
  .action(async () => {
    await os.initialize();
    const models = os.modelManager.getAll();
    console.log("\n  Models:");
    for (const m of models) {
      const icon = m.status === "ready" ? "✓" : m.status === "missing" ? "✗" : "○";
      const vram = Math.round(m.vramRequired / (1024 ** 3));
      console.log(`    ${icon} ${m.name} [${m.family}] - ${vram}GB VRAM`);
      console.log(`      Quantizations: ${m.quantizations.join(", ")}`);
      console.log(`      Status: ${m.status}, License: ${m.license}`);
    }
    console.log(`\n  Total: ${models.length}\n`);
  });

// ─── Tasks ───────────────────────────────────────────────────────────────────

program
  .command("tasks")
  .description("List all managed tasks")
  .action(async () => {
    await os.initialize();
    const tasks = os.taskManager.getAll();
    console.log("\n  Tasks:");
    if (tasks.length === 0) { console.log("    (none)"); }
    for (const t of tasks) {
      const icon = t.status === "completed" ? "✓" : t.status === "failed" ? "✗" : t.status === "running" ? "▶" : "○";
      console.log(`    ${icon} ${t.name} [${t.status}] ${t.progress}%`);
    }
    console.log(`\n  Total: ${tasks.length}\n`);
  });

// ─── Workflows ───────────────────────────────────────────────────────────────

program
  .command("workflows")
  .description("List all registered workflows")
  .action(async () => {
    await os.initialize();
    const wfs = os.workflowManager.getAll();
    console.log("\n  Workflows:");
    if (wfs.length === 0) { console.log("    (none)"); }
    for (const wf of wfs) {
      console.log(`    - ${wf.name} [${wf.status}] (${wf.provider})`);
      console.log(`      Models: ${wf.models.join(", ") || "none"}`);
      console.log(`      Completed: ${wf.tasksCompleted}, Failed: ${wf.tasksFailed}`);
    }
    console.log(`\n  Total: ${wfs.length}\n`);
  });

// ─── Catalog ─────────────────────────────────────────────────────────────────

program
  .command("catalog")
  .description("List workflow catalog (The_frizzy1 workflows)")
  .action(async () => {
    await os.initialize();
    const wfs = os.catalog.getAll();
    console.log("\n  Workflow Catalog:");
    for (const wf of wfs) {
      console.log(`    - ${wf.name} (${wf.family}/${wf.mode}) [${wf.variant}]`);
      console.log(`      VRAM: ${Math.round(wf.minVRAM / (1024 ** 3))}GB min, ${Math.round(wf.recommendedVRAM / (1024 ** 3))}GB recommended`);
    }
    console.log(`\n  Total: ${wfs.length}\n`);
  });

// ─── Color ───────────────────────────────────────────────────────────────────

program
  .command("color-analyze <path>")
  .description("Analyze color properties of a video/image")
  .action(async (path: string) => {
    await os.initialize();
    const analysis = await os.color.analyzeColor(path);
    if (!analysis) { console.log("  Failed to analyze."); return; }
    console.log("\n  Color Analysis:");
    console.log(`    Brightness: ${analysis.avgBrightness.toFixed(1)}/255`);
    console.log(`    Contrast:   ${(analysis.avgContrast * 100).toFixed(1)}%`);
    console.log(`    Temperature: ${analysis.colorTemperature}`);
    console.log(`    Dynamic Range: ${analysis.dynamicRange}`);
    console.log(`    Score: ${analysis.score}/100`);
    console.log("");
  });

// ─── Thumbnail ───────────────────────────────────────────────────────────────

program
  .command("thumbnail <video> [output]")
  .description("Extract best thumbnail from video")
  .option("-s, --strategy <strategy>", "Extraction strategy", "best_scene")
  .option("-n, --count <n>", "Number of candidates", "10")
  .action(async (video: string, output: string | undefined, opts: { strategy: string; count: string }) => {
    await os.initialize();
    const outPath = output ?? video.replace(/\.[^.]+$/, ".thumb.jpg");
    const result = await os.thumbnail.extractBest(video, outPath, {
      strategy: opts.strategy as any,
      maxCandidates: parseInt(opts.count),
    });
    if (result) {
      console.log(`\n  Best thumbnail:`);
      console.log(`    Path: ${result.path}`);
      console.log(`    Time: ${result.timestamp.toFixed(2)}s`);
      console.log(`    Score: ${result.score.overall}/100 (sharpness: ${result.score.sharpness}, color: ${result.score.colorfulness})`);
    } else {
      console.log("  Failed to extract thumbnail.");
    }
    console.log("");
  });

// ─── OCR ─────────────────────────────────────────────────────────────────────

program
  .command("ocr <path>")
  .description("Detect text in a video or image")
  .option("-l, --lang <lang>", "Language", "eng")
  .option("-m, --max-frames <n>", "Max frames to analyze", "20")
  .action(async (path: string, opts: { lang: string; maxFrames: string }) => {
    await os.initialize();
    const available = await os.ocr.isAvailable();
    if (!available) { console.log("  Tesseract not installed. Install: apt install tesseract-ocr"); return; }
    const analysis = await os.ocr.analyzeVideo(path, {
      language: opts.lang,
      maxFrames: parseInt(opts.maxFrames),
    });
    console.log("\n  OCR Results:");
    console.log(`    Frames analyzed: ${analysis.frames.length}`);
    console.log(`    Texts detected: ${analysis.totalTextDetected}`);
    console.log(`    Unique texts: ${analysis.uniqueTexts.length}`);
    console.log(`    Avg confidence: ${(analysis.avgConfidence * 100).toFixed(1)}%`);
    for (const entry of analysis.timeline.slice(0, 10)) {
      console.log(`    [${entry.time.toFixed(1)}s] ${entry.text} (${(entry.confidence * 100).toFixed(0)}%)`);
    }
    console.log("");
  });

// ─── Caption Learn ───────────────────────────────────────────────────────────

program
  .command("caption-learn <video>")
  .description("Learn caption style from a reference video")
  .action(async (video: string) => {
    await os.initialize();
    const style = await os.captionLearning.learnFromVideo(video);
    if (!style) { console.log("  No caption style detected."); return; }
    console.log("\n  Caption Style Learned:");
    console.log(`    Name: ${style.name}`);
    console.log(`    Font: ${style.fontFamily} (${style.fontFamilyCategory})`);
    console.log(`    Size: ${style.fontSizeRange.typical}px (${style.fontSizeRange.min}-${style.fontSizeRange.max})`);
    console.log(`    Animation: ${style.animation.type}`);
    console.log(`    Position: ${style.positioning.vertical}/${style.positioning.horizontal}`);
    console.log(`    Confidence: ${(style.confidence * 100).toFixed(1)}%`);
    console.log(`    Occurrences: ${style.occurrences}`);
    console.log("");
  });

// ─── Quality ─────────────────────────────────────────────────────────────────

program
  .command("quality <path>")
  .description("Evaluate quality of a video/image")
  .action(async (path: string) => {
    await os.initialize();
    const report = os.quality.evaluateVideo(path);
    if (!report) { console.log("  Failed to evaluate."); return; }
    console.log("\n  Quality Report:");
    console.log(`    Overall: ${report.overall}/100`);
    for (const issue of report.issues) {
      console.log(`    [${issue.severity}] ${issue.description} (${issue.suggestion ?? 'no suggestion'})`);
    }
    console.log("");
  });

// ─── Cache Stats ─────────────────────────────────────────────────────────────

program
  .command("cache")
  .description("Show cache statistics")
  .action(async () => {
    await os.initialize();
    const stats = os.cache.getStats();
    console.log("\n  Cache Statistics:");
    console.log(`    Total entries: ${stats.totalEntries}`);
    console.log(`    Total size: ${(stats.totalSize / (1024 * 1024)).toFixed(1)} MB`);
    console.log(`    Hits: ${stats.hits}, Misses: ${stats.misses}, Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    for (const [namespace, nsStats] of Object.entries(stats.byNamespace)) {
      console.log(`    ${namespace}: ${nsStats.entries} items, ${(nsStats.size / (1024 * 1024)).toFixed(1)} MB`);
    }
    console.log("");
  });

// ─── Run ─────────────────────────────────────────────────────────────────────

program.parse();
