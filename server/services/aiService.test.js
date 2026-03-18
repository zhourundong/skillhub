import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import http from 'http';

const require = createRequire(import.meta.url);
const { parseGeneratedSkill, generateSkill } = require('./aiService');

const REQUIRED_FIELDS = ['name', 'description', 'author', 'version', 'category', 'icon', 'skill_content'];

function hasAllFields(result) {
  for (const field of REQUIRED_FIELDS) {
    expect(result).toHaveProperty(field);
    expect(typeof result[field]).toBe('string');
  }
}

describe('parseGeneratedSkill', () => {
  it('parses JSON from ```json code block', () => {
    const input = 'Here is the skill:\n```json\n{"name":"my-skill","description":"A test skill","author":"Test","version":"2.0.0","category":"工具","icon":"🔧","skill_content":"# My Skill"}\n```\nDone.';
    const result = parseGeneratedSkill(input);
    hasAllFields(result);
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('A test skill');
    expect(result.author).toBe('Test');
    expect(result.version).toBe('2.0.0');
    expect(result.skill_content).toBe('# My Skill');
  });

  it('parses bare JSON string', () => {
    const input = '{"name":"bare-skill","description":"Bare JSON","author":"Dev","version":"1.0.0","category":"开发","icon":"💻","skill_content":"content"}';
    const result = parseGeneratedSkill(input);
    hasAllFields(result);
    expect(result.name).toBe('bare-skill');
    expect(result.description).toBe('Bare JSON');
  });

  it('returns default object with skill_content for non-JSON text', () => {
    const input = 'This is just plain text, not JSON at all.';
    const result = parseGeneratedSkill(input);
    hasAllFields(result);
    expect(result.name).toBe('');
    expect(result.author).toBe('AI Generated');
    expect(result.version).toBe('1.0.0');
    expect(result.icon).toBe('🤖');
    expect(result.skill_content).toBe(input);
  });

  it('does not throw for null input', () => {
    const result = parseGeneratedSkill(null);
    hasAllFields(result);
    expect(result.skill_content).toBe('');
  });

  it('does not throw for undefined input', () => {
    const result = parseGeneratedSkill(undefined);
    hasAllFields(result);
    expect(result.skill_content).toBe('');
  });

  it('does not throw for empty string', () => {
    const result = parseGeneratedSkill('');
    hasAllFields(result);
    expect(result.skill_content).toBe('');
  });

  it('does not throw for numeric input', () => {
    const result = parseGeneratedSkill(12345);
    hasAllFields(result);
  });

  it('fills missing fields with defaults when JSON is partial', () => {
    const input = '{"name":"partial-skill"}';
    const result = parseGeneratedSkill(input);
    hasAllFields(result);
    expect(result.name).toBe('partial-skill');
    expect(result.author).toBe('AI Generated');
    expect(result.version).toBe('1.0.0');
    expect(result.icon).toBe('🤖');
  });

  it('prefers JSON code block over surrounding text', () => {
    const input = 'Some preamble text\n```json\n{"name":"from-block","description":"block desc"}\n```\nSome trailing text';
    const result = parseGeneratedSkill(input);
    hasAllFields(result);
    expect(result.name).toBe('from-block');
    expect(result.description).toBe('block desc');
  });
});


