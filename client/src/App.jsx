import React from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
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
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
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
          {isAdmin && (
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
              <button onClick={handleLogout} className="btn-logout">退出</button>
            </>
          ) : (
            <NavLink to="/login" className="btn-login">登录</NavLink>
          )}
        </div>
      </div>

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

        .btn-logout {
          padding: 6px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-logout:hover {
          background: #f5f5f5;
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
                      <ProtectedRoute requireAdmin>
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
