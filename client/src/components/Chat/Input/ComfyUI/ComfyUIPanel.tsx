/**
 * ComfyUI Panel Component
 * ========================
 * Panel principal del sistema de ventanas de ComfyUI
 */

import React, { memo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import type { PopoverStore } from '@ariakit/react';
import {
  X,
  Wand2,
  Loader2,
  Palette,
  Layers,
  Settings2,
  Check,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useComfyUI } from './useComfyUI';
import ModelSelector from './ModelSelector';
import LoRASelector from './LoRASelector';
import ParamsPanel from './ParamsPanel';
import { cn } from '~/utils';

interface ComfyUIPanelProps {
  popoverStore: PopoverStore;
}

const TABS = [
  { key: 'models', label: 'models', Icon: Palette },
  { key: 'loras', label: 'loras', Icon: Layers },
  { key: 'params', label: 'params', Icon: Settings2 },
] as const;

function ComfyUIPanel({ popoverStore }: ComfyUIPanelProps) {
  const localize = useLocalize();
  const {
    params,
    activeTab,
    isGenerating,
    progress,
    selectedModel,
    selectedLoras,
    canGenerate,
    setMode,
    selectModel,
    toggleLora,
    updateLoraStrength,
    updateParam,
    generate,
    reset,
    setActiveTab,
  } = useComfyUI();

  const handleGenerate = useCallback(() => {
    generate();
  }, [generate]);

  const handleClose = useCallback(() => {
    popoverStore.hide();
  }, [popoverStore]);

  return (
    <div className="flex w-[500px] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {localize('comfyui_title') ?? 'ComfyUI Generation'}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2 border-b border-border-light px-4 py-2">
        {(['text2img', 'img2img', 'inpaint', 'video'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setMode(mode)}
            className={cn(
              'rounded-md px-3 py-1 text-sm transition-colors',
              params.mode === mode
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
            )}
          >
            {mode === 'text2img' && 'T2I'}
            {mode === 'img2img' && 'I2I'}
            {mode === 'inpaint' && 'Paint'}
            {mode === 'video' && 'Video'}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-light px-4 py-2">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              activeTab === key
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
            )}
          >
            <Icon className="h-4 w-4" />
            {localize(`comfyui_${label}`) ?? label}
            {key === 'loras' && selectedLoras.length > 0 && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-primary text-[10px] text-white">
                {selectedLoras.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto p-4">
        {activeTab === 'models' && (
          <ModelSelector
            models={[]}
            selectedModel={selectedModel}
            onSelect={selectModel}
          />
        )}
        {activeTab === 'loras' && (
          <LoRASelector
            loras={[]}
            selectedLoras={selectedLoras}
            onToggle={toggleLora}
            onUpdateStrength={updateLoraStrength}
          />
        )}
        {activeTab === 'params' && (
          <ParamsPanel
            params={params}
            onUpdate={updateParam}
          />
        )}
      </div>

      {/* Selected Summary */}
      {selectedModel && (
        <div className="border-t border-border-light px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-text-secondary">Model:</span>
            <span className="font-medium text-text-primary">{selectedModel.name}</span>
          </div>
          {selectedLoras.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedLoras.map((lora) => (
                <span
                  key={lora.id}
                  className="rounded bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary"
                >
                  {lora.name}
                  {lora.strength !== 1 && ` (${lora.strength})`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border-light p-4">
        <div className="mb-3">
          <textarea
            value={params.prompt}
            onChange={(e) => updateParam('prompt', e.target.value)}
            placeholder={
              localize('comfyui_prompt_placeholder') ??
              'Describe what you want to generate...'
            }
            className="w-full rounded-md border border-border-medium bg-surface-primary p-2 text-sm focus:outline-none focus:ring-1 focus:ring-border-heavy"
            rows={3}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border-medium bg-surface-primary px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {localize('comfyui_reset') ?? 'Reset'}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              canGenerate
                ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
                : 'bg-surface-secondary text-text-tertiary cursor-not-allowed',
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress}%
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                {localize('comfyui_generate') ?? 'Generate'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ComfyUIPanel);
