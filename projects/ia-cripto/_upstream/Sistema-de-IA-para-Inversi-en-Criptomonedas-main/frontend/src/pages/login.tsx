/*
 * Login Page
 * ========
 * Página de autenticación multiusuario
 */

import React, { useState } from "react";
import { Form, Input, Button, Card, message, Divider } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../utility";

export const Login = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post("/api/v1/auth/login", values);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      message.success("¡Bienvenido!");
      navigate("/");
    } catch (error: any) {
      message.error(error.response?.data?.detail || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f5",
      }}
    >
      <Card
        title={
          <div style={{ textAlign: "center" }}>
            <h2 style={{ margin: 0 }}>🤖 Crypto AI</h2>
            <p style={{ margin: 0, color: "#888" }}>Sistema de Trading con IA</p>
          </div>
        }
        style={{ width: 400 }}
      >
        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: "Por favor ingresa tu email" },
              { type: "email", message: "Email inválido" },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Email"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: "Por favor ingresa tu contraseña" },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Contraseña"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              Iniciar Sesión
            </Button>
          </Form.Item>

          <Divider>
            <span style={{ color: "#888" }}>o</span>
          </Divider>

          <div style={{ textAlign: "center" }}>
            <a href="/register">Crear cuenta</a>
          </div>
        </Form>
      </Card>
    </div>
  );
};