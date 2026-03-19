const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  preservePath: true,
});

// Helper: decode filename
function decodeFilename(filename) {
  if (!filename) return 'unknown';
  try {
    // Try to decode from latin1 to utf8
    return Buffer.from(filename, 'latin1').toString('utf8');
  } catch {
    return filename;
  }
}

// 获取所有 skills
router.get('/', (req, res) => {
  const { status, category, keyword } = req.query;
  const skills = db.listSkills({ status, category, keyword });
  res.json({ data: skills });
});

// 导入 ZIP 创建 Skill
router.post('/import-zip', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择 ZIP 文件' });

  try {
    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();

    // 查找 SKILL.md 文件
    let skillMdEntry = null;
    let skillMdPath = '';
    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.endsWith('SKILL.md')) {
        skillMdEntry = entry;
        skillMdPath = entry.entryName;
        break;
      }
    }

    if (!skillMdEntry) {
      return res.status(400).json({ error: 'ZIP 文件中未找到 SKILL.md 文件' });
    }

    // 解析 SKILL.md 内容
    const skillMdContent = skillMdEntry.getData().toString('utf-8');
    const { frontmatter, body } = db.parseFrontmatter(skillMdContent);

    if (!frontmatter.name || !frontmatter.description) {
      return res.status(400).json({ error: 'SKILL.md 的 YAML 头必须包含 name 和 description 字段' });
    }

    // 检查名称是否重复
    const existing = db.findSkillByName(frontmatter.name);
    if (existing) {
      return res.status(400).json({ error: `技能名称「${frontmatter.name}」已存在` });
    }

    // 创建 Skill
    const skill = db.createSkill({
      name: frontmatter.name,
      description: frontmatter.description || '',
      category: frontmatter.category || '',
      skill_content: body
    });

    const skillId = skill.id;
    const skillDir = path.join(__dirname, '..', '..', 'skills', skillId);

    // 获取 ZIP 中 SKILL.md 所在的目录前缀
    const basePath = skillMdPath.includes('/')
      ? skillMdPath.substring(0, skillMdPath.lastIndexOf('/'))
      : '';

    console.log('[Import ZIP] basePath:', basePath);

    // 收集所有目录路径
    const allDirs = new Set();

    // 解压其他文件
    const importedFiles = [];
    for (const entry of zipEntries) {
      if (entry.isDirectory) {
        // 记录目录
        let dirPath = entry.entryName;
        if (basePath && dirPath.startsWith(basePath + '/')) {
          dirPath = dirPath.substring(basePath.length + 1);
        }
        if (dirPath && dirPath.includes('/')) {
          allDirs.add(dirPath.replace(/\/$/, '')); // 移除末尾斜杠
        }
        continue;
      }
      if (entry.entryName === skillMdPath) continue; // SKILL.md 已经处理过

      // 计算相对路径
      let relativePath = entry.entryName;
      if (basePath && relativePath.startsWith(basePath + '/')) {
        relativePath = relativePath.substring(basePath.length + 1);
      }

      // 跳过根目录文件和特定文件
      if (!relativePath.includes('/')) continue;
      if (relativePath === 'metadata.json' || relativePath === 'custom_dirs.json') continue;

      const fullPath = path.join(skillDir, relativePath);

      // 安全检查
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(skillDir)) continue;

      // 创建父目录并写入文件
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const content = entry.getData();
      fs.writeFileSync(fullPath, content);

      importedFiles.push(relativePath);

      // 从文件路径提取目录结构
      const parts = relativePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join('/');
        allDirs.add(dirPath);
      }
    }

    console.log('[Import ZIP] All dirs:', [...allDirs]);

    // 识别自定义目录（非 scripts/references/assets）
    const reservedDirs = ['scripts', 'references', 'assets'];

    const customDirsConfig = [];
    for (const dirPath of allDirs) {
      const parts = dirPath.split('/');
      const topDir = parts[0];

      // 跳过保留目录
      if (reservedDirs.includes(topDir)) continue;

      // 跳过超过三级的目录
      if (parts.length > 3) continue;

      // 检查是否已存在
      if (customDirsConfig.find(d => d.path === dirPath)) continue;

      customDirsConfig.push({
        id: uuidv4(),
        name: parts[parts.length - 1], // 当前层级目录名
        path: dirPath,
        parentPath: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
        created_at: new Date().toISOString()
      });
    }

    console.log('[Import ZIP] Custom dirs config:', customDirsConfig);

    // 保存 custom_dirs.json
    if (customDirsConfig.length > 0) {
      const customDirsPath = path.join(skillDir, 'custom_dirs.json');
      fs.writeFileSync(customDirsPath, JSON.stringify(customDirsConfig, null, 2), 'utf-8');
      console.log('[Import ZIP] Saved custom_dirs.json:', customDirsPath);
    }

    res.status(201).json({
      data: {
        skill,
        importedFiles,
        totalFiles: importedFiles.length,
        customDirs: customDirsConfig.map(d => d.path)
      }
    });
  } catch (err) {
    console.error('Import ZIP error:', err);
    res.status(400).json({ error: 'ZIP 文件解析失败: ' + err.message });
  }
});

