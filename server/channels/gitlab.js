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
 * URL 编码项目路径（支持 project ID 或 owner/repo 格式）
 */
function encodeProjectId(projectId) {
  // 如果是纯数字，直接返回（project ID）
  if (/^\d+$/.test(projectId)) {
    return projectId;
  }
  // 否则作为路径编码（owner/repo -> owner%2Frepo）
  return encodeURIComponent(projectId);
}

/**
 * GitLab 发布渠道
 * 将技能发布到指定的 GitLab 仓库和分支
 * 支持自托管 GitLab 实例
 */
class GitLabChannel extends BaseChannel {
  constructor(config) {
    super(config);
    // 支持 GitLab 实例 URL（自托管）
    this.gitlabUrl = (config.gitlabUrl || 'https://git.kingdee.com').replace(/\/+$/, '');
    // 项目 ID 或 URL-encoded path (owner/repo)
    this.projectId = config.projectId || '';
    this.branch = config.branch || 'main';
    this.token = config.token || '';
    // 清理 basePath，移除开头/结尾的斜杠
    this.basePath = (config.basePath || '').replace(/^\/+/, '').replace(/\/+$/, '');

    // API 基础路径
    this.apiBase = `${this.gitlabUrl}/api/v4`;
  }

  /**
   * 获取 API 请求头
   */
  getHeaders() {
    return {
      'PRIVATE-TOKEN': this.token,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 构建完整的 GitLab 文件路径（URL 编码）
   */
  buildFilePath(filePath) {
    const parts = [];
    if (this.basePath) parts.push(this.basePath);
    if (filePath) parts.push(filePath);
    const fullPath = parts
      .join('/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/g, '/');
    return encodeURIComponent(fullPath);
  }

  /**
   * 获取文件信息（用于检查文件是否存在和获取 blob_id）
   */
  async getFileInfo(filePath) {
    const encodedPath = this.buildFilePath(filePath);
    const encodedProjectId = encodeProjectId(this.projectId);
    const url = `${this.apiBase}/projects/${encodedProjectId}/repository/files/${encodedPath}?ref=${encodeURIComponent(this.branch)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        return {
          exists: true,
          blobId: data.blob_id,
          sha: data.sha256 || data.blob_id
        };
      }
    } catch (err) {
      // 文件不存在
    }
    return { exists: false };
  }

  /**
   * 上传单个文件到 GitLab
   */
  async uploadFile(filePath, content, isBinary = false) {
    const encodedPath = this.buildFilePath(filePath);
    const encodedProjectId = encodeProjectId(this.projectId);
    const fileInfo = await this.getFileInfo(filePath);

    // 编码内容
    const encodedContent = isBinary
      ? content.toString('base64')
      : Buffer.from(content).toString('base64');

    const body = {
      branch: this.branch,
      content: encodedContent,
      commit_message: `Update ${filePath}`,
      encoding: 'base64'
    };

    // 如果文件存在，使用 PUT 更新；否则使用 POST 创建
    const method = fileInfo.exists ? 'PUT' : 'POST';
    const url = `${this.apiBase}/projects/${encodedProjectId}/repository/files/${encodedPath}`;

    const response = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitLab API 错误 (${response.status}): ${error.message || JSON.stringify(error)}`);
    }

    return response.json();
  }

  /**
   * 删除 GitLab 上的文件
   */
  async deleteFile(filePath) {
    const encodedPath = this.buildFilePath(filePath);
    const encodedProjectId = encodeProjectId(this.projectId);
    const fileInfo = await this.getFileInfo(filePath);

    if (!fileInfo.exists) return; // 文件不存在

    const url = `${this.apiBase}/projects/${encodedProjectId}/repository/files/${encodedPath}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({
        branch: this.branch,
        commit_message: `Delete ${filePath}`
      })
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.json();
      throw new Error(`GitLab API 错误 (${response.status}): ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * 获取仓库中目录下的所有文件
   */
  async listFiles(dirPath = '') {
    const parts = [];
    if (this.basePath) parts.push(this.basePath);
    if (dirPath) parts.push(dirPath);
    const fullPath = parts.join('/').replace(/\/+$/, '');

    const encodedProjectId = encodeProjectId(this.projectId);
    const url = `${this.apiBase}/projects/${encodedProjectId}/repository/tree?path=${encodeURIComponent(fullPath)}&ref=${encodeURIComponent(this.branch)}&per_page=1000`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        const files = [];

        for (const item of data) {
          if (item.type === 'blob') {
            files.push({
              path: dirPath ? `${dirPath}/${item.name}` : item.name,
              id: item.id
            });
          } else if (item.type === 'tree') {
            // 递归获取子目录文件
            const subDir = dirPath ? `${dirPath}/${item.name}` : item.name;
            const subFiles = await this.listFiles(subDir);
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
   * 发布技能到 GitLab
   */
  async publish(skill) {
    if (!this.projectId) {
      throw new Error('GitLab 渠道配置错误：缺少 projectId');
    }
    if (!this.token) {
      throw new Error('GitLab 渠道配置错误：缺少 token');
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
      console.error('[GitLab Channel] Upload errors:', errors);
      throw new Error(`上传失败: ${errors.join('; ')}`);
    }

    return {
      success: true,
      url: `${this.gitlabUrl}/${this.projectId}/-/tree/${this.branch}/${urlPath}`,
      dirName: skillBasePath,
      files: uploadedFiles
    };
  }

  /**
   * 从 GitLab 下架技能
   */
  async unpublish(skill) {
    if (!this.projectId || !this.token) {
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
        await this.deleteFile(file.path);
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
      return { healthy: false, error: 'GitLab Token 未配置' };
    }
    if (!this.projectId) {
      return { healthy: false, error: 'GitLab 项目信息未配置' };
    }

    try {
      // 尝试获取项目信息
      const encodedProjectId = encodeProjectId(this.projectId);
      const url = `${this.apiBase}/projects/${encodedProjectId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        return {
          healthy: true,
          projectId: this.projectId,
          projectName: data.name,
          branch: this.branch,
          defaultBranch: data.default_branch,
          webUrl: data.web_url
        };
      } else if (response.status === 404) {
        return { healthy: false, error: '项目不存在或无访问权限' };
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

module.exports = GitLabChannel;
