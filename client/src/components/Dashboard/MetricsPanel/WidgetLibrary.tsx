import React from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Bot,
  DollarSign,
  Users,
  MessageSquare,
  Activity,
  X,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { WidgetType } from './MetricsPanel';
import './WidgetLibrary.css';

interface WidgetLibraryProps {
  onAdd: (type: WidgetType, title: string) => void;
  onClose: () => void;
}

const availableWidgets: { type: WidgetType; title: string; description: string; icon: React.ElementType }[] = [
  {
    type: 'token_usage',
    title: 'Uso de Tokens',
    description: 'Tokens consumidos por modelo',
    icon: BarChart3,
  },
  {
    type: 'response_time',
    title: 'Latencia',
    description: 'Tiempo de respuesta promedio',
    icon: TrendingUp,
  },
  {
    type: 'error_rate',
    title: 'Tasa de Errores',
    description: 'Porcentaje de errores',
    icon: AlertTriangle,
  },
  {
    type: 'model_performance',
    title: 'Rendimiento de Modelos',
    description: 'Uso por modelo',
    icon: Bot,
  },
  {
    type: 'cost_tracking',
    title: 'Costos',
    description: 'Gastos por proveedor',
    icon: DollarSign,
  },
  {
    type: 'user_activity',
    title: 'Actividad de Usuarios',
    description: 'Usuarios activos y sesiones',
    icon: Users,
  },
  {
    type: 'conversation_volume',
    title: 'Volumen de Conversaciones',
    description: 'Mensajes por día',
    icon: MessageSquare,
  },
  {
    type: 'provider_health',
    title: 'Salud de Proveedores',
    description: 'Estado de APIs externas',
    icon: Activity,
  },
];

export const WidgetLibrary: React.FC<WidgetLibraryProps> = ({
  onAdd,
  onClose,
}) => {
  const localize = useLocalize();

  return (
    <div className="widget-library">
      <div className="library-header">
        <h3>{localize('com_ui_widget_library') || 'Widget Library'}</h3>
        <button className="close-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      
      <div className="library-grid">
        {availableWidgets.map(widget => {
          const Icon = widget.icon;
          return (
            <button
              key={widget.type}
              className="widget-card"
              onClick={() => onAdd(widget.type, widget.title)}
            >
              <div className="card-icon">
                <Icon size={24} />
              </div>
              <div className="card-content">
                <span className="card-title">{widget.title}</span>
                <span className="card-description">{widget.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WidgetLibrary;
