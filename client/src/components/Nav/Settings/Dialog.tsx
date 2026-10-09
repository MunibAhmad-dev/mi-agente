import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { X, ChevronLeft } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import { SettingsTabValues } from 'librechat-data-provider';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { TDialogProps } from '~/common';
import type { SettingsTab } from './types';
import { useSettingsContext } from './context';
import { useLocalize } from '~/hooks';
import Sidebar from './Sidebar';
import Content from './Content';
import { TABS } from './types';
import { cn } from '~/utils';

export default function SettingsDialog({ open, onOpenChange }: TDialogProps) {
  const localize = useLocalize();
  const ctx = useSettingsContext();
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(SettingsTabValues.GENERAL);
  const [query, setQuery] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);
  const openedAt = useRef<string | null>(null);

  // FASE 25: cuando el usuario navega desde una herramienta inline (p. ej.
  // "Crear Prompt" → /prompts/new), la ruta cambia pero el diálogo quedaría
  // abierto encima tapando la página nueva. Se cierra automáticamente en cuanto
  // la ruta cambia DESPUÉS de abrirse (sin interferir con la apertura inicial).
  useEffect(() => {
    if (open) {
      openedAt.current = location.pathname + location.search;
    }
  }, [open]);
  useEffect(() => {
    if (open && openedAt.current && openedAt.current !== location.pathname + location.search) {
      openedAt.current = null;
      onOpenChange(false);
    }
  }, [location.pathname, location.search, open, onOpenChange]);

  const searching = query.trim().length > 0;
  const inDetail = isSmallScreen && mobileDetail && !searching;
  const showSidebar = !isSmallScreen || !inDetail;
  const showContent = !isSmallScreen || inDetail || searching;
  const hideTabs = isSmallScreen && searching;
  const visibleTabs = TABS.filter((t) => !t.show || t.show(ctx));
  const effectiveTab = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : SettingsTabValues.GENERAL;
  const activeMeta = TABS.find((t) => t.id === effectiveTab);

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (isSmallScreen) {
      setMobileDetail(true);
    }
  };

  return (
    <Transition appear show={open}>
      {/* FASE 25: z-[125] — por encima de los side panels (z-[110]) y de los
          overlays de menús, pero por debajo de los OGDialog (130+/140+) para que
          los diálogos internos (p. ej. "Añadir" de skills/prompts) queden arriba. */}
      <Dialog as="div" className="relative z-[125]" onClose={() => onOpenChange(false)}>
        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black opacity-50 dark:opacity-80" aria-hidden="true" />
        </TransitionChild>
        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <DialogPanel
              className={cn(
                'flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-background shadow-2xl',
                'md:h-[85vh] md:w-[900px]',
              )}
            >
              <DialogTitle
                as="div"
                className="flex items-center justify-between border-b border-border-light p-5"
              >
                {inDetail ? (
                  <button
                    type="button"
                    onClick={() => setMobileDetail(false)}
                    className="-ml-1 flex items-center gap-1 rounded-lg p-1 text-text-primary transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-border-xheavy"
                    aria-label={localize('com_ui_back')}
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    <span className="text-lg font-medium">
                      {activeMeta ? localize(activeMeta.labelKey) : localize('com_nav_settings')}
                    </span>
                  </button>
                ) : (
                  <h2 className="text-lg font-medium text-text-primary">
                    {localize('com_nav_settings')}
                  </h2>
                )}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-lg p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">{localize('com_ui_close_settings')}</span>
                </button>
              </DialogTitle>
              <Tabs.Root
                value={effectiveTab}
                onValueChange={(v) => setActiveTab(v as SettingsTab)}
                orientation="vertical"
                className="flex flex-1 flex-col gap-4 overflow-hidden p-5 md:flex-row md:gap-6"
              >
                {showSidebar && (
                  <Sidebar
                    ctx={ctx}
                    query={query}
                    onQueryChange={setQuery}
                    onSelectTab={selectTab}
                    showChevron={isSmallScreen}
                    hideTabs={hideTabs}
                  />
                )}
                {showContent && (
                  <div className="flex-1 overflow-y-auto md:pr-1">
                    {searching ? (
                      <Content activeTab={effectiveTab} query={query} ctx={ctx} />
                    ) : (
                      <Tabs.Content
                        value={effectiveTab}
                        tabIndex={-1}
                        className="focus:outline-none"
                      >
                        <Content activeTab={effectiveTab} query={query} ctx={ctx} />
                      </Tabs.Content>
                    )}
                  </div>
                )}
              </Tabs.Root>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
