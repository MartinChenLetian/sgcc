import React from 'react';
import { Card, Row, Col, Statistic, Button, Typography } from 'antd';
import { ArrowUpOutlined, FileSearchOutlined, ToolOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Paragraph } = Typography;

const Home = () => {
    const navigate = useNavigate();

    return (
        <div>
            <div style={{ marginBottom: 30 }}>
                <Title level={2}>工作台概览</Title>
                <Paragraph>欢迎使用 SGCC 内部数据处理系统，请从左侧菜单选择功能。</Paragraph>
            </div>

            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={8}>
                    <Card bordered={false} style={{ background: '#e6f7ff' }}>
                        <Statistic title="本月处理数据" value={112893} prefix={<ArrowUpOutlined />} suffix="条" />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card bordered={false} style={{ background: '#f6ffed' }}>
                        <Statistic title="匹配成功率" value={98.5} precision={2} suffix="%" valueStyle={{ color: '#3f8600' }} />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card bordered={false} style={{ background: '#fff7e6' }}>
                        <Statistic title="待处理任务" value={5} valueStyle={{ color: '#cf1322' }} />
                    </Card>
                </Col>
            </Row>

            <Title level={4}>快速入口</Title>
            <Row gutter={16}>
                <Col span={12}>
                    <Card
                        hoverable
                        title="智能对账系统"
                        extra={<Button type="link" onClick={() => navigate('/reconciliation')}>进入</Button>}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', color: '#666' }}>
                            <FileSearchOutlined style={{ fontSize: 40, color: '#1890ff', marginRight: 16 }} />
                            <div>
                                支持地址指纹识别、Excel 自动匹配、分批上传统计。<br />
                                适用于大规模通讯录数据入库。
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col span={12}>
                    <Card
                        hoverable
                        title="数据清洗工具"
                        extra={<Button type="link" onClick={() => navigate('/cleaning')}>进入</Button>}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', color: '#666' }}>
                            <ToolOutlined style={{ fontSize: 40, color: '#faad14', marginRight: 16 }} />
                            <div>
                                专用于 413/451 区块的核弹级数据清洗。<br />
                                自动去除特殊符号、生成标准地址、合并电话列。
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Home;
