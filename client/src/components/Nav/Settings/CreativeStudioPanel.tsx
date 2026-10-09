import React, { useState, useEffect, useRef } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Music,
  Video,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  Mic,
  Film,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * CreativeStudioPanel — Face 22-23: Universal Creative Engine.
 * Video generation (FFmpeg + image pipeline) and music generation
 * (HuggingFace MusicGen / Suno) — Settings → AI → Creative Studio.
 */

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
  } catch { /* ignore */ }
  try { return localStorage.getItem('token'); } catch { return null; }
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res;
}

type Mode = 'video' | 'music';

interface Provider { name: string; model: string; priority: number; free: boolean }
interface VideoStatus { ffmpeg: boolean; ready: boolean }

export default function CreativeStudioPanel() {
  const [mode, setMode] = useState<Mode>('video');
  const [prompt, setPrompt] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [genre, setGenre] = useState('');
  const [fps, setFps] = useState(12);
  const [frameCount, setFrameCount] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<VideoStatus | null>(null);
  const [musicProviders, setMusicProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    apiFetch('/api/creative/video/status').then(r => r.json()).then(setVideoStatus).catch(() => {});
    apiFetch('/api/creative/music/providers').then(r => r.json()).then(d => {
      setMusicProviders(d.providers || []);
      if (d.providers?.length) setSelectedProvider(d.providers[0].name);
    }).catch(() => {});
    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); };
  }, []);

  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    setAudioUrl(null);
    setInfo(null);
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }

    try {
      if (mode === 'video') {
        const res = await apiFetch('/api/creative/video/generate', {
          method: 'POST',
          body: JSON.stringify({ prompt, frameCount, fps }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setVideoUrl(url);
      } else {
        const res = await apiFetch('/api/creative/music/generate', {
          method: 'POST',
          body: JSON.stringify({ prompt, durationSeconds, genre: genre || undefined, provider: selectedProvider || undefined }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setAudioUrl(url);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function generateInfo() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const endpoint = mode === 'video' ? '/api/creative/video/generate-info' : '/api/creative/music/generate-info';
      const body = mode === 'video'
        ? { prompt, frameCount, fps }
        : { prompt, durationSeconds, genre: genre || undefined, provider: selectedProvider || undefined };
      const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      setInfo(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const ready = mode === 'video' ? videoStatus?.ready : musicProviders.length > 0;
  const notReady = mode === 'video'
    ? 'FFmpeg not found on server. Install it: apt-get install ffmpeg / brew install ffmpeg'
    : 'No music provider configured. Set HUGGINGFACE_TOKEN or SUNO_API_KEY in .env';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Film className="h-5 w-5 text-purple-500" />
        <h3 className="text-base font-semibold text-token-text-primary">Creative Studio</h3>
        <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-500">
          Face 22–23
        </span>
      </div>

      {/* Mode selector */}
      <div className="flex rounded-lg border border-token-border-medium overflow-hidden">
        {(['video', 'music'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors',
              mode === m
                ? 'bg-purple-500 text-white'
                : 'bg-token-surface-secondary text-token-text-secondary hover:bg-token-surface-tertiary',
            )}
          >
            {m === 'video' ? <Video className="h-4 w-4" /> : <Music className="h-4 w-4" />}
            {m === 'video' ? 'Video Generation' : 'Music Generation'}
          </button>
        ))}
      </div>

      {/* Status indicator */}
      <div className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        ready === true ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : ready === false ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
          : 'border-token-border-medium bg-token-surface-secondary text-token-text-secondary',
      )}>
        {ready === true ? <CheckCircle className="h-4 w-4" /> : ready === false ? <XCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        {ready === true ? (mode === 'video' ? 'FFmpeg ready — video generation available' : `${musicProviders.length} provider(s) configured`)
          : ready === false ? notReady
          : 'Checking availability...'}
      </div>

      {/* Music provider selector */}
      {mode === 'music' && musicProviders.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-token-text-primary">Provider</label>
          <div className="flex gap-2">
            {musicProviders.map(p => (
              <button
                key={p.name}
                onClick={() => setSelectedProvider(p.name)}
                className={cn(
                  'flex items-center gap-1 rounded border px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedProvider === p.name
                    ? 'border-purple-500 bg-purple-500/15 text-purple-600 dark:text-purple-400'
                    : 'border-token-border-medium text-token-text-secondary hover:border-purple-500/50',
                )}
              >
                <Mic className="h-3 w-3" />
                {p.name} — {p.model} {p.free && <span className="ml-1 text-emerald-500">free</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-token-text-primary">
          {mode === 'video' ? 'Video Prompt' : 'Music Prompt'}
        </label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={mode === 'video'
            ? 'A futuristic cityscape at night, neon lights reflecting on rain-wet streets...'
            : 'An upbeat electronic track with piano melody, 120 BPM, energetic...'}
          rows={3}
          className="w-full rounded-lg border border-token-border-medium bg-token-surface-primary px-3 py-2 text-sm text-token-text-primary placeholder-token-text-tertiary focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-2 gap-3">
        {mode === 'video' ? (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-token-text-secondary">Frames</label>
              <input type="number" min={6} max={120} value={frameCount} onChange={e => setFrameCount(Number(e.target.value))}
                className="w-full rounded border border-token-border-medium bg-token-surface-primary px-2 py-1.5 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-token-text-secondary">FPS</label>
              <input type="number" min={6} max={30} value={fps} onChange={e => setFps(Number(e.target.value))}
                className="w-full rounded border border-token-border-medium bg-token-surface-primary px-2 py-1.5 text-sm" />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-token-text-secondary">Duration (sec)</label>
              <input type="number" min={5} max={300} value={durationSeconds} onChange={e => setDurationSeconds(Number(e.target.value))}
                className="w-full rounded border border-token-border-medium bg-token-surface-primary px-2 py-1.5 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-token-text-secondary">Genre (optional)</label>
              <input type="text" value={genre} onChange={e => setGenre(e.target.value)} placeholder="jazz, lo-fi, epic..."
                className="w-full rounded border border-token-border-medium bg-token-surface-primary px-2 py-1.5 text-sm" />
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Generate &amp; Stream
        </button>
        <button
          onClick={generateInfo}
          disabled={loading || !prompt.trim()}
          className="flex items-center gap-1.5 rounded-lg border border-token-border-medium px-3 py-2 text-sm text-token-text-secondary hover:bg-token-surface-secondary disabled:opacity-50 transition-colors"
          title="Generate and return metadata (no download)"
        >
          Info only
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Video result */}
      {videoUrl && (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Video generated</span>
            <a href={videoUrl} download="generated-video.mp4" className="flex items-center gap-1 rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
              <Download className="h-3 w-3" /> Download MP4
            </a>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={videoUrl} controls className="w-full rounded" style={{ maxHeight: 240 }} />
        </div>
      )}

      {/* Audio result */}
      {audioUrl && (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Music generated</span>
            <a href={audioUrl} download="generated-music.mp3" className="flex items-center gap-1 rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
              <Download className="h-3 w-3" /> Download
            </a>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audioUrl} controls className="w-full" />
        </div>
      )}

      {/* Info result */}
      {info && (
        <div className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3 text-xs font-mono text-token-text-secondary overflow-x-auto">
          <pre>{JSON.stringify(info, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
