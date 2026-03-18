const express = require('express');
const db = require('../db');
const { getRegisteredTypes, createChannel } = require('../channels');

const router = express.Router();

// 获取所有渠道
router.get('/', (req, res) => {
  const channels = db.listChannels();
  res.json({ data: channels, registeredTypes: getRegisteredTypes() });
});

// 创建渠道
router.post('/', (req, res) => {
  const { name, type, config, enabled } = req.body;
  if (!name || !type) return res.status(400).json({ error: '名称和类型不能为空' });

  const registered = getRegisteredTypes();
  if (!registered.includes(type)) {
    return res.status(400).json({ error: `不支持的渠道类型: ${type}，可用: ${registered.join(', ')}` });
  }

  // local 渠道必须配置 outputDir
  if (type === 'local' && (!config || !config.outputDir)) {
    return res.status(400).json({ error: 'local 渠道必须配置 outputDir 属性' });
  }

  // remote 渠道必须配置 url
  if (type === 'remote' && (!config || !config.url)) {
    return res.status(400).json({ error: 'remote 渠道必须配置 url 属性' });
  }

  const channel = db.createChannel({
    name,
    type,
    config: config || {},
    enabled: enabled ?? false
  });

  res.status(201).json({ data: channel });
});

// 更新渠道
router.put('/:id', (req, res) => {
  const ch = db.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: '渠道不存在' });

  const { name, config, enabled, isDefault } = req.body;
  const newConfig = config || ch.config;

  // local 渠道必须配置 outputDir
  if (ch.type === 'local' && !newConfig.outputDir) {
    return res.status(400).json({ error: 'local 渠道必须配置 outputDir 属性' });
  }

  const updateData = {
    name: name || ch.name,
    config: newConfig,
    enabled: enabled ?? ch.enabled
  };

  if (isDefault !== undefined) {
    updateData.isDefault = isDefault;
  }

  const updated = db.updateChannel(req.params.id, updateData);

  res.json({ data: updated });
});

// 测试渠道连接
router.post('/:id/test', async (req, res) => {
  try {
    const ch = db.getChannel(req.params.id);
    if (!ch) return res.status(404).json({ error: '渠道不存在' });

    const publisher = createChannel(ch.type, ch.config);
    const result = await publisher.healthCheck();
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除渠道
router.delete('/:id', (req, res) => {
  const channels = db.listChannels();
  if (channels.length <= 1) {
    return res.status(400).json({ error: '至少需要保留一个渠道' });
  }

  const ch = db.getChannel(req.params.id);
  if (!ch) {
    return res.status(404).json({ error: '渠道不存在' });
  }

  if (ch.enabled) {
    return res.status(400).json({ error: '启用的渠道不能删除，请先禁用' });
  }

  const deleted = db.deleteChannel(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: '渠道不存在' });
  }

  res.json({ data: { id: req.params.id } });
});

module.exports = router;
