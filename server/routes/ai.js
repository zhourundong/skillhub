const express = require('express');
const aiService = require('../services/aiService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const MAX_PROMPT_LENGTH = 5000;

// POST /generate — AI skill generation with SSE (requires authentication)
router.post('/generate', authenticateToken, async (req, res) => {
  const { prompt, language, fileOptions } = req.body;

  // Validate prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: '需求描述不能为空' });
  }

  // Validate prompt length
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `需求描述不能超过 ${MAX_PROMPT_LENGTH} 个字符` });
  }

  // Check AI_API_KEY is configured
  if (!process.env.AI_API_KEY) {
    return res.status(503).json({ error: 'AI 服务未配置，请设置 AI_API_KEY 环境变量' });
  }

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 发送事件的辅助函数
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 文件生成回调
  const onFileGenerated = (file) => {
    sendEvent('file', file);
  };

  // 内容回调（用于调试）
  const onChunk = (content) => {
    sendEvent('chunk', { content: content.substring(0, 200) });
  };

  try {
    // 注册文件生成回调
    aiService.setFileGeneratedCallback(onFileGenerated);

    const result = await aiService.generateSkill(prompt, onChunk, { language, fileOptions });

    // 发送最终结果
    sendEvent('done', {
      success: result.success,
      skill: result.skill,
      rawOutput: result.rawOutput
    });
  } catch (err) {
    console.error(`[AI Route] Error: ${err.message}`);
    sendEvent('error', { error: err.message });
  } finally {
    aiService.setFileGeneratedCallback(null);
    res.end();
  }
});

module.exports = router;
