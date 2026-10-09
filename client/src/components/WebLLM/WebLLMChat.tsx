/**
 * WebLLMChat — runs LLM inference directly in the browser via WebGPU.
 * Uses @mlc-ai/web-llm; falls back gracefully if WebGPU is unavailable.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Cpu, Loader2, MessageSquare, Send, Wifi, WifiOff } from 'lucide-react';
import { cn } from '~/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  name: string;
  size: string;
  params: string;
  tier: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type EngineState = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

interface Props {
  className?: string;
}

// ── Helper: check WebGPU ──────────────────────────────────────────────────────

function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

// ── Main component ────────────────────────────────────────────────────────────

export function WebLLMChat({ className }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const engineRef = useRef<unknown>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const webgpuAvailable = hasWebGPU();

  // Fetch model list from server
  useEffect(() => {
    window
      .fetch('/api/webllm/config')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.models?.length) {
          setModels(data.models);
          setSelectedModel(data.models[0]?.id ?? '');
        }
      })
      .catch(() => {});
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadEngine = useCallback(async () => {
    if (!webgpuAvailable) {
      setError('WebGPU is not available in this browser. Try Chrome 113+ on a supported GPU.');
      setEngineState('error');
      return;
    }
    if (!selectedModel) return;
    setEngineState('loading');
    setLoadProgress(0);
    setError('');
    try {
      // Dynamic import so the rest of the app doesn't load WebLLM eagerly
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const engine = await CreateWebWorkerMLCEngine(
        new Worker(new URL('@mlc-ai/web-llm/lib/web-worker.js', import.meta.url), {
          type: 'module',
        }),
        selectedModel,
        {
          initProgressCallback: (info: { progress: number }) => {
            setLoadProgress(Math.round((info.progress ?? 0) * 100));
          },
        },
      );
      engineRef.current = engine;
      setEngineState('ready');
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load model');
      setEngineState('error');
    }
  }, [selectedModel, webgpuAvailable]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || engineState !== 'ready' || !engineRef.current) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setEngineState('generating');

    try {
      const engine = engineRef.current as {
        chat: { completions: { create: (opts: unknown) => Promise<{ choices: { message: { content: string } }[] }> } };
      };
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const result = await engine.chat.completions.create({ messages: history, stream: false });
      const reply = result.choices[0]?.message?.content ?? '';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError((err as Error).message ?? 'Inference error');
    } finally {
      setEngineState('ready');
    }
  }, [input, messages, engineState]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">WebLLM</span>
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            In-browser
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {webgpuAvailable ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500">
              <Wifi size={10} /> WebGPU
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-red-400">
              <WifiOff size={10} /> No WebGPU
            </span>
          )}
        </div>
      </div>

      {/* Model selector + load button */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <select
          value={selectedModel}
          onChange={(e) => {
            setSelectedModel(e.target.value);
            engineRef.current = null;
            setEngineState('idle');
            setMessages([]);
          }}
          disabled={engineState === 'loading' || engineState === 'generating'}
          className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.size})
            </option>
          ))}
          {!models.length && <option value="">Loading models…</option>}
        </select>
        <button
          onClick={loadEngine}
          disabled={!selectedModel || engineState === 'loading' || engineState === 'generating' || !webgpuAvailable}
          className={cn(
            'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
            engineState === 'ready'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-indigo-500 text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {engineState === 'loading' ? (
            <><Loader2 size={11} className="animate-spin" /> {loadProgress}%</>
          ) : engineState === 'ready' ? (
            <><Cpu size={11} /> Ready</>
          ) : (
            'Load'
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && engineState !== 'error' && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-gray-400">
            <MessageSquare size={28} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs">
              {engineState === 'ready'
                ? 'Model ready — type a message below'
                : 'Select a model and click Load to start'}
            </p>
          </div>
        )}
        {error && (
          <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed',
              msg.role === 'user'
                ? 'ml-auto bg-indigo-500 text-white'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
            )}
          >
            {msg.content}
          </div>
        ))}
        {engineState === 'generating' && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Loader2 size={10} className="animate-spin" /> Generating…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-gray-200 px-3 py-2 dark:border-gray-700">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={engineState !== 'ready'}
          placeholder={engineState === 'ready' ? 'Message…' : 'Load a model first'}
          rows={1}
          className="flex-1 resize-none rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 disabled:opacity-50"
          style={{ maxHeight: '80px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || engineState !== 'ready'}
          className="rounded bg-indigo-500 p-1.5 text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

export default WebLLMChat;
