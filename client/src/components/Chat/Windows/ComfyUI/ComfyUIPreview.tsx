import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wand2,
  Settings,
  Image,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Play,
  Square,
  Eye,
  Layers,
  Sliders,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import './ComfyUIPreview.css';

export interface ComfyUIGeneration {
  id: string;
  prompt: string;
  model: string;
  loras: Array<{ name: string; strength: number }>;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress?: number;
  images?: string[];
  error?: string;
  createdAt: Date;
}

export interface ComfyUIPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  generation?: ComfyUIGeneration;
  onGenerate?: (params: ComfyUIGeneration) => void;
  onCancel?: () => void;
  className?: string;
}

export const ComfyUIPreview: React.FC<ComfyUIPreviewProps> = ({
  isOpen,
  onClose,
  generation,
  onGenerate,
  onCancel,
  className,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('sd_xl_base_1.0');
  const [loras, setLoras] = useState<Array<{ name: string; strength: number }>>([]);
  const [steps, setSteps] = useState(20);
  const [cfg, setCfg] = useState(7);
  const [seed, setSeed] = useState(-1);
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const localize = useLocalize();

  const models = [
    { id: 'sd_xl_base_1.0', name: 'SDXL 1.0', type: 'base' },
    { id: 'sd_1.5', name: 'Stable Diffusion 1.5', type: 'base' },
    { id: 'sd_1.5_vae', name: 'SD 1.5 + VAE', type: 'base' },
  ];

  const availableLoras = [
    { id: 'detail_enhancer', name: 'Detail Enhancer', strength: 1.0 },
    { id: 'anime_style', name: 'Anime Style', strength: 0.8 },
    { id: 'realistic_vision', name: 'Realistic Vision', strength: 0.7 },
    { id: 'pixel_art', name: 'Pixel Art', strength: 0.6 },
  ];

  const resolutions = [
    { width: 512, height: 512, label: '512x512' },
    { width: 768, height: 768, label: '768x768' },
    { width: 512, height: 768, label: 'Portrait' },
    { width: 768, height: 512, label: 'Landscape' },
    { width: 1024, height: 1024, label: '1K Square' },
  ];

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setProgress(0);
    
    const generationParams = {
      id: `gen_${Date.now()}`,
      prompt,
      negativePrompt,
      model: selectedModel,
      loras,
      steps,
      cfg,
      seed,
      width,
      height,
      status: 'queued' as const,
      createdAt: new Date().toISOString(),
    } as unknown as ComfyUIGeneration;
    
    onGenerate?.(generationParams);
  }, [prompt, negativePrompt, selectedModel, loras, steps, cfg, seed, width, height, onGenerate]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setProgress(0);
    onCancel?.();
  }, [onCancel]);

  // Update progress from generation
  useEffect(() => {
    if (generation) {
      setProgress(generation.progress || 0);
      if (generation.status === 'completed') {
        setIsGenerating(false);
      } else if (generation.status === 'failed') {
        setIsGenerating(false);
      }
    }
  }, [generation]);

  const addLora = (loraId: string) => {
    const lora = availableLoras.find(l => l.id === loraId);
    if (lora && !loras.find(l => l.name === loraId)) {
      setLoras([...loras, { name: loraId, strength: lora.strength }]);
    }
  };

  const removeLora = (loraId: string) => {
    setLoras(loras.filter(l => l.name !== loraId));
  };

  const updateLoraStrength = (loraId: string, strength: number) => {
    setLoras(loras.map(l => l.name === loraId ? { ...l, strength } : l));
  };

  if (!isOpen) return null;

  return (
    <div className={cn('comfyui-preview', className)}>
      {/* Header */}
      <div className="preview-header">
        <div className="header-title">
          <Wand2 size={18} />
          <span>{localize('com_ui_comfyui') || 'ComfyUI'}</span>
        </div>
        <button className="close-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Prompt Input */}
      <div className="prompt-section">
        <textarea
          className="prompt-input"
          placeholder={localize('com_ui_prompt_placeholder') || 'Describe your image...'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <textarea
          className="negative-prompt-input"
          placeholder={localize('com_ui_negative_prompt') || 'Negative prompt (optional)...'}
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={2}
        />
      </div>

      {/* Model Selection */}
      <div className="setting-section">
        <div className="setting-label">
          <Image size={14} />
          <span>{localize('com_ui_model') || 'Model'}</span>
        </div>
        <select
          className="model-select"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      {/* LoRAs */}
      <div className="setting-section">
        <div className="setting-label">
          <Layers size={14} />
          <span>{localize('com_ui_loras') || 'LoRAs'}</span>
        </div>
        <div className="loras-list">
          {loras.map(lora => {
            const loraInfo = availableLoras.find(l => l.id === lora.name);
            return (
              <div key={lora.name} className="lora-tag">
                <span>{loraInfo?.name || lora.name}</span>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={lora.strength}
                  onChange={(e) => updateLoraStrength(lora.name, parseFloat(e.target.value))}
                />
                <span>{lora.strength.toFixed(1)}</span>
                <button onClick={() => removeLora(lora.name)}>×</button>
              </div>
            );
          })}
          <select
            className="lora-add"
            value=""
            onChange={(e) => addLora(e.target.value)}
          >
            <option value="">+ {localize('com_ui_add_lora') || 'Add LoRA'}</option>
            {availableLoras
              .filter(l => !loras.find(lora => lora.name === l.id))
              .map(lora => (
                <option key={lora.id} value={lora.id}>{lora.name}</option>
              ))}
          </select>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <button
        className="settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
      >
        <Sliders size={14} />
        <span>{localize('com_ui_advanced_settings') || 'Advanced Settings'}</span>
        {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Advanced Settings */}
      {showSettings && (
        <div className="advanced-settings">
          {/* Resolution */}
          <div className="setting-row">
            <span className="setting-label">{localize('com_ui_resolution') || 'Resolution'}</span>
            <div className="resolution-grid">
              {resolutions.map(res => (
                <button
                  key={res.label}
                  className={cn('resolution-btn', width === res.width && height === res.height && 'active')}
                  onClick={() => {
                    setWidth(res.width);
                    setHeight(res.height);
                  }}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="setting-row">
            <span className="setting-label">{localize('com_ui_steps') || 'Steps'}: {steps}</span>
            <input
              type="range"
              min="1"
              max="50"
              value={steps}
              onChange={(e) => setSteps(parseInt(e.target.value))}
            />
          </div>

          {/* CFG */}
          <div className="setting-row">
            <span className="setting-label">{localize('com_ui_cfg') || 'CFG'}: {cfg}</span>
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={cfg}
              onChange={(e) => setCfg(parseFloat(e.target.value))}
            />
          </div>

          {/* Seed */}
          <div className="setting-row">
            <span className="setting-label">{localize('com_ui_seed') || 'Seed'}</span>
            <input
              type="number"
              className="seed-input"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
              placeholder="-1 for random"
            />
            <button
              className="random-seed-btn"
              onClick={() => setSeed(Math.floor(Math.random() * 999999999999999))}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {isGenerating && (
        <div className="progress-section">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="progress-text">
            {localize('com_ui_generating') || 'Generating'}... {Math.round(progress * 100)}%
          </span>
        </div>
      )}

      {/* Generated Image */}
      {generation?.images && generation.images.length > 0 && (
        <div className="generated-images">
          {generation.images.map((img, idx) => (
            <div key={idx} className="image-container">
              <img src={img} alt={`Generated ${idx + 1}`} />
              <div className="image-actions">
                <button title={localize('com_ui_download') || 'Download'}>
                  <Download size={14} />
                </button>
                <button title={localize('com_ui_preview') || 'Preview'}>
                  <Eye size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {generation?.status === 'failed' && (
        <div className="error-message">
          {generation.error || localize('com_ui_generation_failed') || 'Generation failed'}
        </div>
      )}

      {/* Generate Button */}
      <div className="action-buttons">
        {isGenerating ? (
          <button className="cancel-btn" onClick={handleCancel}>
            <Square size={16} />
            <span>{localize('com_ui_cancel') || 'Cancel'}</span>
          </button>
        ) : (
          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={!prompt.trim()}
          >
            <Play size={16} />
            <span>{localize('com_ui_generate') || 'Generate'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ComfyUIPreview;