describe('generateSkill', () => {
  let server;
  let serverPort;
  const originalEnv = {};

  function saveEnv() {
    originalEnv.AI_API_BASE_URL = process.env.AI_API_BASE_URL;
    originalEnv.AI_API_KEY = process.env.AI_API_KEY;
    originalEnv.AI_MODEL = process.env.AI_MODEL;
  }

  function restoreEnv() {
    for (const key of Object.keys(originalEnv)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  }

  function createSSEServer(handler) {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  }

  beforeEach(() => {
    saveEnv();
  });

  afterEach(async () => {
    restoreEnv();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  it('throws when AI_API_KEY is not set', async () => {
    delete process.env.AI_API_KEY;
    await expect(generateSkill('test prompt', () => {})).rejects.toThrow('AI 服务未配置');
  });

  it('uses default model gpt-4o and default base URL', async () => {
    let receivedBody;
    await createSSEServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        receivedBody = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunk = JSON.stringify({ choices: [{ delta: { content: '{"name":"test"}' } }] });
        res.write(`data: ${chunk}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });

    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;
    delete process.env.AI_MODEL;

    await generateSkill('create a skill', () => {});
    expect(receivedBody.model).toBe('gpt-4o');
  });

  it('uses custom AI_MODEL from env', async () => {
    let receivedBody;
    await createSSEServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        receivedBody = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunk = JSON.stringify({ choices: [{ delta: { content: '{}' } }] });
        res.write(`data: ${chunk}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });

    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;
    process.env.AI_MODEL = 'gpt-3.5-turbo';

    await generateSkill('test', () => {});
    expect(receivedBody.model).toBe('gpt-3.5-turbo');
  });

  it('streams chunks via onChunk callback and returns parsed skill', async () => {
    await createSSEServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const part1 = JSON.stringify({ choices: [{ delta: { content: '{"name":' } }] });
        const part2 = JSON.stringify({ choices: [{ delta: { content: '"streamed-skill","description":"A skill","author":"AI","version":"1.0.0","category":"工具","icon":"🔧","skill_content":"# Content"}' } }] });
        res.write(`data: ${part1}\n\n`);
        res.write(`data: ${part2}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });

    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;

    const chunks = [];
    const result = await generateSkill('create something', (text) => chunks.push(text));

    expect(chunks.length).toBe(2);
    expect(chunks.join('')).toContain('streamed-skill');
    expect(result.skill.name).toBe('streamed-skill');
    expect(result.abortController).toBeDefined();
  });

  it('builds system prompt with SKILL.md content and JSON format instructions', async () => {
    let receivedBody;
    await createSSEServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        receivedBody = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '{}' } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });

    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;

    await generateSkill('my prompt', () => {});

    expect(receivedBody.messages).toHaveLength(2);
    expect(receivedBody.messages[0].role).toBe('system');
    expect(receivedBody.messages[0].content).toContain('Skill 创建助手');
    expect(receivedBody.messages[0].content).toContain('"skill_content"');
    expect(receivedBody.messages[1].role).toBe('user');
    expect(receivedBody.messages[1].content).toBe('my prompt');
    expect(receivedBody.stream).toBe(true);
  });

  it('rejects on non-200 API response', async () => {
    await createSSEServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
      });
    });

    process.env.AI_API_KEY = 'bad-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;

    await expect(generateSkill('test', () => {})).rejects.toThrow('Invalid API key');
  });

  it('supports cancellation via abortController', async () => {
    await createSSEServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        // Send one chunk then hang (simulating slow stream)
        const chunk = JSON.stringify({ choices: [{ delta: { content: 'partial' } }] });
        res.write(`data: ${chunk}\n\n`);
        // Don't end the response — let abort handle it
      });
    });

    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;

    const ac = new AbortController();

    const promise = generateSkill('test', () => {}, { abortController: ac });

    // Give the request time to start, then abort
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();

    await expect(promise).rejects.toThrow('请求已取消');
  });

  it('rejects immediately if abortController is already aborted', async () => {
    await createSSEServer((req, res) => {
      res.writeHead(200);
      res.end();
    });

    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;

    const ac = new AbortController();
    ac.abort();

    await expect(generateSkill('test', () => {}, { abortController: ac })).rejects.toThrow('请求已取消');
  });

  it('handles SSE chunks split across data events', async () => {
    await createSSEServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        // Send a chunk split across two data events (mid-line split)
        const fullLine = `data: ${JSON.stringify({ choices: [{ delta: { content: 'hello' } }] })}\n\n`;
        const mid = Math.floor(fullLine.length / 2);
        res.write(fullLine.slice(0, mid));
        setTimeout(() => {
          res.write(fullLine.slice(mid));
          res.write('data: [DONE]\n\n');
          res.end();
        }, 50);
      });
    });

    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_BASE_URL = `http://localhost:${serverPort}`;

    const chunks = [];
    const result = await generateSkill('test', (text) => chunks.push(text));

    expect(chunks).toContain('hello');
    expect(result.skill).toBeDefined();
  });
});
