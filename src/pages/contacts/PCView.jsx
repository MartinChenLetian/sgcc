import React, { useState, useEffect } from 'react';
import { Table, Card, Input, Button, Space, Modal, Form, message, Popconfirm } from 'antd';
import { SearchOutlined, EditOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabase';

const PCView = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;

    // 编辑/新增状态
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form] = Form.useForm();

    // === 1. 拉取数据 (服务端分页) ===
    const fetchData = async () => {
        setLoading(true);
        try {
            // 计算分页范围
            const from = (page - 1) * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            let query = supabase
                .from('master_records')
                .select('*', { count: 'exact' })
                .order('id', { ascending: true }) // 按 ID 排序，或者按 address
                .range(from, to);

            if (searchText) {
                query = query.ilike('address', `%${searchText}%`);
            }

            const { data: records, error, count } = await query;
            if (error) throw error;

            setData(records);
            setTotal(count || 0);
        } catch (err) {
            message.error('加载失败: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [page, searchText]); // 翻页或搜索时触发

    // === 2. 增删改逻辑 ===
    const handleDelete = async (id) => {
        const { error } = await supabase.from('master_records').delete().eq('id', id);
        if (!error) {
            message.success('删除成功');
            fetchData();
        } else {
            message.error('删除失败');
        }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            let error = null;

            if (editingItem) {
                // 修改
                const res = await supabase.from('master_records').update(values).eq('id', editingItem.id);
                error = res.error;
            } else {
                // 新增 (自动生成指纹逻辑可根据需要添加，这里暂时只存地址)
                const res = await supabase.from('master_records').insert(values);
                error = res.error;
            }

            if (error) throw error;

            message.success(editingItem ? '修改成功' : '添加成功');
            setIsModalOpen(false);
            fetchData();
        } catch (err) {
            message.error('操作失败: ' + err.message);
        }
    };

    // === 3. 表格列定义 ===
    const columns = [
        { title: '户号', dataIndex: 'user_no', width: 100 },
        { title: '户名', dataIndex: 'user_name', width: 120 },
        { title: '地址', dataIndex: 'address', width: 250 },
        { title: '通讯录备注', dataIndex: 'match_display_name', width: 150 },
        { title: '电话1', dataIndex: 'match_business' },
        { title: '电话2', dataIndex: 'match_home' },
        { title: '电话3', dataIndex: 'match_mobile' },
        { title: '电话4', dataIndex: 'match_phone4' },
        { title: '电话5', dataIndex: 'match_phone5' },
        {
            title: '操作',
            key: 'action',
            width: 150,
            render: (_, record) => (
                <Space>
                    <Button
                        type="primary" size="small" ghost icon={<EditOutlined />}
                        onClick={() => {
                            setEditingItem(record);
                            form.setFieldsValue(record);
                            setIsModalOpen(true);
                        }}
                    >
                        编辑
                    </Button>
                    <Popconfirm title="确定删除吗?" onConfirm={() => handleDelete(record.id)}>
                        <Button type="primary" size="small" danger ghost icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
            <Card
                title="SGCC 通讯录总控台"
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                            setEditingItem(null);
                            form.resetFields();
                            setIsModalOpen(true);
                        }} disabled>新增用户</Button>
                    </Space>
                }
            >
                <div style={{ marginBottom: 16, maxWidth: 400 }}>
                    <Input.Search
                        placeholder="搜索地址..."
                        onSearch={val => { setSearchText(val); setPage(1); }} // 搜索时重置回第一页
                        enterButton
                        allowClear
                    />
                </div>

                <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={data}
                    columns={columns}
                    pagination={{
                        current: page,
                        pageSize: PAGE_SIZE,
                        total: total,
                        onChange: (p) => setPage(p),
                        showTotal: (t) => `共 ${t} 条记录`
                    }}
                />
            </Card>

            {/* 编辑/新增 弹窗 */}
            <Modal
                title={editingItem ? "编辑用户" : "新增用户"}
                open={isModalOpen}
                onOk={handleSave}
                onCancel={() => setIsModalOpen(false)}
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="address" label="地址" rules={[{ required: true }]}>
                        <Input placeholder="例：宜川路413弄10号101室" />
                    </Form.Item>
                    <Form.Item name="match_business" label="电话">
                        <Input placeholder="Phone" />
                    </Form.Item>
                    <Form.Item name="match_home" label="电话">
                        <Input placeholder="Phone" />
                    </Form.Item>
                    <Form.Item name="match_mobile" label="电话">
                        <Input placeholder="Phone" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default PCView;