// 获取单个 skill
router.get('/:id', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });
  res.json({ data: skill });
});

// 获取原始 SKILL.md 内容
router.get('/:id/raw', (req, res) => {
  const content = db.getRawSkillFile(req.params.id);
  if (content === null) return res.status(404).json({ error: 'Skill 不存在' });
  res.type('text/plain').send(content);
});

// 创建 skill
router.post('/', (req, res) => {
  const { name, description, version, category, skill_content, scripts, references, assets } = req.body;

  if (!name) return res.status(400).json({ error: '名称不能为空' });

  // 检查名称是否重复
  const existing = db.findSkillByName(name);
  if (existing) {
    return res.status(400).json({ error: `技能名称「${name}」已存在` });
  }

  const skill = db.createSkill({
    name,
    description: description || '',
    version: version || '1.0.0',
    category: category || '',
    skill_content: skill_content || ''
  });

  // 保存辅助文件
  const skillId = skill.id;

  // 保存 scripts
  if (Array.isArray(scripts) && scripts.length > 0) {
    for (const file of scripts) {
      if (file.filename && file.content) {
        db.saveTextFile(skillId, 'scripts', file.filename, file.content);
      }
    }
  }

  // 保存 references
  if (Array.isArray(references) && references.length > 0) {
    for (const file of references) {
      if (file.filename && file.content) {
        db.saveTextFile(skillId, 'references', file.filename, file.content);
      }
    }
  }

  // 保存 assets（文本文件）
  if (Array.isArray(assets) && assets.length > 0) {
    for (const file of assets) {
      if (file.filename && file.content) {
        // 尝试作为文本文件保存
        try {
          db.saveTextFile(skillId, 'assets', file.filename, file.content);
        } catch (e) {
          // 如果是二进制内容，用 Buffer 保存
          db.saveAsset(skillId, file.filename, Buffer.from(file.content, 'utf-8'));
        }
      }
    }
  }

  res.status(201).json({ data: skill });
});

// 更新 skill
router.put('/:id', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const { name, description, version, category, skill_content } = req.body;

  // 检查名称是否重复（排除自身）
  if (name && name !== skill.name) {
    const existing = db.findSkillByName(name, req.params.id);
    if (existing) {
      return res.status(400).json({ error: `技能名称「${name}」已存在` });
    }
  }

  const updated = db.updateSkill(req.params.id, {
    name,
    description,
    version,
    category,
    skill_content
  });

  res.json({ data: updated });
});

// 删除 skill
router.delete('/:id', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  db.deleteSkill(req.params.id);
  res.json({ message: '删除成功' });
});

