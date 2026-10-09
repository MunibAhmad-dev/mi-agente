/*
 * Strategies Page
 * ==========
 * Gestión de estrategias de trading
 */

import React, { useEffect, useState } from "react";
import { Card, Table, Tag, Button, Space, message, Spin } from "antd";
import { PlusOutlined, EditOutlined, PlayOutlined, StopOutlined } from "@ant-design/icons";
import { apiClient } from "../utility";

export const Strategies = () => {
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState([]);

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/v1/strategies");
      setStrategies(data.strategies || []);
    } catch (error) {
      console.error("Error loading strategies:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      await apiClient.put(`/api/v1/strategies/${id}/start`);
      message.success("Estrategia iniciada");
      loadStrategies();
    } catch (error) {
      message.error("Error al iniciar");
    }
  };

  const handleStop = async (id: string) => {
    try {
      await apiClient.put(`/api/v1/strategies/${id}/stop`);
      message.success("Estrategia detenida");
      loadStrategies();
    } catch (error) {
      message.error("Error al detener");
    }
  };

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    { title: "Tipo", dataIndex: "type", key: "type" },
    { title: "Par", dataIndex: "symbol", key: "symbol" },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={status === "active" ? "green" : "default"}>
          {status === "active" ? "Activa" : "Inactiva"}
        </Tag>
      ),
    },
    { title: "Win Rate", dataIndex: "win_rate", key: "win_rate", render: (v: number) => `${(v * 100).toFixed(1)}%` },
    {
      title: "Acciones",
      key: "actions",
      render: (_: any, record: any) => (
        <Space>
          {record.status === "active" ? (
            <Button size="small" icon={<StopOutlined />} onClick={() => handleStop(record.id)}>
              Detener
            </Button>
          ) : (
            <Button size="small" type="primary" icon={<PlayOutlined />} onClick={() => handleStart(record.id)}>
              Iniciar
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Estrategias"
        extra={
          <Button type="primary" icon={<PlusOutlined />}>
            Nueva Estrategia
          </Button>
        }
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Spin />
          </div>
        ) : (
          <Table dataSource={strategies} columns={columns} rowKey="id" />
        )}
      </Card>
    </div>
  );
};