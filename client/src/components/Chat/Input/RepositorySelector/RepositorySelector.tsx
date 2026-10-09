import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderGit2,
  Search,
  RefreshCw,
  Globe,
  Lock,
  ChevronDown,
  ExternalLink,
  Copy,
  X,
  Star,
  FileCode,
  GitBranch,
} from 'lucide-react';
import { useLocalize, useDebounce } from '~/hooks';
import { cn } from '~/utils';

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  stars: number;
  forks: number;
  language?: string;
  defaultBranch: string;
  updatedAt: string;
}

interface RepositorySelectorProps {
  value?: Repository | null;
  onChange: (repo: Repository | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const RepositorySelector: React.FC<RepositorySelectorProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(value || null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(search, 300);
  const localize = useLocalize();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Fetch repositories when search changes
  useEffect(() => {
    const fetchRepos = async () => {
      // Only fetch if connected (has search or just opening)
      if (!isOpen) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) {
          params.append('q', debouncedSearch);
        }
        params.append('limit', '20');
        
        const response = await fetch(`/api/connectors/github/repos?${params}`, {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch repositories');
        }
        
        const data = await response.json();
        setRepos(data.repositories || []);
      } catch (err) {
        console.error('Error fetching repos:', err);
        setError(localize('com_ui_fetch_repos_error') || 'Failed to fetch repositories');
        setRepos([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchRepos();
  }, [debouncedSearch, isOpen, localize]);

  const handleSelect = useCallback((repo: Repository) => {
    setSelectedRepo(repo);
    onChange(repo);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRepo(null);
    onChange(null);
  }, [onChange]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/connectors/github/repos?limit=20', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh');
      }
      
      const data = await response.json();
      setRepos(data.repositories || []);
    } catch (err) {
      setError(localize('com_ui_refresh_error') || 'Failed to refresh');
    } finally {
      setIsLoading(false);
    }
  }, [localize]);

  const copyCloneUrl = useCallback(async (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const openInNewTab = useCallback((url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const getLanguageColor = (language?: string) => {
    const colors: Record<string, string> = {
      JavaScript: '#f1e05a',
      TypeScript: '#3178c6',
      Python: '#3572A5',
      Java: '#b07219',
      Go: '#00ADD8',
      Rust: '#dea584',
      Ruby: '#701516',
      PHP: '#4F5D95',
      'C++': '#f34b7d',
      C: '#555555',
      'C#': '#178600',
      Swift: '#F05138',
      Kotlin: '#A97BFF',
      Dart: '#00B4AB',
    };
    return colors[language || ''] || '#8b949e';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <div className={cn('repository-selector', className)} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className={cn(
          'selector-trigger',
          selectedRepo ? 'has-value' : '',
          disabled && 'disabled'
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={selectedRepo ? selectedRepo.fullName : placeholder || localize('com_ui_select_repo')}
      >
        <FolderGit2 size={14} className="selector-icon" />
        
        {selectedRepo ? (
          <div className="selected-repo">
            <span className="repo-name">
              {selectedRepo.private && <Lock size={10} className="private-icon" />}
              {selectedRepo.name}
            </span>
            <span className="repo-meta">
              {selectedRepo.stars > 0 && (
                <span className="meta-item">
                  <Star size={10} />
                  {formatNumber(selectedRepo.stars)}
                </span>
              )}
              {selectedRepo.language && (
                <span 
                  className="meta-item language-dot"
                  style={{ backgroundColor: getLanguageColor(selectedRepo.language) }}
                >
                  {selectedRepo.language}
                </span>
              )}
            </span>
          </div>
        ) : (
          <span className="placeholder">
            {placeholder || localize('com_ui_select_repo') || 'Select repository'}
          </span>
        )}
        
        <ChevronDown 
          size={14} 
          className={cn('chevron', isOpen && 'open')} 
        />
      </button>

      {/* Clear Button */}
      {selectedRepo && !disabled && (
        <button
          type="button"
          className="clear-btn"
          onClick={handleClear}
          title={localize('com_ui_clear') || 'Clear'}
        >
          <X size={12} />
        </button>
      )}

      {/* Refresh Button */}
      <button
        type="button"
        className={cn('sync-btn', isLoading && 'loading')}
        onClick={handleRefresh}
        disabled={isLoading}
        title={localize('com_ui_refresh') || 'Refresh'}
      >
        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="selector-dropdown">
          {/* Search */}
          <div className="search-container">
            <Search size={14} className="search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder={localize('com_ui_search_repos') || 'Search repositories...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch('')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="dropdown-loading">
              <RefreshCw size={16} className="animate-spin" />
              <span>{localize('com_ui_loading') || 'Loading...'}</span>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="dropdown-error">
              <span>{error}</span>
              <button onClick={handleRefresh}>
                <RefreshCw size={14} />
              </button>
            </div>
          )}

          {/* Repos List */}
          {!isLoading && !error && (
            <div className="repos-list">
              {repos.length === 0 ? (
                <div className="empty-state">
                  {search ? (
                    <>
                      <Search size={24} />
                      <span>{localize('com_ui_no_results') || 'No repositories found'}</span>
                    </>
                  ) : (
                    <>
                      <FolderGit2 size={24} />
                      <span>{localize('com_ui_connect_github') || 'Connect GitHub to see repositories'}</span>
                    </>
                  )}
                </div>
              ) : (
                repos.map((repo) => (
                  <div
                    key={repo.id}
                    className={cn('repo-item', selectedRepo?.id === repo.id && 'selected')}
                    onClick={() => handleSelect(repo)}
                  >
                    <div className="repo-info">
                      <div className="repo-header">
                        <FolderGit2 size={14} className="repo-icon" />
                        <span className="repo-name">{repo.name}</span>
                        {repo.private && (
                          <Lock size={12} className="private-badge" />
                        )}
                      </div>
                      
                      {repo.description && (
                        <div className="repo-description">
                          {repo.description.length > 80
                            ? repo.description.substring(0, 80) + '...'
                            : repo.description}
                        </div>
                      )}
                      
                      <div className="repo-meta">
                        {repo.stars > 0 && (
                          <span className="meta-item">
                            <Star size={12} />
                            {formatNumber(repo.stars)}
                          </span>
                        )}
                        {repo.forks > 0 && (
                          <span className="meta-item">
                            <GitBranch size={12} />
                            {formatNumber(repo.forks)}
                          </span>
                        )}
                        {repo.language && (
                          <span 
                            className="meta-item language"
                            style={{ color: getLanguageColor(repo.language) }}
                          >
                            <FileCode size={12} />
                            {repo.language}
                          </span>
                        )}
                        <span className="meta-item updated">
                          {formatDate(repo.updatedAt)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="repo-actions">
                      <button
                        className="action-btn"
                        onClick={(e) => openInNewTab(repo.htmlUrl, e)}
                        title={localize('com_ui_open_github') || 'Open in GitHub'}
                      >
                        <ExternalLink size={12} />
                      </button>
                      <button
                        className={cn('action-btn', copied && 'success')}
                        onClick={(e) => copyCloneUrl(repo.cloneUrl, e)}
                        title={localize('com_ui_copy_clone') || 'Copy clone URL'}
                      >
                        {copied ? <Copy size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Footer */}
          <div className="dropdown-footer">
            <span className="repo-count">
              {repos.length} {localize('com_ui_repositories') || 'repositories'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepositorySelector;
