import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const express = require('express');

/**
 * Helper: create an Express app with the AI route mounted.
 * We re-require the route each time to pick up the mocked aiService.
 */
function createApp(mockGenerateSkill) {
  // Patch the aiService module in the CJS cache so ai.js picks it up
  const aiServicePath = require.resolve('../services/aiService');
  const originalModule = require.cache[aiServicePath];

  // Replace the cached module's exports
  require.cache[aiServicePath] = {
    ...originalModule,
    exports: {
      ...originalModule.exports,
      generateSkill: mockGenerateSkill,
    },
  };

  // Clear the ai.js cache so it re-requires aiService
  const aiRoutePath = require.resolve('./ai');
  delete require.cache[aiRoutePath];

  const app = express();
  app.use(express.json());
  app.use('/api/ai', require(aiRoutePath));

  // Restore original aiService cache entry (ai.js already captured the mock reference)
  // Actually we need to keep it for the duration of the test since ai.js uses aiService.generateSkill
  // We'll restore in afterEach

  return { app, aiServicePath, originalModule, aiRoutePath };
}

function startApp(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function httpRequest(server, { method = 'POST', path = '/api/ai/generate', body, raw = false }) {
  const addr = server.address();
  const url = `http://localhost:${addr.port}${path}`;

  return new Promise((resolve, reject) => {
    const clientReq = http.request(url, { method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      if (raw) {
        resolve({ res, clientReq });
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    clientReq.on('error', (err) => {
      if (err.code === 'ECONNRESET') return;
      reject(err);
    });
    if (body !== undefined) {
      clientReq.write(JSON.stringify(body));
    }
    clientReq.end();
  });
}

function parseSSEEvents(text) {
  const events = [];
  const blocks = text.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event || data) events.push({ event, data });
  }
  return events;
}

describe('AI Route - POST /api/ai/generate', () => {
  let server;
  let cachedModuleInfo;
  const savedEnv = {};

  beforeEach(() => {
    savedEnv.AI_API_KEY = process.env.AI_API_KEY;
  });

  afterEach(async () => {
    // Restore env
    if (savedEnv.AI_API_KEY === undefined) {
      delete process.env.AI_API_KEY;
    } else {
      process.env.AI_API_KEY = savedEnv.AI_API_KEY;
    }
    // Restore module cache
    if (cachedModuleInfo) {
      require.cache[cachedModuleInfo.aiServicePath] = cachedModuleInfo.originalModule;
      delete require.cache[cachedModuleInfo.aiRoutePath];
      cachedModuleInfo = null;
    }
    // Close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  // --- Validation tests (no mock needed, these return before calling generateSkill) ---

  it('returns 400 when prompt is missing', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/ai', require('./ai'));
    server = await startApp(app);
    const res = await httpRequest(server, { body: {} });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('不能为空');
  });

  it('returns 400 when prompt is empty string', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/ai', require('./ai'));
    server = await startApp(app);
    const res = await httpRequest(server, { body: { prompt: '' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when prompt is whitespace only', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/ai', require('./ai'));
    server = await startApp(app);
    const res = await httpRequest(server, { body: { prompt: '   ' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when prompt exceeds max length', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/ai', require('./ai'));
    server = await startApp(app);
    const longPrompt = 'a'.repeat(5001);
    const res = await httpRequest(server, { body: { prompt: longPrompt } });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('5000');
  });

  it('accepts prompt at exactly max length (returns 503 when no API key)', async () => {
    delete process.env.AI_API_KEY;
    const app = express();
    app.use(express.json());
    app.use('/api/ai', require('./ai'));
    server = await startApp(app);
    const exactPrompt = 'a'.repeat(5000);
    const res = await httpRequest(server, { body: { prompt: exactPrompt } });
    expect(res.status).toBe(503);
  });

  it('returns 503 when AI_API_KEY is not configured', async () => {
    delete process.env.AI_API_KEY;
    const app = express();
    app.use(express.json());
    app.use('/api/ai', require('./ai'));
    server = await startApp(app);
    const res = await httpRequest(server, { body: { prompt: 'test prompt' } });
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).error).toContain('AI_API_KEY');
  });

  // --- SSE streaming tests (need mock) ---

  it('sets SSE headers and streams chunk/done events on success', async () => {
    const mockGenerate = async (prompt, onChunk) => {
      onChunk('Hello ');
      onChunk('World');
      return { skill: { name: 'test-skill', description: 'A test' } };
    };

    process.env.AI_API_KEY = 'test-key';
    cachedModuleInfo = createApp(mockGenerate);
    server = await startApp(cachedModuleInfo.app);

    const res = await httpRequest(server, { body: { prompt: 'create a skill' } });

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');

    const events = parseSSEEvents(res.body);
    const chunkEvents = events.filter((e) => e.event === 'chunk');
    const doneEvents = events.filter((e) => e.event === 'done');

    expect(chunkEvents.length).toBe(2);
    expect(JSON.parse(chunkEvents[0].data).text).toBe('Hello ');
    expect(JSON.parse(chunkEvents[1].data).text).toBe('World');
    expect(doneEvents.length).toBe(1);
    expect(JSON.parse(doneEvents[0].data).skill.name).toBe('test-skill');
  });

  it('sends SSE error event when generateSkill throws', async () => {
    const mockGenerate = async () => {
      throw new Error('API connection failed');
    };

    process.env.AI_API_KEY = 'test-key';
    cachedModuleInfo = createApp(mockGenerate);
    server = await startApp(cachedModuleInfo.app);

    const res = await httpRequest(server, { body: { prompt: 'create a skill' } });

    const events = parseSSEEvents(res.body);
    const errorEvents = events.filter((e) => e.event === 'error');

    expect(errorEvents.length).toBe(1);
    expect(JSON.parse(errorEvents[0].data).message).toBe('API connection failed');
  });

  it('aborts AI request when client disconnects', async () => {
    let capturedAbortController;
    let resolveGenerate;

    const mockGenerate = (_prompt, _onChunk, options) => {
      capturedAbortController = options.abortController;
      return new Promise((resolve) => {
        resolveGenerate = resolve;
      });
    };

    process.env.AI_API_KEY = 'test-key';
    cachedModuleInfo = createApp(mockGenerate);
    server = await startApp(cachedModuleInfo.app);

    // Use raw mode to get the response stream we can destroy
    const { res: rawRes, clientReq } = await httpRequest(server, { body: { prompt: 'create a skill' }, raw: true });

    // Wait for the route handler to invoke generateSkill
    await new Promise((r) => setTimeout(r, 200));

    expect(capturedAbortController).toBeDefined();

    // Destroy the client connection (simulate disconnect)
    clientReq.destroy();

    // Wait for the close event to propagate
    await new Promise((r) => setTimeout(r, 200));

    expect(capturedAbortController.signal.aborted).toBe(true);

    // Resolve the pending promise to clean up
    if (resolveGenerate) resolveGenerate({ skill: null });
  });
});
