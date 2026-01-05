import { useState } from 'react'
import { supabase } from '../supabase'
import * as XLSX from 'xlsx'
// 引入必要的 Ant Design 组件
import { Button, Card, Table, Tag, message, Upload, Space, Badge, Radio, Tabs, Input, Progress } from 'antd'
import { UploadOutlined, CheckCircleOutlined, ExclamationCircleOutlined, PhoneOutlined, SearchOutlined, LinkOutlined, CloudUploadOutlined, ReconciliationFilled } from '@ant-design/icons'

// ==========================================
// 1. 核心算法区
// ==========================================
const generateFingerprint = (rawString) => {
    if (!rawString) return ''
    let s = String(rawString).trim().replace(/\s+/g, '').toUpperCase()

    // 模式1: G3 / 甘泉三村
    if (s.includes('甘泉三村') || s.startsWith('G3')) {
        let no = '', room = '', suffix = ''
        const noMatch = s.match(/(?:G3|三村)[^0-9]*(\d+)(?:号|-)?/)
        if (noMatch) no = noMatch[1]
        if (no) {
            const splitIndex = s.indexOf(no) + no.length
            let remain = s.substring(splitIndex).replace(/号|-|室|层|座/g, '')
            const remainMatch = remain.match(/^(\d*)([A-Z甲乙]*)$/)
            if (remainMatch) { room = remainMatch[1]; suffix = remainMatch[2] }
        }
        return `G3-${no}-${room}${suffix}`.replace(/-$/, '')
    }

    // 模式2: 普通弄号
    let lane = ''
    const laneMatch = s.match(/(\d+)弄/)
    if (laneMatch) lane = laneMatch[1]
    else {
        const parts = s.split(/[-—/]/)
        if (parts.length >= 2 && /^\d+$/.test(parts[0])) lane = parts[0]
    }

    let no = ''
    const noMatch = s.match(/(\d+)号/)
    if (noMatch) no = noMatch[1]
    else if (!s.includes('号') && lane) {
        const parts = s.split(/[-—/]/)
        if (parts.length >= 2) no = parts[1]
    }

    let roomRaw = ''
    if (s.includes('室') || s.includes('层') || s.includes('号')) {
        const noIdx = s.lastIndexOf('号')
        if (noIdx > -1) roomRaw = s.substring(noIdx + 1)
    } else {
        const parts = s.split(/[-—/]/)
        if (parts.length >= 3) roomRaw = parts.slice(2).join('')
    }

    roomRaw = roomRaw.replace(/室|层|座|房东|托|中介/g, '')
    const rMatch = roomRaw.match(/^(\d*)([A-Z甲乙]*)/)
    let room = rMatch ? rMatch[1] : ''
    let suffix = rMatch ? rMatch[2] : ''

    if (lane && no) return `${lane}-${no}-${room}${suffix}`
    return ''
}

const extractPhones = (text) => {
    const matches = String(text).match(/\d{11}|\d{3,4}-\d{7,8}/g) || []
    const unique = [...new Set(matches)]
    return unique.slice(0, 3)
}

const detectBlockName = (text) => {
    const str = String(text).trim()
    if (str.startsWith('G3') || str.includes('甘泉三村')) return '甘泉三村'
    if (str.includes('志丹路')) return '志丹路片区'
    const match = str.match(/^(\d+)[-—/]/)
    if (match) return `${match[1]}弄`
    return '其他'
}

