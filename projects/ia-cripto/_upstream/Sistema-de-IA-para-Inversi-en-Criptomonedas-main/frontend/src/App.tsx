/**
 * Crypto AI Trading System Frontend
 * ================================
 * Panel de control moderno con React Router
 * 
 * Estructura del proyecto:
 * - pages/: Páginas (Dashboard, Trades, Strategies, Settings)
 * - components/: Componentes reutilizables
 * - hooks/: Custom hooks
 * - services/: Integraciones con API
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import esES from 'antd/locale/es_ES';

// Layout
import { Layout } from 'antd';
import { 
  DashboardOutlined,
  SwapOutlined,
  SettingOutlined,
  LineChartOutlined,
  WalletOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { 
  Layout as AntLayout, 
  Menu, 
  Avatar, 
  Badge, 
  Dropdown, 
  Space,
  Typography,
} from 'antd';

const { Header, Content, Sider } = AntLayout;
const { Title, Text } = Typography;

// Pages
import { Dashboard } from './pages/dashboard';
import { Trades } from './pages/trades';
import { Strategies } from './pages/strategies';
import { Settings } from './pages/settings';
import { Login } from './pages/login';

// Check auth
const isAuthenticated = () => !!localStorage.getItem('token');

// Protected Route wrapper
const ProtectedRoute = ({ children }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Sidebar
const Sidebar = ({ collapsed, onCollapse }) => (
  <Sider
    collapsible
    collapsed={collapsed}
    onCollapse={onCollapse}
    theme="dark"
    width={250}
    style={{
      overflow: 'auto',
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
    }}
  >
    <div style={{ 
      height: '64px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderBottom: '1px solid #404040'
    }}>
      <Title level={4} style={{ color: '#fff', margin: 0 }}>
        🤖 Crypto AI
      </Title>
    </div>
    <Menu
      theme="dark"
      defaultSelectedKeys={['dashboard']}
      mode="inline"
      onClick={({ key }) => window.location.href = `/${key}`}
      items={[
        { key: '', icon: <DashboardOutlined />, label: 'Dashboard' },
        { key: 'trades', icon: <SwapOutlined />, label: 'Operaciones' },
        { key: 'strategies', icon: <LineChartOutlined />, label: 'Estrategias' },
        { key: 'portfolio', icon: <WalletOutlined />, label: 'Portafolio' },
        { key: 'settings', icon: <SettingOutlined />, label: 'Configuración' },
      ]}
    />
  </Sider>
);

// Header
const AppHeader = () => (
  <Header style={{ 
    padding: '0 24px', 
    background: '#fff', 
    display: 'flex', 
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #f0f0f0'
  }}>
    <Space>
      <Text strong>Panel de Control</Text>
    </Space>
    <Space size="large">
      <Badge count={5}>
        <Text style={{ cursor: 'pointer' }}><BellOutlined /></Text>
      </Badge>
      <Dropdown menu={{
        items: [
          { key: 'profile', label: 'Perfil', icon: <UserOutlined /> },
          { key: 'settings', label: 'Configuración', icon: <SettingOutlined /> },
          { type: 'divider' },
          { 
            key: 'logout', 
            label: 'Cerrar Sesión', 
            icon: <LogoutOutlined />, 
            danger: true,
            onClick: () => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              window.location.href = '/login';
            }
          },
        ]
      }}>
        <Avatar style={{ backgroundColor: '#1890ff', cursor: 'pointer' }}>U</Avatar>
      </Dropdown>
    </Space>
  </Header>
);

// Main Layout
const AppLayout = ({ children }) => {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <AppHeader />
        <Content style={{ margin: '16px' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

// App Principal
export default function App() {
  return (
    <ConfigProvider locale={esES}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/trades" 
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Trades />
                </AppLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/strategies" 
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Strategies />
                </AppLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/portfolio" 
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Settings />
                </AppLayout>
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}