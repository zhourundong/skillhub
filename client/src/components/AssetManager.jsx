import React, { useState, useEffect } from 'react';
import { skillsApi } from '../api';
import ConfirmDialog from './ConfirmDialog';

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function AssetManager({ skillId, readonly }) {
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      const res = await skillsApi.listAssets(skillId);
      setAssets(res.data);
    } catch (err) {
      console.error('Failed to load assets:', err);
    }
  };

  useEffect(() => { load(); }, [skillId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      await skillsApi.uploadAsset(skillId, file);
      load();
    } catch (err) {
      setConfirm({
        message: '上传失败: ' + (err.response?.data?.error || err.message),
        onConfirm: () => setConfirm(null),
        type: 'error'
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = (filename) => {
    setConfirm({
      message: `确认删除 ${filename}？`,
      onConfirm: async () => {
        try {
          await skillsApi.deleteAsset(skillId, filename);
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

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div>
      {!readonly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <label className="btn btn-default" style={{ cursor: 'pointer' }}>
            {uploading ? '上传中...' : '+ 上传文件'}
            <input
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          <span style={{ color: '#888', fontSize: 12 }}>最大 2MB</span>
        </div>
      )}

      {assets.length === 0 ? (
        <p style={{ color: '#888' }}>暂无静态资源</p>
      ) : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: '8px 0' }}>文件名</th>
              <th>大小</th>
              <th>上传时间</th>
              {!readonly && <th style={{ width: 120 }}></th>}
            </tr>
          </thead>
          <tbody>
            {assets.map(a => (
              <tr key={a.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 0' }}>{a.name}</td>
                <td>{formatSize(a.size)}</td>
                <td>{formatDateTime(a.created_at)}</td>
                {!readonly && (
                  <td style={{ textAlign: 'right' }}>
                    <a
                      href={`/api/skills/${skillId}/assets/${encodeURIComponent(a.name)}`}
                      className="btn btn-default"
                      style={{ padding: '4px 8px', fontSize: 12, textDecoration: 'none' }}
                      download
                    >
                      下载
                    </a>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '4px 8px', fontSize: 12, marginLeft: 4 }}
                      onClick={() => handleDelete(a.name)}
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
