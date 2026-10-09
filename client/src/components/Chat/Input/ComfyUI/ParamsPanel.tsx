/**
 * Parameters Panel Component
 * ==========================
 * Panel de parámetros para ComfyUI
 */

import React, { memo } from 'react';
import type { ComfyUIParams } from './types';
import { ASPECT_RATIOS } from './models';
import { cn } from '~/utils';

interface ParamsPanelProps {
  params: ComfyUIParams;
  onUpdate: <K extends keyof ComfyUIParams>(key: K, value: ComfyUIParams[K]) => void;
}

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
}

function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
}: SliderInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-sm text-text-secondary">{label}</label>
        <span className="text-sm font-medium text-text-primary">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer rounded-lg bg-surface-tertiary accent-accent-primary"
      />
      <div className="flex justify-between text-[10px] text-text-tertiary">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function ParamsPanel({ params, onUpdate }: ParamsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Generation Quality */}
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium text-text-primary">Quality</h4>
        <SliderInput
          label="Steps"
          value={params.steps}
          min={1}
          max={50}
          onChange={(v) => onUpdate('steps', v)}
        />
        <SliderInput
          label="CFG Scale"
          value={params.cfgScale}
          min={1}
          max={20}
          step={0.5}
          onChange={(v) => onUpdate('cfgScale', v)}
        />
      </div>

      {/* Aspect Ratio */}
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-text-primary">Aspect Ratio</h4>
        <div className="grid grid-cols-3 gap-2">
          {ASPECT_RATIOS.map((ratio) => {
            const isSelected =
              params.width === ratio.width && params.height === ratio.height;
            return (
              <button
                key={ratio.label}
                type="button"
                onClick={() => {
                  onUpdate('width', ratio.width);
                  onUpdate('height', ratio.height);
                }}
                className={cn(
                  'rounded-md border py-2 text-center text-sm transition-colors',
                  isSelected
                    ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                    : 'border-border-medium text-text-secondary hover:border-border-heavy hover:bg-surface-secondary',
                )}
              >
                {ratio.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Batch Size */}
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-text-primary">Batch Size</h4>
        <div className="flex gap-2">
          {[1, 2, 4].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onUpdate('batchSize', size)}
              className={cn(
                'flex-1 rounded-md border py-2 text-center text-sm transition-colors',
                params.batchSize === size
                  ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                  : 'border-border-medium text-text-secondary hover:border-border-heavy hover:bg-surface-secondary',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Negative Prompt */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-primary">Negative Prompt</label>
        <textarea
          value={params.negativePrompt}
          onChange={(e) => onUpdate('negativePrompt', e.target.value)}
          placeholder="What to avoid..."
          className="w-full rounded-md border border-border-medium bg-surface-primary p-2 text-sm focus:outline-none focus:ring-1 focus:ring-border-heavy"
          rows={3}
        />
      </div>

      {/* Resolution Info */}
      <div className="rounded-md bg-surface-secondary p-2">
        <span className="text-xs text-text-secondary">
          Resolution: {params.width} x {params.height} = {(params.width * params.height / 1000000).toFixed(1)} MP
        </span>
      </div>
    </div>
  );
}

export default memo(ParamsPanel);
