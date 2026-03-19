import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usersApi } from '../api';
import './Users.css';

const DEFAULT_PASSWORD = 'abc123';

const ROLE_META = {
  admin: {
    label: '管理员',
    hint: '拥有后台全部权限',
    className: 'role-admin'
  },
  user: {
    label: '普通用户',
    hint: '可登录并使用基础功能',
    className: 'role-user'
  }
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

function createEmptyForm() {
  return {
    username: '',
    password: '',
    displayName: '',
    role: 'user'
  };
}

function formatDate(value) {
  if (!value) return '未记录';

  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return '未记录';
  }
}

function getDisplayName(user) {
  return user.displayName || user.display_name || '';
}

function getCreatedAt(user) {
  return user.createdAt || user.created_at;
}

function getUpdatedAt(user) {
  return user.updatedAt || user.updated_at;
}

function getUserInitial(name) {
  const source = (name || '?').trim();
  return source.slice(0, 1).toUpperCase();
}

function getRoleMeta(role) {
  return ROLE_META[role] || ROLE_META.user;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [notice, setNotice] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [form, setForm] = useState(createEmptyForm());

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const result = await usersApi.list({ pageSize: 100 });
      setUsers(result.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setNotice({
        type: 'error',
        message: err.response?.data?.error || '加载用户列表失败，请稍后重试。'
      });
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingUser(null);
    setForm(createEmptyForm());
    setShowModal(true);
  }

  function openEditModal(user) {
    setEditingUser(user);
    setForm({
      username: user.username,
      password: '',
      displayName: getDisplayName(user),
      role: user.role || 'user'
    });
    setShowModal(true);
  }

  function closeEditorModal() {
    if (saving) return;
    setShowModal(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);

      if (editingUser) {
        await usersApi.update(editingUser.id, {
          displayName: form.displayName,
          role: form.role
        });
      } else {
        await usersApi.create({
          username: form.username.trim(),
          password: form.password,
          displayName: form.displayName.trim(),
          role: form.role
        });
      }

      setShowModal(false);
      setNotice({
        type: 'success',
        message: editingUser ? '用户信息已更新。' : '新用户已创建。'
      });
      await loadUsers();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.response?.data?.error || '操作失败，请检查后重试。'
      });
    } finally {
      setSaving(false);
    }
  }

  function openDeleteModal(user) {
    setDeleteTarget(user);
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      setDeleting(true);
      await usersApi.delete(deleteTarget.id);
      setNotice({
        type: 'success',
        message: `用户“${deleteTarget.username}”已删除。`
      });
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.response?.data?.error || '删除失败，请稍后再试。'
      });
    } finally {
      setDeleting(false);
    }
  }

  function openResetPasswordModal(user) {
    setPasswordTarget(user);
    setPasswordInput('');
  }

  function closeResetPasswordModal() {
    if (resettingPassword) return;
    setPasswordTarget(null);
    setPasswordInput('');
  }

  async function handleResetPassword(event) {
    event.preventDefault();

    if (passwordInput && passwordInput.length < 3) {
      setNotice({
        type: 'error',
        message: '新密码长度至少需要 3 位。'
      });
      return;
    }

    if (!passwordTarget) return;

    try {
      setResettingPassword(true);
      await usersApi.resetPassword(passwordTarget.id, passwordInput || undefined);
      setNotice({
        type: 'success',
        message: passwordInput
          ? `已为“${passwordTarget.username}”设置新密码。`
          : `已将“${passwordTarget.username}”的密码重置为默认密码 ${DEFAULT_PASSWORD}。`
      });
      closeResetPasswordModal();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.response?.data?.error || '重置密码失败，请稍后再试。'
      });
    } finally {
      setResettingPassword(false);
    }
  }

  const normalizedKeyword = normalizeText(keyword);
  const filteredUsers = users.filter((user) => {
    const matchesRole = roleFilter === 'all' ? true : user.role === roleFilter;
    const matchesKeyword = normalizedKeyword
      ? [user.username, getDisplayName(user), user.role]
        .some((value) => normalizeText(value).includes(normalizedKeyword))
      : true;

    return matchesRole && matchesKeyword;
  });

  return (
    <div className="users-page">
      {notice ? (
        <div className={`users-notice users-notice-${notice.type}`}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)}>
            关闭
          </button>
        </div>
      ) : null}

      <section className="users-panel">
        <div className="users-panel-top">
          <div>
            <h2>用户管理</h2>
          </div>
          <div className="users-filters">
            <div className="users-filter-field users-search-field">
              <label htmlFor="user-search"></label>
              <input
                id="user-search"
                type="text"
                placeholder="搜索用户名或显示名称"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
            <div className="users-filter-field">
              <select
                id="user-role-filter"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="all">全部角色</option>
                <option value="admin">管理员</option>
                <option value="user">普通用户</option>
              </select>
            </div>
            <button type="button" className="btn users-create-btn" onClick={openCreateModal}>
              <span className="users-create-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" focusable="false">
                  <path d="M10 4.5v11" />
                  <path d="M4.5 10h11" />
                </svg>
              </span>
              <span>新建用户</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="users-state users-loading-state">
            <div className="users-spinner" />
            <p>正在加载用户列表...</p>
          </div>
        ) : filteredUsers.length > 0 ? (
          <div className="users-list-shell">
            <div className="users-list-head">
              <span>账号信息</span>
              <span>显示名称</span>
              <span>角色</span>
              <span>创建时间</span>
              <span>操作</span>
            </div>

            <div className="users-list">
              {filteredUsers.map((user) => {
                const displayName = getDisplayName(user);
                const roleMeta = getRoleMeta(user.role);
                const isCurrentUser = user.id === currentUser?.id;

                return (
                  <article className="user-row" key={user.id}>
                    <div className="user-main-cell">
                      <div className="user-avatar">
                        {getUserInitial(displayName || user.username)}
                      </div>
                      <div className="user-main-copy">
                        <div className="user-name-line">
                          <strong>{user.username}</strong>
                          {isCurrentUser ? <span className="user-self-tag">当前账号</span> : null}
                        </div>
                        <span className="user-subline">
                          最近更新 {formatDate(getUpdatedAt(user))}
                        </span>
                      </div>
                    </div>

                    <div className="user-display-cell" data-label="显示名称">
                      {displayName ? (
                        <>
                          <strong>{displayName}</strong>
                        </>
                      ) : (
                        <>
                          <strong>未设置</strong>
                          <span>会默认显示用户名</span>
                        </>
                      )}
                    </div>

                    <div className="user-role-cell" data-label="角色">
                      <span className={`role-pill ${roleMeta.className}`}>{roleMeta.label}</span>
                    </div>

                    <div className="user-date-cell" data-label="创建时间">
                      <strong>{formatDate(getCreatedAt(user))}</strong>
                    </div>

                    <div className="user-actions" data-label="操作">
                      <button type="button" className="user-action-btn" onClick={() => openEditModal(user)}>
                        编辑
                      </button>
                      <button type="button" className="user-action-btn" onClick={() => openResetPasswordModal(user)}>
                        重置密码
                      </button>
                      {isCurrentUser ? null : (
                        <button
                          type="button"
                          className="user-action-btn danger"
                          onClick={() => openDeleteModal(user)}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="users-state users-empty-state">
            <div className="users-empty-illustration">U</div>
            <h4>没有找到匹配的用户</h4>
            <p>试试清空关键词或切换角色筛选，也可以直接创建一个新账号。</p>
            <button type="button" className="btn btn-primary" onClick={openCreateModal}>
              + 新建用户
            </button>
          </div>
        )}
      </section>

      {showModal ? (
        <div className="modal-overlay" onClick={closeEditorModal}>
          <div className="modal users-modal" onClick={(event) => event.stopPropagation()}>
            <div className="users-modal-banner">
              <span className="users-modal-tag">{editingUser ? '编辑模式' : '创建模式'}</span>
              <h3>{editingUser ? '编辑用户资料' : '新建用户账号'}</h3>
              <p>
                {editingUser
                  ? '更新显示名称和角色信息，保持现有登录账号不变。'
                  : '快速创建新账号，默认密码留空时会自动使用系统初始密码。'}
              </p>
            </div>

            <form className="users-form" onSubmit={handleSubmit}>
              <div className="users-form-grid">
                <div className="form-group">
                  <label htmlFor="user-username">用户名</label>
                  <input
                    id="user-username"
                    type="text"
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    disabled={editingUser ? true : false}
                    placeholder="例如 admin 或 wangli"
                    minLength={2}
                    maxLength={50}
                    autoFocus
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="user-role">角色</label>
                  <select
                    id="user-role"
                    value={form.role}
                    onChange={(event) => setForm({ ...form, role: event.target.value })}
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>

                {editingUser ? null : (
                  <div className="form-group users-form-span">
                    <label htmlFor="user-password">初始密码</label>
                    <input
                      id="user-password"
                      type="password"
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      placeholder={`留空则默认使用 ${DEFAULT_PASSWORD}`}
                    />
                    <span className="field-hint">建议首次登录后立即修改密码。</span>
                  </div>
                )}

                <div className="form-group users-form-span">
                  <label htmlFor="user-display-name">显示名称</label>
                  <input
                    id="user-display-name"
                    type="text"
                    value={form.displayName}
                    onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                    placeholder="张xx"
                  />
                  <span className="field-hint">留空时会使用用户名作为显示名称。</span>
                </div>
              </div>

              <div className="users-modal-actions">
                <button type="button" className="btn btn-default" onClick={closeEditorModal} disabled={saving}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '提交中...' : editingUser ? '保存修改' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {passwordTarget ? (
        <div className="modal-overlay" onClick={closeResetPasswordModal}>
          <div className="modal users-modal users-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="users-mini-header">
              <span className="users-modal-tag">密码维护</span>
              <h3>重置密码</h3>
              <p>
                为用户 <strong>{passwordTarget.username}</strong> 设置新密码，留空则恢复为默认密码 {DEFAULT_PASSWORD}。
              </p>
            </div>

            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label htmlFor="reset-password-input">新密码</label>
                <input
                  id="reset-password-input"
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder={`留空则使用默认密码 ${DEFAULT_PASSWORD}`}
                  autoFocus
                />
                <span className="field-hint">如果是临时密码，建议在发放后提醒对方尽快修改。</span>
              </div>

              <div className="users-modal-actions">
                <button
                  type="button"
                  className="btn btn-default"
                  onClick={closeResetPasswordModal}
                  disabled={resettingPassword}
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={resettingPassword}>
                  {resettingPassword ? '保存中...' : '确认重置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal users-modal users-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="users-danger-block">
              <span className="users-danger-dot" />
              <div>
                <h3>删除用户</h3>
                <p>
                  你即将删除账号 <strong>{deleteTarget.username}</strong>。此操作不可撤销，请确认该账号已不再使用。
                </p>
              </div>
            </div>

            <div className="users-modal-actions">
              <button type="button" className="btn btn-default" onClick={closeDeleteModal} disabled={deleting}>
                取消
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
