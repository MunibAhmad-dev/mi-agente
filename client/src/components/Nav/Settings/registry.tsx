import { SettingsTabValues } from 'librechat-data-provider';
import type { SettingEntry } from './types';
import {
  TextToSpeechSwitch,
  VoiceDropdown,
  CacheTTSSwitch,
  AutomaticPlaybackSwitch,
  CloudBrowserVoicesSwitch,
  PlaybackRate,
} from '../SettingsTabs/Speech/TTS';
import {
  SpeechToTextSwitch,
  LanguageSTTDropdown,
  AutoTranscribeAudioSwitch,
  AutoSendTextSelector,
  DecibelSelector,
} from '../SettingsTabs/Speech/STT';
import DisplayUsernameMessages from '../SettingsTabs/Account/DisplayUsernameMessages';
import ConversationModeSwitch from '../SettingsTabs/Speech/ConversationModeSwitch';
import EnableTwoFactorItem from '../SettingsTabs/Account/TwoFactorAuthentication';
import ImportConversations from '../SettingsTabs/Data/ImportConversations';
import { toggleControl, ThemeSetting, LangSetting } from './controls';
import BackupCodesItem from '../SettingsTabs/Account/BackupCodesItem';
import { EngineSTTSetting, EngineTTSSetting } from './SpeechControls';
import FontSizeSelector from '../SettingsTabs/Chat/FontSizeSelector';
import AdvancedPrompts from '../SettingsTabs/Chat/AdvancedPrompts';
import DuringRunAction from '../SettingsTabs/Chat/DuringRunAction';
import DeleteAccount from '../SettingsTabs/Account/DeleteAccount';
import { ForkSettings } from '../SettingsTabs/Chat/ForkSettings';
import ChatDirection from '../SettingsTabs/Chat/ChatDirection';
import { DeleteCache } from '../SettingsTabs/Data/DeleteCache';
import { RevokeKeys } from '../SettingsTabs/Data/RevokeKeys';
import { ClearChats } from '../SettingsTabs/Data/ClearChats';
import { TokenCredits, AutoRefill } from './BillingControls';
import SharedLinks from '../SettingsTabs/Data/SharedLinks';
import { showThinkingAtom } from '~/store/showThinking';
import ProviderKeys from '../SettingsTabs/ProviderKeys';
import Avatar from '../SettingsTabs/Account/Avatar';
import About from '../SettingsTabs/About/About';
import ApiKeys from '../SettingsTabs/ApiKeys';
import MemoryToggle from './MemoryToggle';
import CustomizeNavigation from './CustomizeNavigation';
import SoundsPanel from './SoundsPanel';
import VisionPanel from './VisionPanel';
import KnowledgeEnginePanel from './KnowledgeEnginePanel';
import RAGPanel from './RAGPanel';
import CreativeStudioPanel from './CreativeStudioPanel';
import LearningPanel from './LearningPanel';
import HarnessPanel from './HarnessPanel';
import AutonomousResearchPanel from './AutonomousResearchPanel';
import CapabilityDiscoveryPanel from './CapabilityDiscoveryPanel';
import ResearchOSPanel from './ResearchOSPanel';
import SocialMarketingPanel from './SocialMarketingPanel';
import WebClonerPanel from './WebClonerPanel';
import ReputationPlatformPanel from './ReputationPlatformPanel';
import HardwarePanel from './HardwarePanel';
import { TTSEndpoints } from '~/common';
import store from '~/store';

const { GENERAL, CHAT, SPEECH, DATA, ACCOUNT, ABOUT } = SettingsTabValues;

