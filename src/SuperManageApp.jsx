import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Menu, Button, Space, Tag, Typography, Card, Row, Col } from 'antd';
import { SettingOutlined, TagsOutlined, DatabaseOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const ADMIN_KEY = 'sgcc_admin_session';
const ADMIN_TTL_MS = 1000 * 60 * 10;

const readAdminSession = () => {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.exp || Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
};

const refreshAdminSession = () => {
  if (!readAdminSession()) return;
  localStorage.setItem(ADMIN_KEY, JSON.stringify({ exp: Date.now() + ADMIN_TTL_MS }));
};

const clearAdminSession = () => localStorage.removeItem(ADMIN_KEY);

const RequireAdmin = ({ children }) => {
  // In the admin-only app, navigating to "/" would still be inside this router and can cause loops.
  // So if not authorized, hard-redirect to the normal app root.
  if (!readAdminSession()) {
    window.location.assign('/');
    return null;
  }
  return children;
};

const AdminDashboard = () => {
  useEffect(() => {
    refreshAdminSession();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12} lg={8}>
          <Card title="标签管理" bordered>
            <Text type="secondary">后续接入：新增/禁用标签、配色、排序。</Text>
            <div style={{ marginTop: 12 }}>
              <Button disabled>即将上线</Button>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Card title="导入与匹配" bordered>
            <Text type="secondary">后续支持 XLSX 通讯录导入、地址提炼、候选匹配与批量写入电话。</Text>
            <div style={{ marginTop: 12 }}>
              <Button disabled>即将上线</Button>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Card title="系统" bordered>
            <Text type="secondary">超管隔离区（与普通主页不共享布局）。</Text>
            <div style={{ marginTop: 12 }}>
              <Space>
                <Button danger onClick={() => window.location.assign('/')}>退出超管（保留10分钟通行）</Button>
                <Button onClick={() => clearAdminSession()}>清除凭证</Button>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 12 }}>
        <Space wrap align="center">
          <Tag color="orange">ADMIN</Tag>
          <Text type="secondary">快捷键：Ctrl/Cmd + Shift + B（打开验证） / Ctrl/Cmd + Esc（退出超管，保留通行）</Text>
        </Space>
      </Card>
    </div>
  );
};

const AdminLayout = () => {
  // keep-alive on every render
  refreshAdminSession();

  return (
    <div style={{ minHeight: '100vh', background: '#fff7e6' }}>
      <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
        <Layout.Sider width={220} style={{ background: '#fa8c16' }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 14px', color: '#fff', fontWeight: 800 }}>
            SGCC Admin
          </div>
          <Menu
            mode="inline"
            theme="dark"
            defaultSelectedKeys={['dashboard']}
            style={{ background: '#fa8c16' }}
            items={[
              { key: 'dashboard', icon: <SettingOutlined style={{ color: '#fff' }} />, label: <span style={{ color: '#fff' }}>控制台</span> },
              { key: 'tags', icon: <TagsOutlined style={{ color: '#fff' }} />, label: <span style={{ color: 'rgba(255,255,255,0.9)' }}>标签（即将上线）</span>, disabled: true },
              { key: 'db', icon: <DatabaseOutlined style={{ color: '#fff' }} />, label: <span style={{ color: 'rgba(255,255,255,0.9)' }}>数据（即将上线）</span>, disabled: true },
            ]}
          />
        </Layout.Sider>

        <Layout style={{ background: 'transparent' }}>
          <Layout.Header style={{ background: '#fff', borderBottom: '1px solid #ffe7ba', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
            <Space size={10}>
              <Tag color="orange">SUPER ADMIN</Tag>
              <Title level={5} style={{ margin: 0 }}>管理后台（隔离区）</Title>
            </Space>
            <Space>
              <Button danger size="small" onClick={() => window.location.assign('/')}>退出（保留）</Button>
              <Button size="small" onClick={() => clearAdminSession()}>清除凭证</Button>
            </Space>
          </Layout.Header>

          <Layout.Content style={{ padding: 16 }}>
            <AdminDashboard />
          </Layout.Content>
        </Layout>
      </Layout>
    </div>
  );
};

const SuperManageApp = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default SuperManageApp;