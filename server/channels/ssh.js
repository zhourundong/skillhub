const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
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
 * SSH/SFTP 发布渠道
 * 将技能通过 SFTP 发布到远程服务器
 */
class SshChannel extends BaseChannel {
  constructor(config) {
    super(config);
    this.host = config.host || '';
    this.port = config.port || 22;
    this.username = config.username || '';
    this.password = config.password || '';
    this.privateKey = config.privateKey || '';
    this.passphrase = config.passphrase || '';
    // 清理 basePath，移除开头/结尾的斜杠
    this.basePath = (config.basePath || '').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  /**
   * 创建 SSH 连接
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const client = new Client();

      const connectConfig = {
        host: this.host,
        port: this.port,
        username: this.username,
        readyTimeout: 30000,
      };

      // 优先使用私钥认证
      if (this.privateKey) {
        // 支持传入文件路径或直接传入私钥内容
        if (this.privateKey.includes('BEGIN') || this.privateKey.startsWith('-----')) {
          connectConfig.privateKey = this.privateKey;
        } else {
          // 当作文件路径读取
          try {
            connectConfig.privateKey = fs.readFileSync(this.privateKey, 'utf8');
          } catch (e) {
            reject(new Error(`无法读取私钥文件: ${this.privateKey}`));
            return;
          }
        }
        if (this.passphrase) {
          connectConfig.passphrase = this.passphrase;
        }
      } else if (this.password) {
        connectConfig.password = this.password;
      } else {
        reject(new Error('SSH 配置错误：需要 password 或 privateKey'));
        return;
      }

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
          } else {
            resolve({ client, sftp });
          }
        });
      });

      client.on('error', (err) => {
        reject(new Error(`SSH 连接失败: ${err.message}`));
      });

      client.connect(connectConfig);
    });
  }

  /**
   * 构建远程路径
   */
  buildPath(filePath) {
    const parts = [];
    if (this.basePath) parts.push(this.basePath);
    if (filePath) parts.push(filePath);
    return '/' + parts
      .join('/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/g, '/');
  }

  /**
   * 确保远程目录存在
   */
  async ensureRemoteDir(sftp, remotePath) {
    return new Promise((resolve, reject) => {
      // 先尝试创建目录
      sftp.mkdir(remotePath, (err) => {
        if (!err) {
          resolve();
          return;
        }
        // 如果目录已存在，忽略错误
        if (err.code === 4 || err.code === 11) { // SSH_FX_FAILURE or SSH_FX_FILE_ALREADY_EXISTS
          resolve();
          return;
        }
        // 如果父目录不存在，递归创建
        if (err.code === 2) { // SSH_FX_NO_SUCH_FILE
          const parentPath = path.dirname(remotePath);
          if (parentPath === '/' || parentPath === remotePath) {
            resolve();
            return;
          }
          this.ensureRemoteDir(sftp, parentPath)
            .then(() => {
              sftp.mkdir(remotePath, (err2) => {
                if (err2 && err2.code !== 4 && err2.code !== 11) {
                  reject(err2);
                } else {
                  resolve();
                }
              });
            })
            .catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * 上传单个文件
   */
  async uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 删除远程文件
   */
  async deleteRemoteFile(sftp, remotePath) {
    return new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err) => {
        if (err && err.code !== 2) { // 忽略文件不存在的错误
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 删除远程目录（递归）
   */
  async deleteRemoteDir(sftp, remotePath) {
    return new Promise((resolve, reject) => {
      // 先尝试删除目录内容
      this.listRemoteDir(sftp, remotePath)
        .then(async (items) => {
          for (const item of items) {
            const itemPath = `${remotePath}/${item.filename}`;
            if (item.longname.startsWith('d')) {
              await this.deleteRemoteDir(sftp, itemPath);
            } else {
              await this.deleteRemoteFile(sftp, itemPath);
            }
          }
          // 删除空目录
          sftp.rmdir(remotePath, (err) => {
            if (err && err.code !== 2) {
              reject(err);
            } else {
              resolve();
            }
          });
        })
        .catch(reject);
    });
  }

  /**
   * 列出远程目录内容
   */
  async listRemoteDir(sftp, remotePath) {
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          if (err.code === 2) { // 目录不存在
            resolve([]);
          } else {
            reject(err);
          }
        } else {
          resolve(list);
        }
      });
    });
  }

  /**
   * 发布技能到远程服务器
   */
  async publish(skill) {
    if (!this.host || !this.username) {
      throw new Error('SSH 渠道配置错误：缺少 host 或 username');
    }
    if (!this.password && !this.privateKey) {
      throw new Error('SSH 渠道配置错误：需要 password 或 privateKey');
    }

    const skillDir = path.join(__dirname, '..', '..', 'skills', skill.id);
    if (!fs.existsSync(skillDir)) {
      throw new Error('Skill 目录不存在');
    }

    const skillBasePath = getSkillDirName(skill);
    const remoteBasePath = this.buildPath(skillBasePath);
    const uploadedFiles = [];
    const errors = [];

    let connection;
    try {
      connection = await this.connect();
      const { client, sftp } = connection;

      // 确保基础目录存在
      await this.ensureRemoteDir(sftp, remoteBasePath);

      // 递归上传所有文件
      const uploadDir = async (localDir, remoteDir) => {
        const items = fs.readdirSync(localDir);

        for (const item of items) {
          const localPath = path.join(localDir, item);
          const stat = fs.statSync(localPath);

          // 排除 metadata.json 和 custom_dirs.json
          if (item === 'metadata.json' || item === 'custom_dirs.json') continue;

          if (stat.isDirectory()) {
            // 创建远程子目录并递归处理
            const subRemotePath = `${remoteDir}/${item}`;
            await this.ensureRemoteDir(sftp, subRemotePath);
            await uploadDir(localPath, subRemotePath);
          } else {
            // 上传文件
            try {
              const remoteFilePath = `${remoteDir}/${item}`;
              await this.uploadFile(sftp, localPath, remoteFilePath);
              uploadedFiles.push(remoteFilePath);
            } catch (err) {
              errors.push(`${item}: ${err.message}`);
            }
          }
        }
      };

      await uploadDir(skillDir, remoteBasePath);

      client.end();

      if (errors.length > 0) {
        console.error('[SSH Channel] Upload errors:', errors);
        throw new Error(`上传失败: ${errors.join('; ')}`);
      }

      return {
        success: true,
        url: `${this.username}@${this.host}:${remoteBasePath}`,
        dirName: skillBasePath,
        files: uploadedFiles
      };
    } catch (err) {
      if (connection && connection.client) {
        connection.client.end();
      }
      throw err;
    }
  }

  /**
   * 从远程服务器下架技能
   */
  async unpublish(skill) {
    if (!this.host || !this.username || (!this.password && !this.privateKey)) {
      return { success: true, message: '配置不完整，跳过远程删除' };
    }

    const skillBasePath = getSkillDirName(skill);
    const remoteBasePath = this.buildPath(skillBasePath);
    const deletedFiles = [];

    let connection;
    try {
      connection = await this.connect();
      const { client, sftp } = connection;

      // 删除整个目录
      await this.deleteRemoteDir(sftp, remoteBasePath);

      client.end();

      return {
        success: true,
        deletedFiles: [remoteBasePath]
      };
    } catch (err) {
      if (connection && connection.client) {
        connection.client.end();
      }
      throw err;
    }
  }

  /**
   * 健康检查 - 测试 SSH 连接
   */
  async healthCheck() {
    if (!this.host || !this.username) {
      return { healthy: false, error: 'SSH 配置不完整：缺少 host 或 username' };
    }
    if (!this.password && !this.privateKey) {
      return { healthy: false, error: 'SSH 配置不完整：需要 password 或 privateKey' };
    }

    let connection;
    try {
      connection = await this.connect();
      const { client, sftp } = connection;

      // 尝试列出基础目录（如果配置了）
      if (this.basePath) {
        const basePath = this.buildPath('');
        await new Promise((resolve, reject) => {
          sftp.stat(basePath, (err) => {
            if (err) {
              reject(new Error(`目标目录不存在或无权限: ${basePath}`));
            } else {
              resolve();
            }
          });
        });
      }

      client.end();

      return {
        healthy: true,
        host: this.host,
        port: this.port,
        username: this.username,
        basePath: this.basePath || '/'
      };
    } catch (err) {
      if (connection && connection.client) {
        connection.client.end();
      }
      return { healthy: false, error: err.message };
    }
  }
}

module.exports = SshChannel;
