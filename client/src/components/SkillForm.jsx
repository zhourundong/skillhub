import React, { useState, useEffect } from 'react';

export default function SkillForm({ skill, onSubmit, onCancel, onChange }) {
  const [form, setForm] = useState({
    name: skill?.name || '',
    description: skill?.description || '',
    version: skill?.version || '1.0.0',
    category: skill?.category || '',
    skill_content: skill?.skill_content || '',
  });

  useEffect(() => {
    if (onChange) {
      onChange(form);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>名称 *</label>
        <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="例如: pdf-editor" />
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>只能包含字母、数字和连字符(-)</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label>版本</label>
          <input value={form.version} onChange={e => set('version', e.target.value)} placeholder="1.0.0" />
        </div>
        <div className="form-group">
          <label>分类</label>
          <input
            value={form.category}
            onChange={e => set('category', e.target.value)}
            placeholder="输入分类，如：工具、开发、AI"
          />
        </div>
      </div>
      <div className="form-group">
        <label>描述</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Skill 的功能描述..." rows={3} />
      </div>
      <div className="form-group">
        <label>Skill 内容 (Markdown)</label>
        <textarea
          value={form.skill_content}
          onChange={e => set('skill_content', e.target.value)}
          placeholder="# 使用说明&#10;&#10;这个 Skill 用于..."
          style={{ height: 300, overflow: 'auto' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-default" onClick={onCancel}>取消</button>
        <button type="submit" className="btn btn-primary">{skill ? '保存' : '创建'}</button>
      </div>
    </form>
  );
}
