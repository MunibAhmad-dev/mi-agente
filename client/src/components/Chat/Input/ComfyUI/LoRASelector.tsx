/**
 * LoRA Selector Component
 * =======================
 * Selector de LoRAs para ComfyUI
 */

import React, { memo } from 'react';
import { Plus, Minus, Layers } from 'lucide-react';
import type { LoRA as LoRAType } from './types';
import { cn } from '~/utils';

interface LoRASelectorProps {
  loras: LoRAType[];
  selectedLoras: LoRAType[];
  onToggle: (lora: LoRAType) => void;
  onUpdateStrength: (loraId: string, strength: number) => void;
}

const LORA_TYPE_COLORS: Record<LoRAType['type'], string> = {
  style: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
  character: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  concept: 'bg-green-500/20 text-green-500 border-green-500/30',
};

const LORA_TYPE_ICONS: Record<LoRAType['type'], string> = {
  style: 'Style',
  character: 'Character',
  concept: 'Concept',
};

function LoRASelector({
  loras,
  selectedLoras,
  onToggle,
  onUpdateStrength,
}: LoRASelectorProps) {
  const [activeType, setActiveType] = React.useState<LoRAType['type'] | 'all'>('all');

  const filteredLoras = React.useMemo(() => {
    if (activeType === 'all') {
      return loras;
    }
    return loras.filter((l) => l.type === activeType);
  }, [loras, activeType]);

  const isSelected = (loraId: string) => {
    return selectedLoras.some((l) => l.id === loraId);
  };

  const getSelectedStrength = (loraId: string) => {
    return selectedLoras.find((l) => l.id === loraId)?.strength ?? 1.0;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Type Filter */}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveType('all')}
          className={cn(
            'rounded-md px-2 py-1 text-xs transition-colors',
            activeType === 'all'
              ? 'bg-surface-hover text-text-primary'
              : 'text-text-secondary hover:bg-surface-secondary',
          )}
        >
          All ({loras.length})
        </button>
        {(['style', 'character', 'concept'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveType(type)}
            className={cn(
              'rounded-md px-2 py-1 text-xs transition-colors',
              activeType === type
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-surface-secondary',
            )}
          >
            {LORA_TYPE_ICONS[type]} ({loras.filter((l) => l.type === type).length})
          </button>
        ))}
      </div>

      {/* LoRA List */}
      {filteredLoras.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-secondary">
          <Layers className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>No LoRAs available</p>
          <p className="mt-1 text-xs">Configure ComfyUI connection first</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredLoras.map((lora) => {
            const selected = isSelected(lora.id);
            const strength = getSelectedStrength(lora.id);

            return (
              <div
                key={lora.id}
                className={cn(
                  'flex items-center justify-between rounded-md border p-2 transition-colors',
                  selected
                    ? 'border-accent-primary bg-accent-primary/10'
                    : 'border-border-medium hover:border-border-heavy',
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggle(lora)}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                      selected
                        ? 'border-accent-primary bg-accent-primary text-white'
                        : 'border-border-medium text-transparent hover:border-border-heavy',
                    )}
                  >
                    {selected && <Plus className="h-3 w-3" />}
                  </button>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">
                      {lora.name}
                    </span>
                    <span
                      className={cn(
                        'inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] uppercase',
                        LORA_TYPE_COLORS[lora.type],
                      )}
                    >
                      {lora.type}
                    </span>
                  </div>
                </div>

                {selected && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateStrength(lora.id, Math.max(0, strength - 0.1))}
                      className="rounded p-1 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-xs text-text-secondary">
                      {strength.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateStrength(lora.id, Math.min(2, strength + 0.1))}
                      className="rounded p-1 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Summary */}
      {selectedLoras.length > 0 && (
        <div className="mt-2 rounded-md border border-border-light bg-surface-secondary p-2">
          <span className="text-xs text-text-secondary">
            {selectedLoras.length} LoRA{selectedLoras.length > 1 ? 's' : ''} selected
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(LoRASelector);
