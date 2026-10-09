/**
 * Model Selector Component
 * ========================
 * Selector de modelos para ComfyUI
 */

import React, { memo } from 'react';
import { Check, Image } from 'lucide-react';
import type { ComfyUIModel, ModelCategory } from './types';
import { MODEL_CATEGORIES } from './models';
import { cn } from '~/utils';

interface ModelSelectorProps {
  models: ComfyUIModel[];
  selectedModel?: ComfyUIModel;
  onSelect: (model: ComfyUIModel) => void;
}

function ModelSelector({ models, selectedModel, onSelect }: ModelSelectorProps) {
  const [activeCategory, setActiveCategory] = React.useState<ModelCategory | 'all'>('all');

  const filteredModels = React.useMemo(() => {
    if (activeCategory === 'all') {
      return models;
    }
    return models.filter((m) => m.category === activeCategory);
  }, [models, activeCategory]);

  return (
    <div className="flex flex-col gap-3">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={cn(
            'rounded-md px-2 py-1 text-xs transition-colors',
            activeCategory === 'all'
              ? 'bg-surface-hover text-text-primary'
              : 'text-text-secondary hover:bg-surface-secondary',
          )}
        >
          All
        </button>
        {MODEL_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id as ModelCategory)}
            className={cn(
              'rounded-md px-2 py-1 text-xs transition-colors',
              activeCategory === cat.id
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-surface-secondary',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Model Grid */}
      {filteredModels.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-secondary">
          <Image className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>No models available</p>
          <p className="mt-1 text-xs">Configure ComfyUI connection first</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredModels.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => onSelect(model)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors',
                selectedModel?.id === model.id
                  ? 'border-accent-primary bg-accent-primary/10'
                  : 'border-border-medium hover:border-border-heavy hover:bg-surface-secondary',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium text-text-primary">
                  {model.name}
                </span>
                {selectedModel?.id === model.id && (
                  <Check className="h-4 w-4 text-accent-primary" />
                )}
              </div>
              <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] uppercase text-text-secondary">
                {model.category}
              </span>
              {model.description && (
                <span className="line-clamp-1 text-xs text-text-secondary">
                  {model.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(ModelSelector);
