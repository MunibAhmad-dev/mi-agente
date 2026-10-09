/*
 * Trades Page
 * ===
 * Gestión de operaciones de trading
 */

import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  InputNumber,
  Select,
  message,
  Spin,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { apiClient } from "../utility";

const { Option } = Select;

export const Trades = () => {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadTrades();
  }, []);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/v1/trading/history");
      setTrades(data.orders || []);
    } catch (error) {
      console.error("Error loading trades:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (values: any) => {
    try {
      await apiClient.post("/api/v1/trading/execute", values);
      message.success("Operación ejecutada");
      setModalVisible(false);
      form.resetFields();
      loadTrades();
    } catch (error: any) {
      message.error(error.response?.data?.detail || "Error al ejecutar");
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 80 },
    { title: "Fecha", dataIndex: "created_at", key: "created_at" },
    { title: "Par", dataIndex: "symbol", key: "symbol" },
    {
      title: "Tipo",
      dataIndex: "type",
      key: "type",
      render: (type: string) => <Tag>{type.toUpperCase()}</Tag>,
    },
    {
      title: "Acción",
      dataIndex: "side",
      key: "side",
      render: (side: string) => (
        <Tag color={side === "buy" ? "green" : "red"}>{side.toUpperCase()}</Tag>
      ),
    },
    { title: "Cantidad", dataIndex: "amount", key: "amount" },
    { title: "Precio", dataIndex: "price", key: "price" },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const color =
          status === "closed"
            ? "green"
            : status === "canceled"
            ? "red"
            : "blue";
        return <Tag color={color}>{status}</Tag>;
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Operaciones"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadTrades}>
              Actualizar
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalVisible(true)}
            >
              Nueva Operación
            </Button>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Spin />
          </div>
        ) : (
          <Table dataSource={trades} columns={columns} rowKey="id" />
        )}
      </Card>

      <Modal
        title="Nueva Operación"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={form.submit}
      >
        <Form form={form} onFinish={handleExecute} layout="vertical">
          <Form.Item
            name="symbol"
            label="Par"
            rules={[{ required: true, message: "Selecciona un par" }]}
          >
            <Select placeholder="Seleccionar par">
              <Option value="BTC/USDT">BTC/USDT</Option>
              <Option value="ETH/USDT">ETH/USDT</Option>
              <Option value="BNB/USDT">BNB/USDT</Option>
              <Option value="SOL/USDT">SOL/USDT</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="side"
            label="Acción"
            rules={[{ required: true, message: "Selecciona acción" }]}
          >
            <Select placeholder="Comprar o Vender">
              <Option value="buy">Comprar</Option>
              <Option value="sell">Vender</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="amount"
            label="Cantidad"
            rules={[{ required: true, message: "Ingresa cantidad" }]}
          >
            <InputNumber style={{ width: "100%" }} min={0.001} step={0.01} />
          </Form.Item>

          <Form.Item name="price" label="Precio (opcional)">
            <InputNumber style={{ width: "100%" }} min={0} step={0.01} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};