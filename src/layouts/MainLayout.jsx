import React, { useState } from 'react';
import { Layout, Menu, Typography, Avatar, Space, ConfigProvider } from 'antd';
import {
    DesktopOutlined,
    WarningOutlined,
    CloudUploadOutlined,
    UserOutlined,
    MenuUnfoldOutlined,
    MenuFoldOutlined,
    CloudDownloadOutlined,
    CameraOutlined,
    
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content, Footer } = Layout;
const { Title } = Typography;

// SGCC 品牌色 (深绿)
const SGCC_GREEN = '#00695C';

const MainLayout = () => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    // 简单判断是否是手机 (页面宽度小于768)
    const isMobile = window.innerWidth < 768;
    // 浏览器指纹判断
    const isMobileAgain = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 如果是手机，直接返回纯净的 Outlet，不要侧边栏和顶栏
    if (isMobile && isMobileAgain) {
        return (
            <div style={{ background: '#f2f2f7', minHeight: '100vh' }}>
                <Outlet />
            </div>
        );
    }

    // 菜单定义
    const items = [
        {
            key: '/',
            icon: <DesktopOutlined />,
            label: '工作台(通讯录管理)',
        },
        {
            key: 'report',
            icon: <WarningOutlined />,
            label: '反馈条目报表',
        },
        {
            key: 'compare',
            icon: <CloudUploadOutlined />,
            label: '智能对账系统',
        },
        {
            key: 'external',
            icon: <CameraOutlined />,
            label: '外部照片系统',
        },
        {
            key: 'xlsx',
            icon: <CloudDownloadOutlined />,
            label: 'Excel 导出工具',
        },
    ];

    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: SGCC_GREEN,
                    borderRadius: 4,
                },
            }}
        >
            <Layout style={{ height: '100vh' }}>
                <Sider trigger={null} collapsible collapsed={collapsed} style={{ background: '#001529' }}>
                    {/* Logo 区域 */}
                    <div style={{
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#002140'
                    }}>
                        {/* <ThunderboltFilled style={{ fontSize: 24, color: '#52c41a', marginRight: collapsed ? 0 : 10 }} /> */}
                        {/* SGCC svg图标文件 限制大小*/}
                        <img
                            src="/state-grid.svg"
                            alt="SGCC Logo"
                            style={{ width: collapsed ? 32 : 55, height: 'auto', marginRight: collapsed ? 0 : 10 }}
                        />
                        {!collapsed && (
                            <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                SGCC<br />
                                数字工作台
                            </span>
                        )}
                    </div>

                    <Menu
                        theme="dark"
                        mode="inline"
                        selectedKeys={[location.pathname]}
                        items={items}
                        onClick={(e) => navigate(e.key)}
                    />
                </Sider>

                <Layout>
                    <Header style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,21,41,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
                                className: 'trigger',
                                onClick: () => setCollapsed(!collapsed),
                                style: { fontSize: 18, marginRight: 24, cursor: 'pointer' }
                            })}
                            <Title level={4} style={{ margin: 0, color: SGCC_GREEN }}>
                                国家电网 · 便捷工作终端
                            </Title>
                        </div>

                        <Space>
                            <span style={{ color: '#666' }}>欢迎回来，<i>陈珑</i></span>
                            <Avatar style={{ backgroundColor: SGCC_GREEN }} icon={<UserOutlined />} />
                        </Space>
                    </Header>

                    <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', flex: 1, overflowY: 'auto' }}>
                        {/* 这里的 Outlet 就是用来显示子页面的窗口 */}
                        <Outlet />
                    </Content>

                    <Footer style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>
                        SGCC Digital Workbench ©{new Date().getFullYear()} Created by Mr. Chen
                    </Footer>
                </Layout>
            </Layout>
        </ConfigProvider>
    );
};

export default MainLayout;
