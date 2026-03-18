const fs = require('fs');
const path = require('path');
const BaseChannel = require('./base');

class LocalChannel extends BaseChannel {
  constructor(config) {
    super(config);
    this.outputDir = path.resolve(config.outputDir || './published_skills');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async publish(skill) {
    const skillDir = path.join(this.outputDir, skill.id);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    // 写入 SKILL.md
    const skillMd = `---
name: ${skill.name}
description: ${skill.description || ''}
version: ${skill.version}
category: ${skill.category || ''}
---

${skill.skill_content || ''}
`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

    // 写入 metadata
    const meta = { ...skill, publishedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(skillDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8');

    return { success: true, path: skillDir };
  }

  async unpublish(skill) {
    const skillId = typeof skill === 'object' ? skill.id : skill;
    const skillDir = path.join(this.outputDir, skillId);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
    return { success: true };
  }

  async healthCheck() {
    return { healthy: true, outputDir: this.outputDir };
  }
}

module.exports = LocalChannel;