function Reconciliation() {
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitProgress, setSubmitProgress] = useState(0)
    const [masterRecords, setMasterRecords] = useState([])
    const [allExcelRows, setAllExcelRows] = useState([])
    const [activeTab, setActiveTab] = useState('pending')

    // === 1. 上传 Excel ===
    const handleFileUpload = (file) => {
        setLoading(true)
        const reader = new FileReader()
        reader.onload = async (e) => {
            try {
                const data = e.target.result
                const workbook = XLSX.read(data, { type: 'array' })
                const sheetName = workbook.SheetNames[0]
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })

                const detectedBlocks = new Set()
                const parsedRows = []

                jsonData.slice(1).forEach((row, index) => {
                    const rawText = row[0]
                    if (!rawText) return

                    const fp = generateFingerprint(rawText)
                    const block = detectBlockName(rawText)
                    if (block !== '其他') detectedBlocks.add(block)

                    parsedRows.push({
                        id: `excel_${index}`, // 确保ID唯一
                        original: rawText,
                        fingerprint: fp,
                        phones: extractPhones(rawText)
                    })
                })

                setAllExcelRows(parsedRows)
                message.success(`检测到区块: ${Array.from(detectedBlocks).join(', ')}`)
                await fetchMasterRecords(Array.from(detectedBlocks), parsedRows)

            } catch (err) {
                message.error("解析Excel失败")
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        reader.readAsArrayBuffer(file)
        return false
    }

    // === 2. 拉取 Master (核心去重逻辑) ===
    const fetchMasterRecords = async (blocks, excelRows) => {
        let rawMasters = []

        // 建立指纹索引
        const fpMap = {}
        excelRows.forEach(row => {
            if (row.fingerprint) {
                if (!fpMap[row.fingerprint]) fpMap[row.fingerprint] = []
                fpMap[row.fingerprint].push(row)
            }
        })

        // 循环拉取
        for (const block of blocks) {
            let query = supabase.from('master_records').select('*')
            if (block.includes('弄')) {
                const match = block.match(/(\d+)/)
                if (match) query = query.like('address', `%${match[1]}弄%`)
            } else if (block === '甘泉三村') {
                query = query.like('address', '甘泉三村%')
            } else if (block.includes('志丹路')) {
                query = query.like('address', '志丹路%')
            }

            const { data, error } = await query
            if (!error && data) {
                rawMasters = [...rawMasters, ...data]
            }
        }

        // === 强力去重：利用 Map 确保 ID 唯一 ===
        const uniqueMap = new Map()
        rawMasters.forEach(item => {
            if (item && item.id) {
                uniqueMap.set(item.id, item) // 后来的覆盖先来的，保证唯一
            }
        })
        const uniqueMasters = Array.from(uniqueMap.values())

        // 处理状态
        const processed = uniqueMasters.map(m => {
            const fp = generateFingerprint(m.address)
            const matches = fpMap[fp] || []

            let status = 'empty'
            let selectedExcelId = null

            if (matches.length === 1) {
                status = 'success'
                selectedExcelId = matches[0].id
            } else if (matches.length > 1) {
                status = 'conflict'
            }

            return {
                ...m,
                fingerprint: fp,
                matchedRows: matches,
                manualCandidates: [],
                status: status,
                selectedExcelId: selectedExcelId
            }
        })

        // 排序
        processed.sort((a, b) => (a.address || '').localeCompare(b.address || '', 'zh-CN'))
        setMasterRecords(processed)
    }

    // === 3. 操作逻辑 ===
    const handleSelectMatch = (masterId, excelRow) => {
        setMasterRecords(prev => prev.map(m => {
            if (m.id === masterId) {
                return {
                    ...m,
                    matchedRows: [excelRow],
                    selectedExcelId: excelRow.id,
                    status: 'success',
                    manualCandidates: []
                }
            }
            return m
        }))
        message.success('已关联')
    }

    const handleRollback = (masterId) => {
        setMasterRecords(prev => prev.map(m => {
            if (m.id === masterId) {
                // 简单粗暴：回退到"无数据"，让用户重新搜
                return { ...m, status: 'empty', selectedExcelId: null }
            }
            return m
        }))
    }

    // 稳健的手动搜索 (不含 risky 的指纹重算，防止死循环)
    const handleManualSearch = (masterId, searchText) => {
        if (!searchText) return

        // 搜索原始文本
        const textMatches = allExcelRows.filter(row =>
            row.original && row.original.includes(searchText)
        )

        // 搜索指纹 (更安全的写法)
        const searchFp = generateFingerprint(searchText)
        const fpMatches = searchFp ? allExcelRows.filter(row =>
            row.fingerprint === searchFp && !row.original.includes(searchText)
        ) : []

        const candidates = [...textMatches, ...fpMatches].slice(0, 10)

        if (candidates.length === 0) {
            message.warning('未找到相关记录')
            return
        }

        setMasterRecords(prev => prev.map(m => {
            if (m.id === masterId) return { ...m, manualCandidates: candidates }
            return m
        }))
    }

    // === 4. 提交逻辑 (切片上传) ===
    const handleBatchSubmit = async () => {
        const successList = masterRecords.filter(m => m.status === 'success')
        if (successList.length === 0) return message.warning('没有可提交的数据')

        setSubmitting(true)
        setSubmitProgress(0)

        try {
            // 准备数据
            const rawUpdates = successList.map(record => {
                const matchedExcelRow = record.matchedRows.find(r => r.id === record.selectedExcelId)
                const phones = matchedExcelRow ? matchedExcelRow.phones : []
                return {
                    id: record.id,
                    match_business: phones[0] || null,
                    match_home: phones[1] || null,
                    match_mobile: phones[2] || null
                }
            })

            // 再次去重 (防止提交时撞 ID)
            const uniqueUpdatesMap = new Map()
            rawUpdates.forEach(item => uniqueUpdatesMap.set(item.id, item))
            const updates = Array.from(uniqueUpdatesMap.values())

            // 切片上传 (每批 50 条)
            const BATCH_SIZE = 50
            const totalBatches = Math.ceil(updates.length / BATCH_SIZE)

            for (let i = 0; i < totalBatches; i++) {
                const start = i * BATCH_SIZE
                const end = start + BATCH_SIZE
                const currentBatch = updates.slice(start, end)

                const { error } = await supabase
                    .from('master_records')
                    .upsert(currentBatch, { onConflict: 'id' })

                if (error) throw error

                const percent = Math.round(((i + 1) / totalBatches) * 100)
                setSubmitProgress(percent)
                // 延时让浏览器喘口气
                await new Promise(r => setTimeout(r, 20))
            }

            message.success(`🎉 成功写入 ${updates.length} 条数据！`)

            // 移除已提交项
            setMasterRecords(prev => prev.filter(m => !successList.find(s => s.id === m.id)))
            setSubmitProgress(0)

        } catch (err) {
            console.error(err)
            alert('提交中断: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    // === 5. 渲染组件 (纯 Flex 布局，无 Warning) ===
    const renderPhones = (phones) => {
        if (!phones || phones.length === 0) return null
        return (
            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                {phones.map((p, i) => (
                    <Tag key={i} color={i === 0 ? "blue" : "cyan"} style={{ marginRight: 0 }}>
                        <PhoneOutlined /> {p}
                    </Tag>
                ))}
            </div>
        )
    }

    const renderMatchArea = (record) => {
        const { matchedRows, manualCandidates, selectedExcelId } = record
        const hasCandidates = manualCandidates && manualCandidates.length > 0
        const displayList = hasCandidates ? manualCandidates : matchedRows

        return (
            <div>
                {displayList.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {displayList.map(item => {
                            const isSelected = selectedExcelId === item.id
                            return (
                                <div
                                    key={item.id} // 确保这个 key 唯一
                                    style={{
                                        background: isSelected ? '#f6ffed' : '#fafafa',
                                        border: isSelected ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    <Radio
                                        checked={isSelected}
                                        onChange={() => handleSelectMatch(record.id, item)}
                                        style={{ marginRight: 8 }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                                            {item.original}
                                        </div>
                                        {renderPhones(item.phones)}
                                    </div>
                                    {hasCandidates && <Tag icon={<LinkOutlined />} color="purple">手动</Tag>}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div style={{ color: '#ccc', fontSize: 12, marginBottom: 8 }}>暂无匹配数据</div>
                )}

                {record.status !== 'success' && (
                    <div style={{ marginTop: 8 }}>
                        <Input.Search
                            placeholder="搜名字 / 号码..."
                            enterButton={<SearchOutlined />}
                            size="small"
                            onSearch={val => handleManualSearch(record.id, val)}
                            allowClear
                        />
                    </div>
                )}
            </div>
        )
    }

    // 列定义
    const columns = [
        {
            title: '标准地址',
            dataIndex: 'address',
            width: 180,
            fixed: 'left',
            render: (text, record) => (
                <div>
                    <div style={{ fontWeight: 'bold', fontSize: 15 }}>{text}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{record.fingerprint}</div>
                </div>
            )
        },
        {
            title: '通讯录匹配',
            key: 'match',
            width: 400,
            render: (_, record) => renderMatchArea(record)
        },
        {
            title: '状态',
            key: 'status',
            width: 120,
            render: (_, record) => {
                if (record.status === 'success') return <Tag color="success" icon={<CheckCircleOutlined />}>已关联</Tag>
                if (record.status === 'conflict') return <Badge status="warning" text="多重冲突" />
                return <Badge status="default" text="无数据" />
            }
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => {
                if (activeTab === 'success') {
                    return <Button size="small" onClick={() => handleRollback(record.id)}>撤销</Button>
                }
                return null
            }
        }
    ]

    const pendingList = masterRecords.filter(m => m.status !== 'success')
    const successList = masterRecords.filter(m => m.status === 'success')

    return (
        <div style={{ padding: '20px', background: '#f0f2f5', minHeight: '100vh' }}>
            <Card title="SGCC 智能对账 V6.0 (系统重置·稳定版)" variant="borderless">
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                        <Upload beforeUpload={handleFileUpload} showUploadList={false}>
                            <Button type="primary" icon={<UploadOutlined />} loading={loading}>导入通讯录</Button>
                        </Upload>
                        <div style={{ color: '#666', fontSize: 12 }}>* 如遇白屏，请刷新页面重新导入。</div>
                    </Space>
                    {submitting && <Progress percent={submitProgress} status="active" />}
                </Space>
            </Card>

            <div style={{ marginTop: 20, background: '#fff', padding: 20, borderRadius: 8 }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: 'pending',
                            label: (<span><ExclamationCircleOutlined /> 待核对 <Badge count={pendingList.length} showZero style={{ marginLeft: 8, backgroundColor: '#faad14' }} /></span>),
                            children: <Table dataSource={pendingList} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
                        },
                        {
                            key: 'success',
                            label: (<span><CheckCircleOutlined /> 匹配成功 <Badge count={successList.length} showZero style={{ marginLeft: 8, backgroundColor: '#52c41a' }} /></span>),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                                        <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleBatchSubmit} loading={submitting}>
                                            确认写入数据库 (共 {successList.length} 条)
                                        </Button>
                                    </div>
                                    <Table dataSource={successList} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
                                </>
                            )
                        }
                    ]}
                />
            </div>
        </div>

        // 提供电话簿下载链接

    )
}

export default Reconciliation;
