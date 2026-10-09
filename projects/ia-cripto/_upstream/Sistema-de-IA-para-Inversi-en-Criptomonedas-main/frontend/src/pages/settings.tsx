/*
 * Settings Page
 * ===========
 * Configuración del sistema y cuenta de usuario
 */

import React, { useState } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  Switch,
  Select,
  InputNumber,
  message,
  Divider,
  Tabs,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";

const { Option } = Select;
const { TextArea } = Input;

export const Settings = () => {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // Save settings to API
      console.log("Saving settings:", values);
      message.success("Configuración guardada");
    } catch (error) {
      message.error("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const tabItems = [
    {
      key: "general",
      label: "General",
      children: (
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="Nombre del Bot" name="bot_name" initialValue="Crypto AI Bot">
            <Input />
          </Form.Item>

          <Form.Item label="Zona Horaria" name="timezone" initialValue="UTC">
            <Select>
              <Option value="UTC">UTC</Option>
              <Option value="America/New_York">New York (EST)</Option>
              <Option value="Europe/London">Londres (GMT)</Option>
              <Option value="Asia/Tokyo">Tokio (JST)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Modo Demo"
            name="demo_mode"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
            Guardar
          </Button>
        </Form>
      ),
    },
    {
      key: "trading",
      label: "Trading",
      children: (
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="Tamaño de Posición (%)" name="position_size" initialValue={10}>
            <InputNumber min={1} max={100} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="Stop Loss (%)" name="stop_loss" initialValue={5}>
            <InputNumber min={0.1} max={50} step={0.1} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="Take Profit (%)" name="take_profit" initialValue={10}>
            <InputNumber min={0.1} max={100} step={0.1} style={{ width: "100%" }} />
          </Form.Item>

          <Divider />

          <Form.Item
            label="Ejecución Automática"
            name="auto_execute"
            valuePropName="checked"
            initialValue={false}
          >
            <Switch />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
            Guardar
          </Button>
        </Form>
      ),
    },
    {
      key: "api",
      label: "API Keys",
      children: (
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="API Key (Binance)" name="binance_api_key">
            <Input.Password placeholder="Ingresa tu API key" />
          </Form.Item>

          <Form.Item label="Secret Key" name="binance_secret">
            <Input.Password placeholder="Ingresa tu secret key" />
          </Form.Item>

          <Divider />

          <Form.Item label="Notas">
            <TextArea
              rows={3}
              placeholder="Notas sobre las API keys..."
              readOnly
              value="• Solo usa claves con permiso de Trading\n• Nunca compartas tus secretos\n• Restringe la IP si es posible"
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
            Guardar
          </Button>
        </Form>
      ),
    },
    {
      key: "notifications",
      label: "Notificaciones",
      children: (
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            label="Notificaciones de Trade"
            name="notify_trades"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Alertas de Precio"
            name="notify_price"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Reportes Diarios"
            name="notify_daily"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

          <Divider />

          <Form.Item label="Telegram Bot Token" name="telegram_token">
            <Input.Password placeholder="Token de Telegram (opcional)" />
          </Form.Item>

          <Form.Item label="Chat ID" name="telegram_chat_id">
            <Input placeholder="Chat ID (opcional)" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
            Guardar
          </Button>
        </Form>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title="Configuración">
        <Tabs items={tabItems} />
      </Card>
    </div>
  );
};