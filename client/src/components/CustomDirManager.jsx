import React, { useState, useEffect } from 'react';
import { skillsApi } from '../api';
import ConfirmDialog from './ConfirmDialog';

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSize(bytes) {
  if (!bytes) return '0 KB';
  return (bytes / 1024).toFixed(2) + ' KB';
}

// 构建目录树结构
function buildDirTree(dirs) {
  const root = { children: [] };
  const map = {};

  // 先按路径排序，确保父目录先处理
  dirs.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

  for (const dir of dirs) {
    map[dir.id] = { ...dir, children: [] };
  }

  for (const dir of dirs) {
    if (dir.parentPath) {
      // 找到父目录
      const parent = dirs.find(d => d.path === dir.parentPath);
      if (parent && map[parent.id]) {
        map[parent.id].children.push(map[dir.id]);
      } else {
        root.children.push(map[dir.id]);
      }
    } else {
      root.children.push(map[dir.id]);
    }
  }

  return root.children;
}

// 目录树节点组件
function DirTreeNode({ dir, level, onExpand, expandedDirs, readonly, onViewFiles, onCreateSubdir, onRename, onDelete }) {
  const isExpanded = expandedDirs[dir.path];
  const hasChildren = dir.children && dir.children.length > 0;
  const canCreateSubdir = level < 2; // 最多三级：level 0=一级, 1=二级, 2=三级

  return (
    <div style={{ marginLeft: level * 20 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 8px',
        background: isExpanded ? '#f0f7ff' : '#fff',
        borderRadius: 4,
        marginBottom: 2,
        border: '1px solid #e8e8e8'
      }}>
        <span
          onClick={() => onExpand(dir.path)}
          style={{ cursor: 'pointer', marginRight: 8, width: 16, textAlign: 'center' }}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : '•'}
        </span>
        <span style={{ fontWeight: 500, flex: 1 }}>📁 {dir.name}</span>
        {!readonly && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn-default"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => onViewFiles(dir)}
            >
              文件
            </button>
            {canCreateSubdir && (
              <button
                className="btn btn-default"
                style={{ padding: '2px 6px', fontSize: 11 }}
                onClick={() => onCreateSubdir(dir)}
                title="创建子目录"
              >
                +子目录
              </button>
            )}
            <button
              className="btn btn-default"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => onRename(dir)}
            >
              重命名
            </button>
            <button
              className="btn btn-danger"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => onDelete(dir)}
            >
              删除
            </button>
          </div>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {dir.children.map(child => (
            <DirTreeNode
              key={child.id}
              dir={child}
              level={level + 1}
              onExpand={onExpand}
              expandedDirs={expandedDirs}
              readonly={readonly}
              onViewFiles={onViewFiles}
              onCreateSubdir={onCreateSubdir}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomDirManager({ skillId, readonly }) {
  const [dirs, setDirs] = useState([]);
  const [expandedDirs, setExpandedDirs] = useState({});
  const [showCreateDir, setShowCreateDir] = useState(null);
  const [newDirName, setNewDirName] = useState('');
  const [renameDir, setRenameDir] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [viewFilesDir, setViewFilesDir] = useState(null);
  const [files, setFiles] = useState([]);
  const [editingFile, setEditingFile] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const loadDirs = async () => {
    try {
      const res = await skillsApi.listCustomDirs(skillId);
      setDirs(res.data || []);
    } catch (err) {
      console.error('Failed to load custom dirs:', err);
    }
  };

  useEffect(() => { loadDirs(); }, [skillId]);

  const handleExpand = (path) => {
    setExpandedDirs(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCreateDir = async () => {
    if (!newDirName.trim()) {
      setConfirm({ message: '目录名不能为空', onConfirm: () => setConfirm(null), type: 'error' });
      return;
    }

    try {
      await skillsApi.createCustomDir(skillId, {
        name: newDirName.trim(),
        parentPath: showCreateDir?.path || ''
      });
      setShowCreateDir(null);
      setNewDirName('');
      loadDirs();
    } catch (err) {
      setConfirm({
        message: err.response?.data?.error || '创建失败',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handleRename = async () => {
    if (!renameValue.trim()) {
      setConfirm({ message: '目录名不能为空', onConfirm: () => setConfirm(null), type: 'error' });
      return;
    }

    try {
      await skillsApi.renameCustomDir(skillId, renameDir.id, renameValue.trim());
      setRenameDir(null);
      setRenameValue('');
      loadDirs();
    } catch (err) {
      setConfirm({
        message: err.response?.data?.error || '重命名失败',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handleDeleteDir = (dir) => {
    setConfirm({
      message: `确认删除目录「${dir.name}」？该目录下的所有文件和子目录都会被删除。`,
      onConfirm: async () => {
        try {
          await skillsApi.deleteCustomDir(skillId, dir.id);
          loadDirs();
          if (viewFilesDir?.id === dir.id) {
            setViewFilesDir(null);
            setFiles([]);
          }
        } catch (err) {
          setConfirm({
            message: err.response?.data?.error || '删除失败',
            onConfirm: () => setConfirm(null),
            type: 'error'
          });
        }
        setConfirm(null);
      }
    });
  };

  const handleViewFiles = async (dir) => {
    setViewFilesDir(dir);
    try {
      const res = await skillsApi.listCustomDirFiles(skillId, dir.path);
      setFiles(res.data || []);
    } catch (err) {
      console.error('Failed to load files:', err);
      setFiles([]);
    }
  };

  const handleNewFile = () => {
    setEditingFile({ path: '', content: '', isNew: true });
  };

  const handleEditFile = async (file) => {
    if (!file.isEditable) {
      setConfirm({
        message: '该文件类型不支持在线编辑，请下载后使用本地编辑器打开',
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
      return;
    }
    try {
      const res = await skillsApi.getCustomFile(skillId, file.path);
      setEditingFile({ path: file.path, content: res.data.content, isNew: false });
    } catch (err) {
      setConfirm({
        message: '读取文件失败: ' + (err.response?.data?.error || err.message),
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handleSaveFile = async () => {
    // 获取文件名（新建时是文件名，编辑时需要提取）
    const filename = editingFile.isNew
      ? editingFile.path.trim()
      : editingFile.path.split('/').pop();

    if (!filename) {
      setConfirm({ message: '文件名不能为空', onConfirm: () => setConfirm(null), type: 'error' });
      return;
    }

    // 检查文件扩展名
    const ext = filename.split('.').pop().toLowerCase();
    const editableExts = [
      'txt', 'md', 'markdown', 'rst', 'adoc',
      'py', 'js', 'ts', 'jsx', 'tsx', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
      'rb', 'pl', 'lua', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs',
      'swift', 'kt', 'scala', 'r', 'sql', 'vue', 'svelte',
      'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env', 'cfg', 'conf',
      'properties', 'gitignore', 'dockerignore', 'editorconfig',
      'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
      'log', 'csv', 'tsv'
    ];
    if (!editableExts.includes(ext)) {
      setConfirm({
        message: `只支持创建文本类文件（.txt, .md, .json, .yaml, .py, .js 等），不支持创建 .${ext} 文件`,
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
      return;
    }

    // 构建完整路径
    const filePath = editingFile.isNew
      ? `${viewFilesDir.path}/${filename}`
      : editingFile.path;

    try {
      await skillsApi.saveCustomFile(skillId, filePath, editingFile.content);
      setEditingFile(null);
      handleViewFiles(viewFilesDir);
    } catch (err) {
      setConfirm({
        message: '保存失败: ' + (err.response?.data?.error || err.message),
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
  };

  const handleDeleteFile = (file) => {
    setConfirm({
      message: `确认删除文件「${file.name}」？`,
      onConfirm: async () => {
        try {
          await skillsApi.deleteCustomFile(skillId, file.path);
          handleViewFiles(viewFilesDir);
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

  const handleUploadFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      await skillsApi.uploadCustomFile(skillId, viewFilesDir.path, file);
      handleViewFiles(viewFilesDir);
    } catch (err) {
      setConfirm({
        message: '上传失败: ' + (err.response?.data?.error || err.message),
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    }
    e.target.value = '';
  };

  const dirTree = buildDirTree(dirs);

  // 文件编辑弹窗
  if (editingFile) {
    return (
      <div className="modal-overlay">
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3 style={{ marginBottom: 12 }}>{editingFile.isNew ? '新建文本文件' : '编辑文件'}</h3>
          {editingFile.isNew && (
            <div className="form-group">
              <label>文件名</label>
              <input
                value={editingFile.path}
                onChange={e => setEditingFile({ ...editingFile, path: e.target.value })}
                placeholder="如 readme.md、config.json"
                autoFocus
              />
              <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                保存路径: {viewFilesDir.path}/{editingFile.path || '<文件名>'}
              </p>
            </div>
          )}
          {!editingFile.isNew && (
            <div className="form-group">
              <label>文件路径</label>
              <input value={editingFile.path} disabled style={{ background: '#f5f5f5' }} />
            </div>
          )}
          <div className="form-group">
            <label>内容</label>
            <textarea
              value={editingFile.content}
              onChange={e => setEditingFile({ ...editingFile, content: e.target.value })}
              rows={12}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-default" onClick={() => setEditingFile(null)}>取消</button>
            <button className="btn btn-primary" onClick={handleSaveFile}>保存</button>
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
      </div>
    );
  }

  return (
    <div>
      {/* 创建目录弹窗 */}
      {showCreateDir !== null && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 12 }}>
              {showCreateDir ? `在「${showCreateDir.name}」下创建子目录` : '创建自定义目录'}
            </h3>
            <div className="form-group">
              <label>目录名</label>
              <input
                value={newDirName}
                onChange={e => setNewDirName(e.target.value)}
                placeholder="只能包含字母、数字、下划线、中划线"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-default" onClick={() => { setShowCreateDir(null); setNewDirName(''); }}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateDir}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renameDir && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 12 }}>重命名目录</h3>
            <div className="form-group">
              <label>新目录名</label>
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                placeholder="只能包含字母、数字、下划线、中划线"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-default" onClick={() => { setRenameDir(null); setRenameValue(''); }}>取消</button>
              <button className="btn btn-primary" onClick={handleRename}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 目录列表 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: '#666' }}>自定义目录（最多三级子目录）</span>
          {!readonly && (
            <button className="btn btn-primary" onClick={() => setShowCreateDir(false)} style={{ padding: '4px 12px', fontSize: 13 }}>
              + 新建目录
            </button>
          )}
        </div>

        {dirTree.length === 0 ? (
          <p style={{ color: '#888', padding: '12px 0' }}>暂无自定义目录</p>
        ) : (
          <div style={{ border: '1px solid #e8e8e8', borderRadius: 6, padding: 8 }}>
            {dirTree.map(dir => (
              <DirTreeNode
                key={dir.id}
                dir={dir}
                level={0}
                onExpand={handleExpand}
                expandedDirs={expandedDirs}
                readonly={readonly}
                onViewFiles={handleViewFiles}
                onCreateSubdir={(dir) => setShowCreateDir(dir)}
                onRename={(dir) => { setRenameDir(dir); setRenameValue(dir.name); }}
                onDelete={handleDeleteDir}
              />
            ))}
          </div>
        )}
      </div>

      {/* 文件列表 */}
      {viewFilesDir && (
        <div style={{
          marginTop: 16,
          padding: 16,
          background: '#fafafa',
          borderRadius: 6,
          border: '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 500 }}>📁 {viewFilesDir.path}/ 下的文件</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {!readonly && (
                <>
                  <button className="btn btn-default" style={{ padding: '4px 12px', fontSize: 13 }} onClick={handleNewFile}>
                    + 新建文本
                  </button>
                  <label className="btn btn-default" style={{ padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}>
                    上传文件
                    <input type="file" onChange={handleUploadFile} style={{ display: 'none' }} />
                  </label>
                </>
              )}
              <button className="btn btn-default" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => { setViewFilesDir(null); setFiles([]); }}>
                关闭
              </button>
            </div>
          </div>

          {files.length === 0 ? (
            <p style={{ color: '#888' }}>暂无文件</p>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: '8px 0' }}>文件路径</th>
                  <th>大小</th>
                  <th>更新时间</th>
                  {!readonly && <th style={{ width: 150 }}></th>}
                </tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.path} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 0' }}>{f.path}</td>
                    <td>{formatSize(f.size)}</td>
                    <td>{formatDateTime(f.updated_at)}</td>
                    {!readonly && (
                      <td style={{ textAlign: 'right' }}>
                        {f.isEditable && (
                          <button
                            className="btn btn-default"
                            style={{ padding: '4px 8px', fontSize: 12, marginRight: 4 }}
                            onClick={() => handleEditFile(f)}
                          >
                            编辑
                          </button>
                        )}
                        <a
                          href={`/api/skills/${skillId}/custom-files/${encodeURIComponent(f.path)}?download=1`}
                          className="btn btn-default"
                          style={{ padding: '4px 8px', fontSize: 12, marginRight: 4, textDecoration: 'none' }}
                          download
                        >
                          下载
                        </a>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => handleDeleteFile(f)}
                        >
                          删除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
