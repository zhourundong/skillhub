import React, { useState, useEffect } from 'react';
import { skillsApi } from '../api';
import ConfirmDialog from './ConfirmDialog';

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function TextFileManager({ skillId, subdir, label, readonly }) {
  const [files, setFiles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      const res = subdir === 'scripts'
        ? await skillsApi.listScripts(skillId)
        : await skillsApi.listReferences(skillId);
      setFiles(res.data);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  };

  useEffect(() => { load(); }, [skillId, subdir]);

  const handleView = async (file) => {
    setLoading(true);
    try {
      const res = subdir === 'scripts'
        ? await skillsApi.getScript(skillId, file.name)
        : await skillsApi.getReference(skillId, file.name);
      setEditing({ name: res.data.name, content: res.data.content, isNew: false });
    } catch (err) {
      setConfirm({
        message: '读取失败: ' + (err.response?.data?.error || err.message),
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
    setLoading(false);
  };

  const handleNew = () => {
    setEditing({ name: '', content: '', isNew: true });
  };

  const handleSave = async () => {
    if (!editing.name.trim()) {
      setConfirm({
        message: '文件名不能为空',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
      return;
    }
    // 检查文件扩展名
    const ext = editing.name.split('.').pop().toLowerCase();
    const allowedExts = [
      // 脚本
      'py', 'sh', 'bash', 'ps1', 'bat', 'js', 'ts', 'rb', 'pl', 'lua',
      // 文档
      'md', 'txt', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'sql', 'ini', 'env'
    ];
    if (!allowedExts.includes(ext)) {
      setConfirm({
        message: '支持的格式: .py, .sh, .bash, .js, .ts, .md, .txt, .json, .yaml, .sql 等',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
      return;
    }
    try {
      if (subdir === 'scripts') {
        await skillsApi.saveScript(skillId, editing.name, editing.content);
      } else {
        await skillsApi.saveReference(skillId, editing.name, editing.content);
      }
      setEditing(null);
      load();
    } catch (err) {
      setConfirm({
        message: '保存失败: ' + (err.response?.data?.error || err.message),
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handleDelete = (filename) => {
    setConfirm({
      message: `确认删除 ${filename}？`,
      onConfirm: async () => {
        try {
          if (subdir === 'scripts') {
            await skillsApi.deleteScript(skillId, filename);
          } else {
            await skillsApi.deleteReference(skillId, filename);
          }
          load();
        } catch (err) {
          setConfirm({
            message: '删除失败: ' + (err.response?.data?.error || err.message),
            onConfirm: () => setConfirm(null),
            type: 'error'
          });
        }
        setConfirm(null);
      }
    });
  };

  // 弹窗模式（查看或编辑）
  if (editing) {
    return (
      <>
        {/* 列表保持显示 */}
        <div>
          {!readonly && (
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={handleNew} disabled={loading}>
                + 新建文件
              </button>
            </div>
          )}
          {files.length === 0 ? (
            <p style={{ color: '#888' }}>暂无文件</p>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: '8px 0' }}>文件名</th>
                  <th>更新时间</th>
                  <th style={{ width: readonly ? 80 : 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 0' }}>{f.name}</td>
                    <td>{formatDateTime(f.updated_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-default"
                        style={{ padding: '4px 8px', fontSize: 12, marginRight: readonly ? 0 : 4 }}
                        onClick={() => handleView(f)}
                      >
                        {readonly ? '查看' : '编辑'}
                      </button>
                      {!readonly && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => handleDelete(f.name)}
                        >
                          删除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 弹窗 */}
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, width: '90%' }}>
            {readonly ? (
              // 查看模式
              <>
                <h3 style={{ marginBottom: 12 }}>{editing.name}</h3>
                <pre style={{
                  background: '#f8f9fa',
                  padding: 16,
                  borderRadius: 6,
                  fontSize: 13,
                  lineHeight: 1.5,
                  maxHeight: 400,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {editing.content || '(空文件)'}
                </pre>
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  <button className="btn btn-default" onClick={() => setEditing(null)}>关闭</button>
                </div>
              </>
            ) : (
              // 编辑模式
              <>
                <h3 style={{ marginBottom: 12 }}>{editing.isNew ? '新建文件' : '编辑文件'}</h3>
                <div className="form-group">
                  <label>文件名 {editing.isNew && '*'}</label>
                  <input
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    placeholder="例如: main.py 或 readme.md"
                    disabled={!editing.isNew}
                  />
                </div>
                <div className="form-group">
                  <label>内容</label>
                  <textarea
                    value={editing.content}
                    onChange={e => setEditing({ ...editing, content: e.target.value })}
                    rows={12}
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-default" onClick={() => setEditing(null)}>取消</button>
                  <button className="btn btn-primary" onClick={handleSave}>保存</button>
                </div>
              </>
            )}
          </div>
        </div>

        {confirm && (
          <ConfirmDialog
            message={confirm.message}
            onConfirm={confirm.onConfirm}
            onCancel={() => setConfirm(null)}
            type={confirm.type}
          />
        )}
      </>
    );
  }

  // 列表模式
  return (
    <div>
      {!readonly && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={handleNew} disabled={loading}>
            + 新建文件
          </button>
        </div>
      )}

      {files.length === 0 ? (
        <p style={{ color: '#888' }}>暂无文件</p>
      ) : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: '8px 0' }}>文件名</th>
              <th>更新时间</th>
              <th style={{ width: readonly ? 80 : 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {files.map(f => (
              <tr key={f.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 0' }}>{f.name}</td>
                <td>{formatDateTime(f.updated_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-default"
                    style={{ padding: '4px 8px', fontSize: 12, marginRight: readonly ? 0 : 4 }}
                    onClick={() => handleView(f)}
                  >
                    {readonly ? '查看' : '编辑'}
                  </button>
                  {!readonly && (
                    <button
                      className="btn btn-danger"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      onClick={() => handleDelete(f.name)}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
