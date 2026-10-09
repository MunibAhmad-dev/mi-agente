import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { WidgetType } from './MetricsPanel';
import './MetricWidget.css';

interface MetricWidgetProps {
  type: WidgetType;
  title: string;
  onRemove?: () => void;
  onConfigure?: () => void;
  className?: string;
}

export const MetricWidget: React.FC<MetricWidgetProps> = ({
  type,
  title,
  onRemove,
  onConfigure,
  className,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [data, setData] = useState<Record<string, unknown>>({});
  const localize = useLocalize();

  // Fetch data based on widget type
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/metrics/${type}`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        // Use mock data
        setData(getMockData(type));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [type]);

  const getMockData = (widgetType: WidgetType) => {
    switch (widgetType) {
      case 'token_usage':
        return {
          value: 1234567,
          limit: 2000000,
          percentage: 61.7,
          trend: 12.5,
          byModel: {
            'GPT-4': 45,
            'Claude': 30,
            'Gemini': 25,
          },
        };
      case 'response_time':
        return {
          avg: 245,
          p50: 180,
          p90: 500,
          p95: 750,
          p99: 1200,
          trend: -5.2,
        };
      case 'error_rate':
        return {
          rate: 0.5,
          total: 23,
          requests: 4567,
          trend: 0.2,
          status: 'good',
        };
      case 'model_performance':
        return {
          models: [
            { name: 'GPT-4', requests: 1234, latency: 320, errors: 12 },
            { name: 'Claude 3.5', requests: 987, latency: 280, errors: 5 },
            { name: 'Gemini Pro', requests: 654, latency: 210, errors: 8 },
          ],
        };
      case 'cost_tracking':
        return {
          total: 127.45,
          budget: 500,
          percentage: 25.5,
          byProvider: {
            'OpenAI': 45.23,
            'Anthropic': 23.50,
            'Google': 12.00,
            'Groq': 0.00,
          },
        };
      case 'user_activity':
        return {
          activeUsers: 156,
          totalUsers: 423,
          sessions: 89,
          avgSessionDuration: '12m 34s',
        };
      case 'conversation_volume':
        return {
          today: 1234,
          yesterday: 1098,
          trend: 12.4,
          avgMessages: 24,
        };
      case 'provider_health':
        return {
          providers: [
            { name: 'OpenAI', status: 'healthy', latency: 120 },
            { name: 'Anthropic', status: 'healthy', latency: 95 },
            { name: 'Google', status: 'healthy', latency: 80 },
            { name: 'Groq', status: 'healthy', latency: 45 },
          ],
        };
      default:
        return {};
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp size={14} className="trend up" />;
    if (trend < 0) return <TrendingDown size={14} className="trend down" />;
    return <Minus size={14} className="trend neutral" />;
  };

  const renderWidgetContent = () => {
    switch (type) {
      case 'token_usage':
        return (
          <div className="widget-content tokens">
            <div className="main-value">
              <span className="value">{formatNumber(data.value as number)}</span>
              <span className="label">{localize('com_ui_tokens') || 'tokens'}</span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(data.percentage as number) || 0}%` }}
              />
            </div>
            <div className="meta">
              <span>{((data.percentage as number) || 0).toFixed(1)}% used</span>
              {(data.trend as number) !== undefined && (
                <span className="trend">
                  {getTrendIcon(data.trend as number)}
                  {Math.abs(data.trend as number)}%
                </span>
              )}
            </div>
          </div>
        );

      case 'response_time':
        return (
          <div className="widget-content latency">
            <div className="main-value">
              <span className="value">{(data.avg as number) || 0}</span>
              <span className="label">ms</span>
            </div>
            <div className="percentiles">
              <div>p50: {(data.p50 as number) || 0}ms</div>
              <div>p95: {(data.p95 as number) || 0}ms</div>
              <div>p99: {(data.p99 as number) || 0}ms</div>
            </div>
            {(data.trend as number) !== undefined && (
              <div className="trend">
                {getTrendIcon(data.trend as number)}
                {Math.abs(data.trend as number)}%
              </div>
            )}
          </div>
        );

      case 'error_rate':
        const status = (data.status as string) || 'good';
        return (
          <div className="widget-content errors">
            <div className="main-value">
              <span className={`value ${status}`}>
                {((data.rate as number) || 0).toFixed(2)}%
              </span>
              <span className={`label ${status}`}>
                {(localize as (k: string) => string)(`com_ui_status_${status}`) || status}
              </span>
            </div>
            <div className="stats">
              <span>{(data.total as number) || 0} errors</span>
              <span>{(data.requests as number) || 0} requests</span>
            </div>
          </div>
        );

      case 'model_performance':
        const models = (data.models as Array<{name: string; requests: number; latency: number; errors: number}>) || [];
        return (
          <div className="widget-content models">
            {models.slice(0, 3).map((model, idx) => (
              <div key={idx} className="model-row">
                <span className="model-name">{model.name}</span>
                <span className="model-bar">
                  <span 
                    className="fill" 
                    style={{ width: `${(model.requests / (models[0]?.requests || 1)) * 100}%` }}
                  />
                </span>
                <span className="model-value">{model.requests}</span>
              </div>
            ))}
          </div>
        );

      case 'cost_tracking':
        return (
          <div className="widget-content costs">
            <div className="main-value">
              <span className="value">${(data.total as number) || 0}</span>
              <span className="label">
                / ${(data.budget as number) || 0}
              </span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${(data.percentage as number) || 0}%` }}
              />
            </div>
            <div className="percentage">
              {((data.percentage as number) || 0).toFixed(1)}% of budget
            </div>
          </div>
        );

      default:
        return (
          <div className="widget-content default">
            <span className="placeholder">{localize('com_ui_loading') || 'Loading...'}</span>
          </div>
        );
    }
  };

  return (
    <div className={cn('metric-widget', className, isExpanded && 'expanded')}>
      {/* Header */}
      <div className="widget-header">
        <h3 className="widget-title">{title}</h3>
        <div className="widget-actions">
          <button 
            className="action-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Minimize' : 'Maximize'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {onConfigure && (
            <button 
              className="action-btn"
              onClick={onConfigure}
              title="Configure"
            >
              <Settings size={12} />
            </button>
          )}
          {onRemove && (
            <button 
              className="action-btn remove"
              onClick={onRemove}
              title="Remove"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="widget-body">
        {isLoading ? (
          <div className="widget-loading">
            <RefreshCw size={20} className="animate-spin" />
          </div>
        ) : (
          renderWidgetContent()
        )}
      </div>
    </div>
  );
};

export default MetricWidget;
