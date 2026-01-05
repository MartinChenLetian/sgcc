import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { Spin, message } from 'antd';
import PCView from './PCView';
import MobileView from './MobileView';

const ContactsIndex = () => {
    const [loading, setLoading] = useState(true);
    const [contacts, setContacts] = useState([]);
    const isMobileAgain = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768 && isMobileAgain);

    // 1. 监听屏幕大小变化
    useEffect(() => {
        const handleResize = () => {
            const isMobileAgain = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            setIsMobile(window.innerWidth < 768 && isMobileAgain);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // 2. 拉取数据
    const fetchData = async () => {
        setLoading(true);
        // 按地址排序
        const { data, error } = await supabase
            .from('master_records')
            .select('*')
            .order('address', { ascending: true });

        if (error) {
            message.error('数据加载失败');
        } else {
            setContacts(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // 3. 供子组件调用的刷新函数
    const handleRefresh = () => {
        fetchData();
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <Spin size="large" tip="加载通讯录..." />
            </div>
        );
    }

    // 4. 根据设备切换视图
    return isMobile ? (
        <MobileView data={contacts} />
    ) : (
        <PCView data={contacts} onRefresh={handleRefresh} />
    );
};

export default ContactsIndex;
