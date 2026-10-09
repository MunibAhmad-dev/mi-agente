'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * VideoGenerator — Face 14: script-based video generation.
 *
 * Attempts real ffmpeg rendering when ffmpeg is available.
 * Falls back to a structured JSON manifest for downstream pipelines when not.
 *
 * All user-supplied values are passed as separate args to execFileSync —
 * never interpolated into a shell string (no injection).
 */
class VideoGenerator {
  constructor({ outputDir = '/tmp/videos', fps = 30, resolution = '1280x720' } = {}) {
    this.outputDir = outputDir;
    this.fps = Math.min(60, Math.max(1, parseInt(fps, 10) || 30));
    this.resolution = /^\d+x\d+$/.test(resolution) ? resolution : '1280x720';
    this._ffmpegPath = this._detectFfmpeg();
    this._jobs = new Map();
    this._stats = { generated: 0, failed: 0, ffmpegUsed: 0, manifestFallback: 0 };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async generate(opts = {}) {
    const { title = 'Untitled', script = [], durationSec = 60, format = 'mp4' } = opts;
    const safeFormat = /^(mp4|webm|gif|avi)$/.test(format) ? format : 'mp4';
    const jobId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const job = {
      id: jobId,
      title,
      script,
      durationSec,
      format: safeFormat,
      fps: this.fps,
      resolution: this.resolution,
      status: 'processing',
      createdAt: new Date().toISOString(),
    };
    this._jobs.set(jobId, job);

    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      // Attempt real ffmpeg render when available
      if (this._ffmpegPath) {
        const videoPath = await this._renderWithFfmpeg(job);
        job.status = 'complete';
        job.outputPath = videoPath;
        this._stats.generated++;
        this._stats.ffmpegUsed++;
        return { success: true, jobId, outputPath: videoPath, rendered: true };
      }

      // Fallback: write structured manifest for downstream video pipelines
      const manifest = this._buildManifest(job);
      const outPath = path.join(this.outputDir, `${jobId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

      job.status = 'complete';
      job.outputPath = outPath;
      this._stats.generated++;
      this._stats.manifestFallback++;
      return { success: true, jobId, outputPath: outPath, manifest, rendered: false, note: 'ffmpeg not found — manifest produced for downstream renderer' };
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      this._stats.failed++;
      return { success: false, jobId, error: err.message };
    }
  }

  async generateFromScript(scriptText, options = {}) {
    const scenes = this._parseScript(scriptText);
    return this.generate({ ...options, script: scenes });
  }

  async exportManifest(jobId, destPath) {
    const job = this._jobs.get(jobId);
    if (!job) return null;
    const manifest = this._buildManifest(job);
    await fs.promises.writeFile(destPath, JSON.stringify(manifest, null, 2));
    return { jobId, destPath, sceneCount: manifest.scenes.length };
  }

  // ── ffmpeg rendering ──────────────────────────────────────────────────────

  /**
   * Render a slideshow-style video: one black frame with text per scene.
   * Uses ffmpeg's lavfi + drawtext filter — no external image files needed.
   */
  async _renderWithFfmpeg(job) {
    const [width, height] = this.resolution.split('x').map(Number);
    const outPath = path.join(this.outputDir, `${job.id}.${job.format}`);
    const totalDur = Math.max(1, job.durationSec);
    const scenes = job.script || [];
    const sceneDur = scenes.length > 0 ? (totalDur / scenes.length).toFixed(2) : String(totalDur);

    // Build filtergraph: one black video segment per scene with drawtext
    if (scenes.length === 0) {
      // No scenes — generate a plain black clip with the title
      const text = job.title.replace(/'/g, '').replace(/:/g, '').slice(0, 60);
      execFileSync(this._ffmpegPath, [
        '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${totalDur}:r=${this.fps}`,
        '-vf', `drawtext=text='${text}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2`,
        '-t', String(totalDur), '-y', outPath,
      ], { stdio: 'pipe', timeout: 60000 });
      return outPath;
    }

    // Multi-scene: concat segments
    const segmentPaths = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const segPath = path.join(this.outputDir, `${job.id}_seg${i}.${job.format}`);
      const rawText = (scene.content || scene.type || `Scene ${i + 1}`).slice(0, 80);
      const safeText = rawText.replace(/'/g, '').replace(/:/g, '').replace(/\n/g, ' ');
      execFileSync(this._ffmpegPath, [
        '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${sceneDur}:r=${this.fps}`,
        '-vf', `drawtext=text='${safeText}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2`,
        '-t', sceneDur, '-y', segPath,
      ], { stdio: 'pipe', timeout: 60000 });
      segmentPaths.push(segPath);
    }

    // Write concat list
    const listPath = path.join(this.outputDir, `${job.id}_list.txt`);
    fs.writeFileSync(listPath, segmentPaths.map((p) => `file '${p}'`).join('\n'));

    execFileSync(this._ffmpegPath, [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c', 'copy', '-y', outPath,
    ], { stdio: 'pipe', timeout: 120000 });

    // Cleanup segments + list
    for (const sp of segmentPaths) try { fs.unlinkSync(sp); } catch {}
    try { fs.unlinkSync(listPath); } catch {}

    return outPath;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _detectFfmpeg() {
    const candidates = ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
    for (const cmd of candidates) {
      try {
        execFileSync(cmd, ['-version'], { stdio: 'pipe', timeout: 3000 });
        return cmd;
      } catch {}
    }
    return null;
  }

  _parseScript(text) {
    if (!text) return [];
    return text.split(/\n{2,}/).map((block, i) => ({
      index: i,
      type: block.startsWith('NARRATOR') ? 'narration' : 'scene',
      content: block.trim(),
      durationSec: Math.max(2, Math.ceil(block.split(' ').length / 150) * 10),
    }));
  }

  _buildManifest(job) {
    return {
      id: job.id,
      title: job.title,
      format: job.format,
      fps: job.fps,
      resolution: job.resolution,
      totalDurationSec: job.durationSec,
      scenes: (job.script || []).map((scene, i) => ({
        index: i,
        ...scene,
        startSec: i * (job.durationSec / Math.max(job.script.length, 1)),
      })),
      ffmpegAvailable: !!this._ffmpegPath,
      metadata: { generator: 'VideoGenerator', version: '2.0.0', builtAt: new Date().toISOString() },
    };
  }

  getJob(jobId) {
    return this._jobs.get(jobId) || null;
  }

  getStats() {
    return { ...this._stats, totalJobs: this._jobs.size, outputDir: this.outputDir, ffmpegPath: this._ffmpegPath || 'not found' };
  }
}

module.exports = VideoGenerator;
