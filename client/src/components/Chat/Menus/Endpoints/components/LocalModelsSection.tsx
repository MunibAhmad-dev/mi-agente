import React, { useCallback, useMemo } from 'react';
import { CustomMenu as Menu, CustomMenuSeparator } from '../CustomMenu';
import OllamaIcon from './OllamaIcon';
import LocalModelsPanel, { type LocalModelsCategory } from './LocalModelsPanel';
import { useModelSelectorContext } from '../ModelSelectorContext';

/**
 * LocalModelsSection — acceso a los modelos locales desde el selector de
 * modelos. FASE 18: es un submenú NATIVO del selector (mismo componente
 * CustomMenu que los endpoints): abre hacia la DERECHA siguiendo el patrón
 * visual de los demás submenús, con auto-flip si no hay espacio.
 *
 * Ollama NO aparece como endpoint independiente (se oculta en
 * ModelSelector): aquí vive DENTRO de "Modelos locales", junto a los
 * runtimes headless (llama.cpp, lms CLI, MLX Engine, SDKs lmstudio).
 *
 * FASE 30 — props opcionales para que el selector universal abra el panel
 * pre-filtrado por modalidad (imagen, video, TTS, STT…).
 */
export default function LocalModelsSection({
  initialTab,
  initialCategory,
  label = 'Modelos locales',
  subtitle = 'Ollama · llama.cpp · LM Studio',
  fixedCategory = false,
  showUrlInput = false,
  inline = false,
}: {
  initialTab?: 'installed' | 'explore';
  initialCategory?: LocalModelsCategory;
  label?: string;
  subtitle?: string;
  /** FASE 31 — fija la categoría (oculta los chips) en el Explorar. */
  fixedCategory?: boolean;
  /** FASE 31 — muestra el campo para pegar URL de un proyecto. */
  showUrlInput?: boolean;
  /** FASE 35 — renderiza el panel DIRECTO (sin submenú) para que al elegir
   *  una modalidad se vean al instante las fuentes y resultados. */
  inline?: boolean;
}) {
  const { mappedEndpoints, handleSelectModel } = useModelSelectorContext();

  // El endpoint de Ollama es un endpoint custom cuyo value incluye "ollama".
  const ollamaEndpoint = useMemo(
    () => mappedEndpoints?.find((e) => (e.value || '').toLowerCase().includes('ollama')),
    [mappedEndpoints],
  );

  const handleUseModel = useCallback(
    (providerId: string, modelId: string) => {
      // Solo Ollama tiene endpoint de chat configurado (librechat.yaml); los
      // demás runtimes headless (llama.cpp, lms, mlx…) aún no.
      if (providerId === 'ollama' && ollamaEndpoint) {
        handleSelectModel(ollamaEndpoint, modelId);
      }
    },
    [ollamaEndpoint, handleSelectModel],
  );

  if (inline) {
    return (
      <div className="px-0.5">
        <div className="mb-1 flex items-center gap-2 py-1 text-sm">
          <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-tertiary">
            <OllamaIcon className="size-4 text-text-primary" />
          </div>
          <span className="min-w-0 flex-1 truncate text-left text-text-primary">{label}</span>
          <span className="shrink-0 text-[11px] text-text-secondary">{subtitle}</span>
        </div>
        <LocalModelsPanel
          onUseModel={handleUseModel}
          initialTab={initialTab}
          initialCategory={initialCategory}
          fixedCategory={fixedCategory}
          showUrlInput={showUrlInput}
        />
      </div>
    );
  }

  return (
    <>
      <CustomMenuSeparator />
      <Menu
        label={
          <div className="group flex w-full min-w-0 items-center gap-2 py-1 text-sm">
            <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-tertiary">
              <OllamaIcon className="size-4 text-text-primary" />
            </div>
            <span className="flex-1 truncate text-left text-text-primary">{label}</span>
            <span className="shrink-0 text-[11px] text-text-secondary">{subtitle}</span>
          </div>
        }
      >
        <LocalModelsPanel
          onUseModel={handleUseModel}
          initialTab={initialTab}
          initialCategory={initialCategory}
          fixedCategory={fixedCategory}
          showUrlInput={showUrlInput}
        />
      </Menu>
    </>
  );
}
