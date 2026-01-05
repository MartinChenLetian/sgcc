// components/ExternalPage.jsx
import React from 'react';

// 接收父组件传来的 targetUrl
const ExternalPage = ({ targetUrl }) => {
    return (
        <div style={{ width: '100%', height: '100%', minHeight: '80vh' }}>
            {/* 这里的 key 很重要：当 URL 变化时，强制 React 销毁并重建 iframe，防止加载缓存或白屏 */}
            <iframe
                key={targetUrl}
                src={targetUrl}
                title="External Page"
                width="100%"
                height="100%"
                style={{ border: 'none' }}
                allowFullScreen
            />
        </div>
    );
};

export default ExternalPage;