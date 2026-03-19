import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { skillsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import SkillForm from '../components/SkillForm';
import AiGenerator from '../components/AiGenerator';
import './SkillList.css';

const STATUS_MAP = {
  draft: '草稿',
  published: '已发布',
  unpublished: '已下架'
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

function formatDate(value) {
  if (!value) return '未更新';

  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return '未更新';
  }
}

function getPaginationState(pagination) {
  return {
    page: pagination?.page || 1,
    pageSize: pagination?.pageSize || 15,
    total: pagination?.total || 0,
    totalPages: pagination?.totalPages || 0
  };
}

export default function SkillList() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [skills, setSkills] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 15,
    total: 0,
    totalPages: 0
  });

  const loadSkills = useCallback(async () => {
    // Wait for auth to finish loading before making API calls
    if (authLoading) return;

    try {
      setLoading(true);

      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize
      };

      const trimmedKeyword = keyword.trim();
      if (trimmedKeyword) {
        params.keyword = trimmedKeyword;
      }

      if (!isAuthenticated) {
        params.status = 'published';
      } else if (statusFilter) {
        params.status = statusFilter;
      }

      const response = await skillsApi.list(params);
      setSkills(Array.isArray(response.data) ? response.data : []);
      setPagination((prev) => ({
        ...prev,
        ...getPaginationState(response.pagination)
      }));
    } catch (err) {
      setSkills([]);
      setNotice({
        type: 'error',
        message: err.response?.data?.error || '加载技能列表失败，请稍后重试。'
      });
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, keyword, pagination.page, pagination.pageSize, statusFilter]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  async function handleCreate(data) {
    try {
      await skillsApi.create(data);
      setShowForm(false);
      setNotice({
        type: 'success',
        message: '技能创建成功。'
      });
      setPagination((prev) => ({ ...prev, page: 1 }));
      await loadSkills();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.response?.data?.error || '创建技能失败，请检查后重试。'
      });
    }
  }

  async function handleAiCreate(data) {
    try {
      await skillsApi.create(data);
      setShowAi(false);
      setNotice({
        type: 'success',
        message: 'AI 生成的技能已创建。'
      });
      setPagination((prev) => ({ ...prev, page: 1 }));
      await loadSkills();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.response?.data?.error || 'AI 创建技能失败，请稍后重试。'
      });
    }
  }

  async function handleImportZip(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setNotice({
        type: 'error',
        message: '只支持导入 .zip 文件。'
      });
      event.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setNotice({
        type: 'error',
        message: 'ZIP 文件不能超过 10MB。'
      });
      event.target.value = '';
      return;
    }

    try {
      const response = await skillsApi.importZip(file);
      const importedSkillName = response.data?.skill?.name || '未命名技能';
      const totalFiles = response.data?.totalFiles || 0;
      setNotice({
        type: 'success',
        message: `导入成功：${importedSkillName}，共导入 ${totalFiles} 个文件。`
      });
      setPagination((prev) => ({ ...prev, page: 1 }));
      await loadSkills();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.response?.data?.error || '导入 ZIP 失败，请稍后重试。'
      });
    } finally {
      event.target.value = '';
    }
  }

  async function handleShare(skill, event) {
    event.stopPropagation();

    const shareUrl = new URL(`/api/skills/${skill.id}/download`, window.location.origin).toString();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }

      setNotice({
        type: 'success',
        message: `已复制 ${skill.name} 的分享链接`
      });
    } catch {
      setNotice({
        type: 'error',
        message: '复制分享链接失败，请稍后重试'
      });
    }
  }

  function handleKeywordChange(event) {
    setKeyword(event.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  function handleStatusChange(event) {
    setStatusFilter(event.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  function handlePageChange(page) {
    setPagination((prev) => ({ ...prev, page }));
  }

  function renderPagination() {
    if (pagination.total <= 0 || pagination.totalPages <= 1) {
      return null;
    }

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
    const end = Math.min(pagination.totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return (
      <div className="skill-list-pagination">
        <span>共 {pagination.total} 条技能</span>

        <div className="skill-list-pagination-buttons">
          <button
            type="button"
            className="btn btn-default"
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            上一页
          </button>

          {pages.map((page) => (
            <button
              key={page}
              type="button"
              className={`btn ${page === pagination.page ? 'btn-primary' : 'btn-default'}`}
              onClick={() => handlePageChange(page)}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            className="btn btn-default"
            disabled={pagination.page === pagination.totalPages}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    );
  }

  const publishedCount = skills.filter((skill) => skill.status === 'published').length;

  return (
    <div className="skill-list-page">
      {notice ? (
        <div className={`skill-list-notice skill-list-notice-${notice.type}`}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)}>
            关闭
          </button>
        </div>
      ) : null}

      <section className="skill-list-panel">
        <div className="skill-list-panel-top">
          <div>
            <h2>技能列表</h2>
          </div>

          <div className="skill-list-filters">
            <div className="skill-list-filter-field skill-list-search-field">
              <input
                id="skill-search"
                className="search-input"
                placeholder="搜索技能名称或描述"
                value={keyword}
                onChange={handleKeywordChange}
              />
            </div>

            {isAuthenticated ? (
              <div className="skill-list-filter-field">
                <label htmlFor="skill-status-filter"></label>
                <select
                  id="skill-status-filter"
                  value={statusFilter}
                  onChange={handleStatusChange}
                >
                  <option value="">全部状态</option>
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="unpublished">已下架</option>
                </select>
              </div>
            ) : null}

            {isAuthenticated ? (
              <div className="skill-list-actions">
                <label className="btn skill-list-import-btn">
                  <span className="skill-list-import-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" focusable="false">
                      <path d="M10 2.5v8" />
                      <path d="M6.75 7.5 10 10.75 13.25 7.5" />
                      <path d="M4 13.5h12" />
                    </svg>
                  </span>
                  <span>导入 ZIP</span>
                  <input type="file" accept=".zip" onChange={handleImportZip} hidden />
                </label>
                <button type="button" className="btn skill-list-ai-btn" onClick={() => setShowAi(true)}>
                  <span className="skill-list-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" focusable="false">
                      <path d="M10 3.5 11.6 7.4 15.5 9 11.6 10.6 10 14.5 8.4 10.6 4.5 9 8.4 7.4 10 3.5Z" />
                    </svg>
                  </span>
                  <span>AI 生成</span>
                </button>
                <button type="button" className="btn app-create-btn skill-list-create-btn" onClick={() => setShowForm(true)}>
                  <span className="app-create-btn-icon skill-list-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" focusable="false">
                      <path d="M10 4.5v11" />
                      <path d="M4.5 10h11" />
                    </svg>
                  </span>
                  <span>新建技能</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="skill-list-meta-strip">
        </div>

        {loading ? (
          <div className="skill-list-state skill-list-loading-state">
            <div className="skill-list-spinner" />
            <p>正在加载技能列表...</p>
          </div>
        ) : pagination.total === 0 ? (
          <div className="skill-list-empty-state">
            <div className="skill-list-empty-illustration">S</div>
            <h4>{isAuthenticated ? '还没有技能' : '暂无可浏览的技能'}</h4>
            <p>
              {isAuthenticated
                ? '可以先导入 ZIP，或者直接创建一个新的技能。'
                : '当前没有已发布技能，稍后再来看看。'}
            </p>
            {isAuthenticated ? (
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                + 新建技能
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="skill-grid skill-list-grid">
              {skills.map((skill) => (
                <article
                  key={skill.id}
                  className="skill-card skill-list-card"
                  onClick={() => navigate(`/skills/${skill.id}`)}
                >
                  {skill.status === 'published' ? (
                    <button
                      type="button"
                      className="skill-list-share-icon-btn"
                      onClick={(event) => handleShare(skill, event)}
                      aria-label={`分享 ${skill.name}`}
                      title="分享"
                    >
                      <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                        <path d="M12.5 4.5h3v3" />
                        <path d="M8 12 15.5 4.5" />
                        <path d="M15 11.5v2.25A1.25 1.25 0 0 1 13.75 15H6.25A1.25 1.25 0 0 1 5 13.75V6.25A1.25 1.25 0 0 1 6.25 5H8.5" />
                      </svg>
                    </button>
                  ) : null}

                  <div className="skill-list-card-top">
                    <div className="skill-list-card-copy">
                      <h3 title={skill.name}>{skill.name}</h3>
                      <p className="skill-list-card-version">v{skill.version || '1.0.0'}</p>
                    </div>

                    <div className={`skill-list-card-top-actions ${skill.status === 'published' ? 'has-share' : ''}`}>
                      {isAuthenticated ? (
                        <span className={`status-badge status-${skill.status}`}>
                          {STATUS_MAP[skill.status] || skill.status}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p className="skill-list-card-description" title={skill.description || '-'}>
                    {skill.description || '-'}
                  </p>

                  <div className="skill-list-card-meta">
                    {skill.category && (
                      <span className="skill-list-category-chip">
                        {skill.category}
                      </span>
                    )}
                    <span className="skill-list-card-time">{formatDate(skill.updated_at || skill.updatedAt)}</span>
                  </div>

                </article>
              ))}
            </div>

            {renderPagination()}
          </>
        )}
      </section>

      {showForm ? (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal skill-list-modal" onClick={(event) => event.stopPropagation()}>
            <div className="skill-list-modal-banner">
              <span className="skill-list-modal-tag">创建模式</span>
              <h3>新建技能</h3>
            </div>
            <div className="skill-list-modal-body">
              <SkillForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      ) : null}

      {showAi ? (
        <div className="modal-overlay" onClick={() => setShowAi(false)}>
          <div className="modal skill-list-modal skill-list-ai-modal" onClick={(event) => event.stopPropagation()}>
            <div className="skill-list-modal-banner">
              <span className="skill-list-modal-tag">AI 模式</span>
              <h3>AI 生成技能</h3>
            </div>
            <div className="skill-list-modal-body">
              <AiGenerator onComplete={handleAiCreate} onCancel={() => setShowAi(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
