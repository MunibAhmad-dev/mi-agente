/**
 * CreativePanel — Face 22-23: Creative Engine.
 *
 * Video generation via FFmpeg (POST /api/creative/video/generate-info)
 * Music generation via MusicGen/Suno (POST /api/creative/music/generate-info)
 */
import React, { useState } from 'react';
import { Sparkles, Film, Music, Loader2, Download, CheckCircle2, XCircle } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { cn } from '~/utils';

interface CreativePanelProps {
  className?: string;
}

async function fetchVideoStatus(): Promise<{ ffmpeg: boolean; ready: boolean }> {
  const res = await fetch('/api/creative/video/status', { credentials: 'include' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchMusicProviders(): Promise<{ providers: string[] }> {
  const res = await fetch('/api/creative/music/providers', { credentials: 'include' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface VideoResult {
  videoPath: string;
  duration?: number;
  fps?: number;
  frameCount?: number;
}

async function generateVideoInfo(payload: {
  prompt: string;
  fps?: number;
  frameCount?: number;
}): Promise<VideoResult> {
  const res = await fetch('/api/creative/video/generate-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface MusicResult {
  provider: string;
  format: string;
  audioPath: string;
  duration?: number;
}

async function generateMusicInfo(payload: {
  prompt: string;
  durationSeconds?: number;
  genre?: string;
}): Promise<MusicResult> {
  const res = await fetch('/api/creative/music/generate-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const CreativePanel: React.FC<CreativePanelProps> = ({ className }) => {
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoFps, setVideoFps] = useState('24');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicGenre, setMusicGenre] = useState('');
  const [musicDuration, setMusicDuration] = useState('30');

  const { data: videoStatus } = useQuery({
    queryKey: ['creative-video-status'],
    queryFn: fetchVideoStatus,
    retry: 1,
  });

  const { data: musicProviders } = useQuery({
    queryKey: ['creative-music-providers'],
    queryFn: fetchMusicProviders,
    retry: 1,
  });

  const videoMut = useMutation({ mutationFn: generateVideoInfo });
  const musicMut = useMutation({ mutationFn: generateMusicInfo });

  return (
    <div className={cn('flex h-full flex-col overflow-y-auto', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <Sparkles size={16} className="text-orange-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Creative Engine</span>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">
          Face 22-23
        </span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        {/* Status row */}
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Film size={12} className="text-gray-500" />
            <span className="text-gray-500">FFmpeg:</span>
            {videoStatus?.ffmpeg
              ? <CheckCircle2 size={12} className="text-green-500" />
              : <XCircle size={12} className="text-red-400" />
            }
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Music size={12} className="text-gray-500" />
            <span className="text-gray-500">Music providers:</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {musicProviders?.providers?.length ? musicProviders.providers.join(', ') : '—'}
            </span>
          </div>
        </div>

        {/* Video generation */}
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Film size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Video Generation</span>
          </div>

          <div className="space-y-2">
            <textarea
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              placeholder="Describe the video you want to generate…"
              rows={3}
              className="w-full resize-none rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">FPS:</label>
              <input
                type="number"
                value={videoFps}
                onChange={(e) => setVideoFps(e.target.value)}
                className="w-16 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                min="1"
                max="60"
              />
              <button
                onClick={() => videoMut.mutate({ prompt: videoPrompt, fps: Number(videoFps) })}
                disabled={videoMut.isLoading || !videoPrompt.trim() || !videoStatus?.ready}
                className="flex items-center gap-1.5 rounded border border-blue-300 bg-blue-100 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {videoMut.isLoading ? <Loader2 size={11} className="animate-spin" /> : <Film size={11} />}
                Generate
              </button>
            </div>
          </div>

          {videoMut.isSuccess && videoMut.data && (
            <div className="mt-2 rounded border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-xs text-green-700 dark:text-green-400">
                Video generated — {videoMut.data.frameCount} frames @ {videoMut.data.fps} fps
              </p>
              <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                {videoMut.data.videoPath}
              </p>
            </div>
          )}
          {videoMut.isError && (
            <p className="mt-1 text-xs text-red-500">{String(videoMut.error)}</p>
          )}
          {!videoStatus?.ready && (
            <p className="mt-1 text-xs text-amber-500">FFmpeg not available — install FFmpeg to enable video generation.</p>
          )}
        </div>

        {/* Music generation */}
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Music size={14} className="text-purple-500" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Music Generation</span>
          </div>

          <div className="space-y-2">
            <textarea
              value={musicPrompt}
              onChange={(e) => setMusicPrompt(e.target.value)}
              placeholder="Describe the music or song you want to generate…"
              rows={3}
              className="w-full resize-none rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-purple-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-500">Genre:</label>
              <input
                value={musicGenre}
                onChange={(e) => setMusicGenre(e.target.value)}
                placeholder="jazz, ambient…"
                className="w-24 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
              <label className="text-xs text-gray-500">Sec:</label>
              <input
                type="number"
                value={musicDuration}
                onChange={(e) => setMusicDuration(e.target.value)}
                className="w-14 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                min="5"
                max="300"
              />
              <button
                onClick={() =>
                  musicMut.mutate({
                    prompt: musicPrompt,
                    genre: musicGenre || undefined,
                    durationSeconds: Number(musicDuration),
                  })
                }
                disabled={musicMut.isLoading || !musicPrompt.trim()}
                className="flex items-center gap-1.5 rounded border border-purple-300 bg-purple-100 px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
              >
                {musicMut.isLoading ? <Loader2 size={11} className="animate-spin" /> : <Music size={11} />}
                Generate
              </button>
            </div>
          </div>

          {musicMut.isSuccess && musicMut.data && (
            <div className="mt-2 rounded border border-purple-200 bg-purple-50 p-2 dark:border-purple-800 dark:bg-purple-900/20">
              <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-400">
                <Download size={11} />
                <span>
                  Generated via <strong>{musicMut.data.provider}</strong> — {musicMut.data.format?.toUpperCase()}
                  {musicMut.data.duration ? ` · ${musicMut.data.duration}s` : ''}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                {musicMut.data.audioPath}
              </p>
            </div>
          )}
          {musicMut.isError && (
            <p className="mt-1 text-xs text-red-500">{String(musicMut.error)}</p>
          )}
        </div>
      </div>
    </div>
  );
};
