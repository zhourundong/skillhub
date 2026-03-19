const fs = require('fs');
const path = require('path');
const BaseChannel = require('./base');

/**
 * 生成安全的文件夹名称：name@version
 */
function getSkillDirName(skill) {
  const safeName = (skill.name || 'unnamed').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  const version = skill.version || '1.0.0';
  return `${safeName}@${version}`;
}

class LocalChannel extends BaseChannel {
  constructor(config) {
    super(config);
    this.outputDir = path.resolve(config.outputDir || './published_skills');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async publish(skill) {
    const dirName = getSkillDirName(skill);
    const targetDir = path.join(this.outputDir, dirName);
    const sourceDir = path.join(__dirname, '..', '..', 'skills', skill.id);

    // 创建目标目录
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
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
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMd, 'utf-8');

    // 排除的文件列表
    const excludeFiles = ['metadata.json', 'custom_dirs.json'];

    // 递归复制目录内容
    const copyDir = (src, dest) => {
      if (!fs.existsSync(src)) return;

      const items = fs.readdirSync(src);
      for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);

        // 跳过排除的文件
        if (excludeFiles.includes(item)) continue;

        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
          // 检查目录是否为空
          const subItems = fs.readdirSync(srcPath);
          if (subItems.length === 0) continue;

          // 创建目标目录
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          // 递归复制
          copyDir(srcPath, destPath);
        } else {
          // 复制文件
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    // 复制所有文件
    copyDir(sourceDir, targetDir);

    const copiedFiles = [];
    const countFiles = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          countFiles(itemPath);
        } else {
          copiedFiles.push(item);
        }
      }
    };
    countFiles(targetDir);

    return {
      success: true,
      path: targetDir,
      dirName,
      totalFiles: copiedFiles.length
    };
  }

  async unpublish(skill) {
    const dirName = getSkillDirName(skill);
    const skillDir = path.join(this.outputDir, dirName);
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
