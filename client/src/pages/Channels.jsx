import React, { useState, useEffect } from 'react';
import { channelsApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const DEFAULT_CONFIGS = {
  local: '{\n  "outputDir": "./published_skills"\n}',
  remote: '{\n  "url": "https://example.com/api/skills/publish",\n  "unpublishUrl": "https://example.com/api/skills/unpublish",\n  "healthCheckUrl": "https://example.com/api/health",\n  "headers": {},\n  "timeout": 60000\n}',
  github: '{\n  "owner": "",\n  "repo": "",\n  "branch": "main",\n  "token": "",\n  "basePath": "skills"\n}',
  ssh: '{\n  "host": "",\n  "port": 22,\n  "username": "",\n  "password": "",\n  "privateKey": "",\n  "passphrase": "",\n  "basePath": "skills"\n}'
};

// GitHub 配置表单组件
function GitHubConfigForm({ config, onChange }) {
  const handleChange = (field, value) => {
    const newConfig = { ...config, [field]: value };
    onChange(newConfig);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>GitHub 仓库地址</label>
        <input
          placeholder="如: https://github.com/owner/repo 或 owner/repo"
          value={config.repoUrl || ''}
          onChange={e => handleChange('repoUrl', e.target.value)}
        />
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          输入完整 URL 或 owner/repo 格式
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>Owner</label>
          <input
            placeholder="用户名或组织名"
            value={config.owner || ''}
            onChange={e => handleChange('owner', e.target.value)}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>Repository</label>
          <input
            placeholder="仓库名称"
            value={config.repo || ''}
            onChange={e => handleChange('repo', e.target.value)}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>分支</label>
          <input
            placeholder="main"
            value={config.branch || 'main'}
            onChange={e => handleChange('branch', e.target.value)}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>目标路径</label>
          <input
            placeholder="skills"
            value={config.basePath || ''}
            onChange={e => handleChange('basePath', e.target.value)}
          />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>GitHub Token</label>
        <input
          type="password"
          placeholder="ghp_xxxx (需要 repo 权限)"
          value={config.token || ''}
          onChange={e => handleChange('token', e.target.value)}
        />
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          需要 Personal Access Token，权限需包含 repo
        </p>
      </div>
    </div>
  );
}

// SSH 配置表单组件
function SSHConfigForm({ config, onChange, onTest, testing }) {
  const handleChange = (field, value) => {
    const newConfig = { ...config, [field]: value };
    onChange(newConfig);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
          <label>主机地址</label>
          <input
            placeholder="如: 192.168.1.100 或 example.com"
            value={config.host || ''}
            onChange={e => handleChange('host', e.target.value)}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>端口</label>
          <input
            type="number"
            placeholder="22"
            value={config.port || 22}
            onChange={e => handleChange('port', parseInt(e.target.value) || 22)}
          />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>用户名</label>
        <input
          placeholder="SSH 登录用户名"
          value={config.username || ''}
          onChange={e => handleChange('username', e.target.value)}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>密码认证</label>
        <input
          type="password"
          placeholder="SSH 密码（使用私钥认证可留空）"
          value={config.password || ''}
          onChange={e => handleChange('password', e.target.value)}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>私钥认证</label>
        <textarea
          placeholder="私钥内容或私钥文件路径（如 /home/user/.ssh/id_rsa）"
          value={config.privateKey || ''}
          onChange={e => handleChange('privateKey', e.target.value)}
          rows={3}
          style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 12 }}
        />
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          支持直接粘贴私钥内容或填写私钥文件路径
        </p>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>私钥密码</label>
        <input
          type="password"
          placeholder="私钥的密码短语（如有）"
          value={config.passphrase || ''}
          onChange={e => handleChange('passphrase', e.target.value)}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>目标路径</label>
        <input
          placeholder="如: /home/user/skills 或 skills"
          value={config.basePath || ''}
          onChange={e => handleChange('basePath', e.target.value)}
        />
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          服务器上存放技能的目录路径
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn btn-default"
          onClick={onTest}
          disabled={testing || !config.host || !config.username || (!config.password && !config.privateKey)}
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
      </div>
    </div>
  );
}

