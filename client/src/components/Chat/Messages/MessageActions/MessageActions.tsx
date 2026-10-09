import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Copy,
  Share2,
  RotateCcw,
  MoreHorizontal,
  Check,
  Calendar,
  Clock,
  Library,
  GitBranch,
  Volume2,
  FileText,
  Flag,
  Loader2,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export interface MessageActionHandlers {
  onCopy?: () => void;
  onShare?: () => void;
  onRetry?: () => void;
  onViewSources?: () => void;
  onCreateThread?: () => void;
  onReadAloud?: () => void;
  onCopyMarkdown?: () => void;
  onReport?: () => void;
}

interface MessageActionsProps extends MessageActionHandlers {
  messageId: string;
  text: string;
  createdAt: Date;
  tokens?: number;
  sources?: Array<{ text: string; url: string }>;
  isAI?: boolean;
  isGenerating?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  messageId,
  text,
  createdAt,
  tokens,
  sources,
  isAI = false,
  isGenerating = false,
  onCopy,
  onShare,
  onRetry,
  onViewSources,
  onCreateThread,
  onReadAloud,
  onCopyMarkdown,
  onReport,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const localize = useLocalize();

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stop reading on unmount
  useEffect(() => {
    return () => {
      if (speechRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [text, onCopy]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'LibreChat Message',
          text: text.substring(0, 500),
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy link
      await navigator.clipboard.writeText(
        `${window.location.href}?message=${messageId}`
      );
      onShare?.();
    }
    setShowMenu(false);
  }, [text, messageId, onShare]);

  const handleRetry = useCallback(() => {
    onRetry?.();
    setShowMenu(false);
  }, [onRetry]);

  const handleReadAloud = useCallback(() => {
    if (isReading) {
      window.speechSynthesis.cancel();
      setIsReading(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      
      utterance.onend = () => setIsReading(false);
      utterance.onerror = () => setIsReading(false);
      
      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsReading(true);
    }
    setShowMenu(false);
  }, [text, isReading]);

  const handleCopyMarkdown = useCallback(async () => {
    const md = `> ${text.replace(/\n/g, '\n> ')}\n\n*Shared from LibreChat*`;
    await navigator.clipboard.writeText(md);
    onCopyMarkdown?.();
    setShowMenu(false);
  }, [text, onCopyMarkdown]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat((localize as (k: string) => string)('comui_date_locale') || 'es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const menuItems = [
    // Date/Time (disabled, just info)
    {
      icon: Calendar,
      label: formatDate(createdAt),
      disabled: true,
      danger: false,
      action: () => {},
    },
    // Time
    {
      icon: Clock,
      label: formatTime(createdAt),
      disabled: true,
      danger: false,
      action: () => {},
    },
    // Tokens (if available)
    tokens !== undefined && {
      icon: Library,
      label: `${localize('com_ui_tokens') || 'Tokens'}: ${tokens}`,
      disabled: true,
      danger: false,
      action: () => {},
    },
    // View sources (if available)
    sources && sources.length > 0 && {
      icon: Library,
      label: `${localize('com_ui_view_sources') || 'Ver fuentes'} (${sources.length})`,
      disabled: false,
      danger: false,
      action: () => {
        onViewSources?.();
        setShowMenu(false);
      },
    },
    // Create thread
    {
      icon: GitBranch,
      label: localize('com_ui_create_thread') || 'Crear hilo nuevo',
      disabled: false,
      danger: false,
      action: () => {
        onCreateThread?.();
        setShowMenu(false);
      },
    },
    // Read aloud
    {
      icon: Volume2,
      label: isReading 
        ? (localize('com_ui_stop_reading') || 'Detener')
        : (localize('com_ui_read_aloud') || 'Leer en voz alta'),
      disabled: false,
      danger: false,
      action: handleReadAloud,
    },
    // Copy as markdown
    {
      icon: FileText,
      label: localize('com_ui_copy_markdown') || 'Copiar como Markdown',
      disabled: false,
      danger: false,
      action: handleCopyMarkdown,
    },
    // Report
    {
      icon: Flag,
      label: localize('com_ui_report') || 'Denunciar',
      disabled: false,
      danger: true,
      action: () => {
        onReport?.();
        setShowMenu(false);
      },
    },
  ].filter(Boolean);

  return (
    <div className="message-actions" ref={menuRef}>
      <div className="actions-row">
        {/* Copy */}
        <button
          className={cn('action-btn', copied && 'success')}
          onClick={handleCopy}
          title={localize('com_ui_copy') || 'Copiar'}
          disabled={isGenerating}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? (localize('com_ui_copied') || 'Copiado') : (localize('com_ui_copy') || 'Copiar')}</span>
        </button>

        {/* Share */}
        <button
          className="action-btn"
          onClick={handleShare}
          title={localize('com_ui_share') || 'Compartir'}
          disabled={isGenerating}
        >
          <Share2 size={14} />
          <span>{localize('com_ui_share') || 'Compartir'}</span>
        </button>

        {/* Retry (only for AI messages) */}
        {isAI && (
          <button
            className="action-btn"
            onClick={handleRetry}
            title={localize('com_ui_retry') || 'Reintentar'}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}
            <span>{localize('com_ui_retry') || 'Reintentar'}</span>
          </button>
        )}

        {/* More Actions */}
        <button
          className="action-btn"
          onClick={() => setShowMenu(!showMenu)}
          title={localize('com_ui_more') || 'Más acciones'}
          disabled={isGenerating}
        >
          <MoreHorizontal size={14} />
          <span>{localize('com_ui_more') || 'Más'}</span>
        </button>
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="actions-dropdown">
          {menuItems.map((item, idx) => {
            if (!item) return null;
            const MenuItem = item as {
              icon: React.ElementType;
              label: string;
              disabled: boolean;
              danger: boolean;
              action: () => void;
            };
            return (
              <button
                key={idx}
                className={cn(
                  'dropdown-item',
                  MenuItem.danger && 'danger',
                  MenuItem.disabled && 'disabled'
                )}
                disabled={MenuItem.disabled}
                onClick={MenuItem.action}
              >
                <MenuItem.icon size={14} />
                <span>{MenuItem.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessageActions;
