const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const skillsDir = path.join(__dirname, '..', 'skills');
const channelsFile = path.join(__dirname, '..', 'data', 'channels.json');

// Ensure directories exist
if (!fs.existsSync(skillsDir)) {
  fs.mkdirSync(skillsDir, { recursive: true });
}
if (!fs.existsSync(path.dirname(channelsFile))) {
  fs.mkdirSync(path.dirname(channelsFile), { recursive: true });
}

// Helper: get skill directory
function getSkillDir(id) {
  return path.join(skillsDir, id);
}

// Helper: read metadata.json (only id, version, category, status, timestamps)
function readMetadata(skillDir) {
  const metaPath = path.join(skillDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

// Helper: write metadata.json
function writeMetadata(skillDir, metadata) {
  const metaPath = path.join(skillDir, 'metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

// Helper: parse YAML frontmatter from content
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: match[2] };
}

// Helper: generate YAML frontmatter
function generateFrontmatter(name, description) {
  const escapeYaml = (str) => {
    if (!str) return '';
    if (str.includes('\n') || str.includes(':') || str.includes('"')) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  };
  return `---\nname: ${escapeYaml(name)}\ndescription: ${escapeYaml(description)}\n---\n`;
}

// Helper: read SKILL.md and extract name, description, content
function readSkillFile(skillDir) {
  const skillPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return { name: '', description: '', content: '' };
  }
  const raw = fs.readFileSync(skillPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    name: frontmatter.name || '',
    description: frontmatter.description || '',
    content: body
  };
}

// Helper: write SKILL.md with frontmatter
function writeSkillFile(skillDir, name, description, content) {
  const skillPath = path.join(skillDir, 'SKILL.md');
  const frontmatter = generateFrontmatter(name, description);
  fs.writeFileSync(skillPath, frontmatter + (content || ''), 'utf-8');
}

// Helper: get raw SKILL.md content (with frontmatter)
function getRawSkillFile(skillDir) {
  const skillPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return '';
  return fs.readFileSync(skillPath, 'utf-8');
}

// Helper: get full skill data
function getSkillData(skillDir) {
  const metadata = readMetadata(skillDir);
  if (!metadata) return null;

  const skill = readSkillFile(skillDir);
  return {
    ...metadata,
    name: skill.name || metadata.name || '',
    description: skill.description || metadata.description || '',
    skill_content: skill.content
  };
}

// Helper: load channels
function loadChannels() {
  if (!fs.existsSync(channelsFile)) {
    const defaultChannel = {
      id: uuidv4(),
      name: '本地发布',
      type: 'local',
      config: { outputDir: './published_skills' },
      enabled: true,
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(channelsFile, JSON.stringify([defaultChannel], null, 2), 'utf-8');
    return [defaultChannel];
  }
  return JSON.parse(fs.readFileSync(channelsFile, 'utf-8'));
}

// Helper: save channels
function saveChannels(channels) {
  fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2), 'utf-8');
}

// 系统保留目录名
const RESERVED_DIRS = ['scripts', 'references', 'assets'];

// 检查目录名是否有效
function isValidCustomDirName(name) {
  if (!name || typeof name !== 'string') return false;
  // 不能是保留目录名
  if (RESERVED_DIRS.includes(name.toLowerCase())) return false;
  // 只允许字母、数字、下划线、中划线
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return false;
  return true;
}

// 获取自定义目录配置文件路径
function getCustomDirsConfigPath(skillId) {
  return path.join(getSkillDir(skillId), 'custom_dirs.json');
}

