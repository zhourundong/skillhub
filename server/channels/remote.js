const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const fetch = require('node-fetch');
const BaseChannel = require('./base');

/**
 * 生成安全的 zip 名称：name@version
 */
function getZipName(skill) {
  const safeName = (skill.name || 'unnamed').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  const version = skill.version || '1.0.0';
  return `${safeName}@${version}`;
}

class RemoteChannel extends BaseChannel {
  constructor(config) {
    super(config);
    this.url = config.url;
    this.unpublishUrl = config.unpublishUrl;
    this.healthCheckUrl = config.healthCheckUrl;
    this.headers = config.headers || {};
    this.timeout = config.timeout || 60000; // 默认60秒超时
  }

  async publish(skill) {
    if (!this.url) {
      throw new Error('远程发布渠道未配置 URL');
    }

    const skillDir = path.join(__dirname, '..', '..', 'skills', skill.id);
    if (!fs.existsSync(skillDir)) {
      throw new Error('Skill 目录不存在');
    }

    // 生成 zip 名称
    const zipName = getZipName(skill);

    // 创建 zip 文件
    const zipBuffer = await this._createZip(skillDir, zipName);

    // 发送到远程服务器
    const result = await this._sendToRemote(skill, zipBuffer, zipName);

    return result;
  }

  async _createZip(skillDir, zipDirName) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err) => reject(err));

      // 遍历目录，排除 metadata.json 和 custom_dirs.json
      const excludeFiles = ['metadata.json', 'custom_dirs.json'];
      const files = fs.readdirSync(skillDir);
      for (const file of files) {
        if (excludeFiles.includes(file)) continue;

        const filePath = path.join(skillDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          archive.directory(filePath, path.join(zipDirName, file));
        } else {
          archive.file(filePath, { name: path.join(zipDirName, file) });
        }
      }

      archive.finalize();
    });
  }

  async _sendToRemote(skill, zipBuffer, zipName) {
    const formData = new (require('form-data'))();
    formData.append('skill', zipBuffer, {
      filename: `${zipName}.zip`,
      contentType: 'application/zip'
    });
    formData.append('metadata', JSON.stringify({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      category: skill.category
    }));

    const headers = {
      ...this.headers,
      ...formData.getHeaders()
    };

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: formData,
      timeout: this.timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`远程发布失败 (${response.status}): ${errorText}`);
    }

    const result = await response.json().catch(() => ({}));
    return {
      success: true,
      url: this.url,
      zipName,
      response: result
    };
  }

  async unpublish(skill) {
    // 如果配置了下架 URL，则调用远程接口
    if (this.unpublishUrl) {
      try {
        const zipName = getZipName(skill);
        const formData = new (require('form-data'))();
        formData.append('metadata', JSON.stringify({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          version: skill.version,
          category: skill.category,
          zipName
        }));

        const response = await fetch(this.unpublishUrl, {
          method: 'POST',
          headers: {
            ...this.headers,
            ...formData.getHeaders()
          },
          body: formData,
          timeout: this.timeout
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`远程下架失败 (${response.status}): ${errorText}`);
        }

        return { success: true, skillId: skill.id };
      } catch (err) {
        throw err;
      }
    }

    return { success: true, skillId: skill.id };
  }

  async healthCheck() {
    const checkUrl = this.healthCheckUrl || this.url;

    if (!checkUrl) {
      return { healthy: false, error: 'URL 未配置' };
    }

    try {
      const response = await fetch(checkUrl, {
        method: 'GET',
        headers: this.headers,
        timeout: 10000
      });

      return {
        healthy: response.ok,
        url: checkUrl,
        statusCode: response.status
      };
    } catch (err) {
      let errorMsg = err.message || '连接失败';
      if (err.code) {
        errorMsg = `${err.code}: ${errorMsg}`;
      }
      if (err.type === 'system') {
        errorMsg = `网络错误: ${err.message || '无法连接到服务器'}`;
      }
      return {
        healthy: false,
        url: checkUrl,
        error: errorMsg
      };
    }
  }
}

module.exports = RemoteChannel;
