import { useMemo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import * as Menu from '@ariakit/react/menu';
import { Switch, DropdownMenuSeparator } from '@librechat/client';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { sidebarFeatures } from '~/hooks/Nav/sidebarFeatures.config';
import { useLocalize } from '~/hooks';
import store from '~/store';

/**
 * Row for a single toggleable sidebar feature (Agent Builder, Skills, Prompts, ...).
 * Lives inside a non-closing Menu.MenuItem so clicking the switch doesn't
 * dismiss the whole "Personalizar menú" submenu.
 */
function FeatureRow({ feature }: { feature: (typeof sidebarFeatures)[number] }) {
  const localize = useLocalize();
  const [checked, setChecked] = useRecoilState(feature.atom);
  const Icon = feature.icon;
  const labelId = `sidebar-feature-${feature.id}-label`;

  return (
    <Menu.MenuItem
      hideOnClick={false}
      className="select-item text-sm"
      onClick={(e) => e.preventDefault()}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="icon-md text-text-secondary" aria-hidden="true" />
          <span id={labelId}>{localize(feature.labelKey)}</span>
        </div>
        <Switch
          id={`sidebar-feature-${feature.id}`}
          checked={checked}
          onCheckedChange={setChecked}
          data-testid={`sidebar-feature-toggle-${feature.id}`}
          aria-labelledby={labelId}
        />
      </div>
    </Menu.MenuItem>
  );
}

export default function FeatureVisibilityMenu() {
  const localize = useLocalize();

  // Called explicitly (not inside a loop/callback) to respect Rules of Hooks.
  // `sidebarFeatures` has a fixed length/order, so this list must stay in sync
  // with that config whenever a panel is added or removed.
  const [showAgentBuilder, setShowAgentBuilder] = useRecoilState(store.showSidebarAgentBuilder);
  const [showSkills, setShowSkills] = useRecoilState(store.showSidebarSkills);
  const [showPrompts, setShowPrompts] = useRecoilState(store.showSidebarPrompts);
  const [showMemories, setShowMemories] = useRecoilState(store.showSidebarMemories);
  const [showBookmarks, setShowBookmarks] = useRecoilState(store.showSidebarBookmarks);
  const [showParameters, setShowParameters] = useRecoilState(store.showSidebarParameters);
  const [showMcpBuilder, setShowMcpBuilder] = useRecoilState(store.showSidebarMcpBuilder);

  const atomStates = useMemo(
    () =>
      [
        [showAgentBuilder, setShowAgentBuilder],
        [showSkills, setShowSkills],
        [showPrompts, setShowPrompts],
        [showMemories, setShowMemories],
        [showBookmarks, setShowBookmarks],
        [showParameters, setShowParameters],
        [showMcpBuilder, setShowMcpBuilder],
      ] as const,
    [
      showAgentBuilder,
      setShowAgentBuilder,
      showSkills,
      setShowSkills,
      showPrompts,
      setShowPrompts,
      showMemories,
      setShowMemories,
      showBookmarks,
      setShowBookmarks,
      showParameters,
      setShowParameters,
      showMcpBuilder,
      setShowMcpBuilder,
    ],
  );

  const allOn = useMemo(() => atomStates.every(([checked]) => checked), [atomStates]);

  const handleMasterToggle = useCallback(
    (value: boolean) => {
      atomStates.forEach(([, setChecked]) => setChecked(value));
    },
    [atomStates],
  );

  return (
    <Menu.MenuProvider placement="right-start">
      <Menu.MenuItem
        hideOnClick={false}
        render={
          <Menu.MenuButton className="select-item flex w-full cursor-pointer items-center gap-2 text-sm" />
        }
      >
        <SlidersHorizontal className="icon-md" aria-hidden="true" />
        <span className="flex-1 text-left">{localize('com_nav_customize_sidebar')}</span>
        <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      </Menu.MenuItem>
      <Menu.Menu
        portal
        gutter={12}
        className="account-settings-popover popover-ui popover-from-left z-[126] w-[280px] rounded-lg"
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-xs" role="note">
          {localize('com_nav_customize_sidebar_desc')}
        </div>
        <Menu.MenuItem
          hideOnClick={false}
          className="select-item text-sm"
          onClick={(e) => e.preventDefault()}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <strong>{localize('com_nav_advanced_mode')}</strong>
            <Switch
              id="sidebar-feature-advanced-mode"
              checked={allOn}
              onCheckedChange={handleMasterToggle}
              data-testid="sidebar-feature-toggle-advanced-mode"
              aria-label={localize('com_nav_advanced_mode')}
            />
          </div>
        </Menu.MenuItem>
        <DropdownMenuSeparator />
        {sidebarFeatures.map((feature) => (
          <FeatureRow key={feature.id} feature={feature} />
        ))}
      </Menu.Menu>
    </Menu.MenuProvider>
  );
}