export default function Channels() {
  const [channels, setChannels] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
  const [gitHubConfig, setGitHubConfig] = useState({ owner: '', repo: '', branch: 'main', token: '', basePath: 'skills', repoUrl: '' });
  const [sshConfig, setSshConfig] = useState({ host: '', port: 22, username: '', password: '', privateKey: '', passphrase: '', basePath: '' });
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const showError = (message) => {
    setConfirm({
      message,
      onConfirm: () => setConfirm(null),
      type: 'error'
    });
  };

  const showSuccess = (message) => {
    setConfirm({
      message,
      onConfirm: () => setConfirm(null),
      type: 'success'
    });
  };

  const load = async () => {
    try {
      const res = await channelsApi.list();
      setChannels(res.data || []);
      setTypes(res.registeredTypes || []);
    } catch (err) {
      showError('加载失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div style={{ marginTop: 20, textAlign: 'center', color: '#999' }}>加载中...</div>;
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      let config;
      if (form.type === 'github') {
        config = gitHubConfig;
      } else if (form.type === 'ssh') {
        config = sshConfig;
      } else {
        config = JSON.parse(form.config);
      }
      await channelsApi.create({ name: form.name, type: form.type, config });
      setShowForm(false);
      setForm({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
      setGitHubConfig({ owner: '', repo: '', branch: 'main', token: '', basePath: 'skills', repoUrl: '' });
      setSshConfig({ host: '', port: 22, username: '', password: '', privateKey: '', passphrase: '', basePath: '' });
      load();
    } catch (err) {
      showError('创建失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = (ch) => {
    setEditingId(ch.id);
    setForm({
      name: ch.name,
      type: ch.type,
      config: JSON.stringify(ch.config, null, 2)
    });
    if (ch.type === 'github') {
      setGitHubConfig({
        owner: ch.config.owner || '',
        repo: ch.config.repo || '',
        branch: ch.config.branch || 'main',
        token: ch.config.token || '',
        basePath: ch.config.basePath ?? '',
        repoUrl: ch.config.repoUrl || ''
      });
    } else if (ch.type === 'ssh') {
      setSshConfig({
        host: ch.config.host || '',
        port: ch.config.port || 22,
        username: ch.config.username || '',
        password: ch.config.password || '',
        privateKey: ch.config.privateKey || '',
        passphrase: ch.config.passphrase || '',
        basePath: ch.config.basePath ?? ''
      });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      let config;
      if (form.type === 'github') {
        config = gitHubConfig;
      } else if (form.type === 'ssh') {
        config = sshConfig;
      } else {
        config = JSON.parse(form.config);
      }
      await channelsApi.update(editingId, {
        name: form.name,
        config
      });
      setEditingId(null);
      setForm({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
      setGitHubConfig({ owner: '', repo: '', branch: 'main', token: '', basePath: 'skills', repoUrl: '' });
      setSshConfig({ host: '', port: 22, username: '', password: '', privateKey: '', passphrase: '', basePath: '' });
      load();
    } catch (err) {
      showError('更新失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleTest = async (id) => {
    try {
      const res = await channelsApi.test(id);
      const ch = channels.find(c => c.id === id);
      const data = res.data || {};

      // 根据渠道类型显示不同的成功信息
      if (ch?.type === 'github') {
        showSuccess(`连接成功！仓库: ${data.repo || ch.config.owner + '/' + ch.config.repo}，分支: ${data.branch || ch.config.branch}`);
      } else if (ch?.type === 'ssh') {
        showSuccess(`连接成功！主机: ${data.host || ch.config.host}:${data.port || ch.config.port}，用户: ${data.username || ch.config.username}`);
      } else if (ch?.type === 'local') {
        showSuccess(`连接成功！输出目录: ${data.outputDir || ch.config.outputDir}`);
      } else {
        showSuccess('连接正常');
      }
    } catch (err) {
      showError('连接失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleTestSshConfig = async () => {
    setTesting(true);
    try {
      const res = await channelsApi.testConfig('ssh', sshConfig);
      const data = res.data || {};
      showSuccess(`连接成功！主机: ${data.host || sshConfig.host}:${data.port || sshConfig.port}`);
    } catch (err) {
      showError('连接失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async (ch) => {
    try {
      await channelsApi.update(ch.id, { enabled: !ch.enabled });
      load();
    } catch (err) {
      showError('操作失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSetDefault = async (ch) => {
    try {
      await channelsApi.update(ch.id, { isDefault: true });
      load();
    } catch (err) {
      showError('设置失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDelete = (ch) => {
    setConfirm({
      message: `确认删除渠道「${ch.name}」？`,
      onConfirm: async () => {
        try {
          await channelsApi.delete(ch.id);
          load();
        } catch (err) {
          showError('删除失败: ' + (err.response?.data?.error || err.message));
          return;
        }
        setConfirm(null);
      }
    });
  };

  const handleTypeChange = (type) => {
    setForm({
      ...form,
      type,
      config: DEFAULT_CONFIGS[type] || '{}'
    });
    if (type === 'github') {
      setGitHubConfig({ owner: '', repo: '', branch: 'main', token: '', basePath: 'skills', repoUrl: '' });
    } else if (type === 'ssh') {
      setSshConfig({ host: '', port: 22, username: '', password: '', privateKey: '', passphrase: '', basePath: '' });
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setForm({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
    setGitHubConfig({ owner: '', repo: '', branch: 'main', token: '', basePath: 'skills', repoUrl: '' });
    setSshConfig({ host: '', port: 22, username: '', password: '', privateKey: '', passphrase: '', basePath: '' });
  };

  const handleEditClose = () => {
    setEditingId(null);
    setForm({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
    setGitHubConfig({ owner: '', repo: '', branch: 'main', token: '', basePath: 'skills', repoUrl: '' });
    setSshConfig({ host: '', port: 22, username: '', password: '', privateKey: '', passphrase: '', basePath: '' });
  };

  // 过滤敏感配置字段用于显示
  const getDisplayConfig = (config, type) => {
    const sensitiveFields = ['token', 'password', 'secret', 'apiKey', 'api_key', 'privateKey', 'passphrase'];
    const display = { ...config };
    for (const field of sensitiveFields) {
      if (display[field]) {
        display[field] = '******';
      }
    }
    return display;
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div className="toolbar">
        <h2 style={{ fontSize: 18 }}>发布渠道管理</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ 添加渠道</button>
      </div>

      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        已注册渠道类型: {types.join(', ') || '无'}。新增渠道类型需在 server/channels/ 目录下实现并注册。
      </p>

      {channels.length === 0 ? (
        <div className="empty"><p>暂无渠道配置</p></div>
      ) : (
        channels.map(ch => (
          <div key={ch.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: 15 }}>
                {ch.name}
                {ch.isDefault && (
                  <span style={{
                    marginLeft: 8,
                    padding: '2px 8px',
                    background: '#e6f7ff',
                    color: '#1890ff',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 'normal'
                  }}>默认</span>
                )}
              </h3>
              <p style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                类型: {ch.type} · 状态: {ch.enabled ? '启用' : '禁用'}
              </p>
              <p style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(getDisplayConfig(ch.config, ch.type), null, 2)}</pre>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-default" onClick={() => handleTest(ch.id)}>测试连接</button>
              <button className="btn btn-default" onClick={() => handleToggle(ch)}>
                {ch.enabled ? '禁用' : '启用'}
              </button>
              {!!ch.enabled && !ch.isDefault && (
                <button className="btn btn-default" onClick={() => handleSetDefault(ch)}>设为默认</button>
              )}
              {!ch.enabled && (
                <button className="btn btn-default" onClick={() => handleEdit(ch)}>编辑</button>
              )}
              {channels.length > 1 && !ch.enabled && (
                <button className="btn btn-danger" onClick={() => handleDelete(ch)}>删除</button>
              )}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={(form.type === 'github' || form.type === 'ssh') ? { maxWidth: 600 } : {}}>
            <h2>添加发布渠道</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>渠道名称</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>渠道类型</label>
                <select value={form.type} onChange={e => handleTypeChange(e.target.value)}>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {form.type === 'github' ? (
                <GitHubConfigForm config={gitHubConfig} onChange={setGitHubConfig} />
              ) : form.type === 'ssh' ? (
                <SSHConfigForm config={sshConfig} onChange={setSshConfig} onTest={handleTestSshConfig} testing={testing} />
              ) : (
                <div className="form-group">
                  <label>配置 (JSON)</label>
                  <textarea value={form.config} onChange={e => setForm({ ...form, config: e.target.value })} rows={6} style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-default" onClick={handleFormClose}>取消</button>
                <button type="submit" className="btn btn-primary">创建</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingId && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={(form.type === 'github' || form.type === 'ssh') ? { maxWidth: 600 } : {}}>
            <h2>编辑发布渠道</h2>
            <form onSubmit={handleUpdate}>
              <div className="form-group">
                <label>渠道名称</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>渠道类型</label>
                <input value={form.type} disabled style={{ background: '#f5f5f5' }} />
              </div>
              {form.type === 'github' ? (
                <GitHubConfigForm config={gitHubConfig} onChange={setGitHubConfig} />
              ) : form.type === 'ssh' ? (
                <SSHConfigForm config={sshConfig} onChange={setSshConfig} onTest={handleTestSshConfig} testing={testing} />
              ) : (
                <div className="form-group">
                  <label>配置 (JSON)</label>
                  <textarea value={form.config} onChange={e => setForm({ ...form, config: e.target.value })} rows={6} style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-default" onClick={handleEditClose}>取消</button>
                <button type="submit" className="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          type={confirm.type}
        />
      )}
    </div>
  );
}
