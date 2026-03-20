const express = require('express');
const db = require('../db');
const { getRegisteredTypes, createChannel } = require('../channels');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All channel routes require authentication
router.use(authenticateToken);

// Helper: check if user can access channel
function canAccessChannel(user, channel) {
  if (!user || !channel) return false;
  // Admin can access all channels
  if (user.role === 'admin') return true;
  // Regular user can only access their own channels
  return channel.created_by === user.id;
}

// 获取渠道列表
router.get('/', async (req, res) => {
  try {
    const { user } = req;
    const isAdmin = user.role === 'admin';
    const channels = await db.listChannels(user.id, isAdmin);

    // 对非自己的渠道，整个 config 脱敏
    const maskedChannels = channels.map(ch => ({
      ...ch,
      config: ch.created_by === user.id ? ch.config : null
    }));

    res.json({ data: maskedChannels, registeredTypes: getRegisteredTypes() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建渠道
router.post('/', async (req, res) => {
  try {
    const { name, type, config, enabled } = req.body;
    if (!name || !type) return res.status(400).json({ error: '名称和类型不能为空' });

    // 检查名称是否重复
    const existingChannel = await db.getChannelByName(name);
    if (existingChannel) {
      return res.status(400).json({ error: '渠道名称已存在' });
    }

    const registered = getRegisteredTypes();
    if (!registered.includes(type)) {
      return res.status(400).json({ error: `不支持的渠道类型: ${type}，可用: ${registered.join(', ')}` });
    }

    // 普通用户禁止创建 local 渠道
    const isAdmin = req.user.role === 'admin';
    if (type === 'local' && !isAdmin) {
      return res.status(403).json({ error: '普通用户不能创建本地目录渠道' });
    }

    // local 渠道必须配置 outputDir
    if (type === 'local' && (!config || !config.outputDir)) {
      return res.status(400).json({ error: 'local 渠道必须配置 outputDir 属性' });
    }

    // remote 渠道必须配置 url
    if (type === 'remote' && (!config || !config.url)) {
      return res.status(400).json({ error: 'remote 渠道必须配置 url 属性' });
    }

    // github 渠道必须配置 owner, repo, token
    if (type === 'github') {
      if (!config) {
        return res.status(400).json({ error: 'github 渠道必须配置' });
      }
      // 支持 repoUrl 自动解析
      if (config.repoUrl && (!config.owner || !config.repo)) {
        const match = config.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          config.owner = match[1];
          config.repo = match[2].replace(/\.git$/, '');
        }
      }
      if (!config.owner || !config.repo) {
        return res.status(400).json({ error: 'github 渠道必须配置 owner 和 repo（或 repoUrl）' });
      }
      if (!config.token) {
        return res.status(400).json({ error: 'github 渠道必须配置 token' });
      }
    }

    const channel = await db.createChannel({
      name,
      type,
      config: config || {},
      enabled: enabled ?? false
    }, req.user.id);

    res.status(201).json({ data: channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新渠道
router.put('/:id', async (req, res) => {
  try {
    const ch = await db.getChannel(req.params.id);
    if (!ch) return res.status(404).json({ error: '渠道不存在' });

    // Check permission
    if (!canAccessChannel(req.user, ch)) {
      return res.status(403).json({ error: '没有权限操作此渠道' });
    }

    const { name, config, enabled, isDefault } = req.body;
    const newConfig = config || ch.config;

    // 如果修改了名称，检查是否重复
    if (name && name !== ch.name) {
      const existingChannel = await db.getChannelByName(name);
      if (existingChannel) {
        return res.status(400).json({ error: '渠道名称已存在' });
      }
    }

    // local 渠道必须配置 outputDir
    if (ch.type === 'local' && !newConfig.outputDir) {
      return res.status(400).json({ error: 'local 渠道必须配置 outputDir 属性' });
    }

    // github 渠道验证
    if (ch.type === 'github') {
      // 支持 repoUrl 自动解析
      if (newConfig.repoUrl && (!newConfig.owner || !newConfig.repo)) {
        const match = newConfig.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          newConfig.owner = match[1];
          newConfig.repo = match[2].replace(/\.git$/, '');
        }
      }
      if (!newConfig.owner || !newConfig.repo) {
        return res.status(400).json({ error: 'github 渠道必须配置 owner 和 repo（或 repoUrl）' });
      }
      if (!newConfig.token) {
        return res.status(400).json({ error: 'github 渠道必须配置 token' });
      }
    }

    const updateData = {
      name: name || ch.name,
      config: newConfig,
      enabled: enabled !== undefined ? Boolean(enabled) : ch.enabled
    };

    if (isDefault !== undefined) {
      updateData.isDefault = isDefault;
    }

    const updated = await db.updateChannel(req.params.id, updateData);

    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 测试渠道连接
router.post('/:id/test', async (req, res) => {
  try {
    const ch = await db.getChannel(req.params.id);
    if (!ch) return res.status(404).json({ error: '渠道不存在' });

    // Check permission
    if (!canAccessChannel(req.user, ch)) {
      return res.status(403).json({ error: '没有权限操作此渠道' });
    }

    const publisher = createChannel(ch.type, ch.config);
    const result = await publisher.healthCheck();

    // 如果健康检查失败，返回错误状态
    if (!result.healthy) {
      return res.status(400).json({ error: result.error || '连接失败', data: result });
    }

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 测试渠道配置（无需保存，用于创建前测试）
router.post('/test-config', async (req, res) => {
  try {
    const { type, config } = req.body;
    if (!type) return res.status(400).json({ error: '渠道类型不能为空' });

    const registered = getRegisteredTypes();
    if (!registered.includes(type)) {
      return res.status(400).json({ error: `不支持的渠道类型: ${type}` });
    }

    const publisher = createChannel(type, config || {});
    const result = await publisher.healthCheck();

    // 如果健康检查失败，返回错误状态
    if (!result.healthy) {
      return res.status(400).json({ error: result.error || '连接失败', data: result });
    }

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除渠道
router.delete('/:id', async (req, res) => {
  try {
    const ch = await db.getChannel(req.params.id);
    if (!ch) {
      return res.status(404).json({ error: '渠道不存在' });
    }

    // Check permission
    if (!canAccessChannel(req.user, ch)) {
      return res.status(403).json({ error: '没有权限操作此渠道' });
    }

    // Check if this is the only channel for the user
    const isAdmin = req.user.role === 'admin';
    const channels = await db.listChannels(req.user.id, isAdmin);

    if (channels.length <= 1) {
      return res.status(400).json({ error: '至少需要保留一个渠道' });
    }

    if (ch.enabled) {
      return res.status(400).json({ error: '启用的渠道不能删除，请先禁用' });
    }

    const deleted = await db.deleteChannel(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '渠道不存在' });
    }

    res.json({ data: { id: req.params.id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
