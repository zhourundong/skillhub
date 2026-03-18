import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { skillsApi } from '../api';

// Markdown 组件样式
const markdownComponents = {
  h1: ({ children }) => (
    <h1 style={{ borderBottom: '1px solid #ddd', paddingBottom: 8, marginBottom: 16 }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ borderBottom: '1px solid #ddd', paddingBottom: 6, marginBottom: 12 }}>{children}</h2>
  ),
  p: ({ children }) => (
    <p style={{ lineHeight: 1.5, marginBottom: 12 }}>{children}</p>
  ),
  pre: ({ children }) => (
    <pre style={{
      background: '#ebedee',
      color: '#333',
      padding: 12,
      borderRadius: 4,
      marginBottom: 16,
      fontSize: 13,
      maxWidth: '100%',
      overflowX: 'auto',
      boxSizing: 'border-box'
    }}>
      {children}
    </pre>
  ),
  code: ({ inline, className, children }) => {
    if (inline) {
      return (
        <code style={{
          background: '#ebedee',
          padding: '2px 6px',
          borderRadius: 3,
          fontSize: 13,
          color: '#333'
        }}>
          {children}
        </code>
      );
    }
    return (
      <code style={{
        fontFamily: 'Consolas, Monaco, monospace',
        display: 'block',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        overflowWrap: 'break-word'
      }}>
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', border: '1px solid #ddd' }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th style={{ border: '1px solid #ddd', padding: '8px 12px', background: '#f5f5f5', textAlign: 'left' }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{ border: '1px solid #ddd', padding: '8px 12px' }}>{children}</td>
  ),
  img: ({ src, alt }) => (
    <img src={src} alt={alt} style={{ maxWidth: '100%', height: 'auto' }} />
  ),
  ul: ({ children }) => (
    <ul style={{ paddingLeft: 30, margin: '0 0 16px 0', overflowWrap: 'break-word' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ paddingLeft: 30, margin: '0 0 16px 0', overflowWrap: 'break-word' }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: 4 }}>{children}</li>
  )
};

// Parse YAML frontmatter from markdown content
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: text };

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: match[2] };
}

export default function SkillPreview({ skillId, onClose, initialContent }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('raw'); // 'raw' | 'markdown'
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (initialContent !== undefined) {
      setContent(initialContent);
      setLoading(false);
    } else {
      skillsApi.getRaw(skillId).then(text => {
        setContent(text);
        setLoading(false);
      });
    }
  }, [skillId, initialContent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const { frontmatter, body } = parseFrontmatter(content);

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>SKILL.md 预览</h3>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <button
              className="btn btn-default"
              onClick={() => setViewMode(viewMode === 'raw' ? 'markdown' : 'raw')}
              disabled={loading}
            >
              {viewMode === 'raw' ? 'Markdown 视图' : '源码视图'}
            </button>
            <button className="btn btn-default" onClick={handleCopy} disabled={loading}>
              复制
            </button>
            <button className="btn btn-default" onClick={onClose}>关闭</button>
            {copySuccess && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: 8,
                background: '#e6f7e6',
                color: '#52c41a',
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 13,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 10
              }}>
                复制成功
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <p>加载中...</p>
        ) : viewMode === 'raw' ? (
          <pre style={{
            background: '#f8f9fa',
            padding: 16,
            borderRadius: 6,
            fontSize: 13,
            lineHeight: 1.5,
            maxHeight: 500,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {content || '(空文件)'}
          </pre>
        ) : (
          <div style={{
            background: '#f8f9fa',
            padding: 16,
            borderRadius: 6,
            fontSize: 14,
            lineHeight: 1.6,
            maxHeight: 500,
            overflowY: 'auto',
            overflowX: 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            boxSizing: 'border-box'
          }}>
            {frontmatter && (
              <pre style={{
                background: '#ebedee',
                color: '#333',
                padding: 12,
                borderRadius: 4,
                marginBottom: 16,
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                <code>{`name: ${frontmatter.name || ''}\ndescription: ${frontmatter.description || ''}`}</code>
              </pre>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{body || '(空文件)'}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
