import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button, Card, Upload, message, Typography } from 'antd';
import { CloudDownloadOutlined, FileExcelOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

// === 1. 核弹级清洗函数 ===
// 规则：只保留 数字(0-9) 和 横杠(-)
// 其他所有字符（中英文、空格、标点、特殊符号）全部会被删掉
const cleanText = (str) => {
    if (!str) return '';
    let s = String(str);

    // 预处理：把可能会用作分隔符的 下划线(_) 或 长破折号(—) 统一转成标准横杠(-)
    s = s.replace(/[—_]/g, '-');

    // 正则: [^0-9-] 表示 "除了0-9和-以外的字符"
    // 把它们全部替换为空
    return s.replace(/[^0-9-]/g, '');
};

// === 2. 地址格式化逻辑 ===
const formatAddress = (cleanStr) => {
    if (!cleanStr) return '';

    // 此时 cleanStr 里只有数字和横杠，处理起来非常标准

    // 匹配三段式: 413-10-101
    const match3 = cleanStr.match(/^(\d+)-(\d+)-(.+)$/);
    if (match3) {
        return `宜川路${match3[1]}弄${match3[2]}号${match3[3]}室`;
    }

    // 匹配两段式: 413-10
    const match2 = cleanStr.match(/^(\d+)-(\d+)$/);
    if (match2) {
        return `宜川路${match2[1]}弄${match2[2]}号`;
    }

    // 保底
    if (cleanStr.startsWith('413') || cleanStr.startsWith('451')) {
        return `宜川路${cleanStr}`;
    }

    return cleanStr;
};

// === 3. 电话合并逻辑 ===
const combinePhones = (p1, p2, p3) => {
    const phones = [p1, p2, p3]
        .map(p => (p ? String(p).trim() : ''))
        .filter(p => p !== '' && p !== '-' && p !== 'null' && p !== 'undefined');
    return phones.join(',');
};

const DataCleaning = () => {
    const [loading, setLoading] = useState(false);

    const handleProcess = (file) => {
        setLoading(true);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

                const exportRows = [];
                exportRows.push(['Display Name (原名)', '清洗后 (仅保留数字横杠)', '更改后地址', '联系电话']);

                let count = 0;

                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    const originalName = String(row[0] || '');

                    // 1. 核弹清洗
                    const cleanedName = cleanText(originalName);

                    // 2. 匹配逻辑
                    if (cleanedName.includes('413-') || cleanedName.includes('451-')) {

                        const newAddr = formatAddress(cleanedName);
                        const phones = combinePhones(row[1], row[2], row[3]);

                        exportRows.push([
                            originalName,
                            cleanedName,
                            newAddr,
                            phones
                        ]);
                        count++;
                    }
                }

                if (count === 0) {
                    message.warning('未找到符合条件的记录');
                    setLoading(false);
                    return;
                }

                const newSheet = XLSX.utils.aoa_to_sheet(exportRows);
                const newWorkbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(newWorkbook, newSheet, "筛选结果");

                XLSX.writeFile(newWorkbook, `413_451_核弹清洗_${Date.now()}.xlsx`);
                message.success(`成功导出 ${count} 条数据！`);

            } catch (error) {
                console.error(error);
                message.error('解析失败');
            } finally {
                setLoading(false);
            }
        };

        reader.readAsArrayBuffer(file);
        return false;
    };

    return (
        <div style={{ padding: 50, display: 'flex', justifyContent: 'center', background: '#f0f2f5', height: '100vh' }}>
            <Card
                style={{ width: 600, textAlign: 'center' }}
                title={<Title level={3} type="danger">🚑 413/451 核弹清洗版</Title>}
            >
                <div style={{ marginBottom: 20, textAlign: 'left', background: '#fff1f0', padding: 15, borderRadius: 8 }}>
                    <Text strong style={{ color: '#cf1322' }}>清洗规则 (V3.0)：</Text>
                    <ul style={{ marginTop: 5, color: '#555' }}>
                        <li>1. 保留：<strong>数字 (0-9)</strong></li>
                        <li>2. 保留：<strong>横杠 (-)</strong></li>
                        <li>3. 删除：<strong>所有其他字符</strong> (中文、英文、空格、括号、点、斜杠、星号等全部删除)</li>
                    </ul>
                </div>

                <Upload beforeUpload={handleProcess} showUploadList={false}>
                    <Button
                        type="primary"
                        danger
                        size="large"
                        icon={loading ? <CloudDownloadOutlined spin /> : <FileExcelOutlined />}
                        loading={loading}
                        style={{ height: 60, fontSize: 20, width: '100%' }}
                    >
                        {loading ? '处理中...' : '上传 Excel'}
                    </Button>
                </Upload>
            </Card>
        </div>
    );
};

export default DataCleaning;