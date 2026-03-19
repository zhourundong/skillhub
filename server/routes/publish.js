const express = require('express');
const db = require('../db');
const { createChannel } = require('../channels');

const router = express.Router();

// 发布 skill 到指定渠道（默认使用默认渠道）
router.post('/:skillId/publish', async (req, res) => {
  try {
    const skill = await db.getSkill(req.params.skillId);
    if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

    const { channelId } = req.body;
    let channel;

    if (channelId) {
      channel = await db.getChannel(channelId);
    } else {
      channel = await db.getDefaultChannel();
    }

    if (!channel) return res.status(400).json({ error: '没有可用的发布渠道，请先启用一个渠道' });

    const publisher = createChannel(channel.type, channel.config);
    const result = await publisher.publish(skill);

    // 只有当 success 为 true 时才记录发布
    if (result.success) {
      // 记录发布
      await db.createPublishRecord(skill.id, channel.id);

      // 更新 skill 状态
      await db.updateSkill(skill.id, { status: 'published' });
    }

    res.json({ data: { channel: channel.name, ...result } });
  } catch (err) {
    console.error('[Publish] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 下架 skill
router.post('/:skillId/unpublish', async (req, res) => {
  try {
    const skill = await db.getSkill(req.params.skillId);
    if (!skill) return res.status(404).json({ error: 'Skill 不存在' });

    // 获取所有已发布记录
    const records = (await db.listPublishRecords(req.params.skillId))
      .filter(r => r.status === 'published');

    for (const record of records) {
      const channel = await db.getChannel(record.channel_id);
      if (channel) {
        const publisher = createChannel(channel.type, channel.config);
        await publisher.unpublish(skill);
      }
    }

    await db.unpublishRecords(req.params.skillId);
    await db.updateSkill(req.params.skillId, { status: 'unpublished' });

    res.json({ message: '下架成功', data: { unpublished_count: records.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取 skill 的发布记录
router.get('/:skillId/records', async (req, res) => {
  try {
    const records = await db.listPublishRecords(req.params.skillId);
    res.json({ data: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
