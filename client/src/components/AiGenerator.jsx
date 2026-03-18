import React, { useState } from 'react';

export default function AiGenerator({ onComplete, onCancel }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入描述');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '生成失败');
      }

      const data = await res.json();
      setResult(data.skill);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (result) {
      onComplete({
        name: result.name,
        description: result.description,
        category: result.category,
        skill_content: result.skill_content
      });
    }
  };

  return (
    <div>
      <div className="form-group">
        <label>描述你想要的 Skill</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="例如: 一个可以帮我阅读和总结 PDF 文档的助手..."
          rows={4}
          disabled={loading}
        />
      </div>

      {error && <p style={{ color: '#e74c3c', marginBottom: 12 }}>{error}</p>}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, marginBottom: 16 }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid #f0f0f0',
            borderTop: '3px solid #1890ff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ marginLeft: 12, color: '#666' }}>AI 正在生成...</span>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!result && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-default" onClick={onCancel} disabled={loading}>取消</button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '生成'}
          </button>
        </div>
      )}

      {result && (
        <>
          <div style={{ background: '#f8f9fa', borderRadius: 6, padding: 16, marginBottom: 16 }}>
            <h4 style={{ marginBottom: 8 }}>生成结果</h4>
            <p><strong>名称:</strong> {result.name || '(未命名)'}</p>
            <p><strong>分类:</strong> {result.category || '未分类'}</p>
            <p><strong>描述:</strong> {result.description || '暂无描述'}</p>
            {result.skill_content && (
              <div style={{ marginTop: 12 }}>
                <strong>Skill 内容:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fff', padding: 8, borderRadius: 4, marginTop: 4, maxHeight: 200, overflow: 'auto' }}>
                  {result.skill_content}
                </pre>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-default" onClick={() => setResult(null)}>重新生成</button>
            <button className="btn btn-primary" onClick={handleConfirm}>确认创建</button>
          </div>
        </>
      )}
    </div>
  );
}
