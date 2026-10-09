import { useState } from 'react';
import { useRecoilState } from 'recoil';
import { Switch } from '@librechat/client';
import { ChevronLeft, ChevronDown, Maximize2, Minimize2, RotateCcw, SquarePen, History } from 'lucide-react';
import { sidebarFeatures } from '~/hooks/Nav/sidebarFeatures.config';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';
import type { TranslationKeys } from '~/hooks';
import MCPBuilderPanel from '~/components/SidePanel/MCPBuilder/MCPBuilderPanel';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import { MemoryPanel } from '~/components/SidePanel/Memories';
import FilesPanel from '~/components/SidePanel/Files/Panel';
import { PromptsAccordion } from '~/components/Prompts';
import { SkillsAccordion } from '~/components/Skills';

/** Per-feature description keys (no invented configs — just a short honest blurb). */
const featureDescKeys: Record<string, TranslationKeys> = {
  agents: 'com_nav_feature_desc_agents',
  skills: 'com_nav_feature_desc_skills',
  prompts: 'com_nav_feature_desc_prompts',
  memories: 'com_nav_feature_desc_memories',
  bookmarks: 'com_nav_feature_desc_bookmarks',
  files: 'com_nav_feature_desc_files',
  parameters: 'com_nav_feature_desc_parameters',
  'mcp-builder': 'com_nav_feature_desc_mcp',
};

/**
 * Mismos componentes que monta el menú principal (useSideNavLinks → SidePanel/Nav)
 * para que la vista maximizada muestre exactamente las mismas funciones.
 * Parámetros queda excluido: usa useChatContext (conversación activa) y no existe
 * ese contexto dentro de Configuración — su fila conserva descripción + switch.
 */
const featureComponents: Partial<Record<string, React.ComponentType>> = {
  agents: AgentPanelSwitch,
  skills: SkillsAccordion,
  prompts: PromptsAccordion,
  memories: MemoryPanel,
  bookmarks: BookmarkPanel,
  files: FilesPanel,
  'mcp-builder': MCPBuilderPanel,
};

type Feature = (typeof sidebarFeatures)[number];

/**
 * Fila de una herramienta. El switch (deslizable) controla ÚNICAMENTE si la
 * herramienta aparece en la barra lateral principal. El botón de la flecha /
 * "Maximizar" abre la VISTA MAXIMIZADA: la función ocupa toda la ventana y
 * las demás desaparecen hasta que el usuario la cierra o minimiza.
 */
