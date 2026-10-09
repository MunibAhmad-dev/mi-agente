import { useCallback, useEffect, useRef, useState } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  ArchiveRestore,
  Hourglass,
  MessageSquareOff,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  useToastContext,
} from '@librechat/client';
import type { RefObject } from 'react';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * TrashChatsModal — FASE 26.
 * Papelera de 30 días: los chats borrados se conservan una copia y pueden
 * restaurarse. Borrar aquí es definitivo (sin papelera).
 */

interface TrashItem {
  conversationId: string;
  title: string;
  endpoint?: string | null;
  model?: string | null;
  createdAt?: string;
  deletedAt?: string;
  expiresAt?: string;
}

function authToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length);
    }
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

function useTrashFetch() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/convos/trash', {
        headers: { Authorization: `Bearer ${authToken() ?? ''}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(data.trash ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}

function formatDate(value?: string) {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function daysLeft(expiresAt?: string) {
  if (!expiresAt) {
    return null;
  }
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / (24 * 3600 * 1000));
  return days > 0 ? days : 0;
}

export function TrashChatsModal({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | HTMLDivElement | null>;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const contentRef = useRef<HTMLDivElement>(null);
  const { items, loading, error, reload } = useTrashFetch();
  const [busy, setBusy] = useState<string | null>(null);

  const handleOpenAutoFocus = (event: Event) => {
    event.preventDefault();
    contentRef.current?.focus();
  };

  const restore = useCallback(
    async (item: TrashItem) => {
      setBusy(item.conversationId);
      try {
        const res = await fetch(`/api/convos/trash/${item.conversationId}/restore`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken() ?? ''}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        showToast({
          message: (localize as (k: string) => string)('com_ui_trash_restored') || 'Chat restaurado',
          severity: NotificationSeverity.SUCCESS,
          showIcon: true,
        });
        await reload();
      } catch (err) {
        showToast({
          message: `No se pudo restaurar: ${err instanceof Error ? err.message : 'error'}`,
          severity: NotificationSeverity.ERROR,
        });
      } finally {
        setBusy(null);
      }
    },
    [reload, showToast, localize],
  );

  const purge = useCallback(
    async (item: TrashItem) => {
      const ok = window.confirm(
        `¿Borrar definitivamente «${item.title}»? Esta acción no se puede deshacer (se elimina de la papelera).`,
      );
      if (!ok) {
        return;
      }
      setBusy(item.conversationId);
      try {
        const res = await fetch(`/api/convos/trash/${item.conversationId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken() ?? ''}` },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        await reload();
      } catch (err) {
        showToast({
          message: `No se pudo borrar: ${err instanceof Error ? err.message : 'error'}`,
          severity: NotificationSeverity.ERROR,
        });
      } finally {
        setBusy(null);
      }
    },
    [reload, showToast],
  );

  const emptyTrash = useCallback(async () => {
    const ok = window.confirm('¿Vaciar la papelera? Todos los chats borrados se eliminarán definitivamente.');
    if (!ok) {
      return;
    }
    setBusy('__all__');
    try {
      const res = await fetch('/api/convos/trash', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken() ?? ''}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await reload();
    } catch (err) {
      showToast({
        message: `No se pudo vaciar: ${err instanceof Error ? err.message : 'error'}`,
        severity: NotificationSeverity.ERROR,
      });
    } finally {
      setBusy(null);
    }
  }, [reload, showToast]);

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogContent
        ref={contentRef}
        tabIndex={-1}
        onOpenAutoFocus={handleOpenAutoFocus}
        title={localize('com_nav_trash_chats') || 'Papelera'}
        className="w-11/12 max-w-[900px] bg-background text-text-primary shadow-2xl focus:outline-none"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_nav_trash_chats') || 'Papelera'}</OGDialogTitle>
        </OGDialogHeader>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-text-secondary">
          <Hourglass className="size-3.5 shrink-0" aria-hidden="true" />
          {localize('com_nav_trash_retention') ||
            'Los chats borrados se conservan 30 días. Puedes restaurarlos o borrarlos definitivamente.'}
        </p>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="text-text-primary" />
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-sm text-red-600 dark:text-red-400">
            No se pudo cargar la papelera ({error})
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-text-secondary">
            <MessageSquareOff className="size-8" aria-hidden="true" />
            {localize('com_nav_trash_empty') || 'La papelera está vacía.'}
          </div>
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.conversationId}
                className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-secondary p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary" title={item.title}>
                    {item.title}
                  </p>
                  <p className="truncate text-[11px] text-text-secondary">
                    {item.endpoint ? `${item.endpoint} · ` : ''}
                    {formatDate(item.deletedAt)} ·{' '}
                    {localize('com_nav_trash_days_left') || 'quedan'} {daysLeft(item.expiresAt)}{' '}
                    {localize('com_nav_trash_days') || 'días'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    className="h-8 gap-1 px-2 text-xs hover:bg-surface-hover"
                    onClick={() => restore(item)}
                    disabled={busy !== null}
                    title={localize('com_ui_restore') || 'Restaurar'}
                  >
                    {busy === item.conversationId ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <ArchiveRestore className="size-4" aria-hidden="true" />
                    )}
                    {localize('com_ui_restore') || 'Restaurar'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 text-text-secondary hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400"
                    onClick={() => purge(item)}
                    disabled={busy !== null}
                    title={localize('com_ui_delete_forever') || 'Borrar definitivamente'}
                  >
                    {busy === item.conversationId ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Trash2 className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={cn('mt-4 flex justify-end gap-2', items.length === 0 && 'hidden')}>
          <Button variant="destructive" onClick={emptyTrash} disabled={busy !== null || items.length === 0}>
            {busy === '__all__' ? <Spinner /> : (localize('com_nav_trash_empty_all') || 'Vaciar papelera')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
