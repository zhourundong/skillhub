const express = require('express');
const aiService = require('../services/aiService');

const router = express.Router();

const MAX_PROMPT_LENGTH = 5000;

// POST /generate — AI skill generation
router.post('/generate', async (req, res) => {
  const { prompt, language } = req.body;

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

  try {
    const result = await aiService.generateSkill(prompt, null, { language });
    res.json({
      success: result.success,
      skill: result.skill,
      rawOutput: result.rawOutput
    });
  } catch (err) {
    console.error(`[AI Route] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
