import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || '登录失败，请检查用户名和密码。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background-glow login-background-glow-left" />
      <div className="login-background-glow login-background-glow-right" />

      <section className="login-shell">
        <div className="login-card">
          <div className="login-card-head">
            <span className="login-logo">SH</span>
            <div>
              <h2>登录</h2>
              <p>填写账号信息后进入 SkillHub 后台。</p>
            </div>
          </div>

          {error ? <div className="login-error-message">{error}</div> : null}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="login-username">用户名</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入用户名"
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">密码</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary login-submit-btn">
              {loading ? '登录中...' : '进入后台'}
            </button>
          </form>
        </div>

        <p className="login-footer">Copyright © 2026 Kingdee. 精选 Kingdee AI Skills</p>
      </section>
    </div>
  );
}
