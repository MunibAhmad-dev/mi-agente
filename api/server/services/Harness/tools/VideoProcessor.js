/**
 * VideoProcessor.js — Real FFmpeg video processing
 * 
 * Uses FFmpeg for actual video operations:
 * - Convert formats (mp4, webm, avi, mov, gif)
 * - Extract frames
 * - Compress videos
 * - Add watermarks
 * - Trim/cut videos
 * - Generate thumbnails
 * - Concat videos
 * - Extract audio
 * - Apply filters
 */

const { execFileSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const logger = {
    debug: (...args) => console.log('[VideoProcessor]', ...args),
    info: (...args) => console.info('[VideoProcessor]', ...args),
    warn: (...args) => console.warn('[VideoProcessor]', ...args),
    error: (...args) => console.error('[VideoProcessor]', ...args),
};

class VideoProcessor {
    constructor(config = {}) {
        this._name = 'VideoProcessor';
        this._ffmpegPath = config.ffmpegPath || 'ffmpeg';
        this._ffprobePath = config.ffprobePath || 'ffprobe';
        this._tempDir = config.tempDir || path.join(process.cwd(), 'tmp', 'video');
        this._outputDir = config.outputDir || path.join(process.cwd(), 'output', 'video');
        
        // Ensure dirs exist
        try { fs.mkdirSync(this._tempDir, { recursive: true }); } catch (e) {}
        try { fs.mkdirSync(this._outputDir, { recursive: true }); } catch (e) {}
        
        this._available = this._checkFFmpeg();
    }

    _checkFFmpeg() {
        try {
            execFileSync(this._ffmpegPath, ['-version'], { stdio: 'pipe', timeout: 5000 });
            logger.info('[VideoProcessor] FFmpeg available');
            return true;
        } catch (e) {
            logger.warn('[VideoProcessor] FFmpeg not found — video processing will use fallback');
            return false;
        }
    }

    isAvailable() { return this._available; }

    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'video_convert',
                    description: 'Convert video from one format to another (mp4, webm, avi, mov, gif, mkv)',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            outputFormat: { type: 'string', description: 'Target format: mp4, webm, avi, mov, gif, mkv', enum: ['mp4', 'webm', 'avi', 'mov', 'gif', 'mkv'] },
                            quality: { type: 'string', description: 'Quality: low, medium, high, lossless', enum: ['low', 'medium', 'high', 'lossless'] },
                        },
                        required: ['inputPath', 'outputFormat'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_trim',
                    description: 'Trim a video to a specific time range',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            startTime: { type: 'string', description: 'Start time (HH:MM:SS or seconds)' },
                            endTime: { type: 'string', description: 'End time (HH:MM:SS or seconds)' },
                        },
                        required: ['inputPath', 'startTime', 'endTime'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_compress',
                    description: 'Compress a video to reduce file size',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            targetSize: { type: 'string', description: 'Target size (e.g., "50MB", "100MB")' },
                            crf: { type: 'number', description: 'Constant Rate Factor (18-28, lower = better quality)' },
                        },
                        required: ['inputPath'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_thumbnail',
                    description: 'Extract thumbnail frames from a video',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            count: { type: 'number', description: 'Number of thumbnails to extract' },
                            interval: { type: 'string', description: 'Time interval between thumbnails (e.g., "00:00:10")' },
                        },
                        required: ['inputPath'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_extract_audio',
                    description: 'Extract audio track from a video',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            format: { type: 'string', description: 'Audio format: mp3, wav, aac, flac, ogg', enum: ['mp3', 'wav', 'aac', 'flac', 'ogg'] },
                        },
                        required: ['inputPath'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_info',
                    description: 'Get detailed information about a video file',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                        },
                        required: ['inputPath'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_to_gif',
                    description: 'Convert a video segment to an animated GIF',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            startTime: { type: 'string', description: 'Start time (HH:MM:SS)' },
                            duration: { type: 'string', description: 'Duration (HH:MM:SS)' },
                            fps: { type: 'number', description: 'Frame rate for GIF (default 10)' },
                            width: { type: 'number', description: 'Output width in pixels' },
                        },
                        required: ['inputPath'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_concat',
                    description: 'Concatenate multiple videos into one',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPaths: { type: 'array', items: { type: 'string' }, description: 'List of video paths to join in order' },
                            outputFormat: { type: 'string', description: 'Output format (default: mp4)' },
                        },
                        required: ['inputPaths'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_watermark',
                    description: 'Add a watermark (text or image) to a video',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            text: { type: 'string', description: 'Text watermark' },
                            imagePath: { type: 'string', description: 'Image watermark path' },
                            position: { type: 'string', description: 'Position: top-left, top-right, bottom-left, bottom-right, center' },
                        },
                        required: ['inputPath'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'video_frames_extract',
                    description: 'Extract all frames from a video as individual images',
                    parameters: {
                        type: 'object',
                        properties: {
                            inputPath: { type: 'string', description: 'Path to input video' },
                            outputDir: { type: 'string', description: 'Output directory for frames' },
                            fps: { type: 'number', description: 'Frames per second to extract' },
                        },
                        required: ['inputPath'],
                    },
                },
            },
        ];
    }

    async execute(toolName, params, context = {}) {
        if (!this._available) {
            return { success: false, error: 'FFmpeg not installed. Install from https://ffmpeg.org/download.html' };
        }
        
        switch (toolName) {
            case 'video_convert': return this.convert(params);
            case 'video_trim': return this.trim(params);
            case 'video_compress': return this.compress(params);
            case 'video_thumbnail': return this.thumbnail(params);
            case 'video_extract_audio': return this.extractAudio(params);
            case 'video_info': return this.info(params);
            case 'video_to_gif': return this.toGif(params);
            case 'video_concat': return this.concat(params);
            case 'video_watermark': return this.watermark(params);
            case 'video_frames_extract': return this.extractFrames(params);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    async convert(params) {
        const { inputPath, outputFormat, quality = 'medium' } = params;
        const inp = this._safePath(inputPath);
        const outputPath = this._outputPath(inp, outputFormat);
        const crfMap = { low: '28', medium: '23', high: '18', lossless: '0' };
        const presetMap = { low: 'fast', medium: 'medium', high: 'slow', lossless: 'veryslow' };
        const crf = crfMap[quality] || '23';
        const preset = presetMap[quality] || 'medium';
        const args = outputFormat === 'gif'
            ? [this._ffmpegPath, '-i', inp, '-vf', 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-loop', '0', outputPath]
            : [this._ffmpegPath, '-i', inp, '-c:v', 'libx264', '-crf', crf, '-preset', preset, '-c:a', 'aac', outputPath];
        return this._run(args, outputPath);
    }

    async trim(params) {
        const { inputPath, startTime, endTime } = params;
        const inp = this._safePath(inputPath);
        const ext = path.extname(inp).slice(1) || 'mp4';
        const outputPath = this._outputPath(inp, ext, '_trimmed');
        // Validate time format: HH:MM:SS or seconds
        const timeRe = /^[\d:.]+$/;
        if (startTime && !timeRe.test(startTime)) return { success: false, error: 'Invalid startTime' };
        if (endTime && !timeRe.test(endTime)) return { success: false, error: 'Invalid endTime' };
        const args = [this._ffmpegPath, '-i', inp];
        if (startTime) args.push('-ss', startTime);
        if (endTime) args.push('-to', endTime);
        args.push('-c', 'copy', outputPath);
        return this._run(args, outputPath);
    }

    async compress(params) {
        const { inputPath, crf = 23 } = params;
        const inp = this._safePath(inputPath);
        const ext = path.extname(inp).slice(1) || 'mp4';
        const outputPath = this._outputPath(inp, ext, '_compressed');
        const safeCrf = String(Math.min(51, Math.max(0, parseInt(crf, 10) || 23)));
        return this._run(
            [this._ffmpegPath, '-i', inp, '-c:v', 'libx264', '-crf', safeCrf, '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k', outputPath],
            outputPath
        );
    }

    async thumbnail(params) {
        const { inputPath, count = 1, interval } = params;
        const inp = this._safePath(inputPath);
        const outDir = path.join(this._outputDir, 'thumbnails_' + Date.now());
        fs.mkdirSync(outDir, { recursive: true });
        const safeCount = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
        const vfArg = interval
            ? `fps=1/${Math.max(1, parseInt(interval, 10) || 10)}`
            : `fps=1/${safeCount + 1}`;
        try {
            execFileSync(this._ffmpegPath,
                ['-i', inp, '-vf', vfArg, '-vframes', String(safeCount), `${outDir}/thumb_%03d.jpg`],
                { stdio: 'pipe', timeout: 60000 }
            );
            const files = fs.readdirSync(outDir).filter(f => f.endsWith('.jpg'));
            return { success: true, thumbnails: files.map(f => path.join(outDir, f)), count: files.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async extractAudio(params) {
        const { inputPath, format = 'mp3' } = params;
        const inp = this._safePath(inputPath);
        const outputPath = this._outputPath(inp, format, '_audio');
        const codecMap = { mp3: 'libmp3lame', wav: 'pcm_s16le', aac: 'aac', flac: 'flac', ogg: 'libvorbis' };
        const codec = codecMap[format] || 'libmp3lame';
        return this._run([this._ffmpegPath, '-i', inp, '-vn', '-c:a', codec, outputPath], outputPath);
    }

    async info(params) {
        const { inputPath } = params;
        const inp = this._safePath(inputPath);
        try {
            const output = execFileSync(this._ffprobePath,
                ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inp],
                { stdio: 'pipe', timeout: 10000 }
            );
            return { success: true, info: JSON.parse(output.toString()) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async toGif(params) {
        const { inputPath, startTime = '00:00:00', duration = '00:00:05', fps = 10, width = 480 } = params;
        const inp = this._safePath(inputPath);
        const outputPath = this._outputPath(inp, 'gif', '_anim');
        const timeRe = /^[\d:.]+$/;
        if (!timeRe.test(startTime) || !timeRe.test(duration)) return { success: false, error: 'Invalid time value' };
        const safeFps = Math.min(60, Math.max(1, parseInt(fps, 10) || 10));
        const safeWidth = Math.min(1920, Math.max(64, parseInt(width, 10) || 480));
        const vf = `fps=${safeFps},scale=${safeWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
        return this._run(
            [this._ffmpegPath, '-ss', startTime, '-t', duration, '-i', inp, '-vf', vf, '-loop', '0', outputPath],
            outputPath
        );
    }

    async concat(params) {
        const { inputPaths, outputFormat = 'mp4' } = params;
        const listFile = path.join(this._tempDir, `concat_${Date.now()}.txt`);
        const outputPath = this._outputPath(this._safePath(inputPaths[0]), outputFormat, '_concat');
        // Write a concat list — paths go into a file, not into shell args
        const content = inputPaths.map(p => `file '${this._safePath(p).replace(/'/g, "'\\''")}'`).join('\n');
        fs.writeFileSync(listFile, content, 'utf-8');
        try {
            const result = this._run(
                [this._ffmpegPath, '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath],
                outputPath
            );
            try { fs.unlinkSync(listFile); } catch (e2) {}
            return result;
        } catch (e) {
            try { fs.unlinkSync(listFile); } catch (e2) {}
            return { success: false, error: e.message };
        }
    }

    async watermark(params) {
        const { inputPath, text, imagePath, position = 'bottom-right' } = params;
        const inp = this._safePath(inputPath);
        const ext = path.extname(inp).slice(1) || 'mp4';
        const outputPath = this._outputPath(inp, ext, '_watermarked');
        const posMap = {
            'top-left': 'x=20:y=20',
            'top-right': 'x=main_w-text_w-20:y=20',
            'bottom-left': 'x=20:y=main_h-text_h-20',
            'bottom-right': 'x=main_w-text_w-20:y=main_h-text_h-20',
            'center': 'x=(main_w-text_w)/2:y=(main_h-text_h)/2',
        };
        if (text) {
            // Strip chars that break ffmpeg drawtext filter syntax
            const safeText = String(text).replace(/[':]/g, '');
            const pos = posMap[position] || posMap['bottom-right'];
            const vf = `drawtext=text='${safeText}':fontsize=24:fontcolor=white:${pos}:shadowcolor=black:shadowx=2:shadowy=2`;
            return this._run([this._ffmpegPath, '-i', inp, '-vf', vf, '-c:a', 'copy', outputPath], outputPath);
        } else if (imagePath) {
            const imgp = this._safePath(imagePath);
            const overlayMap = {
                'top-left': 'overlay=20:20',
                'top-right': 'overlay=main_w-overlay_w-20:20',
                'bottom-left': 'overlay=20:main_h-overlay_h-20',
                'bottom-right': 'overlay=main_w-overlay_w-20:main_h-overlay_h-20',
                'center': 'overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2',
            };
            const fc = overlayMap[position] || overlayMap['bottom-right'];
            return this._run([this._ffmpegPath, '-i', inp, '-i', imgp, '-filter_complex', fc, '-c:a', 'copy', outputPath], outputPath);
        } else {
            return { success: false, error: 'Provide text or imagePath for watermark' };
        }
    }

    async extractFrames(params) {
        const { inputPath, outputDir, fps = 1 } = params;
        const inp = this._safePath(inputPath);
        const outDir = outputDir ? this._safePath(outputDir) : path.join(this._outputDir, 'frames_' + Date.now());
        fs.mkdirSync(outDir, { recursive: true });
        const safeFps = Math.min(60, Math.max(0.01, parseFloat(fps) || 1));
        try {
            execFileSync(this._ffmpegPath,
                ['-i', inp, '-vf', `fps=${safeFps}`, `${outDir}/frame_%06d.png`],
                { stdio: 'pipe', timeout: 300000 }
            );
            const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
            return { success: true, frames: files.map(f => path.join(outDir, f)), count: files.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ── Helpers ────────────────────────────────────

    _outputPath(inputPath, ext, suffix = '') {
        const base = path.basename(inputPath, path.extname(inputPath));
        return path.join(this._outputDir, `${base}${suffix}.${ext}`);
    }

    /**
     * Resolve a caller-supplied path and ensure it is an absolute path
     * with no null bytes. Does NOT restrict to a specific directory because
     * video files may legitimately live anywhere on the server, but it
     * prevents null-byte injection and normalizes the path so it cannot
     * break shell quoting used in ffmpeg filter strings.
     */
    _safePath(p) {
        if (!p || typeof p !== 'string') throw new Error('Invalid path');
        if (p.includes('\0')) throw new Error('Path contains null byte');
        return path.resolve(p);
    }

    /** Run ffmpeg/ffprobe with a structured args array — no shell interpolation. */
    _run(args, outputPath) {
        const cmd = args[0];
        const rest = args.slice(1);
        try {
            execFileSync(cmd, rest, { stdio: 'pipe', timeout: 120000 });
            const stats = outputPath ? fs.statSync(outputPath) : null;
            return {
                success: true,
                outputPath,
                size: stats ? stats.size : null,
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

module.exports = { VideoProcessor };
module.exports.default = VideoProcessor;
