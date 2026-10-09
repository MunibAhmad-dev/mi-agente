import { useState, memo, useRef, useContext, useEffect } from 'react';
import * as Menu from '@ariakit/react/menu';
import { ThemeContext, Avatar, DropdownMenuSeparator } from '@librechat/client';
import {
  Archive,
  Check,
  FileText,
  Laptop,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Trash2,
} from 'lucide-react';
import { ArchivedChatsModal } from '~/components/Nav/SettingsTabs/General/ArchivedChatsModal';
import { TrashChatsModal } from '~/components/Nav/SettingsTabs/General/TrashChatsModal';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import StreakBadge, { useUserStreak } from './StreakBadge';
import StreakGiftModal from './StreakGiftModal';
import Settings from './Settings';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * HeaderUserMenu — FASE 26.
 * Píldora de usuario en el header (icono + nombre) con menú compacto:
 * email, Apariencia (Light / Dark / Match system), Ajustes, Archivos,
 * Chats archivados y Cerrar sesión — el mismo patrón visual del menú de
 * cuenta de la barra lateral, reutilizando sus componentes.
 */
function HeaderUserMenu() {
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { theme, setTheme } = useContext(ThemeContext);
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // FASE 28: celebra el regalo del hito (cada 7 días) cuando hay uno sin
  // reclamar — el modal aparece al cargar el streak y al abrir el menú.
  const { data: streak, reload: reloadStreak } = useUserStreak();
  const giftReady = Boolean(streak?.giftReady && !streak?.giftClaimed);

  useEffect(() => {
    // Cuando el fetch del streak resuelve y hay hito pendiente, muestra el
    // modal aunque el usuario aún no haya abierto el menú.
    if (giftReady) {
      setShowGift(true);
    }
  }, [giftReady]);

  if (!isAuthenticated || !user) {
    return null;
  }

  /** Al abrir el menú, si hay un hito de regalo sin reclamar se muestra el modal. */
  const handleMenuOpen = (open: boolean) => {
    if (open && giftReady) {
      setShowGift(true);
    }
  };

  const appearanceItems = [
    { value: 'light', label: localize('com_nav_theme_light') || 'Light', icon: Sun },
    { value: 'dark', label: localize('com_nav_theme_dark') || 'Dark', icon: Moon },
    { value: 'system', label: localize('com_nav_theme_system') || 'Match system', icon: Laptop },
  ];

  return (
    <Menu.MenuProvider placement="bottom-end" setOpen={handleMenuOpen}>
      <Menu.MenuButton
        ref={triggerRef}
        aria-label={localize('com_nav_account_settings')}
        data-testid="header-user"
        className="flex h-9 items-center gap-2 rounded-full border border-border-light bg-surface-secondary/80 py-1 pl-1 pr-3 text-sm text-text-primary transition-colors hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Avatar user={user} size={26} />
        <span className="max-w-[120px] truncate">
          {user?.name ?? user?.username ?? localize('com_nav_user')}
        </span>
      </Menu.MenuButton>
      <Menu.Menu
        portal
        gutter={6}
        className="account-settings-popover popover-ui z-[130] w-[260px] rounded-lg"
        style={{ transformOrigin: 'top' }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
          {user?.email ?? localize('com_nav_user')}
        </div>
        <StreakBadge />
        <DropdownMenuSeparator />
        <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          {localize('com_nav_appearance') || 'Appearance'}
        </div>
        {appearanceItems.map(({ value, label, icon: Icon }) => (
          <Menu.MenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="select-item flex w-full cursor-pointer items-center gap-2 text-sm"
          >
            <Icon className="icon-md" aria-hidden="true" />
            <span className="flex-1 text-left">{label}</span>
            {theme === value && (
              <Check className="size-4 shrink-0 text-text-primary" aria-hidden="true" />
            )}
          </Menu.MenuItem>
        ))}
        <DropdownMenuSeparator />
        <Menu.MenuItem onClick={() => setShowFiles(true)} className="select-item text-sm">
          <FileText className="icon-md" aria-hidden="true" />
          {localize('com_nav_my_files')}
        </Menu.MenuItem>
        <Menu.MenuItem onClick={() => setShowArchived(true)} className="select-item text-sm">
          <Archive className="icon-md" aria-hidden="true" />
          {localize('com_nav_archived_chats')}
        </Menu.MenuItem>
        <Menu.MenuItem onClick={() => setShowTrash(true)} className="select-item text-sm">
          <Trash2 className="icon-md" aria-hidden="true" />
          {localize('com_nav_trash_chats') || 'Papelera'}
        </Menu.MenuItem>
        <Menu.MenuItem
          onClick={() => setShowSettings(true)}
          className={cn('select-item text-sm')}
          data-testid="header-settings"
        >
          <SettingsIcon className="icon-md" aria-hidden="true" />
          {localize('com_nav_settings')}
        </Menu.MenuItem>
        <DropdownMenuSeparator />
        <Menu.MenuItem onClick={() => logout()} className="select-item text-sm">
          <LogOut className="icon-md" aria-hidden="true" />
          {localize('com_nav_log_out')}
        </Menu.MenuItem>
      </Menu.Menu>
      {showFiles && (
        <MyFilesModal open={showFiles} onOpenChange={setShowFiles} triggerRef={triggerRef} />
      )}
      {showArchived && (
        <ArchivedChatsModal
          open={showArchived}
          onOpenChange={setShowArchived}
          triggerRef={triggerRef}
        />
      )}
      {showTrash && (
        <TrashChatsModal open={showTrash} onOpenChange={setShowTrash} triggerRef={triggerRef} />
      )}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
      {showGift && streak?.giftReady && (
        <StreakGiftModal
          streak={streak}
          onClose={() => setShowGift(false)}
          onClaimed={(next) => {
            setShowGift(false);
            void reloadStreak();
            void next;
          }}
        />
      )}
    </Menu.MenuProvider>
  );
}

export default memo(HeaderUserMenu);
