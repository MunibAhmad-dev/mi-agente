import { MCPIcon, AttachmentIcon } from '@librechat/client';
import { Bot, Brain, Bookmark, NotebookPen, ScrollText, SlidersHorizontal } from 'lucide-react';
import type { RecoilState } from 'recoil';
import type { TranslationKeys } from '~/hooks';
import store from '~/store';

export interface SidebarFeatureDef {
  /** Matches the `id` used in useSideNavLinks.ts NavLink entries */
  id: string;
  atom: RecoilState<boolean>;
  labelKey: TranslationKeys;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

/**
 * Single source of truth for every sidebar panel that a user can hide via
 * "Personalizar menú" (AccountSettings) or the General settings tab.
 * Add a new panel here + one condition in useSideNavLinks.ts to make it toggleable.
 */
export const sidebarFeatures: SidebarFeatureDef[] = [
  {
    id: 'agents',
    atom: store.showSidebarAgentBuilder,
    labelKey: 'com_sidepanel_agent_builder',
    icon: Bot,
  },
  {
    id: 'skills',
    atom: store.showSidebarSkills,
    labelKey: 'com_ui_skills',
    icon: ScrollText,
  },
  {
    id: 'prompts',
    atom: store.showSidebarPrompts,
    labelKey: 'com_ui_prompts',
    icon: NotebookPen,
  },
  {
    id: 'memories',
    atom: store.showSidebarMemories,
    labelKey: 'com_ui_memories',
    icon: Brain,
  },
  {
    id: 'bookmarks',
    atom: store.showSidebarBookmarks,
    labelKey: 'com_sidepanel_conversation_tags',
    icon: Bookmark,
  },
  {
    id: 'parameters',
    atom: store.showSidebarParameters,
    labelKey: 'com_sidepanel_parameters',
    icon: SlidersHorizontal,
  },
  {
    id: 'mcp-builder',
    atom: store.showSidebarMcpBuilder,
    labelKey: 'com_nav_setting_mcp',
    icon: MCPIcon,
  },
  {
    id: 'files',
    atom: store.showSidebarFiles,
    labelKey: 'com_sidepanel_attach_files',
    icon: AttachmentIcon,
  },
];
