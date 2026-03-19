import React, { useEffect, useMemo, useState } from 'react';
import { channelsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import './Channels.css';

const DEFAULT_CONFIGS = {
  local: '{\n  "outputDir": "./published_skills"\n}',
  remote: '{\n  "url": "https://example.com/api/skills/publish",\n  "unpublishUrl": "https://example.com/api/skills/unpublish",\n  "healthCheckUrl": "https://example.com/api/health",\n  "headers": {},\n  "timeout": 60000\n}',
  github: '{\n  "owner": "",\n  "repo": "",\n  "branch": "main",\n  "token": "",\n  "basePath": "skills"\n}',
  ssh: '{\n  "host": "",\n  "port": 22,\n  "username": "",\n  "password": "",\n  "privateKey": "",\n  "passphrase": "",\n  "basePath": "skills"\n}'
};

const CHANNEL_TYPE_META = {
  local: {
    label: '本地目录',
    hint: '发布到当前服务器目录',
    className: 'channel-type-local'
  },
  github: {
    label: 'GitHub',
    hint: '同步到 GitHub 仓库',
    className: 'channel-type-github'
  },
  ssh: {
    label: 'SSH',
    hint: '发布到远端服务器目录',
    className: 'channel-type-ssh'
  },
  remote: {
    label: '远程 API',
    hint: '调用自定义发布接口',
    className: 'channel-type-remote'
  }
};

function createEmptyForm() {
  return {
    name: '',
    type: 'local',
    config: DEFAULT_CONFIGS.local
  };
}

function createEmptyGitHubConfig() {
  return {
    owner: '',
    repo: '',
    branch: 'main',
    token: '',
    basePath: 'skills',
    repoUrl: ''
  };
}

function createEmptySshConfig() {
  return {
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
    basePath: ''
  };
}

function getChannelTypeMeta(type) {
  return CHANNEL_TYPE_META[type] || {
    label: type || '未知类型',
    hint: '自定义渠道类型',
    className: 'channel-type-generic'
  };
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function maskSensitiveFields(config) {
  const sensitiveFields = ['token', 'password', 'secret', 'apiKey', 'api_key', 'privateKey', 'passphrase'];
  const display = { ...config };

  sensitiveFields.forEach((field) => {
    if (display[field]) {
      display[field] = '******';
    }
  });

  return display;
}

function compactConfigValue(value) {
  if (value === undefined || value === null || value === '') {
    return '未设置';
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length ? `${value.length} 项` : '未设置';
  }

  if (typeof value === 'object') {
    const count = Object.keys(value).length;
    return count ? `${count} 项配置` : '未设置';
  }

  return String(value);
}

function getChannelConfigItems(channel) {
  const config = channel.config || {};

  switch (channel.type) {
    case 'local':
      return [
        { label: '输出目录', value: compactConfigValue(config.outputDir) },
        { label: '发布方式', value: '服务器本地目录' }
      ];
    case 'github':
      return [
        { label: '仓库', value: config.repoUrl || [config.owner, config.repo].filter(Boolean).join('/') || '未设置' },
        { label: '分支', value: compactConfigValue(config.branch || 'main') },
        { label: '目录', value: compactConfigValue(config.basePath) },
        { label: 'Token', value: config.token ? '已配置' : '未设置' }
      ];
    case 'ssh':
      return [
        { label: '主机', value: config.host ? `${config.host}:${config.port || 22}` : '未设置' },
        { label: '用户', value: compactConfigValue(config.username) },
        { label: '目录', value: compactConfigValue(config.basePath) },
        { label: '认证', value: config.privateKey ? '私钥' : config.password ? '密码' : '未设置' }
      ];
    case 'remote':
      return [
        { label: '发布地址', value: compactConfigValue(config.url) },
        { label: '下架地址', value: compactConfigValue(config.unpublishUrl) },
        { label: '健康检查', value: compactConfigValue(config.healthCheckUrl) },
        { label: '超时', value: config.timeout ? `${config.timeout} ms` : '未设置' }
      ];
    default: {
      const masked = maskSensitiveFields(config);
      return Object.entries(masked)
        .slice(0, 4)
        .map(([label, value]) => ({ label, value: compactConfigValue(value) }));
    }
  }
}

function getChannelSummary(channel) {
  const config = channel.config || {};

  switch (channel.type) {
    case 'local':
      return config.outputDir || '未设置输出目录';
    case 'github':
      return config.repoUrl || [config.owner, config.repo].filter(Boolean).join('/') || '未设置仓库';
    case 'ssh':
      return config.host ? `${config.host}:${config.port || 22}` : '未设置 SSH 主机';
    case 'remote':
      return config.url || '未设置接口地址';
    default:
      return '查看配置详情';
  }
}

function ModalHeader({ title, description, tag }) {
  return (
    <div className="channels-modal-banner">
      <span className="channels-modal-tag">{tag}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function GitHubConfigForm({ config, onChange }) {
  const update = (field, value) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="channels-config-grid">
      <div className="form-group channels-config-span">
        <label>GitHub 仓库地址</label>
        <input
          placeholder="例如：https://github.com/owner/repo 或 owner/repo"
          value={config.repoUrl || ''}
          onChange={(event) => update('repoUrl', event.target.value)}
        />
        <span className="channels-field-hint">支持完整 URL 或 owner/repo 两种格式。</span>
      </div>

      <div className="form-group">
        <label>Owner</label>
        <input
          placeholder="用户名或组织名"
          value={config.owner || ''}
          onChange={(event) => update('owner', event.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Repository</label>
        <input
          placeholder="仓库名称"
          value={config.repo || ''}
          onChange={(event) => update('repo', event.target.value)}
        />
      </div>

      <div className="form-group">
        <label>分支</label>
        <input
          placeholder="main"
          value={config.branch || 'main'}
          onChange={(event) => update('branch', event.target.value)}
        />
      </div>

      <div className="form-group">
        <label>目标路径</label>
        <input
          placeholder="skills"
          value={config.basePath || ''}
          onChange={(event) => update('basePath', event.target.value)}
        />
      </div>

      <div className="form-group channels-config-span">
        <label>GitHub Token</label>
        <input
          type="password"
          placeholder="ghp_xxxx"
          value={config.token || ''}
          onChange={(event) => update('token', event.target.value)}
        />
        <span className="channels-field-hint">需要带有 repo 权限的 Personal Access Token。</span>
      </div>
    </div>
  );
}

function SSHConfigForm({ config, onChange, onTest, testing }) {
  const update = (field, value) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="channels-config-grid">
      <div className="form-group">
        <label>主机地址</label>
        <input
          placeholder="例如：192.168.1.100 或 example.com"
          value={config.host || ''}
          onChange={(event) => update('host', event.target.value)}
        />
      </div>

      <div className="form-group">
        <label>端口</label>
        <input
          type="number"
          placeholder="22"
          value={config.port || 22}
          onChange={(event) => update('port', parseInt(event.target.value, 10) || 22)}
        />
      </div>

      <div className="form-group">
        <label>用户名</label>
        <input
          placeholder="SSH 登录用户名"
          value={config.username || ''}
          onChange={(event) => update('username', event.target.value)}
        />
      </div>

      <div className="form-group">
        <label>目标路径</label>
        <input
          placeholder="例如：/home/user/skills"
          value={config.basePath || ''}
          onChange={(event) => update('basePath', event.target.value)}
        />
      </div>

      <div className="form-group">
        <label>密码认证</label>
        <input
          type="password"
          placeholder="SSH 密码，可留空"
          value={config.password || ''}
          onChange={(event) => update('password', event.target.value)}
        />
      </div>

      <div className="form-group">
        <label>私钥密码</label>
        <input
          type="password"
          placeholder="私钥密码短语（如有）"
          value={config.passphrase || ''}
          onChange={(event) => update('passphrase', event.target.value)}
        />
      </div>

      <div className="form-group channels-config-span">
        <label>私钥内容</label>
        <textarea
          placeholder="私钥"
          value={config.privateKey || ''}
          onChange={(event) => update('privateKey', event.target.value)}
          rows={4}
          className="channels-code-textarea"
        />
      </div>

      <div className="channels-inline-actions channels-config-span">
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
  const { user, isAdmin } = useAuth();
  const [channels, setChannels] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [gitHubConfig, setGitHubConfig] = useState(createEmptyGitHubConfig());
  const [sshConfig, setSshConfig] = useState(createEmptySshConfig());
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

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

  const resetCreateState = () => {
    setShowForm(false);
    // 普通用户默认选择非 local 类型
    // 优先使用 types 中的非 local 类型，否则使用硬编码的默认值
    const nonLocalType = types.find(t => t !== 'local') || 'github';
    const defaultType = isAdmin ? 'local' : nonLocalType;
    setForm({
      name: '',
      type: defaultType,
      config: DEFAULT_CONFIGS[defaultType] || '{}'
    });
    setGitHubConfig(createEmptyGitHubConfig());
    setSshConfig(createEmptySshConfig());
    setTesting(false);
  };

  const resetEditState = () => {
    setEditingId(null);
    setForm(createEmptyForm());
    setGitHubConfig(createEmptyGitHubConfig());
    setSshConfig(createEmptySshConfig());
    setTesting(false);
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

  useEffect(() => {
    load();
  }, []);

  const filteredChannels = useMemo(() => {
    const normalizedKeyword = normalizeText(keyword);

    return channels.filter((channel) => {
      // 显示启用的渠道，或者自己创建的渠道（无论启用状态）
      const isOwnChannel = channel.created_by === user?.id;
      if (!channel.enabled && !isOwnChannel && !isAdmin) return false;

      const matchesType = typeFilter === 'all' ? true : channel.type === typeFilter;
      const matchesKeyword = normalizedKeyword
        ? [channel.name, channel.type, getChannelSummary(channel)]
          .some((value) => normalizeText(value).includes(normalizedKeyword))
        : true;

      return matchesType && matchesKeyword;
    });
  }, [channels, keyword, typeFilter, user?.id, isAdmin]);

  // 判断是否可以操作渠道（管理员或自己创建的）
  const canManageChannel = (channel) => {
    return isAdmin || channel.created_by === user?.id;
  };

  const enabledCount = channels.filter((channel) => channel.enabled).length;
  const defaultCount = channels.filter((channel) => channel.isDefault).length;

  const handleCreate = async (event) => {
    event.preventDefault();

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
      resetCreateState();
      showSuccess('发布渠道已创建。');
      load();
    } catch (err) {
      showError('创建失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = (channel) => {
    setEditingId(channel.id);
    setForm({
      name: channel.name,
      type: channel.type,
      config: JSON.stringify(channel.config, null, 2)
    });

    if (channel.type === 'github') {
      setGitHubConfig({
        owner: channel.config.owner || '',
        repo: channel.config.repo || '',
        branch: channel.config.branch || 'main',
        token: channel.config.token || '',
        basePath: channel.config.basePath ?? '',
        repoUrl: channel.config.repoUrl || ''
      });
    } else if (channel.type === 'ssh') {
      setSshConfig({
        host: channel.config.host || '',
        port: channel.config.port || 22,
        username: channel.config.username || '',
        password: channel.config.password || '',
        privateKey: channel.config.privateKey || '',
        passphrase: channel.config.passphrase || '',
        basePath: channel.config.basePath ?? ''
      });
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();

    try {
      let config;

      if (form.type === 'github') {
        config = gitHubConfig;
      } else if (form.type === 'ssh') {
        config = sshConfig;
      } else {
        config = JSON.parse(form.config);
      }

      await channelsApi.update(editingId, { name: form.name, config });
      resetEditState();
      showSuccess('发布渠道已更新。');
      load();
    } catch (err) {
      showError('更新失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleTest = async (id) => {
    try {
      const res = await channelsApi.test(id);
      const channel = channels.find((item) => item.id === id);
      const data = res.data || {};

      if (channel?.type === 'github') {
        showSuccess(`连接成功，仓库 ${data.repo || `${channel.config.owner}/${channel.config.repo}`}，分支 ${data.branch || channel.config.branch}`);
      } else if (channel?.type === 'ssh') {
        showSuccess(`连接成功，主机 ${data.host || channel.config.host}:${data.port || channel.config.port}`);
      } else if (channel?.type === 'local') {
        showSuccess(`连接成功，输出目录 ${data.outputDir || channel.config.outputDir}`);
      } else {
        showSuccess('连接测试通过。');
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
      showSuccess(`连接成功，主机 ${data.host || sshConfig.host}:${data.port || sshConfig.port}`);
    } catch (err) {
      showError('连接失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async (channel) => {
    try {
      await channelsApi.update(channel.id, { enabled: !channel.enabled });
      showSuccess(channel.enabled ? '渠道已禁用。' : '渠道已启用。');
      load();
    } catch (err) {
      showError('操作失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSetDefault = async (channel) => {
    try {
      await channelsApi.update(channel.id, { isDefault: true });
      showSuccess(`已将“${channel.name}”设为默认渠道。`);
      load();
    } catch (err) {
      showError('设置失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDelete = (channel) => {
    setConfirm({
      message: `确认删除渠道“${channel.name}”？`,
      onConfirm: async () => {
        try {
          await channelsApi.delete(channel.id);
          setConfirm(null);
          showSuccess(`渠道“${channel.name}”已删除。`);
          load();
        } catch (err) {
          showError('删除失败: ' + (err.response?.data?.error || err.message));
        }
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
      setGitHubConfig(createEmptyGitHubConfig());
    } else if (type === 'ssh') {
      setSshConfig(createEmptySshConfig());
    }
  };

  if (loading) {
    return (
      <div className="channels-loading-state">
        <div className="channels-spinner" />
        <p>正在加载发布渠道...</p>
      </div>
    );
  }

  return (
    <div className="channels-page">
      <section className="channels-panel">
        <div className="channels-panel-top">
          <div>
            <h2>发布渠道</h2>
          </div>

          <div className="channels-filters">
            <div className="channels-filter-field channels-search-field">
              <label htmlFor="channel-search"></label>
              <input
                id="channel-search"
                type="text"
                placeholder="搜索渠道名称"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>

            <div className="channels-filter-field">
              <select
                id="channel-type-filter"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">全部类型</option>
                {[...new Set(channels.map((channel) => channel.type))].map((type) => (
                  <option key={type} value={type}>{getChannelTypeMeta(type).label}</option>
                ))}
              </select>
            </div>

            <button type="button" className="btn app-create-btn channels-create-btn" onClick={() => setShowForm(true)}>
              <span className="app-create-btn-icon channels-create-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" focusable="false">
                  <path d="M10 4.5v11" />
                  <path d="M4.5 10h11" />
                </svg>
              </span>
              <span>新建渠道</span>
            </button>
          </div>
        </div>

        {filteredChannels.length > 0 ? (
          <div className="channels-list-shell">
            <div className="channels-list-head">
              <span>渠道信息</span>
              <span>类型</span>
              <span>配置摘要</span>
              <span>状态</span>
              <span>操作</span>
            </div>

            <div className="channels-list">
              {filteredChannels.map((channel) => {
                const typeMeta = getChannelTypeMeta(channel.type);
                const canManage = canManageChannel(channel);
                // 普通用户查看非自己创建的渠道，配置摘要做脱敏处理
                const displayConfig = canManage
                  ? JSON.stringify(maskSensitiveFields(channel.config || {}), null, 2)
                  : '***';

                return (
                  <article className="channel-row" key={channel.id}>
                    <div className="channel-main-cell">
                      <div className="channel-avatar">{channel.name.slice(0, 1).toUpperCase()}</div>
                      <div className="channel-main-copy">
                        <div className="channel-name-line">
                          <strong>{channel.name}</strong>
                          {channel.isDefault ? <span className="channel-default-tag">默认</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="channel-type-cell" data-label="类型">
                      <span className={`channel-type-pill ${typeMeta.className}`}>{typeMeta.label}</span>
                      <span>{typeMeta.hint}</span>
                    </div>

                    <div className="channel-config-cell" data-label="配置摘要">
                      <pre>{displayConfig}</pre>
                    </div>

                    <div className="channel-status-cell" data-label="状态">
                      <span className={`channel-status-pill ${channel.enabled ? 'enabled' : 'disabled'}`}>
                        {channel.enabled ? '启用中' : '已禁用'}
                      </span>
                    </div>

                    <div className="channel-actions" data-label="操作">
                      {canManage ? (
                        <>
                          <button type="button" className="channel-action-btn" onClick={() => handleTest(channel.id)}>
                            测试连接
                          </button>
                          <button type="button" className="channel-action-btn" onClick={() => handleToggle(channel)}>
                            {channel.enabled ? '禁用' : '启用'}
                          </button>
                          {channel.enabled && !channel.isDefault ? (
                            <button type="button" className="channel-action-btn" onClick={() => handleSetDefault(channel)}>
                              设为默认
                            </button>
                          ) : null}
                          {!channel.enabled ? (
                            <>
                              <button type="button" className="channel-action-btn" onClick={() => handleEdit(channel)}>
                                编辑
                              </button>
                              {channels.length > 1 ? (
                                <button type="button" className="channel-action-btn danger" onClick={() => handleDelete(channel)}>
                                  删除
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="channels-empty-state">
            <div className="channels-empty-illustration">C</div>
            <h4>暂无匹配的发布渠道</h4>
            <p>可以调整筛选条件，或者直接新建一个渠道配置。</p>
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
              + 新建渠道
            </button>
          </div>
        )}
      </section>

      {showForm ? (
        <div className="modal-overlay" onClick={resetCreateState}>
          <div className="modal channels-modal" onClick={(event) => event.stopPropagation()}>
            <ModalHeader
              tag="创建模式"
              title="新建发布渠道"
            />

            <form className="channels-form" onSubmit={handleCreate}>
              <div className="channels-config-grid">
                <div className="form-group">
                  <label>渠道名称</label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                    placeholder="例如：本地默认发布"
                  />
                </div>

                <div className="form-group">
                  <label>渠道类型</label>
                    <select
                      value={form.type}
                      onChange={(event) => handleTypeChange(event.target.value)}
                    >
                      {types.filter((type) => isAdmin || type !== 'local').map((type) => (
                        <option key={type} value={type}>{getChannelTypeMeta(type).label}</option>
                      ))}
                    </select>
                </div>
              </div>

              {form.type === 'github' ? (
                <GitHubConfigForm config={gitHubConfig} onChange={setGitHubConfig} />
              ) : form.type === 'ssh' ? (
                <SSHConfigForm
                  config={sshConfig}
                  onChange={setSshConfig}
                  onTest={handleTestSshConfig}
                  testing={testing}
                />
              ) : (
                <div className="form-group">
                  <label>配置 JSON</label>
                  <textarea
                    value={form.config}
                    onChange={(event) => setForm({ ...form, config: event.target.value })}
                    rows={8}
                    className="channels-code-textarea"
                  />
                </div>
              )}

              <div className="channels-modal-actions">
                <button type="button" className="btn btn-default" onClick={resetCreateState}>取消</button>
                <button type="submit" className="btn btn-primary">创建渠道</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingId ? (
        <div className="modal-overlay" onClick={resetEditState}>
          <div className="modal channels-modal" onClick={(event) => event.stopPropagation()}>
            <ModalHeader
              tag="编辑模式"
              title="编辑发布渠道"
              description="更新渠道名称和配置。已启用渠道需先禁用后再编辑，避免影响正在运行的发布流程。"
            />

            <form className="channels-form" onSubmit={handleUpdate}>
              <div className="channels-config-grid">
                <div className="form-group">
                  <label>渠道名称</label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>渠道类型</label>
                  <input value={form.type} disabled className="channels-disabled-input" />
                </div>
              </div>

              {form.type === 'github' ? (
                <GitHubConfigForm config={gitHubConfig} onChange={setGitHubConfig} />
              ) : form.type === 'ssh' ? (
                <SSHConfigForm
                  config={sshConfig}
                  onChange={setSshConfig}
                  onTest={handleTestSshConfig}
                  testing={testing}
                />
              ) : (
                <div className="form-group">
                  <label>配置 JSON</label>
                  <textarea
                    value={form.config}
                    onChange={(event) => setForm({ ...form, config: event.target.value })}
                    rows={8}
                    className="channels-code-textarea"
                  />
                </div>
              )}

              <div className="channels-modal-actions">
                <button type="button" className="btn btn-default" onClick={resetEditState}>取消</button>
                <button type="submit" className="btn btn-primary">保存修改</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          type={confirm.type}
        />
      ) : null}
    </div>
  );
}
