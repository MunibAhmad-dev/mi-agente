/**
 * MarketingDashboard.tsx — AI-CMO Marketing Dashboard
 * =====================================================
 * Strategy, content calendar, campaigns, and analytics.
 */
import React, { useState, useCallback } from 'react';

interface Strategy { id: string; name: string; objective: string; recommendations: any[]; contentIdeas: any[]; channels: any[]; }
interface ContentPlan { id: string; strategyId: string; items: any[]; }
interface Campaign { campaignId: string; name: string; status: string; metrics: any; }

export default function MarketingDashboard() {
  const [activeTab, setActiveTab] = useState('pipeline');
  const [objective, setObjective] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const runPipeline = async () => {
    if (!objective.trim() && !query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/marketing/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, query: query || objective, maxResults: 30 }),
      });
      if (res.ok) {
        const data = await res.json();
        setPipelineResult(data);
        if (data.data?.strategy) setStrategies((prev) => [...prev, data.data.strategy]);
      }
    } catch {}
    setLoading(false);
  };

  const createCampaign = async (strategyId: string) => {
    try {
      const res = await fetch('/api/v1/marketing/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Campaign from strategy ${strategyId.slice(0, 8)}`,
          objective: 'Execute marketing strategy',
          channels: ['reddit', 'bluesky'],
        }),
      });
      if (res.ok) {
        const campaign = await res.json();
        setCampaigns((prev) => [...prev, campaign]);
      }
    } catch {}
  };

  const tabs = ['pipeline', 'strategies', 'content', 'campaigns'];

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">🎯 AI-CMO Marketing Dashboard</h2>

      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm capitalize ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Pipeline Tab */}
      {activeTab === 'pipeline' && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">🚀 Full Intelligence → Strategy Pipeline</h3>
            <input type="text" value={objective} onChange={(e) => setObjective(e.target.value)}
              placeholder="Marketing objective (e.g., 'Find audience for ceramic workshops')"
              className="w-full px-4 py-2 rounded bg-gray-700 border border-gray-600 text-white" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search query (optional, defaults to objective)"
              className="w-full px-4 py-2 rounded bg-gray-700 border border-gray-600 text-white" />
            <button onClick={runPipeline} disabled={loading}
              className="px-6 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              {loading ? '⏳ Running Pipeline...' : '▶️ Run Full Pipeline'}
            </button>
          </div>

          {pipelineResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <div className="bg-gray-800 rounded p-3 text-center">
                  <div className="text-2xl font-bold text-blue-400">{pipelineResult.contents || 0}</div>
                  <div className="text-xs text-gray-400">Contents</div></div>
                <div className="bg-gray-800 rounded p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{pipelineResult.signals || 0}</div>
                  <div className="text-xs text-gray-400">Signals</div></div>
                <div className="bg-gray-800 rounded p-3 text-center">
                  <div className="text-2xl font-bold text-purple-400">{pipelineResult.evidence || 0}</div>
                  <div className="text-xs text-gray-400">Evidence</div></div>
                <div className="bg-gray-800 rounded p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{pipelineResult.segments || 0}</div>
                  <div className="text-xs text-gray-400">Segments</div></div>
                <div className="bg-gray-800 rounded p-3 text-center">
                  <div className="text-2xl font-bold text-orange-400">{pipelineResult.opportunities || 0}</div>
                  <div className="text-xs text-gray-400">Opportunities</div></div>
                <div className="bg-gray-800 rounded p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{pipelineResult.results?.strategy?.recommendations?.length || 0}</div>
                  <div className="text-xs text-gray-400">Recommendations</div></div>
              </div>

              {pipelineResult.data?.strategy && (
                <div className="bg-gray-800 rounded-lg p-4 border border-green-700">
                  <h4 className="font-semibold text-green-400">📋 Generated Strategy: {pipelineResult.data.strategy.name}</h4>
                  <div className="mt-2 space-y-1">
                    {(pipelineResult.data.strategy.recommendations || []).map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${r.priority === 'high' ? 'bg-red-900/50 text-red-400' : 'bg-gray-700 text-gray-400'}`}>{r.priority}</span>
                        <span>{r.action}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => createCampaign(pipelineResult.data.strategy.id)}
                    className="mt-3 px-4 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700">
                    Create Campaign from Strategy
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Strategies Tab */}
      {activeTab === 'strategies' && (
        <div className="space-y-3">
          {strategies.length === 0 && <div className="text-gray-500">No strategies yet. Run the pipeline first.</div>}
          {strategies.map((s, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="font-semibold">{s.name}</h4>
              <p className="text-sm text-gray-400 mt-1">{s.objective}</p>
              <div className="mt-2 space-y-1">
                {(s.recommendations || []).slice(0, 3).map((r: any, j: number) => (
                  <div key={j} className="text-sm text-gray-300">• {r.action}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="text-gray-500">Content calendar will show planned content items from generated strategies.</div>
      )}

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <div className="space-y-3">
          {campaigns.length === 0 && <div className="text-gray-500">No campaigns yet. Create one from a strategy.</div>}
          {campaigns.map((c, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
              <div>
                <h4 className="font-semibold">{c.name}</h4>
                <span className="px-2 py-0.5 rounded text-xs bg-gray-700">{c.status}</span>
              </div>
              <div className="text-sm text-gray-400">{c.channels?.join(', ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
