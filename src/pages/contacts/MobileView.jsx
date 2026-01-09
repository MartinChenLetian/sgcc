import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Input, Modal, Button, Progress, message, Form, List } from 'antd';
import {
    RightOutlined, PhoneOutlined, SyncOutlined, ExclamationCircleFilled,
    PlusOutlined, SaveOutlined, WarningOutlined, ArrowDownOutlined, CodeOutlined
} from '@ant-design/icons';

// ------------------------------------------------------------------
// 🛡️ 安全引入 Supabase
// 如果路径不对或文件缺失，这里会报错，但我们用 try-catch 包裹初始化逻辑
// ------------------------------------------------------------------
import { supabase } from '../../supabase';

// ==========================================
// 0. 错误边界组件 (防止白屏)
// ==========================================
class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, textAlign: 'center' }}>
                    <h2 style={{ color: 'red' }}>系统发生错误</h2>
                    <p>请截图发给管理员：</p>
                    <pre style={{ background: '#eee', padding: 10, overflow: 'auto' }}>
                        {this.state.error?.toString()}
                    </pre>
                    <Button onClick={() => window.location.reload()}>刷新重试</Button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ==========================================
// 1. IndexedDB Helper
// ==========================================
const DB_NAME = 'SGCC_Contacts_DB';
const DB_VERSION = 2;

const dbHelper = {
    open: () => new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('contacts')) db.createObjectStore('contacts', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'queueId', autoIncrement: true });
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    }),
    deleteDB: () => new Promise(resolve => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = resolve;
        req.onerror = resolve;
        req.onblocked = resolve;
    }),
    getAllContacts: async () => {
        const db = await dbHelper.open();
        return new Promise(r => db.transaction('contacts', 'readonly').objectStore('contacts').getAll().onsuccess = e => r(e.target.result));
    },
    bulkPutContacts: async (items) => {
        const db = await dbHelper.open();
        return new Promise(r => {
            const tx = db.transaction('contacts', 'readwrite');
            items.forEach(i => tx.objectStore('contacts').put(i));
            tx.oncomplete = () => r();
        });
    },
    updateContact: async (item) => {
        const db = await dbHelper.open();
        return new Promise(r => {
            const tx = db.transaction('contacts', 'readwrite');
            tx.objectStore('contacts').put(item);
            tx.oncomplete = () => r();
        });
    },
    clearContacts: async () => {
        const db = await dbHelper.open();
        return new Promise(r => {
            const tx = db.transaction('contacts', 'readwrite');
            tx.objectStore('contacts').clear();
            tx.oncomplete = () => r();
        });
    },
    countContacts: async () => {
        const db = await dbHelper.open();
        return new Promise(r => db.transaction('contacts', 'readonly').objectStore('contacts').count().onsuccess = e => r(e.target.result));
    },
    addToQueue: async (task) => {
        const db = await dbHelper.open();
        return new Promise(r => {
            const tx = db.transaction('sync_queue', 'readwrite');
            tx.objectStore('sync_queue').add(task);
            tx.oncomplete = () => r();
        });
    },
    peekQueue: async () => {
        const db = await dbHelper.open();
        return new Promise(r => {
            const tx = db.transaction('sync_queue', 'readonly');
            tx.objectStore('sync_queue').openCursor().onsuccess = e => r(e.target.result?.value);
        });
    },
    removeFromQueue: async (qid) => {
        const db = await dbHelper.open();
        return new Promise(r => {
            const tx = db.transaction('sync_queue', 'readwrite');
            tx.objectStore('sync_queue').delete(qid);
            tx.oncomplete = () => r();
        });
    }
};

const GlobalLockStyle = () => (
    <style>{`html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; touch-action: pan-y; -webkit-text-size-adjust: 100%; }`}</style>
);

const getGroupName = (address) => {
    if (!address) return '#';
    if (address.includes('充电')) return '充电桩';
    if (address.startsWith('G3') || address.includes('甘泉')) return '甘泉三村';
    if (address.includes('宜川')) return '宜川路';
    if (address.includes('志丹')) return '志丹路';
    if (address.includes('环镇南')) return '环镇南路';
    if (address.includes('双山')) return '双山路';
    if (address.includes('沪太')) return '沪太路';
    if (address.includes('西乡')) return '西乡路';
    if (address.includes('延长西')) return '延长西路';
    if (address.includes('交通')) return '交通路';
    return '其他';
};