// 下载 skill zip 包
router.get('/:id/download', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const skillDir = path.join(__dirname, '..', '..', 'skills', req.params.id);
  if (!fs.existsSync(skillDir)) {
    return res.status(404).json({ error: 'Skill 目录不存在' });
  }

  // 清理文件名中的特殊字符
  const safeName = (skill.name || req.params.id).replace(/[<>:"/\\|?*\s]/g, '-');
  const zipName = `${safeName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    res.status(500).json({ error: '打包失败' });
  });

  archive.pipe(res);

  // 排除的文件列表
  const excludeFiles = ['metadata.json', 'custom_dirs.json'];

  // 递归添加目录内容
  const addDirectory = (dirPath, zipPath) => {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // 检查目录是否为空
        const subItems = fs.readdirSync(fullPath);
        if (subItems.length === 0) continue;
        addDirectory(fullPath, zipPath ? `${zipPath}/${item}` : item);
      } else {
        // 排除特定文件
        if (excludeFiles.includes(item)) continue;
        archive.file(fullPath, { name: zipPath ? `${zipPath}/${item}` : item });
      }
    }
  };

  addDirectory(skillDir, '');

  archive.finalize();
});

// 获取 assets 列表
router.get('/:id/assets', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const assets = db.listAssets(req.params.id);
  res.json({ data: assets });
});

// 上传 asset
router.post('/:id/assets', upload.single('file'), (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  if (!req.file) return res.status(400).json({ error: '请选择文件' });

  const filename = decodeFilename(req.file.originalname);
  const asset = db.saveAsset(req.params.id, filename, req.file.buffer);
  res.status(201).json({ data: asset });
});

// 删除 asset
router.delete('/:id/assets/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const deleted = db.deleteAsset(req.params.id, req.params.filename);
  if (!deleted) return res.status(404).json({ error: '文件不存在' });

  res.json({ message: '删除成功' });
});

// 下载 asset
router.get('/:id/assets/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const filePath = db.getAssetPath(req.params.id, req.params.filename);
  if (!filePath) return res.status(404).json({ error: '文件不存在' });

  res.download(filePath);
});

// ========== Scripts ==========
// 获取 scripts 列表
router.get('/:id/scripts', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });
  res.json({ data: db.listTextFiles(req.params.id, 'scripts') });
});

// 获取单个 script
router.get('/:id/scripts/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const file = db.getTextFile(req.params.id, 'scripts', req.params.filename);
  if (!file) return res.status(404).json({ error: '文件不存在' });
  res.json({ data: file });
});

// 创建/更新 script
router.put('/:id/scripts/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: '内容不能为空' });

  const file = db.saveTextFile(req.params.id, 'scripts', req.params.filename, content);
  res.json({ data: file });
});

// 删除 script
router.delete('/:id/scripts/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const deleted = db.deleteTextFile(req.params.id, 'scripts', req.params.filename);
  if (!deleted) return res.status(404).json({ error: '文件不存在' });
  res.json({ message: '删除成功' });
});

// ========== References ==========
// 获取 references 列表
router.get('/:id/references', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });
  res.json({ data: db.listTextFiles(req.params.id, 'references') });
});

// 获取单个 reference
router.get('/:id/references/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const file = db.getTextFile(req.params.id, 'references', req.params.filename);
  if (!file) return res.status(404).json({ error: '文件不存在' });
  res.json({ data: file });
});

// 创建/更新 reference
router.put('/:id/references/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: '内容不能为空' });

  const file = db.saveTextFile(req.params.id, 'references', req.params.filename, content);
  res.json({ data: file });
});

// 删除 reference
router.delete('/:id/references/:filename', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const deleted = db.deleteTextFile(req.params.id, 'references', req.params.filename);
  if (!deleted) return res.status(404).json({ error: '文件不存在' });
  res.json({ message: '删除成功' });
});

// ========== Custom Directories ==========
// 获取自定义目录列表
router.get('/:id/custom-dirs', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const dirs = db.listCustomDirs(req.params.id);
  res.json({ data: dirs });
});

// 创建自定义目录
router.post('/:id/custom-dirs', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  try {
    const dir = db.createCustomDir(req.params.id, req.body);
    res.status(201).json({ data: dir });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 重命名自定义目录
router.put('/:id/custom-dirs/:dirId', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  try {
    const dir = db.renameCustomDir(req.params.id, req.params.dirId, req.body.name);
    if (!dir) return res.status(404).json({ error: '目录不存在' });
    res.json({ data: dir });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 删除自定义目录
router.delete('/:id/custom-dirs/:dirId', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const deleted = db.deleteCustomDir(req.params.id, req.params.dirId);
  if (!deleted) return res.status(404).json({ error: '目录不存在' });
  res.json({ message: '删除成功' });
});

// 获取自定义目录中的文件列表
router.get('/:id/custom-dirs/:dirPath(*)/files', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const files = db.listCustomDirFiles(req.params.id, req.params.dirPath);
  res.json({ data: files });
});

// 获取自定义目录中的文件
router.get('/:id/custom-files/:filePath(*)', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const skillDir = path.join(__dirname, '..', '..', 'skills', req.params.id);
  const filePath = path.join(skillDir, req.params.filePath);

  // 安全检查
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(skillDir)) {
    return res.status(400).json({ error: '非法路径' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return res.status(400).json({ error: '不能下载目录' });
  }

  const filename = path.basename(req.params.filePath);
  const isEditable = db.isEditableFile(filename);

  // 如果是可编辑文件且没有 download 参数，返回 JSON
  if (isEditable && !req.query.download) {
    try {
      const file = db.getCustomDirFile(req.params.id, req.params.filePath);
      return res.json({ data: file });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // 否则返回文件下载
  res.download(filePath);
});

// 创建/更新自定义目录中的文件
router.put('/:id/custom-files/:filePath(*)', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: '内容不能为空' });

  try {
    const file = db.saveCustomDirFile(req.params.id, req.params.filePath, content);
    res.json({ data: file });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 删除自定义目录中的文件
router.delete('/:id/custom-files/:filePath(*)', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  try {
    const deleted = db.deleteCustomDirFile(req.params.id, req.params.filePath);
    if (!deleted) return res.status(404).json({ error: '文件不存在' });
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 上传文件到自定义目录
router.post('/:id/custom-dirs/:dirPath(*)/upload', upload.single('file'), (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  if (!req.file) return res.status(400).json({ error: '请选择文件' });

  try {
    const filename = decodeFilename(req.file.originalname);
    const file = db.uploadCustomDirFile(req.params.id, req.params.dirPath, filename, req.file.buffer);
    res.status(201).json({ data: file });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
