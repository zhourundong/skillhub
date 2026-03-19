const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const BaseChannel = require('./base');

/**
 * 生成安全的目录名称：name@version
 */
function getSkillDirName(skill) {
  const safeName = (skill.name || 'unnamed').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  const version = skill.version || '1.0.0';
  return `${safeName}@${version}`;
}

/**
 * GitHub 发布渠道
 * 将技能发布到指定的 GitHub 仓库和分支
 */
class GitHubChannel extends BaseChannel {
  constructor(config) {
    super(config);
    // 支持完整 URL 或 owner/repo 格式
    this.owner = config.owner || '';
    this.repo = config.repo || '';
    this.branch = config.branch || 'main';
    this.token = config.token || '';
    // 清理 basePath，移除开头/结尾的斜杠
    this.basePath = (config.basePath || '').replace(/^\/+/, '').replace(/\/+$/, '');
    this.commitMessage = config.commitMessage || 'Update skill: {name}';

    // 解析完整 GitHub URL
    if (config.repoUrl) {
      const match = config.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        this.owner = match[1];
        this.repo = match[2].replace(/\.git$/, '');
      }
    }

    this.apiBase = 'https://api.github.com';
  }

  /**
   * 获取 API 请求头
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SkillHub-Publisher',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  /**
   * 构建完整的 GitHub 路径（移除开头斜杠，清理多余斜杠）
   */
  buildPath(filePath) {
    const parts = [];
    if (this.basePath) parts.push(this.basePath);
    if (filePath) parts.push(filePath);
    return parts
      .join('/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/g, '/');
  }

  /**
   * 获取文件的 SHA（用于更新已有文件）
   */
  async getFileSha(filePath) {
    const fullPath = this.buildPath(filePath);
    const url = `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${fullPath}?ref=${this.branch}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        return data.sha;
      }
    } catch (err) {
      // 文件不存在，返回 null
    }
    return null;
  }

  /**
   * 上传单个文件到 GitHub
   */
  async uploadFile(filePath, content, isBinary = false) {
    const fullPath = this.buildPath(filePath);
    const sha = await this.getFileSha(fullPath);

    // 编码内容
    const encodedContent = isBinary
      ? content.toString('base64')
      : Buffer.from(content).toString('base64');

    const body = {
      message: `Update ${filePath}`,
      content: encodedContent,
      branch: this.branch
    };

    if (sha) {
      body.sha = sha;
    }

    const url = `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${fullPath}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API 错误 (${response.status}): ${error.message || JSON.stringify(error)}`);
    }

    return response.json();
  }

  /**
   * 删除 GitHub 上的文件
   */
  async deleteFile(filePath, sha = null) {
    const fullPath = this.buildPath(filePath);
    if (!sha) {
      sha = await this.getFileSha(fullPath);
    }
    if (!sha) return; // 文件不存在

    const url = `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${fullPath}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({
        message: `Delete ${filePath}`,
        sha,
        branch: this.branch
      })
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.json();
      throw new Error(`GitHub API 错误 (${response.status}): ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * 获取仓库中目录下的所有文件
   */
  async listFiles(dirPath = '') {
    const fullPath = this.buildPath(dirPath);
    const url = `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${fullPath}?ref=${this.branch}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        const files = [];
        for (const item of data) {
          if (item.type === 'file') {
            files.push({
              path: dirPath ? `${dirPath}/${item.name}` : item.name,
              sha: item.sha
            });
          } else if (item.type === 'dir') {
            // 递归获取子目录文件
            const subFiles = await this.listFiles(dirPath ? `${dirPath}/${item.name}` : item.name);
            files.push(...subFiles);
          }
        }
        return files;
      }
    } catch (err) {
      // 目录不存在
    }
    return [];
  }

  /**
   * 发布技能到 GitHub
   */
  async publish(skill) {
    if (!this.owner || !this.repo) {
      throw new Error('GitHub 渠道配置错误：缺少 owner 或 repo');
    }
    if (!this.token) {
      throw new Error('GitHub 渠道配置错误：缺少 token');
    }

    const skillDir = path.join(__dirname, '..', '..', 'skills', skill.id);
    if (!fs.existsSync(skillDir)) {
      throw new Error('Skill 目录不存在');
    }

    const skillBasePath = getSkillDirName(skill); // 使用 name@version 作为目录名
    const uploadedFiles = [];
    const errors = [];

    // 递归上传所有文件
    const uploadDir = async (dirPath, targetPath) => {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        // 排除 metadata.json 和 custom_dirs.json
        if (item === 'metadata.json' || item === 'custom_dirs.json') continue;

        if (stat.isDirectory()) {
          // 递归处理子目录
          await uploadDir(itemPath, `${targetPath}/${item}`);
        } else {
          // 上传文件
          try {
            const content = fs.readFileSync(itemPath);
            const relativePath = `${targetPath}/${item}`;
            await this.uploadFile(relativePath, content, true);
            uploadedFiles.push(relativePath);
          } catch (err) {
            errors.push(`${item}: ${err.message}`);
          }
        }
      }
    };

    // 开始上传
    await uploadDir(skillDir, skillBasePath);

    // 构建返回 URL
    const urlPath = this.basePath ? `${this.basePath}/${skillBasePath}` : skillBasePath;

    // 如果有错误，抛出异常让调用方知道
    if (errors.length > 0) {
      console.error('[GitHub Channel] Upload errors:', errors);
      throw new Error(`上传失败: ${errors.join('; ')}`);
    }

    return {
      success: true,
      url: `https://github.com/${this.owner}/${this.repo}/tree/${this.branch}/${urlPath}`,
      dirName: skillBasePath,
      files: uploadedFiles
    };
  }

  /**
   * 从 GitHub 下架技能
   */
  async unpublish(skill) {
    if (!this.owner || !this.repo || !this.token) {
      return { success: true, message: '配置不完整，跳过远程删除' };
    }

    const skillBasePath = getSkillDirName(skill);
    const deletedFiles = [];
    const errors = [];

    // 获取所有文件
    const files = await this.listFiles(skillBasePath);

    // 删除所有文件
    for (const file of files) {
      try {
        await this.deleteFile(file.path, file.sha);
        deletedFiles.push(file.path);
      } catch (err) {
        errors.push(`${file.path}: ${err.message}`);
      }
    }

    return {
      success: true,
      deletedFiles,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    if (!this.token) {
      return { healthy: false, error: 'GitHub Token 未配置' };
    }
    if (!this.owner || !this.repo) {
      return { healthy: false, error: 'GitHub 仓库信息未配置' };
    }

    try {
      // 尝试获取仓库信息
      const url = `${this.apiBase}/repos/${this.owner}/${this.repo}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        return {
          healthy: true,
          repo: `${this.owner}/${this.repo}`,
          branch: this.branch,
          defaultBranch: data.default_branch,
          private: data.private
        };
      } else if (response.status === 404) {
        return { healthy: false, error: '仓库不存在或无访问权限' };
      } else if (response.status === 401) {
        return { healthy: false, error: 'Token 无效或已过期' };
      } else {
        const error = await response.json();
        return { healthy: false, error: error.message || `HTTP ${response.status}` };
      }
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  }
}

module.exports = GitHubChannel;
