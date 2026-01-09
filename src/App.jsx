import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import ContactsIndex from './pages/contacts/index'; // 引入新的通讯录入口
import ExternalPage from './pages/components/ExternalPage'; // 引入外部页面组件

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          {/* 默认首页就是通讯录 */}
          <Route index element={<ContactsIndex />} />
          <Route path="report" element={<div>反馈条目报表页面 (待实现)</div>} />
          <Route path="compare" element={<div>智能对账系统页面 (待实现)</div>} />
          {/* 内嵌显示https://photo.cl.sg-nus.com外部链接 */}
          <Route path="external" element={<ExternalPage targetUrl="https://photo.cl.sg-nus.com" />} />
          <Route path="xlsx" element={<div>Excel 导出页面 (待实现)</div>} />
          <Route path='downloadFormula' element={<ExternalPage targetUrl="https://xlsx.sg-nus.com/" />} />

          {/* 重定向未匹配路径到首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;