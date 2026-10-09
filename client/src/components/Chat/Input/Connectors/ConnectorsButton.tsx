import React, { memo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { FolderGit2 } from 'lucide-react';
import type { TConnectorProvider, TConnectorSearchResult } from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import ConnectorsPanel from './ConnectorsPanel';

/**
 * No recibe props: toma el formulario del composer directamente del
 * contexto (igual que Mention.tsx / useQueryParams.ts / useAutoSave.ts),
 * así que se puede colocar en BadgeRow sin tener que pasar el texto a mano
 * por cada nivel de componentes.
 */
function ConnectorsButton() {
  const localize = useLocalize();
  const popoverStore = Ariakit.usePopoverStore();
  const methods = useChatFormContext();

  const handleSelect = useCallback(
    (item: TConnectorSearchResult, provider: TConnectorProvider) => {
      // Inserta una referencia al repo/modelo elegido en el mensaje. El
      // backend/agente puede resolver esta URL con sus herramientas (p.ej.
      // un MCP de GitHub/HF) para leer el contenido si hace falta.
      const label = provider === 'github' ? 'repo' : (item.type ?? 'resource');
      const currentText = methods.getValues('text') ?? '';
      const insertion = `[${label}: ${item.name}](${item.url}) `;
      const nextText = currentText ? `${currentText} ${insertion}` : insertion;
      methods.setValue('text', nextText, { shouldDirty: true, shouldValidate: true });
      popoverStore.hide();
    },
    [methods, popoverStore],
  );

  return (
    <Ariakit.PopoverProvider store={popoverStore}>
      <Ariakit.PopoverDisclosure
        store={popoverStore}
        render={
          <TooltipAnchor
            description={localize('com_ui_connectors') ?? 'Repositorios (GitHub / Hugging Face)'}
            render={
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full border border-border-light text-text-primary transition-colors hover:bg-surface-hover"
              >
                <FolderGit2 className="icon-md" />
              </button>
            }
          />
        }
      />
      <Ariakit.Popover
        store={popoverStore}
        gutter={8}
        className="z-50 rounded-xl border border-border-light bg-surface-primary p-2 shadow-lg"
      >
        <ConnectorsPanel onSelect={handleSelect} />
      </Ariakit.Popover>
    </Ariakit.PopoverProvider>
  );
}

export default memo(ConnectorsButton);
