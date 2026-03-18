import React, { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

export default function AiGenerator({ onComplete, onCancel }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState(false);
  const [rawOutput, setRawOutput] = useState('');
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('zh'); // 'zh' | 'en'
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入描述');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setParseError(false);
    setRawOutput('');

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, language })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '生成失败');
      }

      const data = await res.json();
      if (data.success) {
        setResult(data.skill);
        setParseError(false);
      } else {
        setResult(null);
        setParseError(true);
        setRawOutput(data.rawOutput || '');
      }
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
        skill_content: result.skill_content
      });
    }
  };

  const handleRegenerate = () => {
    if (parseError) {
      // 解析失败时直接重新生成，不需要确认
      setResult(null);
      setParseError(false);
      setRawOutput('');
    } else {
      setConfirmRegenerate(true);
    }
  };

  const confirmDoRegenerate = () => {
    setConfirmRegenerate(false);
    setResult(null);
    setParseError(false);
    setRawOutput('');
  };

  const updateField = (field, value) => {
    setResult(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className={`btn ${language === 'zh' ? 'btn-primary' : 'btn-default'}`}
          onClick={() => setLanguage('zh')}
          disabled={loading}
        >
          中文
        </button>
        <button
          className={`btn ${language === 'en' ? 'btn-primary' : 'btn-default'}`}
          onClick={() => setLanguage('en')}
          disabled={loading}
        >
          English
        </button>
      </div>

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

      {!result && !parseError && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-default" onClick={onCancel} disabled={loading}>取消</button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '生成'}
          </button>
        </div>
      )}

      {/* 解析成功：可编辑表单 */}
      {result && !parseError && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>名称 *</label>
              <input
                value={result.name || ''}
                onChange={e => updateField('name', e.target.value)}
                placeholder="技能名称"
              />
            </div>
            <div className="form-group">
              <label>描述</label>
              <textarea
                value={result.description || ''}
                onChange={e => updateField('description', e.target.value)}
                placeholder="技能功能描述"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>Skill 内容 (Markdown)</label>
              <textarea
                value={result.skill_content || ''}
                onChange={e => updateField('skill_content', e.target.value)}
                placeholder="Skill 内容"
                style={{ height: 250, overflow: 'auto' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-default" onClick={handleRegenerate}>重新生成</button>
            <button className="btn btn-primary" onClick={handleConfirm}>确认创建</button>
          </div>
        </>
      )}

      {/* 解析失败：只读内容框 */}
      {parseError && rawOutput && (
        <>
          <div style={{
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 6,
            padding: 12,
            marginBottom: 16
          }}>
            <p style={{ color: '#ff4d4f', marginBottom: 8, fontWeight: 500 }}>
              ⚠️ 模型返回内容无法解析为有效的 Skill 格式
            </p>
            <p style={{ color: '#666', fontSize: 13 }}>
              请修改提示词后重新生成。确保提示词清晰描述你需要的 Skill 功能。
            </p>
          </div>
          <div className="form-group">
            <label>模型返回内容</label>
            <pre style={{
              background: '#f8f9fa',
              padding: 16,
              borderRadius: 6,
              fontSize: 13,
              lineHeight: 1.5,
              maxHeight: 300,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid #e8e8e8'
            }}>
              {rawOutput}
            </pre>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-default" onClick={onCancel}>取消</button>
            <button className="btn btn-primary" onClick={handleRegenerate}>修改提示词重新生成</button>
          </div>
        </>
      )}

      {confirmRegenerate && (
        <ConfirmDialog
          message="重新生成将清空当前编辑的内容，确定要继续吗？"
          onConfirm={confirmDoRegenerate}
          onCancel={() => setConfirmRegenerate(false)}
        />
      )}
    </div>
  );
}
