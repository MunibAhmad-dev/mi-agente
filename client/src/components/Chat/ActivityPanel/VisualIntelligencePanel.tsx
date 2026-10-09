/**
 * VisualIntelligencePanel — Face 9: Visual Intelligence & Visual Software Engineering.
 *
 * Provides:
 *   - Capability status (playwright / puppeteer / sharp)
 *   - HTML audit (DOM + accessibility + UI pattern analysis)
 *   - URL audit (screenshot + full analysis when browser tools available)
 */
import React, { useState } from 'react';
import { Eye, CheckCircle2, XCircle, Loader2, AlertTriangle, Globe, Code2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { cn } from '~/utils';

interface VisualIntelligencePanelProps {
  className?: string;
}

interface CapabilityStatus {
  playwright: boolean;
  puppeteer: boolean;
  sharp: boolean;
  capabilities: {
    screenshot: boolean;
    domAnalysis: boolean;
    accessibility: boolean;
    uiEvaluation: boolean;
    visualRegression: boolean;
    playwrightInspection: boolean;
  };
  note?: string | null;
}

interface Issue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  wcag?: string;
}

interface AuditResult {
  ok: boolean;
  overallScore?: number;
  dom?: { issues: Issue[]; stats: Record<string, number>; score: number };
  accessibility?: { passed: { id: string; description: string; wcag?: string }[]; failed: { id: string; description: string; wcag?: string }[]; score: number; summary: string };
  ui?: { patterns: { name: string; description: string }[]; antiPatterns: { name: string; description: string; severity: string }[]; score: number };
  screenshot?: { success: boolean; data?: string; format?: string; error?: string };
  error?: string;
}

