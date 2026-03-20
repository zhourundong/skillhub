import React, { useState } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { authApi } from './api';
import ProtectedRoute from './components/ProtectedRoute';
import SkillList from './pages/SkillList';
import SkillDetail from './pages/SkillDetail';
import Channels from './pages/Channels';
import Login from './pages/Login';
import Users from './pages/Users';

// Logo SVG Component
function LogoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#667eea' }} />
          <stop offset="100%" style={{ stopColor: '#764ba2' }} />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="80" height="80" rx="16" fill="url(#logoGrad)" />
      <text x="50" y="65" fontFamily="Arial, sans-serif" fontSize="40" fontWeight="bold" fill="white" textAnchor="middle">SH</text>
    </svg>
  );
}

function Header() {
  const { user, logout, isAdmin, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('请填写所有字段');
      return;
    }

    if (passwordForm.newPassword.length < 3) {
      setPasswordError('新密码长度至少 3 位');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    try {
      setPasswordLoading(true);
      await authApi.changePassword(passwordForm.oldPassword, passwordForm.newPassword);
      setPasswordSuccess('密码修改成功');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 1500);
    } catch (err) {
      setPasswordError(err.response?.data?.error || '密码修改失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const closePasswordModal = () => {
    if (passwordLoading) return;
    setShowPasswordModal(false);
    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setPasswordSuccess('');
  };

  return (
    <header className="header">
      <div className="container">
        <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon />
          <h1 style={{ margin: 0 }}>SkillHub</h1>
        </div>
        <nav>
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>Skills 列表</NavLink>
          {isAuthenticated && (
            <NavLink to="/channels" className={({ isActive }) => isActive ? 'active' : ''}>发布渠道</NavLink>
          )}
          {isAdmin && (
            <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>用户管理</NavLink>
          )}
        </nav>
        <div className="user-info">
          {user ? (
            <>
              <span className="user-name">{user.displayName || user.username}</span>
              <span className="user-role">{user.role === 'admin' ? '管理员' : '用户'}</span>
              <button onClick={() => setShowPasswordModal(true)} className="btn-password">修改密码</button>
              <button onClick={handleLogout} className="btn-logout">退出</button>
            </>
          ) : (
            <NavLink to="/login" className="btn-login">登录</NavLink>
          )}
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={closePasswordModal}>
          <div className="modal password-modal" onClick={(e) => e.stopPropagation()}>
            <h3>修改密码</h3>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>原密码</label>
                <input
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                  placeholder="请输入原密码"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>新密码</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="请输入新密码（至少 3 位）"
                />
              </div>
              <div className="form-group">
                <label>确认新密码</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="请再次输入新密码"
                />
              </div>
              {passwordError && <div className="error-message">{passwordError}</div>}
              {passwordSuccess && <div className="success-message">{passwordSuccess}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-default" onClick={closePasswordModal} disabled={passwordLoading}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
                  {passwordLoading ? '提交中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
        }

        .user-name {
          font-weight: 500;
        }

        .user-role {
          font-size: 12px;
          color: #888;
          padding: 2px 8px;
          background: #f0f0f0;
          border-radius: 4px;
        }

        .btn-password {
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.94);
          color: #667eea;
          border-radius: 12px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 10px 20px rgba(43, 54, 98, 0.12);
          transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
        }

        .btn-password:hover {
          background: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 14px 26px rgba(43, 54, 98, 0.16);
        }

        .btn-logout {
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.94);
          color: #33415f;
          border-radius: 12px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 10px 20px rgba(43, 54, 98, 0.12);
          transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
        }

        .btn-logout:hover {
          background: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 14px 26px rgba(43, 54, 98, 0.16);
        }

        .btn-login {
          padding: 6px 16px;
          background: #667eea;
          color: white;
          border-radius: 4px;
          text-decoration: none;
          font-size: 14px;
        }

        .btn-login:hover {
          opacity: 0.9;
        }

        .password-modal {
          max-width: 400px;
        }

        .password-modal h3 {
          margin: 0 0 20px 0;
          font-size: 18px;
          color: #333;
        }

        .password-modal .form-group {
          margin-bottom: 16px;
        }

        .password-modal label {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
          color: #555;
        }

        .password-modal input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          box-sizing: border-box;
        }

        .password-modal input:focus {
          outline: none;
          border-color: #667eea;
        }

        .password-modal .error-message {
          color: #e74c3c;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .password-modal .success-message {
          color: #27ae60;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .password-modal .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 20px;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: white;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <p>Copyright &copy; 2026 Kingdee. 精选 Kingdee AI Skills</p>
      </div>
      <style>{`
        .footer {
          padding: 24px 0;
          text-align: center;
          background: #f8f9fa;
          border-top: 1px solid #e8e8e8;
          margin-top: auto;
        }

        .footer p {
          margin: 0;
          color: #888;
          font-size: 13px;
        }
      `}</style>
    </footer>
  );
}

export default function App() {
  const location = useLocation();
  const isSkillDetailRoute = /^\/skills\/[^/]+$/.test(location.pathname);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <>
              <Header />
              <main
                className="container"
                style={{
                  paddingTop: 16,
                  paddingBottom: 48,
                  flex: 1,
                  maxWidth: isSkillDetailRoute ? 1560 : undefined,
                }}
              >
                <Routes>
                  <Route path="/" element={<SkillList />} />
                  <Route path="/skills/:id" element={<SkillDetail />} />
                  <Route
                    path="/channels"
                    element={
                      <ProtectedRoute>
                        <Channels />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute requireAdmin>
                        <Users />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </main>
              <Footer />
            </>
          }
        />
      </Routes>
    </div>
  );
}
