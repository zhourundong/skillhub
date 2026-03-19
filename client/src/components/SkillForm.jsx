import React, { useEffect, useState } from 'react';
import './SkillForm.css';

const MAX_DESCRIPTION_LENGTH = 500;

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

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const descriptionLength = form.description.length;
  const contentLength = form.skill_content.trim().length;
  const contentLines = form.skill_content ? form.skill_content.split('\n').length : 0;

  return (
    <form onSubmit={handleSubmit} className="skill-form">
      <div className="skill-form-layout">
        <section className="skill-form-main">
          <div className="skill-form-section">
            <div className="form-group">
              <label>名称 <span className="required">*</span></label>
              <input
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                required
                placeholder="例如: pdf-editor"
              />
              <p className="skill-form-hint">建议使用稳定名称，尽量只包含字母、数字和连接符。</p>
            </div>

            <div className="skill-form-meta-grid">
              <div className="form-group">
                <label>版本</label>
                <input
                  value={form.version}
                  onChange={(event) => set('version', event.target.value)}
                  placeholder="1.0.0"
                />
              </div>

              <div className="form-group">
                <label>分类</label>
                <input
                  value={form.category}
                  onChange={(event) => set('category', event.target.value)}
                  placeholder="例如：工具、开发、AI"
                />
              </div>
            </div>

            <div className="form-group">
              <div className="skill-form-label-row">
                <label>描述 <span className="required">*</span></label>
                <span>{descriptionLength} / {MAX_DESCRIPTION_LENGTH}</span>
              </div>
              <textarea
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
                placeholder="Skill 的功能描述..."
                rows={5}
                maxLength={MAX_DESCRIPTION_LENGTH}
                required
              />
            </div>
          </div>

          <div className="skill-form-section skill-form-editor-section">
            <div className="skill-form-section-head">
              <h3>SKILL 内容 <span className="required">*</span></h3>
            </div>

            <div className="form-group skill-form-editor-group">
              <textarea
                value={form.skill_content}
                onChange={(event) => set('skill_content', event.target.value)}
                placeholder={'# 详细描述\n\n这个 Skill 用于...'}
                className="skill-form-editor"
                required
              />
              <div className="skill-form-label-row skill-form-editor-meta">
                <span>{contentLines} 行 / {contentLength} 字</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="skill-form-actions">
        <button type="button" className="btn btn-default" onClick={onCancel}>取消</button>
        <button type="submit" className="btn btn-primary">{skill ? '保存' : '创建'}</button>
      </div>
    </form>
  );
}
