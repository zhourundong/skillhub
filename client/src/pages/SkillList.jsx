import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { skillsApi } from '../api';
import SkillForm from '../components/SkillForm';
import AiGenerator from '../components/AiGenerator';
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_MAP = { draft: '草稿', published: '已发布', unpublished: '已下架' };
const PAGE_SIZE_OPTIONS = [10, 50, 100];

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
  const [confirm, setConfirm] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const params = { page: pagination.page, pageSize: pagination.pageSize };
    if (keyword) params.keyword = keyword;
    if (statusFilter) params.status = statusFilter;
    const res = await skillsApi.list(params);
    setSkills(res.data);
    setPagination(prev => ({ ...prev, ...res.pagination }));
  }, [keyword, statusFilter, pagination.page, pagination.pageSize]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    try {
      await skillsApi.create(data);
      setShowForm(false);
      load();
    } catch (err) {
      setConfirm({
        message: err.response?.data?.error || err.message || '创建失败',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handleAiCreate = async (data) => {
    try {
      await skillsApi.create(data);
      setShowAi(false);
      load();
    } catch (err) {
      setConfirm({
        message: err.response?.data?.error || err.message || '创建失败',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handleImportZip = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setConfirm({ message: '只支持 .zip 文件', onConfirm: () => setConfirm(null), type: 'error' });
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setConfirm({ message: 'ZIP 文件大小不能超过 10MB', onConfirm: () => setConfirm(null), type: 'error' });
      e.target.value = '';
      return;
    }

    try {
      const res = await skillsApi.importZip(file);
      setConfirm({
        message: `导入成功！\n\n技能名称: ${res.data.skill.name}\n导入文件数: ${res.data.totalFiles}`,
        onConfirm: () => setConfirm(null),
        type: 'success'
      });
      load();
    } catch (err) {
      setConfirm({
        message: err.response?.data?.error || err.message || '导入失败',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
    e.target.value = '';
  };

  const handlePageSizeChange = (newSize) => {
    setPagination(prev => ({ ...prev, page: 1, pageSize: newSize }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const renderPagination = () => {
    const { page, pageSize, total, totalPages } = pagination;
    if (total === 0) return null;

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return (
      <div className="container" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#999', fontSize: 13 }}>共 {total} 条</span>
          <select
            value={pageSize}
            onChange={e => handlePageSizeChange(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13 }}
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size} 条/页</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn btn-default"
              style={{ padding: '4px 8px', fontSize: 13, minWidth: 28 }}
              disabled={page === 1}
              onClick={() => handlePageChange(page - 1)}
            >
              ‹
            </button>
            {pages.map(p => (
              <button
                key={p}
                className="btn"
                style={{
                  padding: '4px 8px',
                  fontSize: 13,
                  minWidth: 28,
                  background: p === page ? '#1890ff' : '#fff',
                  color: p === page ? '#fff' : '#666',
                  borderColor: p === page ? '#1890ff' : '#e8e8e8'
                }}
                onClick={() => handlePageChange(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="btn btn-default"
              style={{ padding: '4px 8px', fontSize: 13, minWidth: 28 }}
              disabled={page === totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="toolbar-wrapper">
        <div className="container">
          <div className="toolbar">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                className="search-input"
                placeholder="搜索 Skill 名称或描述..."
                value={keyword}
                onChange={e => { setKeyword(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
              />
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 14 }}
              >
                <option value="">全部状态</option>
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="unpublished">已下架</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label className="btn" style={{ cursor: 'pointer', background: '#722ed1', color: '#fff', borderColor: '#722ed1' }}>
                📦 导入 ZIP
                <input type="file" accept=".zip" onChange={handleImportZip} style={{ display: 'none' }} />
              </label>
              <button className="btn" style={{ background: '#13c2c2', color: '#fff', borderColor: '#13c2c2' }} onClick={() => setShowAi(true)}>✨ AI 生成</button>
              <button className="btn" style={{ background: '#1890ff', color: '#fff', borderColor: '#1890ff' }} onClick={() => setShowForm(true)}>✏️ 创建 Skill</button>
            </div>
          </div>
        </div>
      </div>

      {pagination.total === 0 ? (
        <div className="empty">
          <p>暂无 Skill</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="btn" style={{ cursor: 'pointer', background: '#722ed1', color: '#fff', borderColor: '#722ed1' }}>
              📦 导入 ZIP
              <input type="file" accept=".zip" onChange={handleImportZip} style={{ display: 'none' }} />
            </label>
            <button className="btn" style={{ background: '#13c2c2', color: '#fff', borderColor: '#13c2c2' }} onClick={() => setShowAi(true)}>✨ AI 生成</button>
            <button className="btn" style={{ background: '#1890ff', color: '#fff', borderColor: '#1890ff' }} onClick={() => setShowForm(true)}>✏️ 创建第一个 Skill</button>
          </div>
        </div>
      ) : (
        <>
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
          {renderPagination()}
        </>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>创建 Skill</h2>
            <SkillForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {showAi && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '90%' }}>
            <h2>AI 生成 Skill</h2>
            <AiGenerator onComplete={handleAiCreate} onCancel={() => setShowAi(false)} />
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          type={confirm.type}
        />
      )}
    </>
  );
}
