import React, { useMemo, useState } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { getConfigDefaults } from 'librechat-data-provider';
import type { ModelSelectorProps } from '~/common';
import {
  renderModelSpecs,
  renderEndpoints,
  renderSearchResults,
  renderCustomGroups,
} from './components';
import LocalModelsSection from './components/LocalModelsSection';
import type { LocalModelsCategory } from './components/LocalModelsPanel';
import UniversalAiSection, {
  type Modality,
  CATEGORY_FOR_MODALITY,
  MODALITY_VALUES,
} from './components/UniversalAiSection';
import { ModelSelectorProvider, useModelSelectorContext } from './ModelSelectorContext';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { ModelSelectorChatProvider } from './ModelSelectorChatContext';
import { getSelectedIcon, getDisplayValue } from './utils';
import { CustomMenu as Menu, CustomMenuSeparator } from './CustomMenu';
import DialogManager from './DialogManager';
import { useLocalize } from '~/hooks';

const defaultInterface = getConfigDefaults().interface;

/**
 * FASE 18 — Ollama NO es una categoría independiente del selector: es un
 * proveedor DENTRO de "Modelos locales". Se oculta el endpoint custom
 * "Ollama (local)" de la lista principal y de la búsqueda (sigue vivo en
 * mappedEndpoints para que el botón "Usar" del panel funcione).
 */
const isLocalEndpointValue = (value?: string) =>
  Boolean(value && value.toLowerCase().includes('ollama'));

