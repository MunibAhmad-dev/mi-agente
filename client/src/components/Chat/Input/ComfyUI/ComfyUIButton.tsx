/**
 * ComfyUI Button Component
 * ========================
 * Botón para abrir el panel de ComfyUI
 */

import React, { memo } from 'react';
import * as Ariakit from '@ariakit/react';
import { Image, Wand2 } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import ComfyUIPanel from './ComfyUIPanel';
import { cn } from '~/utils';

interface ComfyUIButtonProps {
  isActive?: boolean;
  onOpen?: () => void;
}

function ComfyUIButton({ isActive = false, onOpen }: ComfyUIButtonProps) {
  const localize = useLocalize();
  const popoverStore = Ariakit.usePopoverStore();

  const handleOpen = React.useCallback(() => {
    popoverStore.show();
    onOpen?.();
  }, [popoverStore, onOpen]);

  return (
    <Ariakit.PopoverProvider store={popoverStore}>
      <Ariakit.PopoverDisclosure
        store={popoverStore}
        render={
          <TooltipAnchor
            description={localize('comfyui_open') ?? 'ComfyUI Generation'}
            render={
              <button
                type="button"
                onClick={handleOpen}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border transition-colors',
                  isActive
                    ? 'border-border-heavy bg-surface-hover text-text-primary'
                    : 'border-border-light text-text-primary hover:bg-surface-hover',
                )}
              >
                <Wand2 className="icon-md" />
              </button>
            }
          />
        }
      />
      <Ariakit.Popover
        store={popoverStore}
        gutter={8}
        className="z-50 max-h-[80vh] overflow-hidden rounded-xl border border-border-light bg-surface-primary shadow-lg"
      >
        <ComfyUIPanel popoverStore={popoverStore} />
      </Ariakit.Popover>
    </Ariakit.PopoverProvider>
  );
}

export default memo(ComfyUIButton);
