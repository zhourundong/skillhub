import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { skillsApi, channelsApi } from '../api';
import SkillForm from '../components/SkillForm';
import AssetManager from '../components/AssetManager';
import TextFileManager from '../components/TextFileManager';
import ConfirmDialog from '../components/ConfirmDialog';
import SkillPreview from '../components/SkillPreview';
import CustomDirManager from '../components/CustomDirManager';

const STATUS_MAP = { draft: '草稿', published: '已发布', unpublished: '已下架' };

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function SkillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [skill, setSkill] = useState(null);
  const [records, setRecords] = useState([]);
  const [channels, setChannels] = useState([]);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editingForm, setEditingForm] = useState(null);

  const load = async () => {
    const [s, r, c] = await Promise.all([
      skillsApi.get(id),
      skillsApi.records(id),
      channelsApi.list(),
    ]);
    setSkill(s.data);
    setRecords(r.data);
    setChannels(c.data);
    // 默认选中默认渠道
    const defaultChannel = c.data.find(ch => ch.isDefault && ch.enabled);
    if (defaultChannel) {
      setSelectedChannel(defaultChannel.id);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (!skill) return <div className="empty"><p>加载中...</p></div>;

  const isReadonly = skill.status === 'published';

  const handleUpdate = async (data) => {
    try {
      await skillsApi.update(id, data);
      setEditing(false);
      load();
    } catch (err) {
      setConfirm({
        message: err.response?.data?.error || err.message || '更新失败',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await skillsApi.publish(id, selectedChannel || undefined);
      load();
      setConfirm({
        message: '发布成功！',
        onConfirm: () => setConfirm(null),
        type: 'success'
      });
    } catch (err) {
      setConfirm({
        message: '发布失败: ' + (err.response?.data?.error || err.message),
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = () => {
    setConfirm({
      message: '确认下架此 Skill？',
      onConfirm: async () => {
        setConfirm(null);
        setUnpublishing(true);
        try {
          await skillsApi.unpublish(id);
          load();
          setConfirm({
            message: '下架成功！',
            onConfirm: () => setConfirm(null),
            type: 'success'
          });
        } catch (err) {
          setConfirm({
            message: '下架失败: ' + (err.response?.data?.error || err.message),
            onConfirm: () => setConfirm(null),
            type: 'error'
          });
        }
        setUnpublishing(false);
      }
    });
  };

  const handleDelete = () => {
    setConfirm({
      message: '确认删除此 Skill？此操作不可恢复。',
      onConfirm: async () => {
        await skillsApi.delete(id);
        navigate('/');
      }
    });
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn btn-default" onClick={() => navigate('/')}>← 返回列表</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={`/api/skills/${id}/download`}
            className="btn btn-default"
            style={{ textDecoration: 'none' }}
          >
            下载
          </a>
          <button className="btn btn-default" onClick={() => setShowPreview(true)}>预览 SKILL.md</button>
        </div>
      </div>

      {editing ? (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>编辑 Skill</h2>
          <SkillForm skill={skill} onSubmit={handleUpdate} onCancel={() => setEditing(false)} onChange={setEditingForm} />
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 20 }}>{skill.name}</h2>
              <p style={{ color: '#666', marginTop: 4 }}>
                v{skill.version}
                {skill.category && (
                  <span style={{
                    display: 'inline-block',
                    marginLeft: 8,
                    padding: '2px 8px',
                    background: '#e8f4ff',
                    color: '#1890ff',
                    borderRadius: 4,
                    fontSize: 12
                  }}>
                    {skill.category}
                  </span>
                )}
              </p>
            </div>
            <span className={`status-badge status-${skill.status}`}>{STATUS_MAP[skill.status] || skill.status}</span>
          </div>

          <p style={{ lineHeight: 1.6, marginBottom: 16 }}>{skill.description || '暂无描述'}</p>

          {skill.skill_content && (
            <div style={{ background: '#f8f9fa', borderRadius: 6, padding: 16, marginBottom: 16, maxHeight: 400, overflow: 'auto' }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, margin: 0 }}>{skill.skill_content}</pre>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!isReadonly && (
              <button className="btn btn-default" onClick={() => setEditing(true)}>编辑</button>
            )}
            {!isReadonly && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={selectedChannel}
                  onChange={e => setSelectedChannel(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 14 }}
                >
                  {channels.filter(c => c.enabled).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.isDefault ? '(默认)' : ''}
                    </option>
                  ))}
                </select>
                <button className="btn btn-success" onClick={handlePublish} disabled={publishing}>
                  {publishing ? '发布中...' : '发布'}
                </button>
              </div>
            )}
            {isReadonly && (
              <button className="btn btn-danger" onClick={handleUnpublish} disabled={unpublishing}>
                {unpublishing ? '下架中...' : '下架'}
              </button>
            )}
            {!isReadonly && (
              <button className="btn btn-danger" onClick={handleDelete}>删除</button>
            )}
          </div>
        </div>
      )}

      {/* Scripts, References, Assets */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 16 }}>脚本 (scripts/)</h3>
        <TextFileManager skillId={id} subdir="scripts" label="脚本" readonly={isReadonly} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 16 }}>参考资料 (references/)</h3>
        <TextFileManager skillId={id} subdir="references" label="参考资料" readonly={isReadonly} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 16 }}>静态资源 (assets/)</h3>
        <AssetManager skillId={id} readonly={isReadonly} />
      </div>

      {/* Custom Directories */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 16 }}>自定义目录</h3>
        <CustomDirManager skillId={id} readonly={isReadonly} />
      </div>

      {records.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>发布记录</h3>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: '8px 0' }}>渠道</th>
                <th>类型</th>
                <th>状态</th>
                <th>发布时间</th>
                <th>下架时间</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0' }}>{r.channel_name}</td>
                  <td>{r.channel_type}</td>
                  <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                  <td>{formatDateTime(r.published_at)}</td>
                  <td>{formatDateTime(r.unpublished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Loading Overlay */}
      {(publishing || unpublishing) && (
        <div className="modal-overlay">
          <div style={{
            background: '#fff',
            padding: '24px 32px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div className="spinner" style={{
              width: 20,
              height: 20,
              border: '2px solid #e8e8e8',
              borderTopColor: '#1890ff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <span>{publishing ? '正在发布...' : '正在下架...'}</span>
          </div>
        </div>
      )}

      {showPreview && (
        <SkillPreview
          skillId={id}
          onClose={() => setShowPreview(false)}
          initialContent={editing && editingForm ? `---
name: ${editingForm.name || ''}
description: ${editingForm.description || ''}
---
${editingForm.skill_content || ''}` : undefined}
        />
      )}
    </div>
  );
}
