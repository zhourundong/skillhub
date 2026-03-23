const express = require('express');
const aiService = require('../services/aiService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const MAX_PROMPT_LENGTH = 5000;

/**
 * 生成短请求 ID
 */
function generateRequestId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// POST /generate — AI skill generation with SSE (requires authentication)
router.post('/generate', authenticateToken, async (req, res) => {
  // 生成请求 ID 用于日志追踪
  const requestId = generateRequestId();
  const logPrefix = `[AI Route ${requestId}]`;

  const log = {
    info: (...args) => console.log(logPrefix, ...args),
    error: (...args) => console.error(logPrefix, ...args),
    warn: (...args) => console.warn(logPrefix, ...args),
  };

  const { prompt, language, fileOptions } = req.body;

  log.info(`New generation request, prompt length: ${prompt?.length || 0}`);

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
    return res.status(503).json({ error: 'AI 服务未配置' });
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
    log.info(`File generated: ${file.type}/${file.filename} (${file.size} chars)`);
    sendEvent('file', file);
  };

  // 内容回调（流式增量内容）
  const onChunk = (content) => {
    sendEvent('chunk', { content });
  };

  // 思考内容回调（流式增量内容）
  const onReasoning = (reasoning) => {
    log.info(`Reasoning chunk: ${reasoning.substring(0, 100)}...`);
    sendEvent('reasoning', { content: reasoning });
  };

  try {
    const result = await aiService.generateSkill(prompt, onChunk, onReasoning, {
      language,
      fileOptions,
      onFileGenerated,
      requestId // 传递请求 ID
    });

    // 发送最终结果
    const doneData = {
      success: result.success,
      skill: result.skill || null,
      rawOutput: result.rawOutput || null
    };
    log.info(`Done event: success=${result.success}, hasSkill=${!!result.skill}, skillName=${result.skill?.name}`);
    sendEvent('done', doneData);
  } catch (err) {
    log.error(`Error: ${err.message}`);
    sendEvent('error', { error: err.message });
  } finally {
    log.info('Request completed');
    res.end();
  }
});

module.exports = router;
