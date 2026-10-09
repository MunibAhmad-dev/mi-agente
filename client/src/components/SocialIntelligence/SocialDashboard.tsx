/**
 * SocialDashboard.tsx — Main Social Intelligence Dashboard
 * =========================================================
 * Shows connector status, search, signals, opportunities, and audience.
 */
import React, { useState, useEffect, useCallback } from 'react';

interface ConnectorInfo { id: string; name: string; status: string; }
interface SignalInfo { id: string; type: string; confidence: number; source: string; topics: string[]; detectedAt: number; }
interface OpportunityInfo { id: string; type: string; title: string; score: number; description: string; }
interface SegmentInfo { id: string; name: string; size: number; topics: string[]; }
interface SearchResult { id: string; title: string; body: string; url: string; source: string; metrics: Record<string, number>; }

export default function SocialDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [signals, setSignals] = useState<SignalInfo[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityInfo[]>([]);
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/social/status');
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/social/connectors');
      if (res.ok) { const data = await res.json(); setConnectors(data.connectors || []); }
    } catch {}
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/social/signals');
      if (res.ok) { const data = await res.json(); setSignals(data.signals || []); }
    } catch {}
  }, []);

  const fetchOpportunities = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/social/opportunities');
      if (res.ok) { const data = await res.json(); setOpportunities(data.opportunities || []); }
    } catch {}
  }, []);

  const fetchSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/social/audience/segments');
      if (res.ok) { const data = await res.json(); setSegments(data.segments || []); }
    } catch {}
  }, []);

  useEffect(() => { fetchStatus(); fetchConnectors(); }, [fetchStatus, fetchConnectors]);
  useEffect(() => { fetchSignals(); fetchOpportunities(); fetchSegments(); }, [fetchSignals, fetchOpportunities, fetchSegments]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/social/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxResults: 50 }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.data?.contents || []);
        setSignals(data.data?.signals || []);
        setOpportunities(data.data?.opportunities || []);
        setSegments(data.data?.segments || []);
      }
    } catch {}
    setLoading(false);
  };

  const tabs = ['overview', 'search', 'signals', 'opportunities', 'audience', 'connectors'];

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">🌐 Social Intelligence Dashboard</h2>

      {/* Status Bar */}
      {status && (
        <div className="flex gap-4 text-sm">
          <span className="px-2 py-1 rounded bg-green-900/30 text-green-400">Connectors: {status.healthyConnectors}/{status.connectors}</span>
          <span className="px-2 py-1 rounded bg-blue-900/30 text-blue-400">Signals: {status.signals}</span>
          <span className="px-2 py-1 rounded bg-purple-900/30 text-purple-400">Evidence: {status.evidence}</span>
          <span className="px-2 py-1 rounded bg-orange-900/30 text-orange-400">Segments: {status.segments}</span>
          <span className="px-2 py-1 rounded bg-yellow-900/30 text-yellow-400">Opportunities: {status.opportunities}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm capitalize ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4"><h3 className="text-lg font-semibold mb-2">📡 Connectors</h3>
            <div className="text-3xl font-bold text-blue-400">{connectors.length}</div>
            <div className="text-sm text-gray-400 mt-1">{connectors.filter((c) => c.status === 'healthy').length} healthy</div></div>
          <div className="bg-gray-800 rounded-lg p-4"><h3 className="text-lg font-semibold mb-2">🔔 Signals</h3>
            <div className="text-3xl font-bold text-green-400">{signals.length}</div></div>
          <div className="bg-gray-800 rounded-lg p-4"><h3 className="text-lg font-semibold mb-2">💡 Opportunities</h3>
            <div className="text-3xl font-bold text-yellow-400">{opportunities.length}</div></div>
          <div className="bg-gray-800 rounded-lg p-4"><h3 className="text-lg font-semibold mb-2">👥 Segments</h3>
            <div className="text-3xl font-bold text-purple-400">{segments.length}</div></div>
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search social media intelligence..."
              className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-blue-500" />
            <button onClick={handleSearch} disabled={loading}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? '⏳ Searching...' : '🔍 Search'}
            </button>
          </div>
          <div className="space-y-3">
            {searchResults.map((r, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-blue-500">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">{r.source}</span>
                  {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs hover:underline">↗</a>}
                </div>
                <h4 className="font-semibold">{r.title || 'Untitled'}</h4>
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{r.body?.slice(0, 200)}</p>
                {r.metrics && <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  {r.metrics.likes > 0 && <span>❤️ {r.metrics.likes}</span>}
                  {r.metrics.comments > 0 && <span>💬 {r.metrics.comments}</span>}
                  {r.metrics.shares > 0 && <span>🔄 {r.metrics.shares}</span>}
                </div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signals Tab */}
      {activeTab === 'signals' && (
        <div className="space-y-3">
          {signals.length === 0 && <div className="text-gray-500">No signals detected yet. Run a search first.</div>}
          {signals.map((s, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex items-center gap-4">
              <span className="text-2xl">{getSignalIcon(s.type)}</span>
              <div className="flex-1">
                <div className="font-semibold text-sm">{s.type.replace(/_/g, ' ')}</div>
                <div className="text-xs text-gray-400">{s.source} • {s.topics?.slice(0, 3).join(', ')}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono">{Math.round(s.confidence * 100)}%</div>
                <div className="text-xs text-gray-500">{new Date(s.detectedAt).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Opportunities Tab */}
      {activeTab === 'opportunities' && (
        <div className="space-y-3">
          {opportunities.length === 0 && <div className="text-gray-500">No opportunities detected yet.</div>}
          {opportunities.map((o, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/50 text-yellow-400">{o.type.replace(/_/g, ' ')}</span>
                  <h4 className="font-semibold mt-1">{o.title}</h4>
                  <p className="text-sm text-gray-400 mt-1">{o.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-yellow-400">{Math.round(o.score * 100)}%</div>
                  <div className="text-xs text-gray-500">score</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audience Tab */}
      {activeTab === 'audience' && (
        <div className="space-y-3">
          {segments.length === 0 && <div className="text-gray-500">No audience segments yet.</div>}
          {segments.map((s, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="font-semibold">{s.name}</h4>
              <div className="text-sm text-gray-400 mt-1">Size: {s.size} • Topics: {s.topics?.join(', ')}</div>
            </div>
          ))}
        </div>
      )}

      {/* Connectors Tab */}
      {activeTab === 'connectors' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {connectors.map((c, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${c.status === 'healthy' ? 'bg-green-500' : c.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <h4 className="font-semibold">{c.name}</h4>
              </div>
              <div className="text-xs text-gray-400 mt-1">v{c.version} • {c.source}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getSignalIcon(type: string): string {
  const icons: Record<string, string> = {
    purchase_intent: '💰', question: '❓', comparison: '⚖️', complaint: '😤',
    recommendation_request: '📢', trend: '📈', pain_point: '😣', alternative_seeking: '🔍',
    budget_signal: '💵', urgency: '⏰', engagement_pattern: '📊', content_request: '📝',
    decision_making: '🤔', opportunity: '💡',
  };
  return icons[type] || '🔔';
}
