const express = require('express');
const db = require('../db');
const { createChannel } = require('../channels');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All publish routes require authentication
router.use(authenticateToken);

// Helper: check if user can access channel
function canAccessChannel(user, channel) {
  if (!user || !channel) return false;
  // Admin can access all channels
  if (user.role === 'admin') return true;
  // 普通用户可以访问所有启用的渠道（包括管理员创建的）
  // 但只能使用，不能编辑/删除
  return channel.enabled !== false;
}

// Helper: check if user can manage skill
function canManageSkill(user, skill) {
  if (!user || !skill) return false;
  if (user.role === 'admin') return true;
  return skill.created_by === user.id;
}

// 发布 skill 到指定渠道（默认使用默认渠道）
router.post('/:skillId/publish', async (req, res) => {
  try {
    const skill = await db.getSkill(req.params.skillId);
    if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

    // 检查是否有权限操作此 Skill
    if (!canManageSkill(req.user, skill)) {
      return res.status(403).json({ error: '没有权限操作此 Skill' });
    }

    // 检查版本号是否已发布过
    const isVersionUsed = await db.isVersionPublished(skill.id, skill.version);
    if (isVersionUsed) {
      return res.status(400).json({
        error: `版本号 ${skill.version} 已发布过，请更新版本号后再发布`,
        code: 'VERSION_CONFLICT',
        current_version: skill.version
      });
    }

    const { channelId } = req.body;
    let channel;

    if (channelId) {
      channel = await db.getChannel(channelId);
    } else {
      channel = await db.getDefaultChannel();
    }

    if (!channel) return res.status(400).json({ error: '没有可用的发布渠道，请先启用一个渠道' });

    // Check permission
    if (!canAccessChannel(req.user, channel)) {
      return res.status(403).json({ error: '没有权限使用此渠道' });
    }

    const publisher = createChannel(channel.type, channel.config);
    const result = await publisher.publish(skill);

    // 只有当 success 为 true 时才记录发布
    if (result.success) {
      // 记录发布（包含版本号）
      await db.createPublishRecord(skill.id, channel.id, skill.version);

      // 更新 skill 状态
      await db.updateSkill(skill.id, { status: 'published' });
    }

    res.json({ data: { channel: channel.name, ...result } });
  } catch (err) {
    console.error('[Publish] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 下架 skill（只更新状态，不删除渠道文件）
router.post('/:skillId/unpublish', async (req, res) => {
  try {
    const skill = await db.getSkill(req.params.skillId);
    if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

    // 检查是否有权限操作此 Skill
    if (!canManageSkill(req.user, skill)) {
      return res.status(403).json({ error: '没有权限操作此 Skill' });
    }

    // 获取所有已发布记录
    const records = (await db.listPublishRecords(req.params.skillId))
      .filter(r => r.status === 'published');

    // Filter records by user's accessible channels
    const accessibleRecords = [];

    for (const record of records) {
      const channel = await db.getChannel(record.channel_id);
      if (channel && canAccessChannel(req.user, channel)) {
        accessibleRecords.push({ record, channel });
      }
    }

    // 只更新数据库状态，不删除渠道文件
    for (const { record } of accessibleRecords) {
      await db.unpublishRecord(record.id);
    }

    // Update skill status only if no more published records
    const remainingRecords = await db.listPublishRecords(req.params.skillId);
    const stillPublished = remainingRecords.some(r => r.status === 'published');
    if (!stillPublished) {
      await db.updateSkill(req.params.skillId, { status: 'unpublished' });
    }

    res.json({ message: '下架成功', data: { unpublished_count: accessibleRecords.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取 skill 的发布记录
router.get('/:skillId/records', async (req, res) => {
  try {
    const allRecords = await db.listPublishRecords(req.params.skillId);

    // Filter records by user's accessible channels
    const isAdmin = req.user.role === 'admin';
    const filteredRecords = [];

    for (const record of allRecords) {
      const channel = await db.getChannel(record.channel_id);
      if (channel && canAccessChannel(req.user, channel)) {
        filteredRecords.push(record);
      }
    }

    res.json({ data: filteredRecords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
