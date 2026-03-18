# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start backend server (port 3030)
node server/index.js

# Start frontend dev server (port 3000)
cd client && npm run dev

# Build frontend for production
cd client && npm run build

# Run tests
npm test
```

## Architecture Overview

### Backend (server/)
- **Express.js** server on port 3030
- **File-system storage**: Skills stored as directories in `skills/`
- Key modules:
  - `db.js` - Core CRUD operations for skills, assets, scripts, references
  - `services/aiService.js` - AI skill generation using OpenAI-compatible API
  - `channels/` - Plugin system for publishing (currently `local` only)
  - `routes/` - Express routes for skills, publish, channels, AI

### Frontend (client/)
- **React + Vite** on port 3000
- Proxies `/api/*` to backend in development
- Key pages: `SkillList`, `SkillDetail`, `Channels`

### Data Storage Structure
```
skills/
└── {skill-id}/
    ├── SKILL.md          # YAML frontmatter + Markdown body
    ├── metadata.json     # id, version, category, status, timestamps
    ├── scripts/          # Executable scripts (.py, .sh, .js, etc.)
    ├── references/       # Documentation (.md, .txt, .json, etc.)
    └── assets/           # Binary files (images, PDFs, etc.)

data/
├── channels.json         # Channel configurations
└── publish_records.json  # Publication history
```

### SKILL.md Format
```markdown
---
name: skill-name
description: Skill description
---

# Markdown content here
```

## Environment Variables

Configure in `server/.env`:
- `AI_API_KEY` - API key for AI generation
- `AI_API_BASE_URL` - OpenAI-compatible API endpoint
- `AI_MODEL` - Model name (default: gpt-4o)
- `PORT` - Server port (default: 3030)

## Key Implementation Details

### YAML Frontmatter Parsing
`db.js` contains `parseFrontmatter()` and `generateFrontmatter()` for reading/writing SKILL.md files. The frontmatter contains only `name` and `description`; other metadata goes in `metadata.json`.

### AI Generation Flow
1. User provides prompt → `/api/ai/generate`
2. `aiService.js` loads `skill-creator/SKILL.md` as system prompt
3. Calls OpenAI-compatible API, parses JSON response
4. Returns structured skill object with `name`, `description`, `version`, `category`, `skill_content`

### Static Assets
Files in `skills/{id}/assets/` are served via `/assets/{id}/assets/{filename}`.

### Publish Channels
New channels can be added by:
1. Creating a class extending `BaseChannel` in `server/channels/`
2. Registering in `channelRegistry` in `server/channels/index.js`
