/*
 * Dashboard Page
 * =============
 * Panel principal con estadísticas y gráficos
 */

import React, { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Table, Tag, Spin } from "antd";
import { apiClient } from "../utility";

// Types
interface Trade {
  id: string;
  symbol: string;
  action: "buy" | "sell";
  amount: number;
  price: number;
  pnl: number;
  created_at: string;
}

interface Stats {
  balance: number;
  pnl_today: number;
  win_rate: number;
  active_positions: number;
}

export const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    balance: 0,
    pnl_today: 0,
    win_rate: 0,
    active_positions: 0,
  });
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, tradesRes] = await Promise.all([
        apiClient.get("/api/v1/performance/metrics"),
        apiClient.get("/api/v1/trading/history?limit=10"),
      ]);
      setStats({
        balance: statsRes.data.total_balance || 0,
        pnl_today: statsRes.data.daily_pnl || 0,
        win_rate: statsRes.data.win_rate || 0,
        active_positions: statsRes.data.open_positions || 0,
      });
      setTrades(tradesRes.data.orders || []);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: "Fecha", dataIndex: "created_at", key: "created_at" },
    { title: "Par", dataIndex: "symbol", key: "symbol" },
    {
      title: "Acción",
      dataIndex: "action",
      key: "action",
      render: (action: string) => (
        <Tag color={action === "buy" ? "green" : "red"}>
          {action.toUpperCase()}
        </Tag>
      ),
    },
    { title: "Cantidad", dataIndex: "amount", key: "amount" },
    { title: "Precio", dataIndex: "price", key: "price" },
    {
      title: "P&L",
      dataIndex: "pnl",
      key: "pnl",
      render: (pnl: number) => (
        <span style={{ color: pnl >= 0 ? "#3f8600" : "#cf1322" }}>
          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Balance Total"
              value={stats.balance}
              prefix="$"
              precision={2}
              valueStyle={{ color: "#3f8600" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="P&L Hoy"
              value={stats.pnl_today}
              prefix="$"
              precision={2}
              valueStyle={{ color: stats.pnl_today >= 0 ? "#3f8600" : "#cf1322" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Win Rate"
              value={stats.win_rate * 100}
              suffix="%"
              precision={1}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Posiciones Activas"
              value={stats.active_positions}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="Últimas Operaciones">
            <Table
              dataSource={trades}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Distribución del Portafolio">
            <div
              style={{
                height: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#888" }}>Gráfico de pie aquí</span>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};