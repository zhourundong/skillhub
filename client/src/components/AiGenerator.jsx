import React, { useState, useRef } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { getStoredToken } from '../utils/authStorage';

export default function AiGenerator({ onComplete, onCancel }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState(false);
  const [rawOutput, setRawOutput] = useState('');
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('zh'); // 'zh' | 'en'
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState({});
  const [generatingFiles, setGeneratingFiles] = useState({ scripts: [], references: [], assets: [] });
  const [statusText, setStatusText] = useState('');
  const [reasoningContent, setReasoningContent] = useState(''); // 思考内容
  const [showReasoning, setShowReasoning] = useState(true); // 思考内容默认展开
  const [streamContent, setStreamContent] = useState(''); // 流式内容（用于调试）
  const abortControllerRef = useRef(null);
  const hasReasoningRef = useRef(false); // 用于追踪是否有思考内容

  // 辅助文件选项，默认只勾选参考资料
  const [fileOptions, setFileOptions] = useState({
    scripts: false,
    references: true,
    assets: false
  });

  const toggleFileOption = (type) => {
    setFileOptions(prev => ({ ...prev, [type]: !prev[type] }));
  };

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
    setExpandedFiles({});
    setGeneratingFiles({ scripts: [], references: [], assets: [] });
    setStatusText('正在连接 AI 服务...');
    setReasoningContent('');
    setShowReasoning(true); // 默认展开
    setStreamContent('');
    hasReasoningRef.current = false; // 重置思考内容标记

    // 创建 AbortController 用于取消请求
    abortControllerRef.current = new AbortController();

    try {
      const token = getStoredToken();
      const response = await fetch(`${import.meta.env.BASE_URL}api/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ prompt, language, fileOptions }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '生成失败');
      }

      // 处理 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 处理 buffer 中的事件的辅助函数
      const processBuffer = (buf, isFinal = false) => {
        const lines = buf.split('\n');
        // 如果不是最终处理，保留最后一行（可能不完整）
        const remainingBuffer = isFinal ? '' : (lines.pop() || '');

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              return { eventType, data, remainingBuffer };
            } catch (e) {
              console.error('[AI Generator] JSON parse error:', e.message);
            }
          }
        }
        return { eventType: null, data: null, remainingBuffer };
      };

      // 处理单个事件的函数
      const handleEvent = (eventType, data) => {
        if (eventType === 'file') {
          setGeneratingFiles(prev => ({
            ...prev,
            [data.type]: [...prev[data.type], { filename: data.filename, size: data.size }]
          }));
          setStatusText(`生成文件: ${data.filename}`);
        } else if (eventType === 'reasoning') {
          setReasoningContent(prev => prev + data.content);
          hasReasoningRef.current = true;
          setStatusText('AI 正在思考...');
        } else if (eventType === 'chunk') {
          setStreamContent(prev => prev + data.content);
          setStatusText('AI 正在生成...');
        } else if (eventType === 'done') {
          console.log('[AI Generator] Done event received:', data);
          if (hasReasoningRef.current) {
            setShowReasoning(false);
          }
          if (data.success && data.skill) {
            const skill = {
              ...data.skill,
              scripts: data.skill.scripts || [],
              references: data.skill.references || [],
              assets: data.skill.assets || []
            };
            console.log('[AI Generator] Setting result:', skill);
            setResult(skill);
            setParseError(false);
          } else {
            console.log('[AI Generator] Parse failed, rawOutput:', data.rawOutput?.substring(0, 200));
            setResult(null);
            setParseError(true);
            setRawOutput(data.rawOutput || '');
          }
        } else if (eventType === 'error') {
          throw new Error(data.error);
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        if (done) {
          // 流结束，处理剩余的 buffer
          if (buffer.trim()) {
            console.log('[AI Generator] Processing remaining buffer, length:', buffer.length);
            console.log('[AI Generator] Buffer content:', buffer);
            let eventType = '';
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                console.log('[AI Generator] Parsing data line, eventType:', eventType, 'dataStr length:', dataStr.length);
                try {
                  const data = JSON.parse(dataStr);
                  handleEvent(eventType, data);
                } catch (e) {
                  console.error('[AI Generator] Final buffer parse error:', e.message, 'dataStr:', dataStr.substring(0, 100));
                }
              }
            }
          } else {
            console.log('[AI Generator] Stream ended with empty buffer');
          }
          break;
        }

        // 解析 SSE 事件
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留未完成的行

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              handleEvent(eventType, data);
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) {
                throw e;
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setStatusText('');
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onCancel();
  };

  const handleConfirm = () => {
    if (!result) return;

    // 验证必填字段
    const errors = [];
    if (!result.name || !result.name.trim()) {
      errors.push('名称不能为空');
    }
    if (!result.description || !result.description.trim()) {
      errors.push('描述不能为空');
    }
    if (!result.skill_content || !result.skill_content.trim()) {
      errors.push('Skill 内容不能为空');
    }

    if (errors.length > 0) {
      setError(errors.join('、'));
      return;
    }

    onComplete({
      name: result.name.trim(),
      description: result.description.trim(),
      skill_content: result.skill_content.trim(),
      scripts: result.scripts || [],
      references: result.references || [],
      assets: result.assets || []
    });
  };

  const handleRegenerate = () => {
    if (parseError) {
      setResult(null);
      setParseError(false);
      setRawOutput('');
      setExpandedFiles({});
      setGeneratingFiles({ scripts: [], references: [], assets: [] });
      setReasoningContent('');
      setShowReasoning(true); // 默认展开
      setStreamContent('');
      hasReasoningRef.current = false;
    } else {
      setConfirmRegenerate(true);
    }
  };

  const confirmDoRegenerate = () => {
    setConfirmRegenerate(false);
    setResult(null);
    setParseError(false);
    setRawOutput('');
    setExpandedFiles({});
    setGeneratingFiles({ scripts: [], references: [], assets: [] });
    setReasoningContent('');
    setShowReasoning(true); // 默认展开
    setStreamContent('');
    hasReasoningRef.current = false;
  };

  const updateField = (field, value) => {
    setResult(prev => ({ ...prev, [field]: value }));
    // 清除错误提示
    if (error) setError('');
  };

  const toggleFileExpand = (type, index) => {
    const key = `${type}-${index}`;
    setExpandedFiles(prev => {
      // 手风琴效果：如果当前已展开则收起，否则只展开当前
      if (prev[key]) {
        return {};
      }
      return { [key]: true };
    });
  };

  const updateAuxiliaryFile = (type, index, field, value) => {
    setResult(prev => {
      const newList = [...(prev[type] || [])];
      newList[index] = { ...newList[index], [field]: value };
      return { ...prev, [type]: newList };
    });
  };

  const removeAuxiliaryFile = (type, index) => {
    setResult(prev => {
      const newList = [...(prev[type] || [])];
      newList.splice(index, 1);
      return { ...prev, [type]: newList };
    });
    // 收起展开状态
    setExpandedFiles({});
  };

  // 渲染生成中的文件列表
  const renderGeneratingFiles = (type, label, icon) => {
    const files = generatingFiles[type];
    if (files.length === 0) return null;

    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span>{icon}</span>
          <span style={{ fontWeight: 500, color: '#666', fontSize: 13 }}>{label}</span>
        </div>
        {files.map((file, index) => (
          <div key={index} style={{
            background: '#e6f7ff',
            border: '1px solid #91d5ff',
            borderRadius: 4,
            padding: '4px 8px',
            marginBottom: 4,
            fontSize: 12
          }}>
            <span style={{ fontFamily: 'monospace' }}>{file.filename}</span>
            <span style={{ color: '#999', marginLeft: 8 }}>({file.size} chars)</span>
          </div>
        ))}
      </div>
    );
  };

  // 渲染辅助文件列表
  const renderAuxiliaryFiles = (type, label, icon) => {
    const files = result?.[type] || [];
    if (files.length === 0) return null;

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          fontSize: 13,
          color: '#666'
        }}>
          <span>{icon}</span>
          <span>{label}</span>
          <span style={{ background: '#e8e8e8', padding: '1px 6px', borderRadius: 10, fontSize: 11 }}>{files.length}</span>
        </div>
        {files.map((file, index) => {
          const isExpanded = expandedFiles[`${type}-${index}`];
          return (
            <div key={`${type}-${index}`} style={{
              background: '#fff',
              border: `1px solid ${isExpanded ? '#1890ff' : '#e8e8e8'}`,
              borderRadius: 6,
              marginBottom: 6,
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                cursor: 'pointer',
                background: isExpanded ? '#f0f7ff' : '#fafafa'
              }} onClick={() => toggleFileExpand(type, index)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    color: isExpanded ? '#1890ff' : '#999',
                    fontSize: 12,
                    transition: 'transform 0.2s',
                    display: 'inline-block',
                    transform: isExpanded ? 'rotate(90deg)' : 'none'
                  }}>▶</span>
                  <span style={{
                    fontFamily: 'monospace',
                    color: isExpanded ? '#1890ff' : '#333',
                    fontSize: 13
                  }}>{file.filename}</span>
                  <span style={{ color: '#bbb', fontSize: 11 }}>{file.content?.length || 0} 字符</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeAuxiliaryFile(type, index); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#999',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    fontSize: 12
                  }}
                  title="删除"
                >
                  ✕
                </button>
              </div>
              {isExpanded && (
                <div style={{
                  padding: '16px',
                  borderTop: '1px solid #e8e8e8',
                  background: '#fff'
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{
                      fontSize: 12,
                      color: '#333',
                      fontWeight: 500,
                      marginBottom: 6,
                      display: 'block'
                    }}>文件名</label>
                    <input
                      value={file.filename}
                      onChange={e => updateAuxiliaryFile(type, index, 'filename', e.target.value)}
                      placeholder="输入文件名，如 helper.py"
                      style={{
                        width: '100%',
                        fontSize: 13,
                        padding: '8px 12px',
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        outline: 'none'
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = '#1890ff';
                        e.target.style.boxShadow = '0 0 0 2px rgba(24, 144, 255, 0.1)';
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#d9d9d9';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div>
                    <label style={{
                      fontSize: 12,
                      color: '#333',
                      fontWeight: 500,
                      marginBottom: 6,
                      display: 'block'
                    }}>内容</label>
                    <textarea
                      value={file.content}
                      onChange={e => updateAuxiliaryFile(type, index, 'content', e.target.value)}
                      placeholder="输入文件内容..."
                      style={{
                        width: '100%',
                        minHeight: 200,
                        fontSize: 13,
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        padding: '12px',
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        background: '#fafafa',
                        lineHeight: 1.6,
                        resize: 'vertical',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        outline: 'none'
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = '#1890ff';
                        e.target.style.boxShadow = '0 0 0 2px rgba(24, 144, 255, 0.1)';
                        e.target.style.background = '#fff';
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#d9d9d9';
                        e.target.style.boxShadow = 'none';
                        e.target.style.background = '#fafafa';
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const hasGeneratingFiles = generatingFiles.scripts.length > 0 || generatingFiles.references.length > 0 || generatingFiles.assets.length > 0;
  const hasAuxiliaryFiles = (result?.scripts?.length > 0 || result?.references?.length > 0 || result?.assets?.length > 0);

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
        <label style={{ marginBottom: 8 }}>辅助文件（可选）</label>
        <div style={{ display: 'flex', gap: 24, marginBottom: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={fileOptions.scripts}
              onChange={() => toggleFileOption('scripts')}
              disabled={loading}
              style={{ width: 16, height: 16 }}
            />
            <span>脚本文件</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={fileOptions.references}
              onChange={() => toggleFileOption('references')}
              disabled={loading}
              style={{ width: 16, height: 16 }}
            />
            <span>参考文档</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={fileOptions.assets}
              onChange={() => toggleFileOption('assets')}
              disabled={loading}
              style={{ width: 16, height: 16 }}
            />
            <span>静态资源</span>
          </label>
        </div>
        <div style={{ fontSize: 12, color: '#999', lineHeight: 1.5 }}>
          勾选后 AI 可能会生成相应的辅助文件，此选项仅作为系统提示，不作为AI生成依据。
        </div>
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
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{
              width: 24,
              height: 24,
              border: '2px solid #f0f0f0',
              borderTop: '2px solid #1890ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{ marginLeft: 12, color: '#666' }}>{statusText || 'AI 正在生成...'}</span>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>

          {/* 思考过程展示（部分模型支持）- 放在最上面 */}
          {reasoningContent && (
            <div style={{
              background: '#f0f7ff',
              border: '1px solid #91d5ff',
              borderRadius: 6,
              padding: 12,
              marginBottom: 12
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setShowReasoning(!showReasoning)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#1890ff' }}>💭</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1890ff' }}>思考过程</span>
                  <span style={{ fontSize: 11, color: '#999' }}>({reasoningContent.length} 字符)</span>
                </div>
                <span style={{ fontSize: 12, color: '#1890ff', cursor: 'pointer' }}>
                  {showReasoning ? '收起 ▲' : '展开 ▼'}
                </span>
              </div>
              {showReasoning && (
                <pre style={{
                  background: '#fff',
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                  lineHeight: 1.6,
                  maxHeight: 300,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: '12px 0 0 0',
                  border: '1px solid #e8e8e8'
                }}>
                  {reasoningContent}
                </pre>
              )}
            </div>
          )}

          {/* 流式内容展示（实时显示 AI 输出） */}
          {streamContent && !reasoningContent && (
            <div style={{
              background: '#fafafa',
              border: '1px solid #e8e8e8',
              borderRadius: 6,
              padding: 12,
              marginBottom: 12
            }}>
              <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>
                <span style={{ marginRight: 6 }}>📝</span>
                生成内容预览
                <span style={{ fontSize: 11, marginLeft: 8 }}>({streamContent.length} 字符)</span>
              </div>
              <pre style={{
                background: '#fff',
                padding: 12,
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.6,
                maxHeight: 200,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0
              }}>
                {streamContent}
              </pre>
            </div>
          )}

          {/* 实时显示生成中的文件 */}
          {hasGeneratingFiles && (
            <div style={{
              background: '#fafafa',
              border: '1px solid #e8e8e8',
              borderRadius: 6,
              padding: 12
            }}>
              <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>正在生成的文件：</div>
              {renderGeneratingFiles('scripts', '脚本文件', '🐍')}
              {renderGeneratingFiles('references', '参考文档', '📄')}
              {renderGeneratingFiles('assets', '静态资源', '📦')}
            </div>
          )}
        </div>
      )}

      {!result && !parseError && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-default" onClick={handleCancel} disabled={loading}>取消</button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '生成'}
          </button>
        </div>
      )}

      {/* 解析成功：可编辑表单 */}
      {result && !parseError && (
        <>
          <div style={{ marginBottom: 16 }}>
            {/* 思考过程展示（生成完成后可查看） */}
            {reasoningContent && (
              <div style={{
                background: '#f0f7ff',
                border: '1px solid #91d5ff',
                borderRadius: 6,
                padding: 12,
                marginBottom: 16
              }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => setShowReasoning(!showReasoning)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#1890ff' }}>💭</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1890ff' }}>思考过程</span>
                    <span style={{ fontSize: 11, color: '#999' }}>({reasoningContent.length} 字符)</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#1890ff', cursor: 'pointer' }}>
                    {showReasoning ? '收起 ▲' : '展开 ▼'}
                  </span>
                </div>
                {showReasoning && (
                  <pre style={{
                    background: '#fff',
                    padding: 12,
                    borderRadius: 4,
                    fontSize: 12,
                    lineHeight: 1.6,
                    maxHeight: 300,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: '12px 0 0 0',
                    border: '1px solid #e8e8e8'
                  }}>
                    {reasoningContent}
                  </pre>
                )}
              </div>
            )}

            <div className="form-group">
              <label>名称 *</label>
              <input
                value={result.name || ''}
                onChange={e => updateField('name', e.target.value)}
                placeholder="技能名称"
                style={!result.name?.trim() ? { borderColor: '#ff4d4f' } : {}}
              />
              <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>只能包含字母、数字和连字符(-)</p>
            </div>
            <div className="form-group">
              <label>描述 *</label>
              <textarea
                value={result.description || ''}
                onChange={e => updateField('description', e.target.value)}
                placeholder="技能功能描述"
                rows={3}
                style={!result.description?.trim() ? { borderColor: '#ff4d4f' } : {}}
              />
            </div>
            <div className="form-group">
              <label>Skill 内容 (Markdown) *</label>
              <textarea
                value={result.skill_content || ''}
                onChange={e => updateField('skill_content', e.target.value)}
                placeholder="Skill 内容"
                style={{
                  height: 250,
                  overflow: 'auto',
                  ...(!result.skill_content?.trim() ? { borderColor: '#ff4d4f' } : {})
                }}
              />
            </div>

            {/* 辅助文件区域 */}
            {hasAuxiliaryFiles && (
              <div style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid #e8e8e8'
              }}>
                {renderAuxiliaryFiles('scripts', '脚本', '🐍')}
                {renderAuxiliaryFiles('references', '参考文档', '📄')}
                {renderAuxiliaryFiles('assets', '静态资源', '📦')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-default" onClick={handleRegenerate}>重新生成</button>
            <button className="btn btn-primary" onClick={handleConfirm}>确认创建</button>
          </div>
        </>
      )}

      {/* 解析失败：只读内容框 */}
      {parseError && (
        <>
          <div style={{
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 6,
            padding: 12,
            marginBottom: 16
          }}>
            <p style={{ color: '#ff4d4f', marginBottom: 8, fontWeight: 500 }}>
              ⚠️ {rawOutput ? '模型返回内容无法解析为有效的 Skill 格式' : 'AI 响应异常，请重试'}
            </p>
            <p style={{ color: '#666', fontSize: 13 }}>
              {rawOutput ? '请修改提示词后重新生成。确保提示词清晰描述你需要的 Skill 功能。' : 'AI 响应异常，请重试。'}
            </p>
          </div>
          {rawOutput && (
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
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-default" onClick={handleCancel}>取消</button>
            <button className="btn btn-primary" onClick={handleRegenerate}>{rawOutput ? '修改提示词重新生成' : '重新生成'}</button>
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
