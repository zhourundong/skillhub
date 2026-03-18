const express = require('express');
const multer = require('multer');
const path = require('path');
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
  const { name, description, version, category, skill_content } = req.body;

  if (!name) return res.status(400).json({ error: '名称不能为空' });

  const skill = db.createSkill({
    name,
    description: description || '',
    version: version || '1.0.0',
    category: category || '',
    skill_content: skill_content || ''
  });

  res.status(201).json({ data: skill });
});

// 更新 skill
router.put('/:id', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

  const { name, description, version, category, skill_content } = req.body;
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

module.exports = router;