// 读取自定义目录配置
function readCustomDirsConfig(skillId) {
  const configPath = getCustomDirsConfigPath(skillId);
  if (!fs.existsSync(configPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return [];
  }
}

// 保存自定义目录配置
function saveCustomDirsConfig(skillId, dirs) {
  const configPath = getCustomDirsConfigPath(skillId);
  fs.writeFileSync(configPath, JSON.stringify(dirs, null, 2), 'utf-8');
}

// 检查目录路径是否与已有目录冲突
function checkDirPathConflict(skillId, dirPath, excludeId = null) {
  const dirs = readCustomDirsConfig(skillId);
  for (const dir of dirs) {
    if (excludeId && dir.id === excludeId) continue;
    // 冲突条件：
    // 1. 相同路径
    // 2. 新路径是已有路径的父目录（会导致嵌套冲突）
    // 注意：新路径作为已有路径的子目录是允许的
    if (dir.path === dirPath || dir.path.startsWith(dirPath + '/')) {
      return dir;
    }
  }
  return null;
}

// Database-like API
const db = {
  // Skills
  listSkills({ status, category, keyword }) {
    const skillDirs = fs.readdirSync(skillsDir).filter(f => {
      const stat = fs.statSync(path.join(skillsDir, f));
      return stat.isDirectory() && fs.existsSync(path.join(skillsDir, f, 'metadata.json'));
    });

    let skills = skillDirs.map(dir => getSkillData(path.join(skillsDir, dir))).filter(Boolean);

    if (status) skills = skills.filter(s => s.status === status);
    if (category) skills = skills.filter(s => s.category === category);
    if (keyword) {
      const kw = keyword.toLowerCase();
      skills = skills.filter(s =>
        s.name.toLowerCase().includes(kw) ||
        (s.description && s.description.toLowerCase().includes(kw))
      );
    }

    skills.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return skills;
  },

  getSkill(id) {
    const skillDir = getSkillDir(id);
    if (!fs.existsSync(skillDir)) return null;
    return getSkillData(skillDir);
  },

  findSkillByName(name, excludeId) {
    const skills = this.listSkills({});
    return skills.find(s => s.name === name && s.id !== excludeId);
  },

  getRawSkillFile(id) {
    const skillDir = getSkillDir(id);
    if (!fs.existsSync(skillDir)) return null;
    return getRawSkillFile(skillDir);
  },

  createSkill(data) {
    const id = data.id || uuidv4();
    const skillDir = getSkillDir(id);

    // Create directory structure
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'assets'), { recursive: true });

    const now = new Date().toISOString();
    const metadata = {
      id,
      version: data.version || '1.0.0',
      category: data.category || '',
      status: 'draft',
      created_at: now,
      updated_at: now
    };

    writeMetadata(skillDir, metadata);
    writeSkillFile(skillDir, data.name || '', data.description || '', data.skill_content || '');

    return getSkillData(skillDir);
  },

  updateSkill(id, data) {
    const skillDir = getSkillDir(id);
    if (!fs.existsSync(skillDir)) return null;

    const metadata = readMetadata(skillDir);
    if (!metadata) return null;

    // Read existing skill file
    const skill = readSkillFile(skillDir);

    // Update metadata
    if (data.version !== undefined) metadata.version = data.version;
    if (data.category !== undefined) metadata.category = data.category;
    if (data.status !== undefined) metadata.status = data.status;
    metadata.updated_at = new Date().toISOString();
    writeMetadata(skillDir, metadata);

    // Update SKILL.md if name/description/content changed
    const newName = data.name !== undefined ? data.name : skill.name;
    const newDesc = data.description !== undefined ? data.description : skill.description;
    const newContent = data.skill_content !== undefined ? data.skill_content : skill.content;
    writeSkillFile(skillDir, newName, newDesc, newContent);

    return getSkillData(skillDir);
  },

  deleteSkill(id) {
    const skillDir = getSkillDir(id);
    if (!fs.existsSync(skillDir)) return false;

    // Delete publish records
    const recordsFile = path.join(__dirname, '..', 'data', 'publish_records.json');
    if (fs.existsSync(recordsFile)) {
      const records = JSON.parse(fs.readFileSync(recordsFile, 'utf-8'));
      const filtered = records.filter(r => r.skill_id !== id);
      fs.writeFileSync(recordsFile, JSON.stringify(filtered, null, 2), 'utf-8');
    }

    // Recursively delete directory
    fs.rmSync(skillDir, { recursive: true, force: true });
    return true;
  },

  // Assets
  listAssets(skillId) {
    const assetsDir = path.join(getSkillDir(skillId), 'assets');
    if (!fs.existsSync(assetsDir)) return [];

    return fs.readdirSync(assetsDir).map(name => {
      const filePath = path.join(assetsDir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        created_at: stat.birthtime.toISOString()
      };
    });
  },

  saveAsset(skillId, filename, buffer) {
    const assetsDir = path.join(getSkillDir(skillId), 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    const filePath = path.join(assetsDir, path.basename(filename));
    fs.writeFileSync(filePath, buffer);
    return { name: path.basename(filename), size: buffer.length };
  },

  deleteAsset(skillId, filename) {
    const filePath = path.join(getSkillDir(skillId), 'assets', path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  },

  getAssetPath(skillId, filename) {
    return path.join(getSkillDir(skillId), 'assets', path.basename(filename));
  },

  // Generic text files (scripts, references)
  listTextFiles(skillId, subdir) {
    const dir = path.join(getSkillDir(skillId), subdir);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map(name => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        updated_at: stat.mtime.toISOString()
      };
    });
  },

  getTextFile(skillId, subdir, filename) {
    const filePath = path.join(getSkillDir(skillId), subdir, path.basename(filename));
    if (!fs.existsSync(filePath)) return null;
    return {
      name: path.basename(filename),
      content: fs.readFileSync(filePath, 'utf-8')
    };
  },

  saveTextFile(skillId, subdir, filename, content) {
    const dir = path.join(getSkillDir(skillId), subdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, path.basename(filename));
    fs.writeFileSync(filePath, content || '', 'utf-8');
    return { name: path.basename(filename), size: (content || '').length };
  },

  deleteTextFile(skillId, subdir, filename) {
    const filePath = path.join(getSkillDir(skillId), subdir, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  },

  // Channels
  listChannels() {
    return loadChannels();
  },

  getChannel(id) {
    const channels = loadChannels();
    return channels.find(c => c.id === id);
  },

  getChannelByType(type) {
    const channels = loadChannels();
    return channels.find(c => c.type === type);
  },

  getDefaultChannel() {
    const channels = loadChannels();
    // 优先返回启用的默认渠道
    const defaultChannel = channels.find(c => c.isDefault && c.enabled);
    if (defaultChannel) return defaultChannel;
    // 否则返回第一个启用的渠道
    return channels.find(c => c.enabled);
  },

  createChannel(data) {
    const channels = loadChannels();
    const channel = {
      id: uuidv4(),
      name: data.name,
      type: data.type,
      config: data.config || {},
      enabled: data.enabled ?? false,
      isDefault: false,
      created_at: new Date().toISOString()
    };
    channels.push(channel);
    saveChannels(channels);
    return channel;
  },

  updateChannel(id, data) {
    const channels = loadChannels();
    const idx = channels.findIndex(c => c.id === id);
    if (idx === -1) return null;

    // 如果设置为默认渠道，先取消其他渠道的默认状态
    if (data.isDefault) {
      for (let i = 0; i < channels.length; i++) {
        if (channels[i].id !== id) {
          channels[i].isDefault = false;
        }
      }
    }

    channels[idx] = { ...channels[idx], ...data };
    saveChannels(channels);
    return channels[idx];
  },

  deleteChannel(id) {
    const channels = loadChannels();
    const idx = channels.findIndex(c => c.id === id);
    if (idx === -1) return false;
    channels.splice(idx, 1);
    saveChannels(channels);
    return true;
  },

  // Publish Records
  listPublishRecords(skillId) {
    const recordsFile = path.join(__dirname, '..', 'data', 'publish_records.json');
    if (!fs.existsSync(recordsFile)) return [];

    let records = JSON.parse(fs.readFileSync(recordsFile, 'utf-8'));
    if (skillId) {
      records = records.filter(r => r.skill_id === skillId);
    }

    // Attach channel info
    const channels = loadChannels();
    return records.map(r => {
      const channel = channels.find(c => c.id === r.channel_id) || {};
      return {
        ...r,
        channel_name: channel.name || 'Unknown',
        channel_type: channel.type || 'unknown'
      };
    }).sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  },

  createPublishRecord(skillId, channelId) {
    const recordsFile = path.join(__dirname, '..', 'data', 'publish_records.json');
    let records = [];
    if (fs.existsSync(recordsFile)) {
      records = JSON.parse(fs.readFileSync(recordsFile, 'utf-8'));
    }

    const record = {
      id: uuidv4(),
      skill_id: skillId,
      channel_id: channelId,
      status: 'published',
      published_at: new Date().toISOString(),
      unpublished_at: null
    };
    records.push(record);
    fs.writeFileSync(recordsFile, JSON.stringify(records, null, 2), 'utf-8');
    return record;
  },

  unpublishRecords(skillId) {
    const recordsFile = path.join(__dirname, '..', 'data', 'publish_records.json');
    if (!fs.existsSync(recordsFile)) return [];

    let records = JSON.parse(fs.readFileSync(recordsFile, 'utf-8'));
    const updated = records.map(r => {
      if (r.skill_id === skillId && r.status === 'published') {
        return { ...r, status: 'unpublished', unpublished_at: new Date().toISOString() };
      }
      return r;
    });
    fs.writeFileSync(recordsFile, JSON.stringify(updated, null, 2), 'utf-8');

    return records.filter(r => r.skill_id === skillId && r.status === 'unpublished');
  },

  // ========== Custom Directories ==========
  // 获取自定义目录列表
  listCustomDirs(skillId) {
    return readCustomDirsConfig(skillId);
  },

  // 创建自定义目录
  createCustomDir(skillId, data) {
    const { name, parentPath = '' } = data;

    if (!isValidCustomDirName(name)) {
      throw new Error('目录名无效，只能包含字母、数字、下划线、中划线，且不能与系统目录重名');
    }

    // 检查目录层级，最多三级
    const currentLevel = parentPath ? parentPath.split('/').length : 0;
    if (currentLevel >= 3) {
      throw new Error('目录层级最多支持三级');
    }

    const dirPath = parentPath ? `${parentPath}/${name}` : name;

    // 检查路径冲突
    const conflict = checkDirPathConflict(skillId, dirPath);
    if (conflict) {
      throw new Error(`目录路径与已有目录「${conflict.name}」冲突`);
    }

    const dirs = readCustomDirsConfig(skillId);
    const dir = {
      id: uuidv4(),
      name,
      path: dirPath,
      parentPath,
      created_at: new Date().toISOString()
    };
    dirs.push(dir);
    saveCustomDirsConfig(skillId, dirs);

    // 创建物理目录
    const physicalDir = path.join(getSkillDir(skillId), dirPath);
    fs.mkdirSync(physicalDir, { recursive: true });

    return dir;
  },

  // 删除自定义目录（包括子目录和文件）
  deleteCustomDir(skillId, dirId) {
    const dirs = readCustomDirsConfig(skillId);
    const dir = dirs.find(d => d.id === dirId);
    if (!dir) return false;

    // 删除物理目录
    const physicalDir = path.join(getSkillDir(skillId), dir.path);
    if (fs.existsSync(physicalDir)) {
      fs.rmSync(physicalDir, { recursive: true, force: true });
    }

    // 删除配置中的目录及其子目录
    const filtered = dirs.filter(d => {
      // 不是自己，也不是子目录
      return d.id !== dirId && !d.path.startsWith(dir.path + '/');
    });
    saveCustomDirsConfig(skillId, filtered);

    return true;
  },

  // 重命名自定义目录
  renameCustomDir(skillId, dirId, newName) {
    if (!isValidCustomDirName(newName)) {
      throw new Error('目录名无效，只能包含字母、数字、下划线、中划线，且不能与系统目录重名');
    }

    const dirs = readCustomDirsConfig(skillId);
    const dir = dirs.find(d => d.id === dirId);
    if (!dir) return null;

    const oldPath = dir.path;
    const newPath = dir.parentPath ? `${dir.parentPath}/${newName}` : newName;

    // 检查新路径是否冲突
    const conflict = checkDirPathConflict(skillId, newPath, dirId);
    if (conflict) {
      throw new Error(`目录路径与已有目录「${conflict.name}」冲突`);
    }

    // 重命名物理目录
    const oldPhysicalDir = path.join(getSkillDir(skillId), oldPath);
    const newPhysicalDir = path.join(getSkillDir(skillId), newPath);
    if (fs.existsSync(oldPhysicalDir)) {
      // 先创建父目录
      fs.mkdirSync(path.dirname(newPhysicalDir), { recursive: true });
      fs.renameSync(oldPhysicalDir, newPhysicalDir);
    }

    // 更新配置
    const updated = dirs.map(d => {
      if (d.id === dirId) {
        return { ...d, name: newName, path: newPath };
      }
      // 更新子目录路径
      if (d.path.startsWith(oldPath + '/')) {
        return {
          ...d,
          path: d.path.replace(oldPath + '/', newPath + '/'),
          parentPath: d.parentPath.replace(oldPath, newPath)
        };
      }
      return d;
    });
    saveCustomDirsConfig(skillId, updated);

    return updated.find(d => d.id === dirId);
  },

  // 列出自定义目录中的文件（支持递归列出子目录）
  listCustomDirFiles(skillId, dirPath) {
    const dir = path.join(getSkillDir(skillId), dirPath);
    if (!fs.existsSync(dir)) return [];

    const result = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      // 使用正斜杠作为路径分隔符，保持跨平台一致性
      const relativePath = dirPath ? `${dirPath}/${item}` : item;

      if (stat.isDirectory()) {
        // 递归列出子目录
        const subFiles = this.listCustomDirFiles(skillId, relativePath);
        result.push(...subFiles);
      } else {
        result.push({
          name: item,
          path: relativePath,
          size: stat.size,
          isEditable: this.isEditableFile(item),
          updated_at: stat.mtime.toISOString()
        });
      }
    }

    return result;
  },

  // 可编辑的文本文件扩展名
  EDITABLE_EXTENSIONS: [
    // 文档类
    'txt', 'md', 'markdown', 'rst', 'adoc',
    // 代码/脚本
    'py', 'js', 'ts', 'jsx', 'tsx', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
    'rb', 'pl', 'lua', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs',
    'swift', 'kt', 'scala', 'r', 'sql', 'vue', 'svelte',
    // 配置/数据
    'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env', 'cfg', 'conf',
    'properties', 'gitignore', 'dockerignore', 'editorconfig',
    // 样式/标记
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
    // 其他文本
    'log', 'csv', 'tsv'
  ],

  // 检查文件是否可编辑
  isEditableFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return this.EDITABLE_EXTENSIONS.includes(ext);
  },

  // 获取自定义目录中的文件
  getCustomDirFile(skillId, filePath) {
    const fullPath = path.join(getSkillDir(skillId), filePath);
    if (!fs.existsSync(fullPath)) return null;

    // 安全检查：确保路径在 skill 目录内
    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) return null;

    const filename = path.basename(filePath);
    const isEditable = this.isEditableFile(filename);

    const result = {
      name: filename,
      path: filePath,
      size: stat.size,
      isEditable,
      updated_at: stat.mtime.toISOString()
    };

    // 只有可编辑文件才返回内容
    if (isEditable) {
      result.content = fs.readFileSync(fullPath, 'utf-8');
    }

    return result;
  },

  // 保存文件到自定义目录
  saveCustomDirFile(skillId, filePath, content) {
    const fullPath = path.join(getSkillDir(skillId), filePath);

    // 安全检查：确保路径在 skill 目录内
    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    // 创建父目录
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content || '', 'utf-8');

    return {
      name: path.basename(filePath),
      path: filePath,
      size: (content || '').length
    };
  },

  // 删除自定义目录中的文件
  deleteCustomDirFile(skillId, filePath) {
    const fullPath = path.join(getSkillDir(skillId), filePath);

    // 安全检查
    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  },

  // 上传文件到自定义目录
  uploadCustomDirFile(skillId, dirPath, filename, buffer) {
    const safeFilename = path.basename(filename);
    const fullPath = path.join(getSkillDir(skillId), dirPath, safeFilename);

    // 安全检查
    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    // 确保目录存在
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);

    return {
      name: safeFilename,
      path: dirPath ? `${dirPath}/${safeFilename}` : safeFilename,
      size: buffer.length
    };
  },

  // 暴露 parseFrontmatter 供其他模块使用
  parseFrontmatter
};

module.exports = db;