function ModelSelectorContent() {
  const localize = useLocalize();
  const modelSelectorHint = useShortcutHint('openModelSelector', localize('com_ui_select_model'));
  const modelSelectorAriaKey = useShortcutAriaKey('openModelSelector');

  const {
    // LibreChat
    agentsMap,
    modelSpecs,
    mappedEndpoints,
    endpointsConfig,
    // State
    searchValue,
    searchResults,
    selectedValues,
    // Functions
    setSearchValue,
    setSelectedValues,
    // Dialog
    keyDialogOpen,
    onOpenChange,
    keyDialogEndpoint,
  } = useModelSelectorContext();

  const selectedIcon = useMemo(
    () =>
      getSelectedIcon({
        mappedEndpoints: mappedEndpoints ?? [],
        selectedValues,
        modelSpecs,
        endpointsConfig,
      }),
    [mappedEndpoints, selectedValues, modelSpecs, endpointsConfig],
  );
  const selectedDisplayValue = useMemo(
    () =>
      getDisplayValue({
        localize,
        agentsMap,
        modelSpecs,
        selectedValues,
        mappedEndpoints,
      }),
    [localize, agentsMap, modelSpecs, selectedValues, mappedEndpoints],
  );

  /** FASE 31/34 — modalidad de IA elegida en el selector universal (controla
   *  qué se muestra debajo). Se persiste en localStorage; la lista de valores
   *  válidos es extensible (MODALITY_VALUES). */
  const [aiModality, setAiModality] = useState<Modality>(() => {
    try {
      const saved = localStorage.getItem('universal-ai-modality');
      if (saved && MODALITY_VALUES.has(saved)) {
        return saved as Modality;
      }
    } catch { /* ignore */ }
    return 'todo';
  });
  const changeModality = (m: Modality) => {
    setAiModality(m);
    try {
      localStorage.setItem('universal-ai-modality', m);
    } catch { /* ignore */ }
  };
  /** Modelos locales: se muestran en Todo y en Texto/LLM. */
  const showLlmBlock = aiModality === 'todo' || aiModality === 'texto';
  /** FASE 46 — los proveedores LLM (specs + endpoints + grupos) se muestran
   *  en «Todo» bajo «Modelos de texto (LLM)» y en «Texto / LLM» bajo
   *  «Proveedores LLM». El usuario pidió que la sección de LLM aparezca en
   *  ambos, con el nombre adecuado a cada contexto. */
  const showLlmProviders = aiModality === 'todo' || aiModality === 'texto';

  /** Etiquetas por categoría del panel Explorar (FASE 34). */
  const CATEGORY_LABELS: Record<string, { label: string; subtitle: string }> = {
    imagen: { label: 'Modelos de imagen', subtitle: 'generación y edición' },
    video: { label: 'Modelos de video', subtitle: 'generación y animación' },
    animacion: { label: 'Modelos de animación', subtitle: 'video y movimiento' },
    voz: { label: 'Modelos de voz (TTS)', subtitle: 'texto a voz' },
    stt: { label: 'Modelos de voz (STT)', subtitle: 'transcripción' },
    audio: { label: 'Modelos de audio', subtitle: 'voz, efectos y música' },
    musica: { label: 'Modelos de música', subtitle: 'música y sonido' },
    '3d': { label: 'Modelos 3D', subtitle: 'generación 3D' },
    vision: { label: 'Modelos de visión', subtitle: 'comprensión de imágenes' },
    embeddings: { label: 'Modelos de embeddings', subtitle: 'representaciones vectoriales' },
    reranking: { label: 'Modelos de reranking', subtitle: 'ordenar resultados' },
    ocr: { label: 'Modelos OCR', subtitle: 'texto desde imágenes' },
    traduccion: { label: 'Modelos de traducción', subtitle: 'traducción automática' },
    codigo: { label: 'Modelos de código', subtitle: 'generación y análisis de código' },
    agentes: { label: 'Modelos de agentes', subtitle: 'agentes de IA' },
    robotica: { label: 'Modelos de robótica', subtitle: 'control y visión robótica' },
    multimodal: { label: 'Modelos multimodales', subtitle: 'texto + imagen + audio' },
  };

  /** Cada modalidad no-LLM abre el panel local pre-filtrado por categoría. */
  const modalityBlock = (() => {
    if (aiModality === 'todo' || aiModality === 'texto') {
      return null;
    }
    const category = CATEGORY_FOR_MODALITY[aiModality];
    if (!category) {
      return null;
    }
    const meta = CATEGORY_LABELS[category] ?? {
      label: `Modelos de ${aiModality}`,
      subtitle: 'explorar e instalar',
    };
    return { category, label: meta.label, subtitle: meta.subtitle };
  })();

  const trigger = (
    <TooltipAnchor
      aria-label={localize('com_ui_select_model')}
      description={modelSelectorHint}
      render={
        <button
          data-testid="model-selector-button"
          aria-keyshortcuts={modelSelectorAriaKey}
          className="my-1 flex h-9 w-full max-w-[70vw] items-center justify-center gap-2 rounded-xl border border-border-light bg-presentation px-3 py-2 text-sm text-text-primary hover:bg-surface-active-alt"
          aria-label={localize('com_ui_select_model')}
        >
          {selectedIcon && React.isValidElement(selectedIcon) && (
            <div className="flex flex-shrink-0 items-center justify-center overflow-hidden">
              {selectedIcon}
            </div>
          )}
          <span className="flex-grow truncate text-left">{selectedDisplayValue}</span>
        </button>
      }
    />
  );

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-2">
      <Menu
        values={selectedValues}
        onValuesChange={(values: Record<string, any>) => {
          setSelectedValues({
            endpoint: values.endpoint || '',
            model: values.model || '',
            modelSpec: values.modelSpec || '',
          });
        }}
        onSearch={(value) => setSearchValue(value)}
        combobox={<input id="model-search" placeholder=" " />}
        comboboxLabel={localize('com_endpoint_search_models')}
        trigger={trigger}
      >
        {searchResults ? (
          renderSearchResults(
            (searchResults ?? []).filter(
              (item) => !('value' in item && isLocalEndpointValue(item.value)),
            ),
            localize,
            searchValue,
          )
        ) : (
          <>
            {/* FASE 34 — MODELOS LOCALES ARRIBA del selector (prioridad máxima):
                se abre en INSTALADOS (lo que ya tienes: motores + modelos con
                Borrar) con pestaña Explorar para descubrir/instalar. */}
            {showLlmBlock && (
              <LocalModelsSection
                fixedCategory
                initialCategory="llm"
                label="Modelos locales"
                subtitle="Instalados · Explorar"
                showUrlInput
              />
            )}
            {/* IA Universal — chips de modalidad extensibles + runtimes por tipo.
                El contenido inferior cambia según la modalidad elegida. */}
            <UniversalAiSection modality={aiModality} onModalityChange={changeModality} />
            {showLlmProviders && (
              <>
                <CustomMenuSeparator />
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                  {aiModality === 'todo' ? 'Modelos de texto (LLM)' : 'Proveedores LLM'}
                </div>
                {/* Render ungrouped modelSpecs (no group field) */}
                {renderModelSpecs(
                  modelSpecs?.filter((spec) => !spec.group) || [],
                  selectedValues.modelSpec || '',
                )}
                {/* Render endpoints (will include grouped specs matching endpoint names) */}
                {renderEndpoints(
                  (mappedEndpoints ?? []).filter((e) => !isLocalEndpointValue(e.value)),
                )}
                {/* Render custom groups (specs with group field not matching any endpoint) */}
                {renderCustomGroups(modelSpecs || [], mappedEndpoints ?? [])}
              </>
            )}
            {modalityBlock && (
              <>
                <CustomMenuSeparator />
                {/* FASE 35: el bloque de modalidad se renderiza INLINE (sin
                    submenú): al elegir Imagen/Video/TTS… se ven al instante
                    las fuentes (Catálogo/HF/GitHub/Civitai), el buscador y
                    los proyectos/modelos de la modalidad. */}
                <LocalModelsSection
                  key={modalityBlock.category}
                  inline
                  initialTab="explore"
                  initialCategory={modalityBlock.category as LocalModelsCategory}
                  label={modalityBlock.label}
                  subtitle={modalityBlock.subtitle}
                  fixedCategory
                  showUrlInput
                />
              </>
            )}
          </>
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        onOpenChange={onOpenChange}
        endpointsConfig={endpointsConfig || {}}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
      />
    </div>
  );
}

export default function ModelSelector({ startupConfig }: ModelSelectorProps) {
  const interfaceConfig = startupConfig?.interface ?? defaultInterface;
  const modelSpecs = startupConfig?.modelSpecs?.list ?? [];

  // Hide the selector when modelSelect is false and there are no model specs to show
  if (interfaceConfig.modelSelect === false && modelSpecs.length === 0) {
    return null;
  }

  return (
    <ModelSelectorChatProvider>
      <ModelSelectorProvider startupConfig={startupConfig}>
        <ModelSelectorContent />
      </ModelSelectorProvider>
    </ModelSelectorChatProvider>
  );
}