export const registry: SettingEntry[] = [
  // General · Appearance
  {
    id: 'theme',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_theme',
    keywords: ['dark', 'light', 'appearance', 'color'],
    Component: ThemeSetting,
  },
  {
    id: 'language',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_language',
    keywords: ['locale', 'translation'],
    Component: LangSetting,
  },
  {
    id: 'fontSize',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_font_size',
    keywords: ['text', 'zoom'],
    Component: FontSizeSelector,
  },
  {
    id: 'chatDirection',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_chat_direction',
    keywords: ['rtl', 'ltr'],
    Component: ChatDirection,
  },
  // General · Layout
  {
    id: 'maximizeChatSpace',
    tab: GENERAL,
    section: 'layout',
    labelKey: 'com_nav_maximize_chat_space',
    Component: toggleControl({
      stateAtom: store.maximizeChatSpace,
      localizationKey: 'com_nav_maximize_chat_space',
      switchId: 'maximizeChatSpace',
    }),
  },
  {
    id: 'centerFormOnLanding',
    tab: GENERAL,
    section: 'layout',
    labelKey: 'com_nav_center_chat_input',
    Component: toggleControl({
      stateAtom: store.centerFormOnLanding,
      localizationKey: 'com_nav_center_chat_input',
      switchId: 'centerFormOnLanding',
    }),
  },
  {
    id: 'showScrollButton',
    tab: GENERAL,
    section: 'layout',
    labelKey: 'com_nav_scroll_button',
    Component: toggleControl({
      stateAtom: store.showScrollButton,
      localizationKey: 'com_nav_scroll_button',
      switchId: 'showScrollButton',
    }),
  },
  // General · Accessibility
  {
    id: 'keepScreenAwake',
    tab: GENERAL,
    section: 'accessibility',
    labelKey: 'com_nav_keep_screen_awake',
    Component: toggleControl({
      stateAtom: store.keepScreenAwake,
      localizationKey: 'com_nav_keep_screen_awake',
      switchId: 'keepScreenAwake',
    }),
  },

  // Chat · Sending
  {
    id: 'enterToSend',
    tab: CHAT,
    section: 'sending',
    labelKey: 'com_nav_enter_to_send',
    keywords: ['return', 'newline'],
    Component: toggleControl({
      stateAtom: store.enterToSend,
      localizationKey: 'com_nav_enter_to_send',
      switchId: 'enterToSend',
      hoverCardText: 'com_nav_info_enter_to_send',
    }),
  },
  {
    id: 'duringRunDefaultAction',
    tab: CHAT,
    section: 'sending',
    labelKey: 'com_nav_during_run_action',
    keywords: ['steer', 'queue', 'interrupt', 'generating'],
    Component: DuringRunAction,
  },
  {
    id: 'saveDrafts',
    tab: CHAT,
    section: 'sending',
    labelKey: 'com_nav_save_drafts',
    Component: toggleControl({
      stateAtom: store.saveDrafts,
      localizationKey: 'com_nav_save_drafts',
      switchId: 'saveDrafts',
      hoverCardText: 'com_nav_info_save_draft',
    }),
  },
  {
    id: 'saveBadgesState',
    tab: CHAT,
    section: 'sending',
    labelKey: 'com_nav_save_badges_state',
    Component: toggleControl({
      stateAtom: store.saveBadgesState,
      localizationKey: 'com_nav_save_badges_state',
      switchId: 'showBadges',
      hoverCardText: 'com_nav_info_save_badges_state',
    }),
  },
  // Chat · Commands
  {
    id: 'atCommand',
    tab: CHAT,
    section: 'commands',
    labelKey: 'com_nav_at_command_description',
    Component: toggleControl({
      stateAtom: store.atCommand,
      localizationKey: 'com_nav_at_command_description',
      switchId: 'atCommand',
    }),
  },
  {
    id: 'plusCommand',
    tab: CHAT,
    section: 'commands',
    labelKey: 'com_nav_plus_command_description',
    show: (ctx) => ctx.hasMultiConvo,
    Component: toggleControl({
      stateAtom: store.plusCommand,
      localizationKey: 'com_nav_plus_command_description',
      switchId: 'plusCommand',
    }),
  },
  {
    id: 'slashCommand',
    tab: CHAT,
    section: 'commands',
    labelKey: 'com_nav_slash_command_description',
    show: (ctx) => ctx.hasPrompts,
    Component: toggleControl({
      stateAtom: store.slashCommand,
      localizationKey: 'com_nav_slash_command_description',
      switchId: 'slashCommand',
    }),
  },
  // Chat · Messages
  {
    id: 'enableUserMsgMarkdown',
    tab: CHAT,
    section: 'messages',
    labelKey: 'com_nav_user_msg_markdown',
    Component: toggleControl({
      stateAtom: store.enableUserMsgMarkdown,
      localizationKey: 'com_nav_user_msg_markdown',
      switchId: 'enableUserMsgMarkdown',
    }),
  },
  {
    id: 'usernameDisplay',
    tab: CHAT,
    section: 'messages',
    labelKey: 'com_nav_user_name_display',
    keywords: ['username', 'name'],
    Component: DisplayUsernameMessages,
  },
  {
    id: 'latexParsing',
    tab: CHAT,
    section: 'messages',
    labelKey: 'com_nav_latex_parsing',
    Component: toggleControl({
      stateAtom: store.LaTeXParsing,
      localizationKey: 'com_nav_latex_parsing',
      switchId: 'latexParsing',
      hoverCardText: 'com_nav_info_latex_parsing',
    }),
  },
  {
    id: 'showThinking',
    tab: CHAT,
    section: 'messages',
    labelKey: 'com_nav_show_thinking',
    Component: toggleControl({
      stateAtom: showThinkingAtom,
      localizationKey: 'com_nav_show_thinking',
      switchId: 'showThinking',
    }),
  },
  {
    id: 'autoExpandTools',
    tab: CHAT,
    section: 'messages',
    labelKey: 'com_nav_auto_expand_tools',
    Component: toggleControl({
      stateAtom: store.autoExpandTools,
      localizationKey: 'com_nav_auto_expand_tools',
      switchId: 'autoExpandTools',
    }),
  },
  // Chat · Conversations
  {
    id: 'newChatSwitchToHistory',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_new_chat_switch_to_history',
    Component: toggleControl({
      stateAtom: store.newChatSwitchToHistory,
      localizationKey: 'com_nav_new_chat_switch_to_history',
      switchId: 'newChatSwitchToHistory',
    }),
  },
  {
    id: 'autoScroll',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_auto_scroll',
    Component: toggleControl({
      stateAtom: store.autoScroll,
      localizationKey: 'com_nav_auto_scroll',
      switchId: 'autoScroll',
    }),
  },
  {
    id: 'modularChat',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_modular_chat',
    Component: toggleControl({
      stateAtom: store.modularChat,
      localizationKey: 'com_nav_modular_chat',
      switchId: 'modularChat',
    }),
  },
  {
    id: 'defaultTemporaryChat',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_default_temporary_chat',
    Component: toggleControl({
      stateAtom: store.defaultTemporaryChat,
      localizationKey: 'com_nav_default_temporary_chat',
      switchId: 'defaultTemporaryChat',
      hoverCardText: 'com_nav_info_default_temporary_chat',
    }),
  },
  {
    id: 'forkSettings',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_ui_fork_default',
    keywords: ['fork', 'branch', 'split'],
    Component: ForkSettings,
  },
  // Chat · Prompts
  {
    id: 'advancedPrompts',
    tab: CHAT,
    section: 'prompts',
    labelKey: 'com_nav_advanced_prompts',
    keywords: ['prompt'],
    Component: AdvancedPrompts,
  },
  {
    id: 'alwaysMakeProd',
    tab: CHAT,
    section: 'prompts',
    labelKey: 'com_nav_always_make_prod',
    Component: toggleControl({
      stateAtom: store.alwaysMakeProd,
      localizationKey: 'com_nav_always_make_prod',
      switchId: 'alwaysMakeProd',
    }),
  },
  {
    id: 'autoSendPrompts',
    tab: CHAT,
    section: 'prompts',
    labelKey: 'com_nav_auto_send_prompts',
    Component: toggleControl({
      stateAtom: store.autoSendPrompts,
      localizationKey: 'com_nav_auto_send_prompts',
      switchId: 'autoSendPrompts',
      hoverCardText: 'com_nav_auto_send_prompts_desc',
    }),
  },

  // Speech · Speech-to-text
  {
    id: 'speechToText',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_nav_speech_to_text',
    Component: SpeechToTextSwitch,
  },
  {
    id: 'engineSTT',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_ui_settings_label_engine_stt',
    Component: EngineSTTSetting,
  },
  {
    id: 'languageSTT',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_ui_settings_label_language_stt',
    Component: LanguageSTTDropdown,
  },
  {
    id: 'autoTranscribeAudio',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_nav_auto_transcribe_audio',
    Component: AutoTranscribeAudioSwitch,
  },
  {
    id: 'decibelValue',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_ui_settings_label_decibel',
    Component: DecibelSelector,
  },
  {
    id: 'autoSendText',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_nav_auto_send_text',
    Component: AutoSendTextSelector,
  },
  // Speech · Text-to-speech
  {
    id: 'textToSpeech',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_text_to_speech',
    Component: TextToSpeechSwitch,
  },
  {
    id: 'engineTTS',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_engine_tts',
    Component: EngineTTSSetting,
  },
  {
    id: 'voice',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_voice',
    Component: VoiceDropdown,
  },
  {
    id: 'conversationMode',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_conversation_mode',
    Component: ConversationModeSwitch,
  },
  {
    id: 'automaticPlayback',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_automatic_playback',
    Component: AutomaticPlaybackSwitch,
  },
  {
    id: 'cloudBrowserVoices',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_enable_cloud_browser_voice',
    show: (ctx) => ctx.engineTTS === TTSEndpoints.browser,
    Component: CloudBrowserVoicesSwitch,
  },
  {
    id: 'playbackRate',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_playback_rate',
    Component: PlaybackRate,
  },
  {
    id: 'cacheTTS',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_enable_cache_tts',
    Component: CacheTTSSwitch,
  },

  // Data controls · Memory
  {
    id: 'referenceSavedMemories',
    tab: DATA,
    section: 'memory',
    labelKey: 'com_ui_reference_saved_memories',
    keywords: ['memory', 'personalization'],
    show: (ctx) => ctx.hasMemoryOptOut,
    Component: MemoryToggle,
  },
  // Data controls · Your data
  {
    id: 'importConversations',
    tab: DATA,
    section: 'data',
    labelKey: 'com_ui_settings_label_import',
    Component: ImportConversations,
  },
  {
    id: 'sharedLinks',
    tab: DATA,
    section: 'data',
    labelKey: 'com_ui_settings_label_shared_links',
    Component: SharedLinks,
  },
  // Data controls · API keys
  {
    id: 'providerApiKeys',
    tab: DATA,
    section: 'apiKeys',
    labelKey: 'com_ui_settings_label_provider_api_keys',
    keywords: ['api', 'key', 'keys', 'provider', 'endpoint', 'credentials'],
    show: (ctx) => ctx.hasUserProvidedEndpoints,
    Component: ProviderKeys,
  },
  {
    id: 'agentApiKeys',
    tab: DATA,
    section: 'apiKeys',
    labelKey: 'com_ui_settings_label_agent_api_keys',
    show: (ctx) => ctx.hasRemoteAgents,
    Component: ApiKeys,
  },
  {
    id: 'revokeKeys',
    tab: DATA,
    section: 'apiKeys',
    labelKey: 'com_ui_settings_label_revoke_keys',
    Component: RevokeKeys,
  },
  // Data controls · Danger zone
  {
    id: 'deleteCache',
    tab: DATA,
    section: 'danger',
    labelKey: 'com_ui_settings_label_delete_cache',
    Component: DeleteCache,
  },
  {
    id: 'clearChats',
    tab: DATA,
    section: 'danger',
    labelKey: 'com_ui_settings_label_clear_chats',
    Component: ClearChats,
  },

  // Account · Profile
  {
    id: 'avatar',
    tab: ACCOUNT,
    section: 'profile',
    labelKey: 'com_ui_settings_label_avatar',
    Component: Avatar,
  },
  // Account · Security
  {
    id: 'twoFactor',
    tab: ACCOUNT,
    section: 'security',
    labelKey: 'com_ui_settings_label_2fa',
    show: (ctx) => ctx.isLocalProvider,
    Component: EnableTwoFactorItem,
  },
  {
    id: 'backupCodes',
    tab: ACCOUNT,
    section: 'security',
    labelKey: 'com_ui_settings_label_backup_codes',
    show: (ctx) => ctx.isLocalProvider && ctx.twoFactorEnabled,
    Component: BackupCodesItem,
  },
  // Account · Billing
  {
    id: 'tokenCredits',
    tab: ACCOUNT,
    section: 'billing',
    labelKey: 'com_ui_settings_label_credits',
    show: (ctx) => ctx.balanceEnabled,
    Component: TokenCredits,
  },
  {
    id: 'autoRefill',
    tab: ACCOUNT,
    section: 'billing',
    labelKey: 'com_ui_settings_label_auto_refill',
    show: (ctx) => ctx.balanceEnabled,
    Component: AutoRefill,
  },
  // Account · Danger zone
  {
    id: 'deleteAccount',
    tab: ACCOUNT,
    section: 'danger',
    labelKey: 'com_ui_settings_label_delete_account',
    show: (ctx) => ctx.allowAccountDeletion,
    Component: DeleteAccount,
  },

  // Preferences · Sounds & notifications
  {
    id: 'sounds',
    tab: 'preferences',
    section: 'sounds',
    labelKey: 'com_nav_setting_sounds',
    keywords: ['sound', 'sounds', 'notification', 'notifications', 'audio', 'volume', 'alerts'],
    Component: SoundsPanel,
  },

  // IA · Visión por computadora (FASE 31)
  {
    id: 'vision',
    tab: 'ai',
    section: 'vision',
    labelKey: 'com_nav_setting_vision',
    keywords: ['vision', 'imagen', 'image', 'ocr', 'objetos', 'objects', 'clasificar', 'computer'],
    Component: VisionPanel,
  },

  // IA · Knowledge Engine (FASE 34)
  {
    id: 'knowledge',
    tab: 'ai',
    section: 'knowledge',
    labelKey: 'com_nav_setting_knowledge',
    keywords: [
      'knowledge',
      'search',
      'buscar',
      'web',
      'verify',
      'verificar',
      'fuentes',
      'sources',
      'fact',
      'rag',
    ],
    Component: KnowledgeEnginePanel,
  },

  // IA · Base de conocimiento (RAG) (FASE 37)
  {
    id: 'rag',
    tab: 'ai',
    section: 'rag',
    labelKey: 'com_nav_setting_rag',
    keywords: [
      'rag',
      'knowledge base',
      'base de conocimiento',
      'colecciones',
      'collections',
      'indexar',
      'documentos',
      'documents',
      'semántica',
      'semantic',
    ],
    Component: RAGPanel,
  },

  // IA · Research OS (Face 21)
  {
    id: 'research-os',
    tab: 'ai',
    section: 'research',
    labelKey: 'com_nav_setting_research_os',
    keywords: ['research', 'investigación', 'universal', 'sources', 'fuentes', 'fact', 'verify', 'academic', 'deep'],
    Component: ResearchOSPanel,
  },

  // IA · Autonomous Research (Face 10)
  {
    id: 'autonomous-research',
    tab: 'ai',
    section: 'research',
    labelKey: 'com_nav_setting_autonomous_research',
    keywords: ['autonomous', 'autónomo', 'research', 'investigación', 'skill', 'hypothesis', 'loop', 'learn'],
    Component: AutonomousResearchPanel,
  },

  // IA · Agent Harness (Face 14)
  {
    id: 'harness',
    tab: 'ai',
    section: 'agents',
    labelKey: 'com_nav_setting_harness',
    keywords: ['harness', 'deepseek', 'sandbox', 'terminal', 'checkpoint', 'goals', 'agent', 'tools'],
    Component: HarnessPanel,
  },

  // IA · Learning & Experience (Face 9 + 16)
  {
    id: 'learning',
    tab: 'ai',
    section: 'agents',
    labelKey: 'com_nav_setting_learning',
    keywords: ['learning', 'aprendizaje', 'experience', 'experiencia', 'lesson', 'reflect', 'improve', 'self'],
    Component: LearningPanel,
  },

  // IA · Capability Discovery (Face 15)
  {
    id: 'capability-discovery',
    tab: 'ai',
    section: 'capabilities',
    labelKey: 'com_nav_setting_capability_discovery',
    keywords: ['capability', 'discovery', 'skills', 'plugins', 'marketplace', 'mcp', 'install', 'github', 'huggingface'],
    Component: CapabilityDiscoveryPanel,
  },

  // IA · Hardware Requirements Center (Face 13)
  {
    id: 'hardware-requirements',
    tab: 'ai',
    section: 'capabilities',
    labelKey: 'com_nav_setting_hardware_requirements',
    keywords: ['hardware', 'gpu', 'vram', 'ram', 'cpu', 'disk', 'local model', 'requirements', 'viability', 'ollama', 'llama'],
    Component: HardwarePanel,
  },

  // IA · Creative Studio (Face 22-23)
  {
    id: 'creative-studio',
    tab: 'ai',
    section: 'creative',
    labelKey: 'com_nav_setting_creative_studio',
    keywords: ['creative', 'video', 'music', 'audio', 'generate', 'ffmpeg', 'musicgen', 'animation', 'studio'],
    Component: CreativeStudioPanel,
  },

  // IA · Social Marketing Intelligence
  {
    id: 'social-marketing-intelligence',
    tab: 'ai',
    section: 'research',
    labelKey: 'com_nav_setting_social_marketing',
    keywords: [
      'social', 'marketing', 'intelligence', 'campaign', 'signal', 'audience',
      'bluesky', 'reddit', 'twitter', 'mastodon', 'youtube', 'rss', 'brand',
      'ai-cmo', 'strategy', 'content', 'engagement',
    ],
    Component: SocialMarketingPanel,
  },

  // IA · Reputation Platform (Face 19-20)
  {
    id: 'reputation-intelligence',
    tab: 'ai',
    section: 'research',
    labelKey: 'com_nav_setting_reputation_platform',
    keywords: ['reputation', 'monitor', 'evidence', 'claims', 'dispute', 'defamation', 'brand', 'osint', 'investigation', 'case'],
    Component: ReputationPlatformPanel,
  },

  // IA · Website Cloner (Face 18)
  {
    id: 'website-cloner',
    tab: 'ai',
    section: 'creative',
    labelKey: 'com_nav_setting_website_cloner',
    keywords: ['clone', 'scrape', 'website', 'reverse engineer', 'extract', 'scaffold', 'design', 'copy', 'sitio'],
    Component: WebClonerPanel,
  },

  // Navigation · Sidebar
  {
    id: 'customizeNavigation',
    tab: 'navigation',
    section: 'sidebar',
    labelKey: 'com_nav_setting_navigation',
    keywords: [
      'sidebar',
      'navigation',
      'menu',
      'agents',
      'skills',
      'prompts',
      'memories',
      'bookmarks',
      'mcp',
    ],
    Component: CustomizeNavigation,
  },

  // About
  {
    id: 'about',
    tab: ABOUT,
    section: 'about',
    labelKey: 'com_nav_setting_about',
    keywords: ['version', 'build', 'diagnostics'],
    show: (ctx) => ctx.aboutEnabled,
    Component: About,
  },
];
