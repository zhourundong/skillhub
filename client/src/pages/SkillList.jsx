import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { skillsApi } from '../api';
import SkillForm from '../components/SkillForm';
import AiGenerator from '../components/AiGenerator';

const STATUS_MAP = { draft: '草稿', published: '已发布', unpublished: '已下架' };

function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SkillList() {
  const [skills, setSkills] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const params = {};
    if (keyword) params.keyword = keyword;
    if (statusFilter) params.status = statusFilter;
    const res = await skillsApi.list(params);
    setSkills(res.data);
  }, [keyword, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    await skillsApi.create(data);
    setShowForm(false);
    load();
  };

  const handleAiCreate = async (data) => {
    await skillsApi.create(data);
    setShowAi(false);
    load();
  };

  return (
    <>
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            className="search-input"
            placeholder="搜索 Skill 名称或描述..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 14 }}
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="unpublished">已下架</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-default" onClick={() => setShowAi(true)}>AI 生成</button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ 创建 Skill</button>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="empty">
          <p>暂无 Skill</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-default" onClick={() => setShowAi(true)}>AI 生成</button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>创建第一个 Skill</button>
          </div>
        </div>
      ) : (
        <div className="skill-grid">
          {skills.map(s => (
            <div key={s.id} className="skill-card" onClick={() => navigate(`/skills/${s.id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 title={s.name}>{s.name}</h3>
                <span className={`status-badge status-${s.status}`}>{STATUS_MAP[s.status] || s.status}</span>
              </div>
              <p title={s.description || '暂无描述'}>{s.description || '暂无描述'}</p>
              <div className="meta">
                {s.category && (
                  <span style={{
                    padding: '2px 6px',
                    background: '#e8f4ff',
                    color: '#1890ff',
                    borderRadius: 4,
                    fontSize: 12
                  }}>{s.category}</span>
                )}
                <span style={{ marginLeft: 15 }}>v{s.version}</span>
                <span style={{ marginLeft: 'auto' }}>{formatDate(s.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>创建 Skill</h2>
            <SkillForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {showAi && (
        <div className="modal-overlay" onClick={() => setShowAi(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <h2>AI 生成 Skill</h2>
            <AiGenerator onComplete={handleAiCreate} onCancel={() => setShowAi(false)} />
          </div>
        </div>
      )}
    </>
  );
}
