import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Button, Input, Modal, Space, Typography, message, Spin, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

import MainLayout from './layouts/MainLayout';
import ContactsIndex from './pages/contacts/index';
import ExternalPage from './pages/components/ExternalPage';
import { supabase } from './supabase';

const { Text } = Typography;

// ====== Admin Shortcut + OTP Modal (Normal App only) ======
const AdminShortcut = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [challengeId, setChallengeId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mask, setMask] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // ===== Admin session (10min) =====
  const ADMIN_KEY = 'sgcc_admin_session';
  const ADMIN_TTL_MS = 1000 * 60 * 10; // 10 minutes

  const writeAdminSession = () => {
    const exp = Date.now() + ADMIN_TTL_MS;
    localStorage.setItem(ADMIN_KEY, JSON.stringify({ exp }));
  };

  const readAdminSession = () => {
    try {
      const raw = localStorage.getItem(ADMIN_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.exp || Date.now() > obj.exp) return null;
      return obj;
    } catch {
      return null;
    }
  };

  // ===== 前端限流（仅降低误触发/刷请求，真正安全仍需后端限流） =====
  const OTP_COOLDOWN_MS = 60 * 1000; // 60s 冷却
  const OTP_WINDOW_MS = 10 * 60 * 1000; // 10min 窗口
  const OTP_MAX_IN_WINDOW = 3;
  const OTP_RL_KEY = 'sgcc_admin_otp_rl';
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const readRl = () => {
    try {
      const raw = localStorage.getItem(OTP_RL_KEY);
      return raw ? JSON.parse(raw) : { last: 0, arr: [] };
    } catch {
      return { last: 0, arr: [] };
    }
  };

  const writeRl = (obj) => {
    localStorage.setItem(OTP_RL_KEY, JSON.stringify(obj));
  };

  const canSendOtp = () => {
    const now = Date.now();
    const rl = readRl();
    const last = Number(rl.last || 0);
    const arr = Array.isArray(rl.arr) ? rl.arr : [];
    const arr2 = arr.filter((t) => now - t < OTP_WINDOW_MS);

    if (now - last < OTP_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        left: Math.ceil((OTP_COOLDOWN_MS - (now - last)) / 1000),
        arr: arr2,
        last,
      };
    }
    if (arr2.length >= OTP_MAX_IN_WINDOW) {
      const oldest = Math.min(...arr2);
      const leftMs = OTP_WINDOW_MS - (now - oldest);
      return { ok: false, reason: 'window', left: Math.ceil(leftMs / 1000), arr: arr2, last };
    }
    return { ok: true, reason: 'ok', left: 0, arr: arr2, last };
  };

  // ===== Keyboard shortcuts =====
  useEffect(() => {
    const onKeyDown = (e) => {
      const primaryKey = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on macOS

      // Ctrl/Cmd + Esc: exit admin (do NOT clear session)
      if (primaryKey && (e.key === 'Escape' || e.code === 'Escape')) {
        e.preventDefault();
        e.stopPropagation();
        navigate('/');
        return;
      }

      // Esc: close modal + stop browser fullscreen-exit (only when modal open)
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
        return;
      }

      // Ctrl/Cmd + Shift + B: open admin modal
      if (primaryKey && e.shiftKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [navigate, open]);

  // Countdown refresh
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const c = canSendOtp();
      if (!c.ok) setCooldownLeft(c.left);
      else setCooldownLeft(0);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When modal opens: if session valid, jump to /admin without emailing.
  useEffect(() => {
    if (!open) return;

    if (readAdminSession()) {
      setOpen(false);
      window.location.assign('/admin');
      return;
    }

    setPwd('');
    setChallengeId(null);
    requestOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestOtp = async () => {
    const c = canSendOtp();
    if (!c.ok) {
      if (c.reason === 'cooldown') messageApi.warning(`操作过快，请 ${c.left}s 后再试`);
      else messageApi.warning(`发送过于频繁，请 ${c.left}s 后再试`);
      setCooldownLeft(c.left);
      return;
    }

    // record send
    const now = Date.now();
    const rl = readRl();
    const arr = Array.isArray(rl.arr) ? rl.arr : [];
    const arr2 = arr.filter((t) => now - t < OTP_WINDOW_MS);
    arr2.push(now);
    writeRl({ last: now, arr: arr2 });

    setLoading(true);
    setMask(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin_password_request', {
        body: { reason: 'admin_login' },
      });
      if (error) throw error;

      const cid = data?.challenge_id || data?.challengeId || null;
      setChallengeId(cid);
      messageApi.success('已向邮箱发送一次性密码');
    } catch (e) {
      messageApi.error('发送失败: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
      setMask(false);
    }
  };

  const verifyOtp = async () => {
    const p = pwd.trim();
    if (!p) {
      messageApi.warning('请输入邮箱收到的密码');
      return;
    }

    setLoading(true);
    setMask(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin_password_verify', {
        body: { password: p, challenge_id: challengeId },
      });
      if (error) throw error;

      const ok = !!(data?.ok ?? data?.success ?? false);
      if (!ok) {
        messageApi.error(data?.message || '密码错误');
        return;
      }

      writeAdminSession();
      messageApi.success('验证通过');
      setOpen(false);
      window.location.assign('/admin');
    } catch (e) {
      messageApi.error('验证失败: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
      setMask(false);
    }
  };

  return (
    <>
      {contextHolder}

      <Tooltip title="超级管理员（Ctrl/Cmd+Shift+B）" placement="left">
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<SettingOutlined />}
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 9999,
            background: '#fa8c16',
            borderColor: '#fa8c16',
          }}
        />
      </Tooltip>

      {mask ? <Spin fullscreen /> : null}

      <Modal title="超级管理员验证" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Text type="secondary">一次性密码已发送到你的邮箱（如未收到可点击重新发送）。</Text>
          <Input.Password
            autoFocus
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="输入邮箱收到的密码"
            onPressEnter={verifyOtp}
          />
          <Space>
            <Button type="primary" loading={loading} onClick={verifyOtp}>
              确认
            </Button>
            <Button loading={loading} onClick={requestOtp} disabled={cooldownLeft > 0}>
              {cooldownLeft > 0 ? `重新发送（${cooldownLeft}s）` : '重新发送'}
            </Button>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            快捷键触发：Ctrl/Cmd + Shift + B 打开验证；Esc 关闭弹窗；Ctrl/Cmd + Esc 退出超管（保留通行）
          </Text>
        </Space>
      </Modal>
    </>
  );
};

const AdminHardRedirect = () => {
  useEffect(() => {
    window.location.assign('/admin');
  }, []);
  return null;
};

const AppRoutes = () => (
  <>
    <AdminShortcut />
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<ContactsIndex />} />
        <Route path="report" element={<div>反馈条目报表页面 (待实现)</div>} />
        <Route path="compare" element={<div>智能对账系统页面 (待实现)</div>} />
        <Route path="external" element={<ExternalPage targetUrl="https://photo.cl.sg-nus.com" />} />
        <Route path="xlsx" element={<div>Excel 导出页面 (待实现)</div>} />
        <Route path="downloadFormula" element={<ExternalPage targetUrl="https://xlsx.sg-nus.com/" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      {/* If normal app is mounted and user visits /admin, force a reload so entry mounts SuperManageApp */}
      <Route path="/admin" element={<AdminHardRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>
);

const App = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;