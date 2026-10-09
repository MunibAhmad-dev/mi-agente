import { useState } from 'react';
import { Brain } from 'lucide-react';
import { useMemoriesQuery } from '~/data-provider';
import MemoryPanel from '~/components/SidePanel/Memories/MemoryPanel';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * ChatMemoryButton — FASE 29: memoria visible en el chat.
 * Muestra un botón 🧠 con el número de recuerdos del usuario; al pulsarlo
 * abre el MemoryPanel existente (mismo componente de la barra lateral) en un
 * diálogo, para ver/editar/borrar memorias sin salir de la conversación.
 */
export default function ChatMemoryButton() {
  const localize = useLocalize();
  const { data } = useMemoriesQuery();
  const [open, setOpen] = useState(false);
  const count = Array.isArray(data?.memories) ? data.memories.length : 0;

  return (
    <>
      <button
        type="button"
        aria-label={localize('com_ui_memories') || 'Memories'}
        title={localize('com_ui_memories') || 'Memories'}
        onClick={() => setOpen(true)}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full border border-border-light',
          'bg-surface-secondary/80 text-text-primary transition-colors hover:bg-surface-active-alt',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <Brain className="size-4" aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={localize('com_ui_memories') || 'Memories'}
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border-light bg-surface-primary shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-primary px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Brain className="size-4" aria-hidden="true" />
                {localize('com_ui_memories') || 'Memories'}
                {count > 0 && (
                  <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
                    {count}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-active hover:text-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="p-3">
              <MemoryPanel />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
