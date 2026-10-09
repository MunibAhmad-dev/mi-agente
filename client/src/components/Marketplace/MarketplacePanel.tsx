/**
 * Marketplace Panel
 * =================
 * Panel de Marketplace para skills y plugins de IA
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMarketplaceSkills,
  useMarketplaceCategories,
  useMarketplaceFeatured,
  useMarketplaceStats,
  useMarketplaceInstallSkill,
} from 'librechat-data-provider';
import * as marketplaceService from 'librechat-data-provider/marketplace-service';

// Íconos para fuentes
const SOURCE_ICONS: Record<string, string> = {
  mcp: '🔌',
  npm: '📦',
  pypi: '🐍',
  github: '🐙',
  huggingface: '🤗',
};

// Íconos para tipos
const TYPE_ICONS: Record<string, string> = {
  skill: '⭐',
  plugin: '🔌',
  tool: '🛠️',
  dataset: '📊',
  model: '🧠',
  agent: '🤖',
};

interface MarketplacePanelProps {
  onClose?: () => void;
  onSkillSelect?: (skill: marketplaceService.MarketplaceSkill) => void;
}

type ViewMode = 'browse' | 'category' | 'skill';

export function MarketplacePanel({ onClose, onSkillSelect }: MarketplacePanelProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewMode>('browse');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedSkill, setSelectedSkill] = useState<marketplaceService.MarketplaceSkill | undefined>();
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<'rating' | 'downloads' | 'stars'>('rating');
  const [searchQuery, setSearchQuery] = useState('');

  // Queries
  const skillsQuery = useMarketplaceSkills({
    category: selectedCategory,
    agent: selectedAgent,
    sortBy,
    limit: 50,
  });
  const featuredQuery = useMarketplaceFeatured();
  const categoriesQuery = useMarketplaceCategories();
  const statsQuery = useMarketplaceStats();
  const installMutation = useMarketplaceInstallSkill();

  // Filtrar skills
  const filteredSkills = useMemo(() => {
    let skills = skillsQuery.data?.skills ?? [];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      skills = skills.filter(
        s =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags?.some(t => t.toLowerCase().includes(query))
      );
    }
    
    return skills;
  }, [skillsQuery.data?.skills, searchQuery]);

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setView('category');
  };

  const handleSkillClick = (skill: marketplaceService.MarketplaceSkill) => {
    setSelectedSkill(skill);
    setView('skill');
    if (onSkillSelect) {
      onSkillSelect(skill);
    }
  };

  const handleInstall = async (skill: marketplaceService.MarketplaceSkill) => {
    if (selectedAgent) {
      await installMutation.mutateAsync({ id: skill.id, agent: selectedAgent });
    }
  };

  const renderStars = (rating?: number) => {
    if (!rating) return null;
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    return (
      <span className="flex items-center gap-1">
        <span className="text-yellow-400">{'★'.repeat(fullStars)}</span>
        {hasHalf && <span className="text-yellow-400">½</span>}
        <span className="text-gray-400 text-sm ml-1">({rating.toFixed(1)})</span>
      </span>
    );
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {view === 'skill' && selectedSkill ? selectedSkill.name : t('marketplace_title', 'AI Skills Marketplace')}
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label={(t as (k: string, d?: string) => string)('close', 'Close')}
          >
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('marketplace_search', 'Search skills, tools, plugins...')}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 pr-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {statsQuery.data && (
        <div className="mx-4 mb-4 flex flex-wrap gap-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-white">{statsQuery.data.totalSkills}</span>
            <span className="ml-1 text-gray-500">{t('marketplace_skills', 'Skills')}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-white">{statsQuery.data.totalCategories}</span>
            <span className="ml-1 text-gray-500">{t('marketplace_categories', 'Categories')}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-white">
              {marketplaceService.formatDownloads(statsQuery.data.totalDownloads)}
            </span>
            <span className="ml-1 text-gray-500">{t('marketplace_downloads', 'Downloads')}</span>
          </div>
        </div>
      )}

      {/* Agent Selector */}
      <div className="mx-4 mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('marketplace_filter_agent', 'Filter by agent')}
        </label>
        <select
          value={selectedAgent || ''}
          onChange={(e) => setSelectedAgent(e.target.value || undefined)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="">{t('marketplace_all_agents', 'All agents')}</option>
          <option value="claude_code">🤖 Claude Code</option>
          <option value="cursor">👨‍💻 Cursor</option>
          <option value="windsurf">🌊 Windsurf</option>
          <option value="manus">📖 Manus</option>
          <option value="openhands">🤝 OpenHands</option>
          <option value="continue">▶️ Continue</option>
        </select>
      </div>

      {/* Sort */}
      <div className="mx-4 mb-4 flex gap-2">
        <button
          onClick={() => setSortBy('rating')}
          className={`rounded px-3 py-1 text-sm ${
            sortBy === 'rating' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          ⭐ {t('marketplace_sort_rating', 'Top Rated')}
        </button>
        <button
          onClick={() => setSortBy('downloads')}
          className={`rounded px-3 py-1 text-sm ${
            sortBy === 'downloads' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          📥 {t('marketplace_sort_downloads', 'Most Downloaded')}
        </button>
        <button
          onClick={() => setSortBy('stars')}
          className={`rounded px-3 py-1 text-sm ${
            sortBy === 'stars' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          ⭐ {t('marketplace_sort_stars', 'Most Stars')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Categories Grid */}
        {view === 'browse' && !searchQuery && (
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium text-gray-500">
              {t('marketplace_categories', 'Categories')}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {categoriesQuery.data?.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className="flex flex-col items-center rounded-lg border border-gray-200 p-4 text-center transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  style={{ borderLeftColor: cat.color, borderLeftWidth: 3 }}
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                    {cat.name}
                  </span>
                  <span className="text-xs text-gray-500">{cat.skillCount} skills</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Featured Skills */}
        {view === 'browse' && !selectedCategory && (
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium text-gray-500">
              ⭐ {t('marketplace_featured', 'Featured Skills')}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {featuredQuery.data?.slice(0, 6).map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => handleSkillClick(skill)}
                  renderStars={renderStars}
                />
              ))}
            </div>
          </div>
        )}

        {/* All Skills or Category Skills */}
        {(view === 'category' || searchQuery || view === 'browse') && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-500">
                {selectedCategory
                  ? categoriesQuery.data?.find(c => c.id === selectedCategory)?.name
                  : searchQuery
                  ? t('marketplace_search_results', 'Search Results')
                  : t('marketplace_all_skills', 'All Skills')}
                <span className="ml-2 text-gray-400">({filteredSkills.length})</span>
              </h3>
              {view === 'category' && (
                <button
                  onClick={() => { setView('browse'); setSelectedCategory(undefined); }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  ← {t('marketplace_back', 'Back')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => handleSkillClick(skill)}
                  renderStars={renderStars}
                />
              ))}
            </div>
            {filteredSkills.length === 0 && (
              <div className="py-8 text-center text-gray-500">
                {t('marketplace_no_results', 'No skills found')}
              </div>
            )}
          </div>
        )}

        {/* Skill Detail */}
        {view === 'skill' && selectedSkill && (
          <div>
            <button
              onClick={() => setView(selectedCategory ? 'category' : 'browse')}
              className="mb-4 text-sm text-blue-600 hover:text-blue-800"
            >
              ← {t('marketplace_back', 'Back')}
            </button>
            
            <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700">
              <div className="mb-4 flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 text-3xl dark:bg-gray-700">
                  {TYPE_ICONS[selectedSkill.type] || '📦'}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedSkill.name}
                  </h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-2xl">{SOURCE_ICONS[selectedSkill.source] || '📦'}</span>
                    <span className="text-sm text-gray-500">{selectedSkill.source}</span>
                    {selectedSkill.verified && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        ✓ {t('marketplace_verified', 'Verified')}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">{renderStars(selectedSkill.rating)}</div>
                </div>
              </div>

              <p className="text-gray-600 dark:text-gray-300">{selectedSkill.description}</p>

              {/* Tags */}
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedSkill.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Compatible Agents */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('marketplace_compatible', 'Compatible with')}
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedSkill.compatibleAgents?.map((agent) => (
                    <span
                      key={agent}
                      className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </div>

              {/* Install */}
              {selectedAgent && selectedSkill.compatibleAgents?.includes(selectedAgent) && (
                <div className="mt-6">
                  <button
                    onClick={() => handleInstall(selectedSkill)}
                    disabled={installMutation.isLoading}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {installMutation.isLoading
                      ? t('marketplace_installing', 'Installing...')
                      : t('marketplace_install', 'Install for')} {selectedAgent}
                  </button>
                </div>
              )}

              {/* Link */}
              <div className="mt-4">
                <a
                  href={selectedSkill.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {t('marketplace_view_source', 'View on')} {selectedSkill.source} →
                </a>
              </div>

              {/* Stats */}
              <div className="mt-4 flex gap-6 text-sm text-gray-500">
                {selectedSkill.stars && (
                  <span>⭐ {marketplaceService.formatStars(selectedSkill.stars)} stars</span>
                )}
                {selectedSkill.downloads && (
                  <span>📥 {marketplaceService.formatDownloads(selectedSkill.downloads)} downloads</span>
                )}
                {selectedSkill.reviewCount && (
                  <span>💬 {selectedSkill.reviewCount} reviews</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-2 text-center text-xs text-gray-500 dark:border-gray-700">
        {t('marketplace_footer', 'Powered by MCP, NPM, PyPI, GitHub & HuggingFace')}
      </div>
    </div>
  );
}

// Skill Card Component
interface SkillCardProps {
  skill: marketplaceService.MarketplaceSkill;
  onClick: () => void;
  renderStars: (rating?: number) => JSX.Element | null;
}

function SkillCard({ skill, onClick, renderStars }: SkillCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-gray-200 p-4 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xl dark:bg-gray-600">
          {TYPE_ICONS[skill.type] || '📦'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900 dark:text-white">
              {skill.name}
            </span>
            {skill.verified && (
              <span className="flex-shrink-0 text-xs text-green-600">✓</span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">{skill.description}</p>
          <div className="mt-2 flex items-center gap-2">
            {renderStars(skill.rating)}
            <span className="text-xs text-gray-400">
              {SOURCE_ICONS[skill.source]} {skill.source}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default MarketplacePanel;
