import React, { useState, useCallback, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Users,
  Activity,
  Plus,
  Settings,
  GripVertical,
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  Grid3x3,
  LayoutGrid,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { MetricWidget } from './MetricWidget';
import { WidgetLibrary } from './WidgetLibrary';
import './MetricsPanel.css';

export type WidgetType = 
  | 'token_usage'
  | 'response_time'
  | 'error_rate'
  | 'model_performance'
  | 'cost_tracking'
  | 'user_activity'
  | 'conversation_volume'
  | 'provider_health';

export interface MetricWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config?: Record<string, unknown>;
}

export interface MetricsPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

const defaultWidgets: MetricWidget[] = [
  {
    id: 'tokens-1',
    type: 'token_usage',
    title: 'Uso de Tokens',
    position: { x: 0, y: 0, w: 1, h: 1 },
  },
  {
    id: 'latency-1',
    type: 'response_time',
    title: 'Latencia',
    position: { x: 1, y: 0, w: 1, h: 1 },
  },
  {
    id: 'errors-1',
    type: 'error_rate',
    title: 'Tasa de Errores',
    position: { x: 0, y: 1, w: 1, h: 1 },
  },
  {
    id: 'models-1',
    type: 'model_performance',
    title: 'Modelos',
    position: { x: 1, y: 1, w: 1, h: 1 },
  },
];

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  isOpen = true,
  onClose,
  className,
}) => {
  const [widgets, setWidgets] = useState<MetricWidget[]>(defaultWidgets);
  const [showLibrary, setShowLibrary] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'free'>('grid');
  const [columns, setColumns] = useState(2);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const localize = useLocalize();

  // Load saved layout
  useEffect(() => {
    const saved = localStorage.getItem('metrics-layout');
    if (saved) {
      try {
        setWidgets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load metrics layout:', e);
      }
    }
  }, []);

  // Save layout on change
  useEffect(() => {
    localStorage.setItem('metrics-layout', JSON.stringify(widgets));
  }, [widgets]);

  const handleDragStart = useCallback((widgetId: string) => {
    setDraggedWidget(widgetId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedWidget || draggedWidget === targetId) return;

    setWidgets(prev => {
      const newWidgets = [...prev];
      const draggedIndex = newWidgets.findIndex(w => w.id === draggedWidget);
      const targetIndex = newWidgets.findIndex(w => w.id === targetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [dragged] = newWidgets.splice(draggedIndex, 1);
        newWidgets.splice(targetIndex, 0, dragged);
      }

      return newWidgets;
    });
  }, [draggedWidget]);

  const handleDragEnd = useCallback(() => {
    setDraggedWidget(null);
  }, []);

  const handleAddWidget = useCallback((type: WidgetType, title: string) => {
    const newWidget: MetricWidget = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      position: { x: 0, y: widgets.length, w: 1, h: 1 },
    };
    setWidgets(prev => [...prev, newWidget]);
    setShowLibrary(false);
  }, [widgets.length]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    // Simulate refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);
  }, []);

  const renderWidget = (widget: MetricWidget) => (
    <div
      key={widget.id}
      className={cn('widget-wrapper', draggedWidget === widget.id && 'dragging')}
      draggable
      onDragStart={() => handleDragStart(widget.id)}
      onDragOver={(e) => handleDragOver(e, widget.id)}
      onDragEnd={handleDragEnd}
    >
      <div className="widget-drag-handle">
        <GripVertical size={14} />
      </div>
      <MetricWidget
        type={widget.type}
        title={widget.title}
        onRemove={() => handleRemoveWidget(widget.id)}
      />
    </div>
  );

  return (
    <div className={cn('metrics-panel', className)}>
      {/* Header */}
      <div className="panel-header">
        <div className="header-title">
          <BarChart3 size={18} />
          <span>{localize('com_ui_metrics') || 'Metrics'}</span>
        </div>

        <div className="header-actions">
          {/* Layout Toggle */}
          <div className="layout-toggle">
            <button
              className={cn('toggle-btn', columns === 1 && 'active')}
              onClick={() => setColumns(1)}
              title="1 column"
            >
              <Minimize2 size={14} />
            </button>
            <button
              className={cn('toggle-btn', columns === 2 && 'active')}
              onClick={() => setColumns(2)}
              title="2 columns"
            >
              <Grid3x3 size={14} />
            </button>
            <button
              className={cn('toggle-btn', columns === 3 && 'active')}
              onClick={() => setColumns(3)}
              title="3 columns"
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          {/* Add Widget */}
          <button
            className="header-btn"
            onClick={() => setShowLibrary(!showLibrary)}
            title={localize('com_ui_add_widget') || 'Add widget'}
          >
            <Plus size={16} />
          </button>

          {/* Refresh */}
          <button
            className={cn('header-btn', isLoading && 'loading')}
            onClick={handleRefresh}
            disabled={isLoading}
            title={localize('com_ui_refresh') || 'Refresh'}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>

          {/* Close */}
          {onClose && (
            <button
              className="header-btn close"
              onClick={onClose}
              title={localize('com_ui_close') || 'Close'}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Widget Library */}
      {showLibrary && (
        <WidgetLibrary
          onAdd={handleAddWidget}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Dashboard Grid */}
      <div 
        className={cn('dashboard-grid', `cols-${columns}`)}
        style={{ '--columns': columns } as React.CSSProperties}
      >
        {widgets.length === 0 ? (
          <div className="empty-state">
            <BarChart3 size={48} />
            <span>{localize('com_ui_no_widgets') || 'No widgets yet'}</span>
            <button onClick={() => setShowLibrary(true)}>
              <Plus size={16} />
              {localize('com_ui_add_widget') || 'Add Widget'}
            </button>
          </div>
        ) : (
          widgets.map(renderWidget)
        )}
      </div>

      {/* Footer */}
      <div className="panel-footer">
        <span className="widget-count">
          {widgets.length} {localize('com_ui_widgets') || 'widgets'}
        </span>
        <span className="last-update">
          {localize('com_ui_last_update') || 'Last update'}: {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default MetricsPanel;
