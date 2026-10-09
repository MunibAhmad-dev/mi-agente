import React, { memo, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { FolderGit2, Github } from 'lucide-react';
import type { TConnectorProvider, TConnectorStatus } from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { useConnectorsQuery } from '~/data-provider/Connectors';
import ConnectorsPanel from './ConnectorsPanel';
import { cn } from '~/utils';

/**
 * Ícono simple para Hugging Face (evitamos logo con marca registrada).
 */
function HFIcon({ className }: { className?: string }) {
  return <span className={cn('font-bold text-sm', className)}>HF</span>;
}

/**
 * Badge pequeño para mostrar en el botón cuando hay conexión activa.
 */
interface ConnectionBadgeProps {
  provider: TConnectorProvider;
  status?: TConnectorStatus;
}

function ConnectionBadge({ provider, status }: ConnectionBadgeProps) {
  if (!status?.connected) {
    return null;
  }

  const isGithub = provider === 'github';
  const label = isGithub ? 'GH' : 'HF';
  const color = isGithub ? 'bg-green-500' : 'bg-yellow-500';

  return (
    <span
      className={cn(
        'absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white shadow-md',
        color,
      )}
      title={`${isGithub ? 'GitHub' : 'HuggingFace'}: ${status.meta?.username || 'Connected'}`}
    >
      {label}
    </span>
  );
}

/**
 * Botón de conectores con badges visuales que muestran el estado de conexión.
 * 
 * Muestra:
 * - Badge verde "GH" cuando GitHub está conectado
 * - Badge amarillo "HF" cuando HuggingFace está conectado
 * - Tooltip con el nombre de usuario cuando está conectado
 */
function ConnectorsButtonWithBadges() {
  const localize = useLocalize();
  const popoverStore = Ariakit.usePopoverStore();
  const methods = useChatFormContext();

  // Obtener estado de conexiones
  const { data: connectors } = useConnectorsQuery();

  // Obtener estado por proveedor
  const githubStatus = useMemo(
    () => connectors?.find((c) => c.provider === 'github'),
    [connectors],
  );

  const hfStatus = useMemo(
    () => connectors?.find((c) => c.provider === 'huggingface'),
    [connectors],
  );

  // Determinar el tooltip
  const tooltipText = useMemo(() => {
    const connected: string[] = [];
    if (githubStatus?.connected) {
      connected.push(`GitHub: @${githubStatus.meta?.username}`);
    }
    if (hfStatus?.connected) {
      connected.push(`HuggingFace: @${hfStatus.meta?.username}`);
    }
    if (connected.length === 0) {
      return localize('com_ui_connectors') ?? 'Repositories (GitHub / HuggingFace)';
    }
    return connected.join('\n');
  }, [githubStatus, hfStatus, localize]);

  const handleSelect = React.useCallback(
    (item: { id: string; name: string; url: string; type?: string }, provider: TConnectorProvider) => {
      const label = provider === 'github' ? 'repo' : (item.type ?? 'resource');
      const currentText = methods.getValues('text') ?? '';
      const insertion = `[${label}: ${item.name}](${item.url}) `;
      const nextText = currentText ? `${currentText} ${insertion}` : insertion;
      methods.setValue('text', nextText, { shouldDirty: true, shouldValidate: true });
      popoverStore.hide();
    },
    [methods, popoverStore],
  );

  // Verificar si algún proveedor está conectado
  const hasAnyConnection = githubStatus?.connected || hfStatus?.connected;

  return (
    <Ariakit.PopoverProvider store={popoverStore}>
      <Ariakit.PopoverDisclosure
        store={popoverStore}
        render={
          <TooltipAnchor
            description={tooltipText}
            render={
              <button
                type="button"
                className={cn(
                  'relative flex size-9 items-center justify-center rounded-full border transition-colors',
                  hasAnyConnection
                    ? 'border-border-heavy bg-surface-primary text-text-primary hover:bg-surface-hover'
                    : 'border-border-light text-text-primary hover:bg-surface-hover',
                )}
              >
                <FolderGit2 className="icon-md" />
                
                {/* Badge de GitHub */}
                <ConnectionBadge provider="github" status={githubStatus} />
                
                {/* Badge de HuggingFace */}
                <ConnectionBadge provider="huggingface" status={hfStatus} />
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

export default memo(ConnectorsButtonWithBadges);
