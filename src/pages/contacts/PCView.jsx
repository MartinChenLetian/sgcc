import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Input, Button, Space, Modal, Form, message, Popconfirm, Select, Spin, Tooltip, Tag } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabase';

const PCView = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // 编辑/新增状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();

  // antd v5：避免 message 静态函数 context 警告
  const [messageApi, contextHolder] = message.useMessage();

  // 固定视口高度，仅表格内容滚动；virtual 表格 scroll.y 必须是 number
  const [scrollY, setScrollY] = useState(520);
  useEffect(() => {
    const update = () => {
      // 估算：100vh -（Card头+搜索栏+内边距+底部已选择提示+分页）
      // 你可按实际 UI 微调 offset
      const offset = 360;
      const y = Math.max(260, window.innerHeight - offset);
      setScrollY(y);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 选择行
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const toggleSelectRow = (id) => {
    setSelectedRowKeys((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // 标记下拉
  const [tagLoading, setTagLoading] = useState(false);
  const [tagOptions, setTagOptions] = useState(['出租', '自住', '无人', '纸质账单', '补单']);

  const encryptTag3 = (tag) => {
    // 生成稳定的 3 字符码（ASCII），写入 user_remark
    // 后续你如果有真正的加密算法/中间件，这里替换即可
    try {
      return btoa(unescape(encodeURIComponent(tag))).replace(/=+$/g, '').slice(0, 3);
    } catch {
      return String(tag).slice(0, 3);
    }
  };

  // === 1. 拉取数据 (服务端分页) ===
  const fetchData = async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('master_records')
        .select('*', { count: 'exact' })
        .order('id', { ascending: true })
        .range(from, to);

      if (searchText) {
        query = query.ilike('address', `%${searchText}%`);
      }

      const { data: records, error, count } = await query;
      if (error) throw error;

      setData(records || []);
      setTotal(count || 0);
    } catch (err) {
      messageApi.error('加载失败: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchText, pageSize]);

  // === 2. 增删改逻辑 ===
  const handleDelete = async (id) => {
    const { error } = await supabase.from('master_records').delete().eq('id', id);
    if (!error) {
      messageApi.success('删除成功');
      fetchData();
    } else {
      messageApi.error('删除失败');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      let error = null;

      if (editingItem) {
        const res = await supabase.from('master_records').update(values).eq('id', editingItem.id);
        error = res.error;
      } else {
        const res = await supabase.from('master_records').insert(values);
        error = res.error;
      }

      if (error) throw error;

      messageApi.success(editingItem ? '修改成功' : '添加成功');
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      messageApi.error('操作失败: ' + (err?.message || String(err)));
    }
  };

  const applyTagToSelected = async (tag) => {
    if (!selectedRowKeys.length) {
      messageApi.warning('请先选择用户');
      return;
    }

    const code = encryptTag3(tag);

    // 先乐观更新本地
    setData((prev) => prev.map((r) => (selectedRowKeys.includes(r.id) ? { ...r, user_remark: code } : r)));

    // 写入后端
    const { error } = await supabase
      .from('master_records')
      .update({ user_remark: code })
      .in('id', selectedRowKeys);

    if (error) {
      messageApi.error('标记写入失败: ' + error.message);
      fetchData();
      return;
    }

    messageApi.success(`已标记 ${selectedRowKeys.length} 项`);
  };

  const clearStatusForSelected = async () => {
    if (!selectedRowKeys.length) {
      messageApi.warning('请先选择用户');
      return;
    }

    // 乐观更新本地
    setData((prev) => prev.map((r) => (selectedRowKeys.includes(r.id) ? { ...r, user_remark: null } : r)));

    const { error } = await supabase
      .from('master_records')
      .update({ user_remark: null })
      .in('id', selectedRowKeys);

    if (error) {
      messageApi.error('清除状态失败: ' + error.message);
      fetchData();
      return;
    }

    messageApi.success(`已清除 ${selectedRowKeys.length} 项状态`);
  };

  const loadMoreTags = async () => {
    setTagLoading(true);
    try {
      // TODO: 之后替换成你写的“中间件 + 超管页”接口
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();

      if (Array.isArray(json) && json.length) {
        setTagOptions((prev) => {
          const s = new Set(prev);
          json.forEach((x) => s.add(String(x)));
          return Array.from(s);
        });
        messageApi.success('标记已更新');
        setTagLoading(false);
        return;
      } else {
        // 不显示警告，不清除 loading，轮询重试
        setTimeout(() => loadMoreTags(), 1200);
        return;
      }
    } catch (e) {
      messageApi.error('获取标记失败: ' + (e?.message || String(e)));
      setTagLoading(false);
    }
    // no finally: loading only cleared on success or error
  };

  const remarkMetaMap = useMemo(() => {
    const m = new Map();

    (tagOptions || []).forEach((opt) => {
      // 兼容：tagOptions 既可能是字符串数组（当前实现），也可能是对象数组（未来 tags 表）
      if (typeof opt === 'string') {
        const label = opt;
        const key = encryptTag3(label);
        m.set(String(key), { label, color: 'default', disabled: false });
        return;
      }

      if (opt && typeof opt === 'object') {
        const key = opt.code ?? opt.id;
        if (!key) return;
        m.set(String(key), {
          label: String(opt.label ?? key),
          color: String(opt.color ?? 'default'),
          disabled: !!opt.disabled,
        });
      }
    });

    return m;
  }, [tagOptions]);

  const statusMeta = (remark) => {
    if (!remark) return null;
    return remarkMetaMap.get(String(remark)) || null;
  };

  const statusLabel = (remark) => {
    const meta = statusMeta(remark);
    if (!meta) return String(remark);
    // 若标签已 disabled，则统一显示 disabled
    if (meta.disabled) return 'disabled';
    return meta.label;
  };

  const statusTitle = useMemo(
    () => (record) => {
      const r = record?.user_remark;
      const meta = statusMeta(r);
      if (meta?.disabled) return '用户状态:disabled';
      return `用户状态:${statusLabel(r)}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remarkMetaMap]
  );

  const statusColor = (remark) => {
    const meta = statusMeta(remark);
    if (meta?.disabled) return 'default';
    const label = statusLabel(remark);
    // 若未来 tags 表提供 color，则优先使用
    if (meta?.color && meta.color !== 'default') return meta.color;

    switch (label) {
      case '出租':
        return 'orange';
      case '自住':
        return 'green';
      case '无人':
        return 'red';
      case '纸质账单':
        return 'blue';
      case '补单':
        return 'purple';
      default:
        return 'default';
    }
  };

  // === 3. 表格列定义 ===
  const columns = [
    {
      title: '户号',
      dataIndex: 'user_no',
      width: 200,
    },
    {
      title: '户名',
      dataIndex: 'user_name',
      width: 120,
      ellipsis: { title: true },
      render: (text, record) =>
        record.user_remark ? (
          <Tooltip title={statusTitle(record)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
              <Tag
                color={statusColor(record.user_remark)}
                style={{ margin: 0, lineHeight: '18px', height: 20, paddingInline: 6 }}
              >
                {statusLabel(record.user_remark)}
              </Tag>
            </span>
          </Tooltip>
        ) : (
          <span>{text}</span>
        ),
    },
    {
      title: '地址',
      dataIndex: 'address',
      width: 220,
    },
    { title: '电话1', dataIndex: 'match_business', ellipsis: true },
    { title: '电话2', dataIndex: 'match_home', ellipsis: true },
    { title: '电话3', dataIndex: 'match_mobile', ellipsis: true },
    { title: '电话4', dataIndex: 'match_phone4', ellipsis: true },
    { title: '电话5', dataIndex: 'match_phone5', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            ghost
            icon={<EditOutlined />}
            onClick={() => {
              setEditingItem(record);
              form.setFieldsValue(record);
              setIsModalOpen(true);
            }}
          />
          <Popconfirm title="确定删除吗?" onConfirm={() => handleDelete(record.id)}>
            <Button type="primary" size="small" danger ghost icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 使用 antd 内建 rowSelection（比自制 checkbox 更快），并放大 checkbox
  const rowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (keys) => setSelectedRowKeys(keys),
      columnTitle: '',
      columnWidth: 44,
      fixed: true,
      renderCell: (_checked, _record, _index, originNode) => (
        <div style={{ transform: 'scale(1.9)', transformOrigin: 'left center' }}>
          {originNode}
        </div>
      ),
    }),
    [selectedRowKeys]
  );

  const pagination = useMemo(
    () => ({
      current: page,
      pageSize,
      total,
      showSizeChanger: true,
      onChange: (p, size) => {
        setPage(p);
        setPageSize(size);
      },
      showTotal: (t) => `共 ${t} 条记录`,
    }),
    [page, pageSize, total]
  );

  return (
    <div
      style={{
        padding: 24,
        background: '#f0f2f5',
        height: '100%',
        width: '100%',
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        boxSizing: 'border-box',
      }}
    >
      {contextHolder}
      {tagLoading && <Spin fullscreen tip="加载标记..." />}

      <Card
        title="SGCC 通讯录总控台"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingItem(null);
                form.resetFields();
                setIsModalOpen(true);
              }}
              disabled
            >
              新增用户
            </Button>
          </Space>
        }
        style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}
        bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 260, maxWidth: 520 }}>
            <Input.Search
              placeholder="搜索地址..."
              onSearch={(val) => {
                setSearchText(val);
                setPage(1);
              }}
              enterButton
              allowClear
            />
          </div>

          <Select
            style={{ width: 180 }}
            placeholder="---选择标记---"
            value={undefined}
            options={[
              ...tagOptions.map((t) => ({ value: t, label: t })),
              { value: '__more__', label: '添加更多...' },
            ]}
            onChange={(val) => {
              if (val === '__more__') {
                loadMoreTags();
                return;
              }
              applyTagToSelected(val);
            }}
            disabled={!selectedRowKeys.length}
            loading={tagLoading}
          />
          <Button size="small" disabled={!selectedRowKeys.length} onClick={clearStatusForSelected}>
            清除状态
          </Button>
        </div>

        <Table
          rowKey="id"
          tableLayout="fixed"
          loading={loading}
          dataSource={data}
          columns={columns}
          rowSelection={rowSelection}
          virtual
          sticky
          scroll={{ y: scrollY }}
          pagination={pagination}
          onRow={(record) => ({
            onClick: (e) => {
              // 点击行任意位置可切换选择（排除按钮/链接/输入）
              if (e.target.closest('button') || e.target.closest('a') || e.target.tagName === 'INPUT') return;
              e.preventDefault();
              toggleSelectRow(record.id);
            },
          })}
          style={{ flex: 1, minHeight: 0 }}
        />

        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#666' }}>共选择 {selectedRowKeys.length} 条</div>
        </div>
      </Card>

      <Modal
        title={editingItem ? '编辑用户' : '新增用户'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="address" label="地址" rules={[{ required: true }]} disabled>
            <Input placeholder="例：宜川路413弄10号101室" />
          </Form.Item>
          <Form.Item name="match_business" label="电话1">
            <Input placeholder="Phone" />
          </Form.Item>
          <Form.Item name="match_home" label="电话2">
            <Input placeholder="Phone" />
          </Form.Item>
          <Form.Item name="match_mobile" label="电话3">
            <Input placeholder="Phone" />
          </Form.Item>
          <Form.Item name="match_phone4" label="电话4">
            <Input placeholder="Phone" />
          </Form.Item>
          <Form.Item name="match_phone5" label="电话5">
            <Input placeholder="Phone" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PCView;