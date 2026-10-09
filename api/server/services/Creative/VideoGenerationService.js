'use strict';

/**
 * VideoGenerationService — Face 22-23: AI Video Generation.
 *
 * Pipeline:
 *   1. Derive N keyframe prompts from the main prompt (or use caller-supplied keyframes[])
 *   2. Generate each frame as a PNG via ImageRuntime (HuggingFace SDXL / DALL-E Mini / mock)
 *   3. Stitch frames into an MP4 with FFmpeg at the requested fps
 *
 * Requirements:
 *   - FFmpeg on PATH (apt-get install ffmpeg / brew install ffmpeg)
 *   - HUGGINGFACE_TOKEN env var for real images (falls back to placeholder frames in dev)
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const logger = {
  info: (...a) => console.log('[VideoGenService]', ...a),
  warn: (...a) => console.warn('[VideoGenService]', ...a),
  error: (...a) => console.error('[VideoGenService]', ...a),
};

// Minimal 1×1 black PNG — FFmpeg scales it to the requested resolution.
// Used as placeholder when ImageRuntime is in mock/dev mode.
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Check if FFmpeg is available on PATH. */
function isFFmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Lazy-load ImageRuntime singleton. */
function _getImageRuntime() {
  const { getImageRuntime } = require('~/server/services/ImageRuntime/ImageRuntime');
  return getImageRuntime();
}

/**
 * Derive N distinct keyframe prompts from a single main prompt.
 * Adds cinematic modifiers so each frame gets a slightly different perspective.
 */
function deriveKeyframes(prompt, count) {
  const modifiers = [
    'wide establishing shot,',
    'medium shot,',
    'close-up detail,',
    'overhead aerial view,',
    'low angle shot,',
    'golden hour lighting,',
    'dramatic angle,',
    'final scene,',
  ];
  return Array.from({ length: count }, (_, i) => `${modifiers[i % modifiers.length]} ${prompt}`);
}

/**
 * Generate a short video from a text prompt.
 *
 * @param {object} opts
 * @param {string}   opts.prompt         - main scene description
 * @param {string[]} [opts.keyframes]    - per-frame prompts (overrides prompt + frameCount)
 * @param {number}   [opts.frameCount=6] - frames to generate when using prompt
 * @param {number}   [opts.fps=1]        - output video frame rate
 * @param {number}   [opts.width=512]    - frame width (px)
 * @param {number}   [opts.height=512]   - frame height (px)
 * @param {string}   [opts.outputDir]    - directory to write temp frames + video
 * @returns {Promise<{videoPath, frames, duration, fps, frameCount, workDir}>}
 */
async function generateVideo(opts = {}) {
  if (!isFFmpegAvailable()) {
    throw new Error(
      'FFmpeg not found. Install it: apt-get install ffmpeg (Linux) / brew install ffmpeg (Mac)',
    );
  }

  const {
    prompt, keyframes, frameCount = 6,
    fps = 1, width = 512, height = 512, outputDir,
  } = opts;

  // Validate numeric inputs to prevent argument injection
  const safeFps = Math.max(1, Math.min(60, Number(fps) || 1));
  const safeWidth = Math.max(64, Math.min(3840, Number(width) || 512));
  const safeHeight = Math.max(64, Math.min(2160, Number(height) || 512));

  if (!prompt && (!keyframes || !keyframes.length)) {
    throw new Error('prompt or keyframes required');
  }

  const frames = keyframes?.length ? keyframes : deriveKeyframes(prompt, frameCount);
  const workDir = outputDir || path.join(os.tmpdir(), `mi-video-${crypto.randomUUID()}`);
  fs.mkdirSync(workDir, { recursive: true });

  logger.info(`Generating ${frames.length} frames @ ${fps}fps for: "${(prompt || frames[0]).slice(0, 60)}..."`);

  const ir = _getImageRuntime();
  const framePaths = [];

  for (let i = 0; i < frames.length; i++) {
    const framePrompt = frames[i];
    const frameFile = path.join(workDir, `frame-${String(i).padStart(4, '0')}.png`);
    logger.info(`  Frame ${i + 1}/${frames.length}: "${framePrompt.slice(0, 60)}"`);

    try {
      const result = await ir.execute({ intent: 'generate', prompt: framePrompt, options: { width, height } });

      if (result.base64) {
        fs.writeFileSync(frameFile, Buffer.from(result.base64, 'base64'));
      } else if (result.imageUrl?.startsWith('data:')) {
        fs.writeFileSync(frameFile, Buffer.from(result.imageUrl.split(',')[1], 'base64'));
      } else {
        // Mock / dev mode: write placeholder
        fs.writeFileSync(frameFile, PLACEHOLDER_PNG);
      }
    } catch (imgErr) {
      logger.warn(`Frame ${i} generation failed (${imgErr.message}), using placeholder`);
      fs.writeFileSync(frameFile, PLACEHOLDER_PNG);
    }

    framePaths.push(frameFile);
  }

  // Stitch frames into MP4 with FFmpeg — structured args, no shell injection
  const videoPath = path.join(workDir, 'output.mp4');
  const framePattern = path.join(workDir, 'frame-%04d.png');

  // scale + pad ensures output is exactly W×H regardless of placeholder size
  const vf = `scale=${safeWidth}:${safeHeight}:force_original_aspect_ratio=decrease,pad=${safeWidth}:${safeHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

  logger.info('Stitching frames with FFmpeg...');
  execFileSync('ffmpeg', [
    '-y',
    '-framerate', String(safeFps),
    '-i', framePattern,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-vf', vf,
    videoPath,
  ], { stdio: 'pipe' });

  const duration = frames.length / safeFps;
  logger.info(`Video ready: ${videoPath} (${duration}s)`);

  return { videoPath, frames: framePaths, duration, fps: safeFps, frameCount: frames.length, workDir };
}

module.exports = { generateVideo, isFFmpegAvailable, deriveKeyframes };