const MobileViewContent = () => {
    // 基础状态
    const [initializing, setInitializing] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncStatusText, setSyncStatusText] = useState('准备数据...');
    const [allData, setAllData] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
    const [visibleCount, setVisibleCount] = useState(50);

    // 交互状态
    const [selectedContact, setSelectedContact] = useState(null);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const [form] = Form.useForm();

    // 指令状态
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [resetInput, setResetInput] = useState('');
    const [showCommandList, setShowCommandList] = useState(false);
    const [scrollToTarget, setScrollToTarget] = useState(null);
    const itemRefs = useRef({});

    useEffect(() => {
        const handleResize = () => setViewportHeight(window.innerHeight);
        window.addEventListener('resize', handleResize);

        // 初始化数据加载
        checkLocalData();

        // 队列处理
        const interval = setInterval(() => {
            if (navigator.onLine) processSyncQueue();
        }, 5000);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearInterval(interval);
        };
    }, []);

    // 监听滚动目标
    useEffect(() => {
        if (scrollToTarget) {
            const idx = flatData.findIndex(item => item.id === scrollToTarget);
            if (idx !== -1) {
                if (idx >= visibleCount) setVisibleCount(idx + 20);
                setTimeout(() => {
                    const el = itemRefs.current[scrollToTarget];
                    if (el) {
                        el.scrollIntoView({ behavior: 'auto', block: 'center' });
                        el.style.backgroundColor = '#fff1b8';
                        setTimeout(() => { el.style.backgroundColor = ''; }, 1500);
                    } else {
                        message.warning('定位失败，请重试');
                    }
                }, 300);
            }
            setScrollToTarget(null);
        }
    }, [scrollToTarget, visibleCount]); // removed flatData from dependency to avoid loop

    const checkLocalData = async () => {
        try {
            const count = await dbHelper.countContacts();
            if (count > 0) {
                const localData = await dbHelper.getAllContacts();
                setAllData(localData);
                setInitializing(false);
            } else {
                startFullSync();
            }
        } catch (err) { console.error(err); }
    };

    const startFullSync = async () => {
        setSyncing(true);
        setInitializing(false);
        setSyncProgress(0);
        try {
            const { count } = await supabase.from('master_records').select('*', { count: 'exact', head: true });
            const total = count || 0;
            if (total === 0) { setSyncing(false); return; }

            const BATCH_SIZE = 1000;
            let fetchedCount = 0;
            let allFetchedItems = [];

            await dbHelper.clearContacts();

            while (fetchedCount < total) {
                const { data, error } = await supabase.from('master_records').select('*').range(fetchedCount, fetchedCount + BATCH_SIZE - 1);
                if (error) throw error;
                if (!data) break;

                await dbHelper.bulkPutContacts(data);
                allFetchedItems = [...allFetchedItems, ...data];
                fetchedCount += data.length;

                setSyncProgress(Math.floor((fetchedCount / total) * 100));
                setSyncStatusText(`已下载 ${fetchedCount} / ${total}`);
            }

            setAllData(allFetchedItems);
            setSyncing(false);

            Modal.info({
                title: '同步完成',
                content: '为了确保数据正确加载，必须重新启动应用。',
                okText: '立即重启',
                centered: true,
                onOk: () => window.location.reload()
            });

        } catch (err) {
            console.error(err);
            setSyncing(false);
            message.error('同步失败，请检查网络');
        }
    };

    const processSyncQueue = async () => {
        const task = await dbHelper.peekQueue();
        if (!task || window.isUploading) return;
        window.isUploading = true;
        try {
            const { error } = await supabase.from('master_records').update(task.payload).eq('id', task.targetId);
            if (error) throw error;
            await dbHelper.removeFromQueue(task.queueId);
        } catch (err) {
            // 这里可以加后端发邮件逻辑
            console.error('Upload failed');
        } finally {
            window.isUploading = false;
        }
    };

    const handleSaveContact = async () => {
        try {
            const values = await form.validateFields();
            const updated = { ...editingContact, ...values };

            const newData = allData.map(d => d.id === updated.id ? updated : d);
            setAllData(newData);
            await dbHelper.updateContact(updated);

            const task = {
                targetId: updated.id,
                payload: {
                    match_business: values.match_business,
                    match_home: values.match_home,
                    match_mobile: values.match_mobile,
                    match_phone4: values.match_phone4,
                    match_phone5: values.match_phone5,
                    match_display_name: values.match_display_name,
                },
                timestamp: Date.now()
            };
            await dbHelper.addToQueue(task);

            message.success('保存成功');
            setEditModalVisible(false);
            setSelectedContact(null);
            if (navigator.onLine) processSyncQueue();
        } catch (err) { console.error(err); }
    };

    // === 搜索逻辑与指令 ===
    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchText(val);

        if (val === '\\') setShowCommandList(true);
        else if (!val.startsWith('\\') && !val.startsWith('\\s ')) setShowCommandList(false);

        if (val === 'fixed') {
            setSearchText('');
            setResetInput('');
            setIsResetModalOpen(true);
        }
        if (val === '197612050000') {
            Modal.confirm({
                title: '管理员同步',
                content: '确认重新下载数据？',
                onOk: () => { setSearchText(''); startFullSync(); }
            });
        }
    };

    const handleSearchEnter = () => {
        if (searchText.startsWith('\\s ')) {
            const addr = searchText.substring(3).trim();
            if (!addr) return;
            const target = allData.find(i => i.address && i.address.includes(addr));
            if (target) {
                message.success('已定位');
                setSearchText('');
                setScrollToTarget(target.id);
            } else {
                message.warning('未找到地址');
            }
        }
    };

    const handleHardReset = async () => {
        if (resetInput !== 'Yes') { message.error('输入 Yes 确认'); return; }
        await dbHelper.deleteDB();
        localStorage.clear();
        message.loading('正在销毁并重启...', 0);
        setTimeout(() => window.location.reload(), 1000);
    };

    const flatData = useMemo(() => {
        // 指令模式下不过滤
        const isCommand = searchText.startsWith('\\');
        const valid = isCommand ? allData : allData.filter(i => !searchText || (i.address && i.address.includes(searchText.toUpperCase())));

        const groups = {};
        valid.forEach(i => {
            const g = getGroupName(i.address);
            if (!groups[g]) groups[g] = [];
            groups[g].push(i);
        });

        const res = [];
        Object.keys(groups).sort().forEach(g => {
            res.push({ type: 'header', title: g, id: `h-${g}` });
            groups[g].forEach(i => res.push({ type: 'item', data: i, id: i.id }));
        });
        return res;
    }, [allData, searchText]);

    const styles = {
        container: { width: '100vw', height: viewportHeight, background: '#EDEDED', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
        sync: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#fff', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 },
        header: { padding: '8px 10px', background: '#EDEDED', borderBottom: '1px solid #e0e0e0', position: 'relative' },
        input: { background: '#fff', borderRadius: 6, border: 'none', height: 34, textAlign: 'center' },
        list: { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
        group: { padding: '6px 16px', color: '#888', fontWeight: 'bold', background: '#EDEDED' },
        item: (has) => ({ padding: '14px 16px', background: has ? '#fff' : '#f5f5f5', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }),
        cmdList: { position: 'absolute', top: 45, left: 10, right: 10, background: 'rgba(0,0,0,0.85)', color: '#fff', borderRadius: 8, zIndex: 2000, padding: 5 },
        cmdItem: { padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 10, cursor: 'pointer' }
    };

    if (syncing) return (
        <div style={styles.sync}>
            <SyncOutlined spin style={{ fontSize: 40, color: '#1890ff', marginBottom: 20 }} />
            <h3>正在同步数据</h3>
            <Progress percent={syncProgress} status="active" />
            <p style={{ marginTop: 20, color: '#999' }}>请勿关闭页面</p>
        </div>
    );

    return (
        <div style={styles.container}>
            <GlobalLockStyle />
            <div style={styles.header}>
                <Input
                    placeholder="🔍 搜索 / 输入 \ 打开指令"
                    value={searchText}
                    onChange={handleSearchChange}
                    onPressEnter={handleSearchEnter}
                    style={styles.input}
                    allowClear
                />
                {showCommandList && (
                    <div style={styles.cmdList}>
                        <div style={styles.cmdItem} onClick={() => { setSearchText('197612050000'); setShowCommandList(false); }}>
                            <SyncOutlined /> 强制重置同步 (1976...)
                        </div>
                        <div style={styles.cmdItem} onClick={() => { setSearchText('fixed'); setShowCommandList(false); }}>
                            <WarningOutlined style={{ color: '#ff4d4f' }} /> 销毁本地数据 (fixed)
                        </div>
                        <div style={{ ...styles.cmdItem, borderBottom: 'none' }} onClick={() => { setSearchText('\\s '); setShowCommandList(false); }}>
                            <ArrowDownOutlined /> 定位模式 (\s 地址)
                        </div>
                    </div>
                )}
            </div>

            <div style={styles.list} onScroll={e => {
                if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 300) {
                    if (visibleCount < flatData.length) setVisibleCount(c => c + 50);
                }
            }}>
                {flatData.slice(0, visibleCount).map((item, idx) => {
                    if (item.type === 'header') return <div key={idx} style={styles.group}>{item.title}</div>;
                    const c = item.data;
                    const has = c.match_business || c.match_home || c.match_mobile || c.match_phone4 || c.match_phone5;
                    return (
                        <div
                            key={c.id}
                            ref={el => itemRefs.current[c.id] = el}
                            style={styles.item(has)}
                            onClick={() => {
                                if (has) setSelectedContact(c);
                                else { setEditingContact(c); form.setFieldsValue(c); setEditModalVisible(true); }
                            }}
                        >
                            <div style={{ fontSize: 17, color: has ? '#000' : '#999', fontWeight: 500 }}>{c.address}</div>
                            {!has && <ExclamationCircleFilled style={{ color: '#faad14', fontSize: 18 }} />}
                            {has && <RightOutlined style={{ color: '#ccc' }} />}
                        </div>
                    );
                })}
                <div style={{ height: 40 }}></div>
            </div>

            {/* 弹窗部分 */}
            <Modal open={!!selectedContact} onCancel={() => setSelectedContact(null)} footer={null} centered width="85vw" closeIcon={null}>
                {selectedContact && (
                    <div style={{ padding: 24 }}>
                        <h2 style={{ fontSize: 20 }}>{selectedContact.address}</h2>
                        {selectedContact.user_no && (
                            <div style={{ marginBottom: 15, borderBottom: '1px solid #eee', paddingBottom: 5 }}>
                                <div style={{ color: '#888', fontSize: 12 }}>户号</div>
                                <div style={{ fontSize: 18, color: '#000', fontWeight: 'bold' }}>{selectedContact.user_no}</div>
                            </div>
                        )}
                        {selectedContact.user_name && (
                            <div style={{ marginBottom: 15, borderBottom: '1px solid #eee', paddingBottom: 5 }}>
                                <div style={{ color: '#888', fontSize: 12 }}>户名</div>
                                <div style={{ fontSize: 18, color: '#000', fontWeight: 'bold' }}>{selectedContact.user_name}</div>
                            </div>
                        )}
                        {selectedContact.match_display_name && (
                            <div style={{ marginBottom: 15, borderBottom: '1px solid #eee', paddingBottom: 5 }}>
                                <div style={{ color: '#888', fontSize: 12 }}>通讯录记录名</div>
                                <div style={{ fontSize: 18, color: '#000', fontWeight: 'bold' }}>{selectedContact.match_display_name}</div>
                            </div>
                        )}
                        {[
                            { l: '常用', v: selectedContact.match_business },
                            { l: '住宅', v: selectedContact.match_home },
                            { l: '移动', v: selectedContact.match_mobile },
                            { l: '电话4', v: selectedContact.match_phone4 },
                            { l: '电话5', v: selectedContact.match_phone5 },
                        ].map((p, i) => p.v && (
                            <div key={i} style={{ marginBottom: 15, borderBottom: '1px solid #eee', paddingBottom: 5 }}>
                                <div style={{ color: '#888', fontSize: 12 }}>{p.l}</div>
                                <a href={`tel:${p.v}`} style={{ fontSize: 18, color: '#1890ff', fontWeight: 'bold' }}>{p.v}</a>
                            </div>
                        ))}
                        <Button block onClick={() => setSelectedContact(null)}>关闭</Button>
                    </div>
                )}
            </Modal>

            <Modal open={editModalVisible} onCancel={() => setEditModalVisible(false)} footer={null} centered width="85vw" closeIcon={null}>
                <div style={{ padding: 20 }}>
                    <h3>
                        {editingContact?.address}
                        <br />
                        {editingContact?.user_no && (
                            <span style={{ fontSize: 14, color: '#888', marginLeft: 10 }}>
                                户号: {editingContact.user_no}
                            </span>
                        )}
                        {editingContact?.user_name && (
                            <span style={{ fontSize: 14, color: '#888', marginLeft: 10 }}>
                                户名: {editingContact.user_name}
                            </span>
                        )}
                    </h3>
                    <Form form={form} component={false}>
                        <Form.Item name="match_display_name"><Input placeholder="备注" /></Form.Item>
                        <Form.Item name="match_business"><Input placeholder="电话" /></Form.Item>
                        <Form.Item name="match_home"><Input placeholder="电话" /></Form.Item>
                        <Form.Item name="match_mobile"><Input placeholder="电话" /></Form.Item>
                        <Form.Item name="match_phone4"><Input placeholder="电话" /></Form.Item>
                        <Form.Item name="match_phone5"><Input placeholder="电话" /></Form.Item>
                    </Form>
                    <Button type="primary" block icon={<SaveOutlined />} onClick={handleSaveContact}>保存</Button>
                    <Button type="text" block onClick={() => setEditModalVisible(false)} style={{ marginTop: 10 }}>取消</Button>
                </div>
            </Modal>

            <Modal
                open={isResetModalOpen}
                onOk={handleHardReset}
                onCancel={() => setIsResetModalOpen(false)}
                title="⚠️ 危险操作"
                okText="确认销毁"
                okButtonProps={{ danger: true }}
                centered
            >
                <p>确认要销毁本地所有数据并重置吗？(输入 Yes)</p>
                <Input value={resetInput} onChange={e => setResetInput(e.target.value)} placeholder="Yes" />
            </Modal>
        </div>
    );
};

// ==========================================
// 3. 导出组件 (包裹在 ErrorBoundary 中)
// ==========================================
export default function MobileView() {
    return (
        <ErrorBoundary>
            <MobileViewContent />
        </ErrorBoundary>
    );
}