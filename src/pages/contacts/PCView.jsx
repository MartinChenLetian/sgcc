import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Table,
    Card,
    Input,
    Button,
    Space,
    Modal,
    Form,
    message,
    Popconfirm,
    Select,
    Spin,
    Tooltip,
    Tag,
    Pagination,
} from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabase';

const PCView = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(100);

    // 总页数计算
    const totalPages = useMemo(() => {
        const ps = Number(pageSize) || 1;
        const t = Number(total) || 0;
        return Math.max(1, Math.ceil(t / ps));
    }, [total, pageSize]);

    // 编辑/新增状态（目前新增按钮 disabled）
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form] = Form.useForm();

    // antd v5：避免 message 静态函数 context 警告
    const [messageApi, contextHolder] = message.useMessage();

    // 固定视口高度，仅表格内容滚动；virtual 表格 scroll.y 必须是 number
    const [scrollY, setScrollY] = useState(520);
    const tableWrapRef = useRef(null);
    const FOOTER_H = 56; // 仅用于计算预留空间
    useEffect(() => {
        const update = () => {
            // 估算：100vh -（Card头+搜索栏+内边距+底部footer）
            const offset = 480; // 预留底部工具条/分页条空间，避免遮挡
            const y = Math.max(260, window.innerHeight - offset);
            setScrollY(y);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    // 选择行（只做当前页选择；跨页选择会被识别为“不一致/不可操作”）
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const toggleSelectRow = (id) => {
        setSelectedRowKeys((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    // 标记下拉
    const [tagLoading, setTagLoading] = useState(false);
    const [tagOptions, setTagOptions] = useState(['出租', '自住', '无人', '纸质账单', '补单']);

    // Select 受控值 + 状态
    const [tagSelectValue, setTagSelectValue] = useState([]);
    const [tagSelectDisabled, setTagSelectDisabled] = useState(false);
    const [tagSelectPlaceholder, setTagSelectPlaceholder] = useState('---选择标记---');

    const encryptTag3 = (tag) => {
        // 生成稳定的 3 字符码（ASCII），写入 user_remark
        // 后续你如果有真正的加密算法/中间件，这里替换即可
        try {
            return btoa(unescape(encodeURIComponent(tag))).replace(/=+$/g, '').slice(0, 3);
        } catch {
            return String(tag).slice(0, 3);
        }
    };

    const parseRemarks = (remark) => {
        if (!remark) return [];
        if (Array.isArray(remark)) return remark.map(String).filter(Boolean);
        return String(remark)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    };

    const joinRemarks = (arr) => {
        const list = (arr || []).map(String).map((s) => s.trim()).filter(Boolean);
        if (!list.length) return null;
        return Array.from(new Set(list)).join(',');
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
                // 支持任意列搜索（户号/户名/地址/电话1~5）
                // PostgREST 的 or() 用逗号分隔条件，所以把用户输入里的逗号替换为空格，避免解析冲突
                const q = String(searchText).trim().replace(/,/g, ' ');
                const pattern = `%${q}%`;

                query = query.or(
                    [
                        `user_no.ilike.${pattern}`,
                        `user_name.ilike.${pattern}`,
                        `address.ilike.${pattern}`,
                        `match_business.ilike.${pattern}`,
                        `match_home.ilike.${pattern}`,
                        `match_mobile.ilike.${pattern}`,
                        `match_phone4.ilike.${pattern}`,
                        `match_phone5.ilike.${pattern}`,
                    ].join(',')
                );
            }
            const { data: records, error, count } = await query;
            if (error) throw error;

            setData(records || []);
            setTotal(count || 0);

            // 切换页后：如果之前选中过跨页内容，会造成“当前页缺失”，这里不强制清空
            // 让一致性 useEffect 自动禁用 Select 并提示即可
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

    useEffect(() => {
        // 翻页/变更每页条数/搜索后：让表格滚动回到最上方
        const root = tableWrapRef.current;
        if (!root) return;
        // antd virtual table 的可滚动容器
        const el = root.querySelector('.ant-table-body') || root.querySelector('.ant-table-content');
        if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: 0 });
        else if (el) el.scrollTop = 0;
    }, [page, pageSize, searchText]);

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
    };

    // === 3. 标签元信息映射（code -> meta） ===
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
                    disabled: !!(opt.disabled ?? opt.is_disabled ?? opt.isDisabled ?? opt.disable ?? opt.disabled_flag),
                });
            }
        });

        return m;
    }, [tagOptions]);

    const statusMeta = (remark) => {
        if (!remark) return null;
        return remarkMetaMap.get(String(remark)) || null;
    };

    // 规则：已有用户若用的是 disabled 标签 -> 显示 disabled
    // 同时：若 remark 无法解析（不在映射里）也视作 disabled
    const statusLabel = (remark) => {
        const meta = statusMeta(remark);
        if (!meta) return 'disabled';
        if (meta.disabled) return 'disabled';
        return meta.label;
    };

    const statusTitle = useMemo(
        () => (record) => {
            const parts = parseRemarks(record?.user_remark)
                .map((r) => {
                    const meta = statusMeta(r);
                    if (!meta || meta.disabled) return 'disabled';
                    return statusLabel(r);
                })
                .filter(Boolean);

            if (!parts.length) return '';
            return '用户状态:' + parts.join(' / ');
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [remarkMetaMap]
    );

    const statusColor = (remark) => {
        const meta = statusMeta(remark);
        if (!meta || meta?.disabled) return 'default';
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

    // === 4. 一致性判断：选中项状态一致才可回显/可编辑 ===
    const normalizeRemarkKey = (remark) => {
        const arr = parseRemarks(remark);
        const uniq = Array.from(new Set(arr.map(String)));
        uniq.sort();
        return uniq.join('|');
    };

    const remarksToSelectableLabels = (remark) => {
        return parseRemarks(remark)
            .map((rk) => {
                const meta = statusMeta(rk);
                if (!meta || meta.disabled) return null;
                return meta.label;
            })
            .filter(Boolean);
    };

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            // 无选择：恢复默认
            if (!selectedRowKeys.length) {
                setTagSelectDisabled(false);
                setTagSelectPlaceholder('---选择标记---');
                setTagSelectValue([]);
                return;
            }

            // 先尝试用当前页数据判断；若跨页（缺失），再去数据库拉取最小字段
            const selectedSet = new Set(selectedRowKeys);
            let rows = (data || []).filter((r) => selectedSet.has(r.id));

            if (rows.length !== selectedRowKeys.length) {
                // 跨页：拉取所有已选行的 user_remark 用于一致性判断与回显
                const { data: remoteRows, error } = await supabase
                    .from('master_records')
                    .select('id,user_remark')
                    .in('id', selectedRowKeys);

                if (cancelled) return;
                if (error) {
                    // 拉取失败时不阻塞操作，但不做回显
                    setTagSelectDisabled(false);
                    setTagSelectPlaceholder('---选择标记---');
                    setTagSelectValue([]);
                    return;
                }

                rows = remoteRows || [];
            }

            if (!rows.length) {
                setTagSelectDisabled(false);
                setTagSelectPlaceholder('---选择标记---');
                setTagSelectValue([]);
                return;
            }

            const keys = rows.map((r) => normalizeRemarkKey(r.user_remark));
            const allSame = keys.every((k) => k === keys[0]);

            if (rows.length === 1 || allSame) {
                const raw = parseRemarks(rows[0].user_remark);
                const hasInvalid = raw.some((rk) => {
                    const meta = statusMeta(rk);
                    return !meta || meta.disabled;
                });

                if (hasInvalid && raw.length) {
                    // 存在 disabled/未知标签：不允许在 Select 中回显/编辑
                    setTagSelectDisabled(true);
                    setTagSelectPlaceholder('-请确保所选项状态一致-');
                    setTagSelectValue([]);
                    return;
                }

                const labels = remarksToSelectableLabels(rows[0].user_remark);
                setTagSelectDisabled(false);
                setTagSelectPlaceholder('---选择标记---');
                setTagSelectValue(Array.from(new Set(labels)));
                return;
            }

            // 多选但不一致 -> 禁用
            setTagSelectDisabled(true);
            setTagSelectPlaceholder('-请确保所选项状态一致-');
            setTagSelectValue([]);
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [selectedRowKeys, data, remarkMetaMap]);

    // === 5. 批量写入标签（按钮触发，避免 onBlur 误触） ===
    const applyTagToSelected = async () => {
        if (!selectedRowKeys.length) {
            messageApi.warning('请先选择用户');
            return;
        }
        if (tagSelectDisabled) {
            messageApi.warning('请确保所选项状态一致');
            return;
        }
        if (!tagSelectValue.length) {
            messageApi.warning('请选择标记');
            return;
        }

        const codesToAdd = tagSelectValue.map((t) => encryptTag3(t)).map(String).filter(Boolean);
        if (!codesToAdd.length) return;

        try {
            // ✅ 跨页：从数据库拉取所有已选行的 remark，再逐行合并
            const { data: rows, error } = await supabase
                .from('master_records')
                .select('id,user_remark')
                .in('id', selectedRowKeys);
            if (error) throw error;

            const nextById = new Map();
            (rows || []).forEach((r) => {
                const current = parseRemarks(r.user_remark);
                nextById.set(r.id, joinRemarks([...current, ...codesToAdd]));
            });

            // 乐观更新当前页可见数据
            setData((prev) => prev.map((r) => (nextById.has(r.id) ? { ...r, user_remark: nextById.get(r.id) } : r)));

            const tasks = Array.from(nextById.entries()).map(([id, val]) =>
                supabase.from('master_records').update({ user_remark: val }).eq('id', id)
            );

            const results = await Promise.all(tasks);
            const firstErr = results.find((x) => x?.error)?.error;
            if (firstErr) throw firstErr;

            messageApi.success(`已标记 ${selectedRowKeys.length} 项`);
            setTagSelectValue([]);
            setTagSelectPlaceholder('---选择标记---');
        } catch (e) {
            messageApi.error('标记写入失败: ' + (e?.message || String(e)));
            fetchData();
        }
    };

    const clearStatusForSelected = async () => {
        if (!selectedRowKeys.length) {
            messageApi.warning('请先选择用户');
            return;
        }

        // 乐观更新本地
        setData((prev) => prev.map((r) => (selectedRowKeys.includes(r.id) ? { ...r, user_remark: null } : r)));

        const { error } = await supabase.from('master_records').update({ user_remark: null }).in('id', selectedRowKeys);

        if (error) {
            messageApi.error('清除状态失败: ' + error.message);
            fetchData();
            return;
        }

        setTagSelectValue([]);
        setTagSelectPlaceholder('---选择标记---');
        messageApi.success(`已清除 ${selectedRowKeys.length} 项状态`);
    };

    // === 6. 表格列定义 ===
    const columns = [
        {
            title: '户号',
            dataIndex: 'user_no',
            width: 160,
        },
        {
            title: '户名',
            dataIndex: 'user_name',
            width: 160,
            ellipsis: { title: true },
            render: (text, record) => {
                const remarks = parseRemarks(record.user_remark);
                const hasAny = remarks.length > 0;

                const content = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                            {text}
                        </span>

                        {remarks.map((rk) => (
                            <Tag
                                key={rk}
                                color={statusColor(rk)}
                                style={{
                                    margin: 0,
                                    lineHeight: '18px',
                                    height: 20,
                                    paddingInline: 6,
                                    fontSize: 10,
                                    border: '.7px solid',
                                }}
                            >
                                {statusLabel(rk)}
                            </Tag>
                        ))}
                    </span>
                );

                if (!hasAny) return <span>{text}</span>;
                return <Tooltip title={statusTitle(record)}>{content}</Tooltip>;
            },
        },
        {
            title: '地址',
            dataIndex: 'address',
            width: 240,
            ellipsis: { title: true },
            render: (text) => <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
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

    // rowSelection：不改变 checkbox 大小（scale(1) 保持）
    const rowSelection = useMemo(
        () => ({
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            columnTitle: '',
            columnWidth: 44,
            fixed: true,
            renderCell: (_checked, _record, _index, originNode) => (
                <div style={{ transform: 'scale(1)', transformOrigin: 'left center' }}>{originNode}</div>
            ),
        }),
        [selectedRowKeys]
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
            {tagLoading && <Spin fullscreen />}

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
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    minWidth: 0,
                }}
                bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
                {/* 顶部工具条 */}
                <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 260, maxWidth: 520 }}>
                        <Input.Search
                            placeholder="搜索户号/户名/地址/电话..."
                            onSearch={(val) => {
                                setSearchText(val);
                                setPage(1);
                            }}
                            enterButton
                            allowClear
                        />
                    </div>

                    <Select
                        mode="multiple"
                        style={{ width: 260 }}
                        placeholder={tagSelectPlaceholder}
                        value={tagSelectValue}
                        options={[...tagOptions.map((t) => ({ value: t, label: t })), { value: '__more__', label: '添加更多...' }]}
                        onChange={(vals) => {
                            const arr = Array.isArray(vals) ? vals : [];
                            if (arr.includes('__more__')) {
                                loadMoreTags();
                                const cleaned = arr.filter((x) => x !== '__more__');
                                setTagSelectValue(cleaned);
                                return;
                            }
                            setTagSelectValue(arr);
                        }}
                        disabled={!selectedRowKeys.length || tagSelectDisabled}
                        loading={tagLoading}
                        maxTagCount="responsive"
                    />

                    <Button
                        type="primary"
                        size="small"
                        disabled={!selectedRowKeys.length || tagSelectDisabled || !tagSelectValue.length}
                        onClick={applyTagToSelected}
                    >
                        应用标记
                    </Button>

                    <Button size="small" disabled={!selectedRowKeys.length} onClick={clearStatusForSelected}>
                        清除状态
                    </Button>
                </div>

                {/* 表格：只滚动列表 */}
                <div ref={tableWrapRef} style={{ flex: 1, minHeight: 0 }}>
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
                        pagination={false}
                        onRow={(record) => ({
                            onClick: (e) => {
                                // 点击行任意位置可切换选择（排除按钮/链接/输入/下拉）
                                if (
                                    e.target.closest('button') ||
                                    e.target.closest('a') ||
                                    e.target.tagName === 'INPUT' ||
                                    e.target.closest('.ant-select') ||
                                    e.target.closest('.ant-dropdown')
                                )
                                    return;
                                e.preventDefault();
                                toggleSelectRow(record.id);
                            },
                        })}
                        style={{ flex: 1, minHeight: 0 }}
                    />
                </div>

                {/* 底部 footer：清晰显示“已选数量 + 当前页”，并固定在可视范围内 */}
                <div
                  style={{
                    marginTop: 8,
                    zIndex: 2,
                    background: '#fff',
                    borderTop: '1px solid #f0f0f0',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Tag color="blue" style={{ margin: 0 }}>
                      已选 <b>{selectedRowKeys.length}</b> 条
                    </Tag>
                    <span style={{ color: '#333', fontSize: 12, whiteSpace: 'nowrap' }}>
                      第 <b>{page}</b> / {totalPages} 页 · 每页 <b>{pageSize}</b> 条 · 共 <b>{total}</b> 条
                    </span>
                  </div>

                  <Pagination
                    size="small"
                    current={page}
                    pageSize={pageSize}
                    total={total}
                    showSizeChanger
                    showQuickJumper
                    pageSizeOptions={[50, 100, 200, 500, 1000]}
                    onChange={(p, size) => {
                      setPage(p);
                      setPageSize(size);
                    }}
                  />
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