function FeatureRow({
  feature,
  onMaximize,
}: {
  feature: Feature;
  onMaximize: (id: string) => void;
}) {
  const localize = useLocalize();
  const [checked, setChecked] = useRecoilState(feature.atom);
  const Icon = feature.icon;
  const label = localize(feature.labelKey);
  const labelId = `settings-nav-${feature.id}-label`;

  return (
    <div className="px-4 py-3">
      <div className="flex w-full items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onMaximize(feature.id)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          aria-label={`${localize('com_nav_open_feature') || 'Abrir'}: ${label}`}
        >
          <Icon className="icon-md shrink-0 text-text-secondary" aria-hidden="true" />
          <span id={labelId} className="truncate text-sm text-text-primary">
            {label}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          <Switch
            id={`settings-nav-switch-${feature.id}`}
            checked={checked}
            onCheckedChange={setChecked}
            data-testid={`settings-nav-toggle-${feature.id}`}
            aria-label={`${localize('com_nav_show_in_sidebar')}: ${label}`}
          />
          <button
            type="button"
            onClick={() => onMaximize(feature.id)}
            aria-label={`${localize('com_nav_open_feature') || 'Abrir'}: ${label}`}
            title={localize('com_nav_open_feature') || 'Abrir'}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
}

/** Filas fijas (Nuevo chat, Historial): siempre visibles, sin botón "Abrir". */
function FixedRow({
  id,
  icon: Icon,
  labelKey,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  labelKey: TranslationKeys;
}) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-3">
      <div className="flex w-full items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`settings-nav-fixed-${id}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-border-xheavy"
        >
          <Icon className="icon-md shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="truncate text-sm text-text-primary">{localize(labelKey)}</span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] text-text-secondary md:inline">
            {localize('com_nav_always_visible')}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? localize('com_nav_collapse') : localize('com_nav_expand')}
            className="rounded-md p-1 text-text-tertiary transition-colors hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </span>
      </div>
      {open && (
        <div id={`settings-nav-fixed-${id}`} className="mt-2 rounded-lg bg-surface-secondary p-3">
          <p className="text-xs text-text-secondary">{localize('com_nav_fixed_item_desc')}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Vista ampliada: panel INLINE dentro de Configuración (no pantalla completa),
 * con altura controlada y scroll interno. Al abrirla, la lista de la izquierda
 * queda reemplazada por la función; el botón volver/minimizar (flechita) la
 * cierra y restaura la lista. Muestra las funciones REALES de la herramienta.
 */
function MaximizedFeature({
  feature,
  onClose,
}: {
  feature: Feature;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const [checked, setChecked] = useRecoilState(feature.atom);
  const Icon = feature.icon;
  const label = localize(feature.labelKey);
  const desc = featureDescKeys[feature.id]
    ? localize(featureDescKeys[feature.id])
    : localize('com_nav_customize_sidebar_desc');
  const PanelComponent = featureComponents[feature.id];

  return (
    <div className="flex max-h-[75vh] min-h-0 flex-col overflow-hidden rounded-xl border border-border-light bg-surface-secondary text-text-primary">
      {/* Barra superior de la ventana */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-light bg-surface-tertiary/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label={localize('com_nav_close_full') || 'Volver a la lista'}
            title={localize('com_nav_close_full') || 'Volver a la lista'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <Icon className="icon-md shrink-0 text-text-secondary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{label}</h2>
            <p className="truncate text-xs text-text-secondary">{desc}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 text-xs text-text-secondary sm:flex">
            {localize('com_nav_show_in_sidebar')}
            <Switch
              id={`settings-nav-max-switch-${feature.id}`}
              checked={checked}
              onCheckedChange={setChecked}
              aria-label={`${localize('com_nav_show_in_sidebar')}: ${label}`}
            />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={localize('com_nav_close_full') || 'Minimizar'}
            title={localize('com_nav_close_full') || 'Minimizar'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          >
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Funciones reales de la herramienta (las mismas del menú principal) */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {PanelComponent ? <PanelComponent /> : <p className="text-sm text-text-secondary">{desc}</p>}
      </div>
    </div>
  );
}

export default function CustomizeNavigation() {
  const localize = useLocalize();
  const [showAgentBuilder, setShowAgentBuilder] = useRecoilState(store.showSidebarAgentBuilder);
  const [showSkills, setShowSkills] = useRecoilState(store.showSidebarSkills);
  const [showPrompts, setShowPrompts] = useRecoilState(store.showSidebarPrompts);
  const [showMemories, setShowMemories] = useRecoilState(store.showSidebarMemories);
  const [showBookmarks, setShowBookmarks] = useRecoilState(store.showSidebarBookmarks);
  const [showParameters, setShowParameters] = useRecoilState(store.showSidebarParameters);
  const [showMcpBuilder, setShowMcpBuilder] = useRecoilState(store.showSidebarMcpBuilder);
  const [showFiles, setShowFiles] = useRecoilState(store.showSidebarFiles);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);

  const atomStates = [
    [showAgentBuilder, setShowAgentBuilder],
    [showSkills, setShowSkills],
    [showPrompts, setShowPrompts],
    [showMemories, setShowMemories],
    [showBookmarks, setShowBookmarks],
    [showParameters, setShowParameters],
    [showMcpBuilder, setShowMcpBuilder],
    [showFiles, setShowFiles],
  ] as const;

  const allOn = atomStates.every(([checked]) => checked);

  const handleMasterToggle = (value: boolean) => {
    atomStates.forEach(([, setChecked]) => setChecked(value));
  };

  const handleRestoreAll = () => {
    atomStates.forEach(([, setChecked]) => setChecked(true));
  };

  const maximizedFeature = sidebarFeatures.find((f) => f.id === maximizedId);

  return (
    <div className="flex flex-col gap-4">
      {maximizedFeature ? (
        <MaximizedFeature feature={maximizedFeature} onClose={() => setMaximizedId(null)} />
      ) : (
        <>
          <p className="px-1 text-sm text-text-secondary">
            {localize('com_nav_setting_navigation_desc')}
          </p>
          <div className="divide-y divide-border-light overflow-hidden rounded-xl border border-border-light text-sm text-text-primary">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <strong className="text-sm text-text-primary">
                {localize('com_nav_advanced_mode')}
              </strong>
              <Switch
                id="settings-nav-advanced-mode"
                checked={allOn}
                onCheckedChange={handleMasterToggle}
                data-testid="settings-nav-toggle-advanced-mode"
                aria-label={localize('com_nav_advanced_mode')}
              />
            </div>
            <FixedRow id="new-chat" icon={SquarePen} labelKey="com_ui_new_chat" />
            <FixedRow id="history" icon={History} labelKey="com_ui_history" />
            {sidebarFeatures.map((feature) => (
              <FeatureRow key={feature.id} feature={feature} onMaximize={setMaximizedId} />
            ))}
          </div>
          <div className="px-1">
            <button
              type="button"
              onClick={handleRestoreAll}
              className="flex items-center gap-2 rounded-lg border border-border-light px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {localize('com_nav_restore_navigation_defaults')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