async function fetchStatus(): Promise<CapabilityStatus> {
  const res = await fetch('/api/visual-intelligence/status', { credentials: 'include' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function analyzeHTML(html: string): Promise<AuditResult> {
  const res = await fetch('/api/visual-intelligence/analyze-html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ html }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function auditPage(url: string): Promise<AuditResult> {
  const res = await fetch('/api/visual-intelligence/audit-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
  const color =
    score >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : score >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', color)}>
      {score}/100
    </span>
  );
};

const IssueSeverityIcon: React.FC<{ severity: string }> = ({ severity }) => {
  if (severity === 'error') return <XCircle size={11} className="shrink-0 text-red-500" />;
  if (severity === 'warning') return <AlertTriangle size={11} className="shrink-0 text-yellow-500" />;
  return <CheckCircle2 size={11} className="shrink-0 text-blue-400" />;
};

const CapabilityRow: React.FC<{ label: string; available: boolean }> = ({ label, available }) => (
  <div className="flex items-center gap-1.5 text-xs">
    {available
      ? <CheckCircle2 size={12} className="text-green-500" />
      : <XCircle size={12} className="text-gray-400" />
    }
    <span className={available ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}>
      {label}
    </span>
  </div>
);

const Collapsible: React.FC<{ title: string; badge?: React.ReactNode; children: React.ReactNode }> = ({ title, badge, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <span className="flex items-center gap-2">{title}{badge}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div className="border-t border-gray-200 px-2.5 py-2 dark:border-gray-700">{children}</div>}
    </div>
  );
};

// ── Main Panel ─────────────────────────────────────────────────────────────

export const VisualIntelligencePanel: React.FC<VisualIntelligencePanelProps> = ({ className }) => {
  const [htmlInput, setHtmlInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [activeMode, setActiveMode] = useState<'html' | 'url'>('html');

  const { data: status, isLoading: statusLoading, refetch } = useQuery({
    queryKey: ['visual-intelligence-status'],
    queryFn: fetchStatus,
    retry: 1,
  });

  const htmlMut = useMutation({
    mutationFn: analyzeHTML,
    onSuccess: (data) => setAuditResult(data),
  });

  const urlMut = useMutation({
    mutationFn: auditPage,
    onSuccess: (data) => setAuditResult(data),
  });

  const isBusy = htmlMut.isLoading || urlMut.isLoading;
  const mutError = htmlMut.error || urlMut.error;

  return (
    <div className={cn('flex h-full flex-col overflow-y-auto', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <Eye size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Visual Intelligence</span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
            Face 9
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
          title="Refresh status"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* Capability status */}
        {statusLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" />Loading capabilities…
          </div>
        ) : status ? (
          <div className="rounded border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Available Capabilities
            </p>
            <div className="grid grid-cols-2 gap-1">
              <CapabilityRow label="DOM Analysis" available={status.capabilities.domAnalysis} />
              <CapabilityRow label="Accessibility" available={status.capabilities.accessibility} />
              <CapabilityRow label="UI Evaluation" available={status.capabilities.uiEvaluation} />
              <CapabilityRow label="Screenshots" available={status.capabilities.screenshot} />
              <CapabilityRow label="Visual Regression" available={status.capabilities.visualRegression} />
              <CapabilityRow label="Playwright" available={status.playwright} />
            </div>
            {status.note && (
              <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                {status.note}
              </p>
            )}
          </div>
        ) : null}

        {/* Mode selector */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveMode('html')}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors',
              activeMode === 'html'
                ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700',
            )}
          >
            <Code2 size={12} />
            Analyze HTML
          </button>
          <button
            onClick={() => setActiveMode('url')}
            disabled={!status?.capabilities.screenshot}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              activeMode === 'url'
                ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700',
            )}
          >
            <Globe size={12} />
            Audit URL
          </button>
        </div>

        {/* Input area */}
        {activeMode === 'html' ? (
          <div>
            <textarea
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              placeholder="Paste HTML to analyze for accessibility, DOM structure, and UI patterns…"
              rows={6}
              className="w-full resize-none rounded border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs text-gray-700 placeholder-gray-400 focus:border-indigo-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <button
              onClick={() => htmlMut.mutate(htmlInput)}
              disabled={isBusy || !htmlInput.trim()}
              className="mt-1.5 flex items-center gap-1.5 rounded border border-indigo-300 bg-indigo-100 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
            >
              {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
              Analyze
            </button>
          </div>
        ) : (
          <div>
            <div className="flex gap-1.5">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isBusy && urlInput.trim() && urlMut.mutate(urlInput.trim())}
                placeholder="https://example.com"
                className="flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-indigo-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
              <button
                onClick={() => urlMut.mutate(urlInput.trim())}
                disabled={isBusy || !urlInput.trim()}
                className="flex items-center gap-1.5 rounded border border-indigo-300 bg-indigo-100 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
              >
                {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
                Audit
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {mutError ? (
          <p className="text-xs text-red-500">{String(mutError)}</p>
        ) : null}

        {/* Results */}
        {auditResult && (
          <div className="space-y-2">
            {/* Overall score */}
            {auditResult.overallScore !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Overall Score:</span>
                <ScoreBadge score={auditResult.overallScore} />
              </div>
            )}

            {/* Screenshot preview */}
            {auditResult.screenshot?.success && auditResult.screenshot.data && (
              <Collapsible title="Screenshot">
                <img
                  src={`data:image/${auditResult.screenshot.format || 'png'};base64,${auditResult.screenshot.data}`}
                  alt="Page screenshot"
                  className="w-full rounded border border-gray-200 dark:border-gray-700"
                />
              </Collapsible>
            )}
            {auditResult.screenshot && !auditResult.screenshot.success && (
              <p className="text-xs text-amber-500">{auditResult.screenshot.error}</p>
            )}

            {/* DOM Analysis */}
            {auditResult.dom && (
              <Collapsible
                title="DOM Analysis"
                badge={<ScoreBadge score={auditResult.dom.score} />}
              >
                <div className="space-y-1">
                  {auditResult.dom.issues.length === 0 ? (
                    <p className="text-xs text-green-600 dark:text-green-400">No DOM issues found.</p>
                  ) : (
                    auditResult.dom.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                        <IssueSeverityIcon severity={issue.severity} />
                        <span>{issue.message}{issue.wcag ? ` (${issue.wcag})` : ''}</span>
                      </div>
                    ))
                  )}
                  {Object.keys(auditResult.dom.stats).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {Object.entries(auditResult.dom.stats).map(([k, v]) => (
                        <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Collapsible>
            )}

            {/* Accessibility */}
            {auditResult.accessibility && (
              <Collapsible
                title="Accessibility"
                badge={<ScoreBadge score={auditResult.accessibility.score} />}
              >
                <p className="mb-1 text-xs text-gray-500">{auditResult.accessibility.summary}</p>
                <div className="space-y-0.5">
                  {auditResult.accessibility.failed.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <XCircle size={11} className="shrink-0 text-red-500" />
                      <span className="text-gray-700 dark:text-gray-300">{f.description}</span>
                      {f.wcag && <span className="text-gray-400">{f.wcag}</span>}
                    </div>
                  ))}
                  {auditResult.accessibility.passed.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <CheckCircle2 size={11} className="shrink-0 text-green-500" />
                      <span className="text-gray-400 dark:text-gray-500">{p.description}</span>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}

            {/* UI Evaluation */}
            {auditResult.ui && (
              <Collapsible
                title="UI Patterns"
                badge={<ScoreBadge score={auditResult.ui.score} />}
              >
                {auditResult.ui.patterns.length > 0 && (
                  <div className="mb-1.5 space-y-0.5">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">Good patterns:</p>
                    {auditResult.ui.patterns.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <CheckCircle2 size={11} className="shrink-0 text-green-500" />
                        <span className="text-gray-600 dark:text-gray-400">{p.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                {auditResult.ui.antiPatterns.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">Issues:</p>
                    {auditResult.ui.antiPatterns.map((a, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <IssueSeverityIcon severity={a.severity} />
                        <span className="text-gray-700 dark:text-gray-300">{a.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                {auditResult.ui.patterns.length === 0 && auditResult.ui.antiPatterns.length === 0 && (
                  <p className="text-xs text-gray-400">No patterns detected.</p>
                )}
              </Collapsible>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
