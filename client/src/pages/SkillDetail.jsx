import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { skillsApi, channelsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import SkillForm from '../components/SkillForm';
import AssetManager from '../components/AssetManager';
import TextFileManager from '../components/TextFileManager';
import ConfirmDialog from '../components/ConfirmDialog';
import SkillPreview from '../components/SkillPreview';
import CustomDirManager from '../components/CustomDirManager';
import './SkillDetail.css';

const STATUS_MAP = {
  draft: '草稿',
  published: '已发布',
  unpublished: '已下架'
};

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function SkillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isOwner, isAuthenticated } = useAuth();
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
    try {
      const s = await skillsApi.get(id);
      setSkill(s.data);

      try {
        const r = await skillsApi.records(id);
        setRecords(r.data);
      } catch (err) {
        console.log('Could not load records:', err.message);
      }

      if (isAdmin) {
        try {
          const c = await channelsApi.list();
          setChannels(c.data);
          const defaultChannel = c.data.find((ch) => ch.isDefault && ch.enabled);
          if (defaultChannel) {
            setSelectedChannel(defaultChannel.id);
          }
        } catch (err) {
          console.log('Could not load channels:', err.message);
        }
      }
    } catch (err) {
      console.error('Failed to load skill:', err.message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (!skill) {
    return <div className="empty"><p>加载中...</p></div>;
  }

  const canEdit = isAuthenticated && (isOwner(skill.created_by) || isAdmin) && skill.status !== 'published';
  const canDelete = isAuthenticated && (isOwner(skill.created_by) || isAdmin) && skill.status !== 'published';
  const canPublish = isAdmin;
  const isReadonly = !canEdit;
  const isAnonymousReadonly = !isAuthenticated;

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
        message: '发布成功',
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
      message: '确认下架这个 Skill 吗？',
      onConfirm: async () => {
        setConfirm(null);
        setUnpublishing(true);
        try {
          await skillsApi.unpublish(id);
          load();
          setConfirm({
            message: '下架成功',
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
      message: '确认删除这个 Skill 吗？此操作不可恢复。',
      onConfirm: async () => {
        await skillsApi.delete(id);
        navigate('/');
      }
    });
  };

  return (
    <div className="skill-detail-page">
      <div className="skill-detail-toolbar">
        <button className="btn btn-default" onClick={() => navigate('/')}>返回列表</button>
        <div className="skill-detail-toolbar-actions">
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
        <div className="card skill-detail-edit-card skill-detail-edit-mode">
          <h2 style={{ marginBottom: 24, fontSize: 20 }}>编辑 Skill</h2>
          <SkillForm skill={skill} onSubmit={handleUpdate} onCancel={() => setEditing(false)} onChange={setEditingForm} />
        </div>
      ) : (
        <div className="card skill-overview-card">
          <div className="skill-overview-layout">
            <section className="skill-overview-main">
              <div className="skill-overview-header">
                <div>
                  <h2 className="skill-overview-title">{skill.name}</h2>
                  <p className="skill-overview-meta">
                    v{skill.version}
                    {skill.category ? (
                      <span className="skill-category-chip">{skill.category}</span>
                    ) : null}
                  </p>
                </div>
                <span className={`status-badge status-${skill.status}`}>{STATUS_MAP[skill.status] || skill.status}</span>
              </div>

              <div className="skill-description-block">
                <h4>描述</h4>
                <p>{skill.description || '暂无描述'}</p>
              </div>

              <div className="skill-content-block">
                <h4>SKILL 内容</h4>
                <pre className="skill-content-pre">
                  {skill.skill_content || <span className="skill-content-empty">暂无内容</span>}
                </pre>
              </div>
            </section>

            <aside className="skill-overview-side">
              <div className="skill-side-card">
                <h4>操作</h4>
                <div className="skill-action-stack">
                  {!isReadonly ? (
                    <button className="btn btn-default" onClick={() => setEditing(true)}>编辑</button>
                  ) : null}

                  {!isReadonly ? (
                    <div className="skill-publish-row">
                      <select
                        value={selectedChannel}
                        onChange={(e) => setSelectedChannel(e.target.value)}
                      >
                        {channels.filter((c) => c.enabled).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.isDefault ? '（默认）' : ''}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-success" onClick={handlePublish} disabled={publishing}>
                        {publishing ? '发布中...' : '发布'}
                      </button>
                    </div>
                  ) : null}

                  {canPublish && skill.status === 'published' ? (
                    <button className="btn btn-danger" onClick={handleUnpublish} disabled={unpublishing}>
                      {unpublishing ? '下架中...' : '下架'}
                    </button>
                  ) : null}

                  {canDelete ? (
                    <button className="btn btn-danger" onClick={handleDelete}>删除</button>
                  ) : null}
                </div>
              </div>

              <div className="skill-side-card skill-side-meta">
                <h4>信息</h4>
                <div className="skill-meta-list">
                  <div>
                    <span>状态</span>
                    <strong>{STATUS_MAP[skill.status] || skill.status}</strong>
                  </div>
                  <div>
                    <span>版本</span>
                    <strong>v{skill.version}</strong>
                  </div>
                  <div>
                    <span>分类</span>
                    <strong>{skill.category || '-'}</strong>
                  </div>
                  <div>
                    <span>更新时间</span>
                    <strong>{formatDateTime(skill.updated_at)}</strong>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      <div className="card skill-detail-section">
        <h3 style={{ marginBottom: 16, fontSize: 18 }}>脚本 (scripts/)</h3>
        <TextFileManager skillId={id} subdir="scripts" label="脚本" readonly={isReadonly || isAnonymousReadonly} />
      </div>

      <div className="card skill-detail-section">
        <h3 style={{ marginBottom: 16, fontSize: 18 }}>参考资料 (references/)</h3>
        <TextFileManager skillId={id} subdir="references" label="参考资料" readonly={isReadonly || isAnonymousReadonly} />
      </div>

      <div className="card skill-detail-section">
        <h3 style={{ marginBottom: 16, fontSize: 18 }}>静态资源 (assets/)</h3>
        <AssetManager skillId={id} readonly={isReadonly || isAnonymousReadonly} />
      </div>

      <div className="card skill-detail-section">
        <h3 style={{ marginBottom: 16, fontSize: 18 }}>自定义目录</h3>
        <CustomDirManager skillId={id} readonly={isReadonly || isAnonymousReadonly} />
      </div>

      {records.length > 0 ? (
        <div className="card skill-detail-section">
          <h3 style={{ marginBottom: 16, fontSize: 18 }}>发布记录</h3>
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
              {records.map((r) => (
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
      ) : null}

      {confirm ? (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          type={confirm.type}
        />
      ) : null}

      {(publishing || unpublishing) ? (
        <div className="modal-overlay">
          <div className="skill-loading-box">
            <div
              className="spinner"
              style={{
                width: 20,
                height: 20,
                border: '2px solid #e8e8e8',
                borderTopColor: '#1890ff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}
            />
            <span>{publishing ? '正在发布...' : '正在下架...'}</span>
          </div>
        </div>
      ) : null}

      {showPreview ? (
        <SkillPreview
          skillId={id}
          onClose={() => setShowPreview(false)}
          initialContent={editing && editingForm ? `---
name: ${editingForm.name || ''}
description: ${editingForm.description || ''}
---
${editingForm.skill_content || ''}` : undefined}
        />
      ) : null}
    </div>
  );
}
