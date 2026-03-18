import React, { useState, useEffect } from 'react';
import { channelsApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const DEFAULT_CONFIGS = {
  local: '{\n  "outputDir": "./published_skills"\n}',
  remote: '{\n  "url": "https://example.com/api/skills/publish",\n  "unpublishUrl": "https://example.com/api/skills/unpublish",\n  "healthCheckUrl": "https://example.com/api/health",\n  "headers": {},\n  "timeout": 60000\n}'
};

export default function Channels() {
  const [channels, setChannels] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
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
      onConfirm: () => setConfirm(null)
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
      await channelsApi.create({ ...form, config: JSON.parse(form.config) });
      setShowForm(false);
      setForm({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
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
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await channelsApi.update(editingId, {
        name: form.name,
        config: JSON.parse(form.config)
      });
      setEditingId(null);
      setForm({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
      load();
    } catch (err) {
      showError('更新失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleTest = async (id) => {
    try {
      const res = await channelsApi.test(id);
      showSuccess('连接正常: ' + JSON.stringify(res.data));
    } catch (err) {
      showError('连接失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleToggle = async (ch) => {
    try {
      await channelsApi.update(ch.id, { enabled: ch.enabled ? 0 : 1 });
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
  };

  const handleFormClose = () => {
    setShowForm(false);
    setForm({ name: '', type: 'local', config: DEFAULT_CONFIGS.local });
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
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(ch.config, null, 2)}</pre>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-default" onClick={() => handleTest(ch.id)}>测试连接</button>
              <button className="btn btn-default" onClick={() => handleToggle(ch)}>
                {ch.enabled ? '禁用' : '启用'}
              </button>
              {ch.enabled && !ch.isDefault && (
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
          <div className="modal" onClick={e => e.stopPropagation()}>
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
              <div className="form-group">
                <label>配置 (JSON)</label>
                <textarea value={form.config} onChange={e => setForm({ ...form, config: e.target.value })} rows={6} style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }} />
              </div>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
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
              <div className="form-group">
                <label>配置 (JSON)</label>
                <textarea value={form.config} onChange={e => setForm({ ...form, config: e.target.value })} rows={6} style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-default" onClick={() => setEditingId(null)}>取消</button>
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
