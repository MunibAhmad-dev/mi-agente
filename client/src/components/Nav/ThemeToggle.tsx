import { memo, useContext } from 'react';
import { ThemeContext, isDark } from '@librechat/client';
import { Moon, Sun } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * ThemeToggle — FASE 26.
 * Botón del menú principal para alternar claro/oscuro al instante.
 * Usa el ThemeContext existente (persiste igual que el selector de Ajustes).
 */
function ThemeToggle() {
  const localize = useLocalize();
  const { theme, setTheme } = useContext(ThemeContext);
  const dark = isDark(theme);
  const label = dark ? localize('com_nav_theme_light') || 'Light' : localize('com_nav_theme_dark') || 'Dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={localize('com_nav_toggle_theme') || 'Cambiar tema claro/oscuro'}
      title={label}
      data-testid="theme-toggle"
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-light bg-surface-secondary/80 text-text-primary transition-colors',
        'hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}

export default memo(ThemeToggle);
