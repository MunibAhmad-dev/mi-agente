import { useCallback } from 'react';
import { useLocalize } from '~/hooks';
import { useToastContext } from '@librechat/client';

export interface UseMessageActionsOptions {
  messageId: string;
  text: string;
  onRetry?: () => void;
  onViewSources?: (sources: Array<{ text: string; url: string }>) => void;
  onCreateThread?: () => void;
  onReport?: (messageId: string) => void;
}

export function useMessageActions(options: UseMessageActionsOptions) {
  const { messageId, text, onRetry, onViewSources, onCreateThread, onReport } = options;
  const localize = useLocalize();
  const { showToast } = useToastContext() || {};

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast?.({
        message: localize('com_ui_copied') || 'Copied',
        status: 'success',
      });
    } catch (error) {
      showToast?.({
        message: localize('com_ui_copy_failed') || 'Failed to copy',
        status: 'error',
      });
    }
  }, [text, showToast, localize]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'LibreChat Message',
          text: text.substring(0, 500),
          url: window.location.href,
        });
      } catch (error) {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(
        `${window.location.href}?message=${messageId}`
      );
      showToast?.({
        message: 'Link copied to clipboard',
        status: 'success',
      });
    }
  }, [text, messageId, showToast]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  const handleReadAloud = useCallback(() => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  }, [text]);

  const handleCopyMarkdown = useCallback(async () => {
    const md = `> ${text.replace(/\n/g, '\n> ')}\n\n*Shared from LibreChat*`;
    await navigator.clipboard.writeText(md);
    showToast?.({
      message: 'Copied as Markdown',
      status: 'success',
    });
  }, [text, showToast]);

  const handleReport = useCallback(() => {
    onReport?.(messageId);
  }, [messageId, onReport]);

  return {
    handleCopy,
    handleShare,
    handleRetry,
    handleReadAloud,
    handleCopyMarkdown,
    handleReport,
    handleViewSources: onViewSources,
    handleCreateThread: onCreateThread,
  };
}

export default useMessageActions;
