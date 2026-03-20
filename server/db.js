const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

// Table names with prefix
const TABLES = {
  users: 't_sh_users',
  skills: 't_sh_skills',
  channels: 't_sh_channels',
  publish_records: 't_sh_publish_records',
  custom_dirs: 't_sh_custom_dirs',
  skill_files: 't_sh_skill_files'
};

// File system paths
const skillsDir = path.join(__dirname, '..', 'skills');

// Ensure skills directory exists
if (!fs.existsSync(skillsDir)) {
  fs.mkdirSync(skillsDir, { recursive: true });
}

// Database connection pool
let pool = null;

// Get or create connection pool
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'skillhub',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

// Helper: get skill directory
function getSkillDir(id) {
  return path.join(skillsDir, id);
}

// Helper: parse YAML frontmatter from content
function parseFrontmatter(content) {
  // Remove BOM if present and normalize line endings
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: match[2] };
}

// Helper: generate YAML frontmatter
function generateFrontmatter(name, description) {
  const escapeYaml = (str) => {
    if (!str) return '';
    if (str.includes('\n') || str.includes(':') || str.includes('"')) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  };
  return `---\nname: ${escapeYaml(name)}\ndescription: ${escapeYaml(description)}\n---\n`;
}

// ========== Skill Files Table Helpers ==========
// Map subdir to file type
function getFileType(subdir) {
  const typeMap = {
    'scripts': 'script',
    'references': 'reference',
    'assets': 'asset'
  };
  return typeMap[subdir] || 'custom';
}

// Insert or update file record
async function upsertFileRecord(skillId, type, filename, filePath, size, isEditable) {
  const pool = getPool();
  const id = uuidv4();
  const now = new Date();

  // Use INSERT ... ON DUPLICATE KEY UPDATE
  // First check if record exists
  const [existing] = await pool.execute(
    `SELECT id FROM ${TABLES.skill_files} WHERE skill_id = ? AND path = ?`,
    [skillId, filePath]
  );

  if (existing.length > 0) {
    await pool.execute(
      `UPDATE ${TABLES.skill_files} SET filename = ?, size = ?, is_editable = ?, updated_at = ? WHERE id = ?`,
      [filename, size, isEditable ? 1 : 0, now, existing[0].id]
    );
    return existing[0].id;
  } else {
    await pool.execute(
      `INSERT INTO ${TABLES.skill_files} (id, skill_id, type, filename, path, size, is_editable, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, skillId, type, filename, filePath, size, isEditable ? 1 : 0, now, now]
    );
    return id;
  }
}

// Delete file record
async function deleteFileRecord(skillId, filePath) {
  const pool = getPool();
  await pool.execute(
    `DELETE FROM ${TABLES.skill_files} WHERE skill_id = ? AND path = ?`,
    [skillId, filePath]
  );
}

// Delete all file records for a skill
async function deleteAllFileRecords(skillId) {
  const pool = getPool();
  await pool.execute(
    `DELETE FROM ${TABLES.skill_files} WHERE skill_id = ?`,
    [skillId]
  );
}

// Database API
const db = {
  // Expose pool for external use (e.g., migration)
  getPool,

  // Close pool (for graceful shutdown)
  async closePool() {
    if (pool) {
      await pool.end();
      pool = null;
    }
  },

  // ========== Users ==========
  async getUserById(id) {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.users} WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async getUserByUsername(username) {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.users} WHERE username = ?`,
      [username]
    );
    return rows[0] || null;
  },

  async listUsers({ page = 1, pageSize = 20, keyword } = {}) {
    const pool = getPool();
    let sql = `SELECT id, username, display_name, role, created_at, updated_at FROM ${TABLES.users}`;
    const params = [];

    if (keyword) {
      sql += ' WHERE (username LIKE ? OR display_name LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw);
    }

    // Count total
    const countSql = sql.replace('SELECT id, username, display_name, role, created_at, updated_at', 'SELECT COUNT(*) as total');
    const [countRows] = await pool.execute(countSql, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / pageSize);

    // Get paginated results
    const limit = parseInt(pageSize, 10) || 20;
    const offset = (parseInt(page, 10) - 1) * limit;
    sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await pool.execute(sql, params);

    return {
      data: rows,
      pagination: { page, pageSize, total, totalPages }
    };
  },

  async createUser(data) {
    const pool = getPool();
    const id = uuidv4();
    const now = new Date();

    await pool.execute(
      `INSERT INTO ${TABLES.users} (id, username, password_hash, display_name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.username,
        data.passwordHash,
        data.displayName || data.username,
        data.role || 'user',
        now,
        now
      ]
    );

    return this.getUserById(id);
  },

  async updateUser(id, data) {
    const pool = getPool();
    const updates = [];
    const params = [];

    if (data.displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(data.displayName);
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      params.push(data.role);
    }
    if (data.passwordHash !== undefined) {
      updates.push('password_hash = ?');
      params.push(data.passwordHash);
    }

    if (updates.length === 0) {
      return this.getUserById(id);
    }

    params.push(id);
    await pool.execute(
      `UPDATE ${TABLES.users} SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.getUserById(id);
  },

  async deleteUser(id) {
    const pool = getPool();
    const [result] = await pool.execute(
      `DELETE FROM ${TABLES.users} WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  },

  async countUsers() {
    const pool = getPool();
    const [rows] = await pool.execute(`SELECT COUNT(*) as count FROM ${TABLES.users}`);
    return rows[0].count;
  },

  async countAdminUsers() {
    const pool = getPool();
    const [rows] = await pool.execute(`SELECT COUNT(*) as count FROM ${TABLES.users} WHERE role = 'admin'`);
    return rows[0].count;
  },

  // ========== Skills ==========
  async listSkills({ status, category, keyword, page = 1, pageSize = 10 }) {
    const pool = getPool();
    let sql = `SELECT * FROM ${TABLES.skills}`;
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    if (keyword) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countRows] = await pool.execute(countSql, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / pageSize);

    // Get paginated results
    // Note: LIMIT/OFFSET must be literal values in MySQL prepared statements
    const limit = parseInt(pageSize, 10) || 10;
    const offset = (parseInt(page, 10) - 1) * limit;
    sql += ` ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await pool.execute(sql, params);

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      }
    };
  },

  async getSkill(id) {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.skills} WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async findSkillByName(name, excludeId) {
    const pool = getPool();
    let sql = `SELECT * FROM ${TABLES.skills} WHERE name = ?`;
    const params = [name];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
  },

  async getRawSkillFile(id) {
    const skillDir = getSkillDir(id);
    const skillPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;
    return fs.readFileSync(skillPath, 'utf-8');
  },

  async createSkill(data) {
    const pool = getPool();
    const id = data.id || uuidv4();
    const skillDir = getSkillDir(id);

    // Create directory structure
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'assets'), { recursive: true });

    const now = new Date();

    // Insert into database
    await pool.execute(
      `INSERT INTO ${TABLES.skills} (id, name, description, skill_content, version, category, status, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name || '',
        data.description || '',
        data.skill_content || '',
        data.version || '1.0.0',
        data.category || '',
        'draft',
        data.createdBy || null,
        data.updatedBy || data.createdBy || null,
        now,
        now
      ]
    );

    // Write SKILL.md file (for backward compatibility and export)
    const skillPath = path.join(skillDir, 'SKILL.md');
    const frontmatter = generateFrontmatter(data.name || '', data.description || '');
    fs.writeFileSync(skillPath, frontmatter + (data.skill_content || ''), 'utf-8');

    return this.getSkill(id);
  },

  async updateSkill(id, data) {
    const pool = getPool();
    const skill = await this.getSkill(id);
    if (!skill) return null;

    const now = new Date();
    const updates = [];
    const params = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.skill_content !== undefined) {
      updates.push('skill_content = ?');
      params.push(data.skill_content);
    }
    if (data.version !== undefined) {
      updates.push('version = ?');
      params.push(data.version);
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      params.push(data.category);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(data.updatedBy);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now);
      params.push(id);

      await pool.execute(
        `UPDATE ${TABLES.skills} SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Update SKILL.md file
    const updatedSkill = await this.getSkill(id);
    const skillDir = getSkillDir(id);
    const skillPath = path.join(skillDir, 'SKILL.md');
    const frontmatter = generateFrontmatter(updatedSkill.name, updatedSkill.description);
    fs.writeFileSync(skillPath, frontmatter + (updatedSkill.skill_content || ''), 'utf-8');

    return updatedSkill;
  },

  async deleteSkill(id) {
    const pool = getPool();

    // Delete from database (cascade will delete related records)
    const [result] = await pool.execute(
      `DELETE FROM ${TABLES.skills} WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) return false;

    // Delete skill directory
    const skillDir = getSkillDir(id);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }

    return true;
  },

  // ========== Assets ==========
  listAssets(skillId) {
    const assetsDir = path.join(getSkillDir(skillId), 'assets');
    if (!fs.existsSync(assetsDir)) return [];

    return fs.readdirSync(assetsDir).map(name => {
      const filePath = path.join(assetsDir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        created_at: stat.birthtime.toISOString()
      };
    });
  },

  async saveAsset(skillId, filename, buffer) {
    const assetsDir = path.join(getSkillDir(skillId), 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    const filePath = path.join(assetsDir, path.basename(filename));
    fs.writeFileSync(filePath, buffer);

    // Update skill_files table
    const relativePath = `assets/${path.basename(filename)}`;
    await upsertFileRecord(skillId, 'asset', path.basename(filename), relativePath, buffer.length, false);

    return { name: path.basename(filename), size: buffer.length };
  },

  async deleteAsset(skillId, filename) {
    const filePath = path.join(getSkillDir(skillId), 'assets', path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);

      // Update skill_files table
      const relativePath = `assets/${path.basename(filename)}`;
      await deleteFileRecord(skillId, relativePath);

      return true;
    }
    return false;
  },

  getAssetPath(skillId, filename) {
    return path.join(getSkillDir(skillId), 'assets', path.basename(filename));
  },

  // ========== Generic text files (scripts, references) ==========
  listTextFiles(skillId, subdir) {
    const dir = path.join(getSkillDir(skillId), subdir);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map(name => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        updated_at: stat.mtime.toISOString()
      };
    });
  },

  getTextFile(skillId, subdir, filename) {
    const filePath = path.join(getSkillDir(skillId), subdir, path.basename(filename));
    if (!fs.existsSync(filePath)) return null;
    return {
      name: path.basename(filename),
      content: fs.readFileSync(filePath, 'utf-8')
    };
  },

  async saveTextFile(skillId, subdir, filename, content) {
    const dir = path.join(getSkillDir(skillId), subdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, path.basename(filename));
    fs.writeFileSync(filePath, content || '', 'utf-8');

    // Update skill_files table
    const relativePath = `${subdir}/${path.basename(filename)}`;
    const type = getFileType(subdir);
    await upsertFileRecord(skillId, type, path.basename(filename), relativePath, (content || '').length, true);

    return { name: path.basename(filename), size: (content || '').length };
  },

  async deleteTextFile(skillId, subdir, filename) {
    const filePath = path.join(getSkillDir(skillId), subdir, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);

      // Update skill_files table
      const relativePath = `${subdir}/${path.basename(filename)}`;
      await deleteFileRecord(skillId, relativePath);

      return true;
    }
    return false;
  },

  // ========== Channels ==========
  async listChannels(userId = null, isAdmin = false) {
    const pool = getPool();
    // All users can see all channels, join users table to get creator info
    const [rows] = await pool.execute(
      `SELECT c.*, u.display_name AS created_by_name, u.username AS created_by_username
       FROM ${TABLES.channels} c
       LEFT JOIN ${TABLES.users} u ON c.created_by = u.id
       ORDER BY c.created_at ASC`
    );
    return rows.map(row => ({
      ...row,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      isDefault: !!row.is_default,
      createdByName: row.created_by_name || row.created_by_username || null
    }));
  },

  async getChannel(id) {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.channels} WHERE id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      config: typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config,
      isDefault: !!rows[0].is_default
    };
  },

  async getChannelByType(type) {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.channels} WHERE type = ?`,
      [type]
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      config: typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config,
      isDefault: !!rows[0].is_default
    };
  },

  async getDefaultChannel() {
    const pool = getPool();
    // First try to get enabled default channel
    const [defaultRows] = await pool.execute(
      `SELECT * FROM ${TABLES.channels} WHERE is_default = TRUE AND enabled = TRUE`
    );
    if (defaultRows[0]) {
      return {
        ...defaultRows[0],
        config: typeof defaultRows[0].config === 'string' ? JSON.parse(defaultRows[0].config) : defaultRows[0].config,
        isDefault: true
      };
    }
    // Otherwise get first enabled channel
    const [enabledRows] = await pool.execute(
      `SELECT * FROM ${TABLES.channels} WHERE enabled = TRUE ORDER BY created_at ASC LIMIT 1`
    );
    if (!enabledRows[0]) return null;
    return {
      ...enabledRows[0],
      config: typeof enabledRows[0].config === 'string' ? JSON.parse(enabledRows[0].config) : enabledRows[0].config,
      isDefault: !!enabledRows[0].is_default
    };
  },

  async createChannel(data, createdBy = null) {
    const pool = getPool();
    const id = uuidv4();
    const now = new Date();

    await pool.execute(
      `INSERT INTO ${TABLES.channels} (id, name, type, config, enabled, is_default, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.type,
        JSON.stringify(data.config || {}),
        data.enabled ? 1 : 0,
        0,
        createdBy,
        now
      ]
    );

    return this.getChannel(id);
  },

  async updateChannel(id, data) {
    const pool = getPool();
    const channel = await this.getChannel(id);
    if (!channel) return null;

    const updates = [];
    const params = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      params.push(data.type);
    }
    if (data.config !== undefined) {
      updates.push('config = ?');
      params.push(JSON.stringify(data.config));
    }
    if (data.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(data.enabled ? 1 : 0);
    }
    if (data.isDefault !== undefined) {
      updates.push('is_default = ?');
      params.push(data.isDefault ? 1 : 0);
    }

    if (updates.length > 0) {
      // If setting as default, unset other defaults first
      if (data.isDefault) {
        await pool.execute(`UPDATE ${TABLES.channels} SET is_default = FALSE`);
      }

      params.push(id);
      await pool.execute(
        `UPDATE ${TABLES.channels} SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    return this.getChannel(id);
  },

  async deleteChannel(id) {
    const pool = getPool();
    const [result] = await pool.execute(
      `DELETE FROM ${TABLES.channels} WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  },

  // ========== Publish Records ==========
  async listPublishRecords(skillId) {
    const pool = getPool();
    let sql = `
      SELECT pr.*, c.name as channel_name, c.type as channel_type
      FROM ${TABLES.publish_records} pr
      LEFT JOIN ${TABLES.channels} c ON pr.channel_id = c.id
    `;
    const params = [];

    if (skillId) {
      sql += ' WHERE pr.skill_id = ?';
      params.push(skillId);
    }

    sql += ' ORDER BY pr.published_at DESC';

    const [rows] = await pool.execute(sql, params);
    return rows;
  },

  async createPublishRecord(skillId, channelId) {
    const pool = getPool();
    const id = uuidv4();
    const now = new Date();

    await pool.execute(
      `INSERT INTO ${TABLES.publish_records} (id, skill_id, channel_id, status, published_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, skillId, channelId, 'published', now]
    );

    const [rows] = await pool.execute(
      `SELECT pr.*, c.name as channel_name, c.type as channel_type
       FROM ${TABLES.publish_records} pr
       LEFT JOIN ${TABLES.channels} c ON pr.channel_id = c.id
       WHERE pr.id = ?`,
      [id]
    );
    return rows[0];
  },

  async unpublishRecord(recordId) {
    const pool = getPool();
    const now = new Date();

    await pool.execute(
      `UPDATE ${TABLES.publish_records} SET status = 'unpublished', unpublished_at = ? WHERE id = ? AND status = 'published'`,
      [now, recordId]
    );
  },

  async unpublishRecords(skillId) {
    const pool = getPool();
    const now = new Date();

    // Get current published records
    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.publish_records} WHERE skill_id = ? AND status = 'published'`,
      [skillId]
    );

    // Update to unpublished
    await pool.execute(
      `UPDATE ${TABLES.publish_records} SET status = 'unpublished', unpublished_at = ? WHERE skill_id = ? AND status = 'published'`,
      [now, skillId]
    );

    return rows.map(r => ({ ...r, status: 'unpublished', unpublished_at: now }));
  },

  // ========== Custom Directories ==========
  async listCustomDirs(skillId) {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE skill_id = ? ORDER BY path ASC`,
      [skillId]
    );
    // Convert snake_case to camelCase for frontend compatibility
    return rows.map(row => ({
      ...row,
      parentPath: row.parent_path
    }));
  },

  async createCustomDir(skillId, data) {
    const pool = getPool();
    const { name, parentPath = '' } = data;

    // Validate name
    const RESERVED_DIRS = ['scripts', 'references', 'assets'];
    if (!name || typeof name !== 'string') {
      throw new Error('目录名无效');
    }
    if (RESERVED_DIRS.includes(name.toLowerCase())) {
      throw new Error('目录名不能与系统目录重名');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('目录名只能包含字母、数字、下划线、中划线');
    }

    // Check depth limit (max 3 levels)
    const currentLevel = parentPath ? parentPath.split('/').length : 0;
    if (currentLevel >= 3) {
      throw new Error('目录层级最多支持三级');
    }

    const dirPath = parentPath ? `${parentPath}/${name}` : name;

    // Check for conflicts
    const [existing] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE skill_id = ? AND (path = ? OR path LIKE ?)`,
      [skillId, dirPath, `${dirPath}/%`]
    );
    if (existing.length > 0) {
      throw new Error(`目录路径与已有目录「${existing[0].name}」冲突`);
    }

    const id = uuidv4();
    const now = new Date();

    await pool.execute(
      `INSERT INTO ${TABLES.custom_dirs} (id, skill_id, name, path, parent_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, skillId, name, dirPath, parentPath, now]
    );

    // Create physical directory
    const physicalDir = path.join(getSkillDir(skillId), dirPath);
    fs.mkdirSync(physicalDir, { recursive: true });

    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE id = ?`,
      [id]
    );
    return { ...rows[0], parentPath: rows[0].parent_path };
  },

  async deleteCustomDir(skillId, dirId) {
    const pool = getPool();

    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE id = ? AND skill_id = ?`,
      [dirId, skillId]
    );
    if (rows.length === 0) return false;

    const dir = rows[0];

    // Delete physical directory
    const physicalDir = path.join(getSkillDir(skillId), dir.path);
    if (fs.existsSync(physicalDir)) {
      fs.rmSync(physicalDir, { recursive: true, force: true });
    }

    // Delete file records from skill_files table
    await pool.execute(
      `DELETE FROM ${TABLES.skill_files} WHERE skill_id = ? AND (path = ? OR path LIKE ?)`,
      [skillId, dir.path, `${dir.path}/%`]
    );

    // Delete from database (including child directories)
    await pool.execute(
      `DELETE FROM ${TABLES.custom_dirs} WHERE skill_id = ? AND (id = ? OR path LIKE ?)`,
      [skillId, dirId, `${dir.path}/%`]
    );

    return true;
  },

  async renameCustomDir(skillId, dirId, newName) {
    const pool = getPool();

    // Validate name
    const RESERVED_DIRS = ['scripts', 'references', 'assets'];
    if (!newName || typeof newName !== 'string') {
      throw new Error('目录名无效');
    }
    if (RESERVED_DIRS.includes(newName.toLowerCase())) {
      throw new Error('目录名不能与系统目录重名');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
      throw new Error('目录名只能包含字母、数字、下划线、中划线');
    }

    const [rows] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE id = ? AND skill_id = ?`,
      [dirId, skillId]
    );
    if (rows.length === 0) return null;

    const dir = rows[0];
    const oldPath = dir.path;
    const newPath = dir.parent_path ? `${dir.parent_path}/${newName}` : newName;

    // Check for conflicts
    const [existing] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE skill_id = ? AND id != ? AND (path = ? OR path LIKE ?)`,
      [skillId, dirId, newPath, `${newPath}/%`]
    );
    if (existing.length > 0) {
      throw new Error(`目录路径与已有目录「${existing[0].name}」冲突`);
    }

    // Rename physical directory
    const oldPhysicalDir = path.join(getSkillDir(skillId), oldPath);
    const newPhysicalDir = path.join(getSkillDir(skillId), newPath);
    if (fs.existsSync(oldPhysicalDir)) {
      fs.mkdirSync(path.dirname(newPhysicalDir), { recursive: true });
      fs.renameSync(oldPhysicalDir, newPhysicalDir);
    }

    // Update database
    await pool.execute(
      `UPDATE ${TABLES.custom_dirs} SET name = ?, path = ? WHERE id = ?`,
      [newName, newPath, dirId]
    );

    // Update child directories
    const [children] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE skill_id = ? AND path LIKE ?`,
      [skillId, `${oldPath}/%`]
    );

    for (const child of children) {
      const newChildPath = child.path.replace(oldPath + '/', newPath + '/');
      const newParentPath = child.parent_path.replace(oldPath, newPath);
      await pool.execute(
        `UPDATE ${TABLES.custom_dirs} SET path = ?, parent_path = ? WHERE id = ?`,
        [newChildPath, newParentPath, child.id]
      );
    }

    const [updated] = await pool.execute(
      `SELECT * FROM ${TABLES.custom_dirs} WHERE id = ?`,
      [dirId]
    );
    return { ...updated[0], parentPath: updated[0].parent_path };
  },

  // ========== Custom Directory Files ==========
  listCustomDirFiles(skillId, dirPath) {
    const dir = path.join(getSkillDir(skillId), dirPath);
    if (!fs.existsSync(dir)) return [];

    const result = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      const relativePath = dirPath ? `${dirPath}/${item}` : item;

      if (stat.isDirectory()) {
        const subFiles = this.listCustomDirFiles(skillId, relativePath);
        result.push(...subFiles);
      } else {
        result.push({
          name: item,
          path: relativePath,
          size: stat.size,
          isEditable: this.isEditableFile(item),
          updated_at: stat.mtime.toISOString()
        });
      }
    }

    return result;
  },

  EDITABLE_EXTENSIONS: [
    'txt', 'md', 'markdown', 'rst', 'adoc',
    'py', 'js', 'ts', 'jsx', 'tsx', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
    'rb', 'pl', 'lua', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs',
    'swift', 'kt', 'scala', 'r', 'sql', 'vue', 'svelte',
    'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env', 'cfg', 'conf',
    'properties', 'gitignore', 'dockerignore', 'editorconfig',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
    'log', 'csv', 'tsv'
  ],

  isEditableFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return this.EDITABLE_EXTENSIONS.includes(ext);
  },

  getCustomDirFile(skillId, filePath) {
    const fullPath = path.join(getSkillDir(skillId), filePath);
    if (!fs.existsSync(fullPath)) return null;

    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) return null;

    const filename = path.basename(filePath);
    const isEditable = this.isEditableFile(filename);

    const result = {
      name: filename,
      path: filePath,
      size: stat.size,
      isEditable,
      updated_at: stat.mtime.toISOString()
    };

    if (isEditable) {
      result.content = fs.readFileSync(fullPath, 'utf-8');
    }

    return result;
  },

  async saveCustomDirFile(skillId, filePath, content) {
    const fullPath = path.join(getSkillDir(skillId), filePath);

    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content || '', 'utf-8');

    // Update skill_files table
    const filename = path.basename(filePath);
    const isEditable = this.isEditableFile(filename);
    await upsertFileRecord(skillId, 'custom', filename, filePath, (content || '').length, isEditable);

    return {
      name: filename,
      path: filePath,
      size: (content || '').length
    };
  },

  async deleteCustomDirFile(skillId, filePath) {
    const fullPath = path.join(getSkillDir(skillId), filePath);

    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);

      // Update skill_files table
      await deleteFileRecord(skillId, filePath);

      return true;
    }
    return false;
  },

  async uploadCustomDirFile(skillId, dirPath, filename, buffer) {
    const safeFilename = path.basename(filename);
    const fullPath = path.join(getSkillDir(skillId), dirPath, safeFilename);

    const skillDir = getSkillDir(skillId);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(skillDir)) {
      throw new Error('非法路径');
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);

    // Update skill_files table
    const relativePath = dirPath ? `${dirPath}/${safeFilename}` : safeFilename;
    const isEditable = this.isEditableFile(safeFilename);
    await upsertFileRecord(skillId, 'custom', safeFilename, relativePath, buffer.length, isEditable);

    return {
      name: safeFilename,
      path: relativePath,
      size: buffer.length
    };
  },

  // ========== Skill Files Query ==========
  async listSkillFiles(skillId, type = null) {
    const pool = getPool();
    let sql = `SELECT * FROM ${TABLES.skill_files} WHERE skill_id = ?`;
    const params = [skillId];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY path ASC';
    const [rows] = await pool.execute(sql, params);
    return rows;
  },

  async syncSkillFiles(skillId) {
    const pool = getPool();
    const skillDir = getSkillDir(skillId);
    const stats = { added: 0, updated: 0, removed: 0 };

    // Get existing files from database
    const [existingFiles] = await pool.execute(
      `SELECT path FROM ${TABLES.skill_files} WHERE skill_id = ?`,
      [skillId]
    );
    const existingPaths = new Set(existingFiles.map(f => f.path));

    // Scan file system
    const foundPaths = new Set();
    const subdirs = ['scripts', 'references', 'assets'];

    const scanDir = (dirPath, type) => {
      if (!fs.existsSync(dirPath)) return;

      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          scanDir(itemPath, type);
        } else {
          const relativePath = path.relative(skillDir, itemPath).replace(/\\/g, '/');
          const isEditable = type !== 'asset' && this.isEditableFile(item);

          upsertFileRecord(skillId, type, item, relativePath, stat.size, isEditable);
          foundPaths.add(relativePath);

          if (!existingPaths.has(relativePath)) {
            stats.added++;
          } else {
            stats.updated++;
          }
        }
      }
    };

    // Scan standard directories
    for (const subdir of subdirs) {
      const type = getFileType(subdir);
      scanDir(path.join(skillDir, subdir), type);
    }

    // Scan custom directories
    const customDirs = await this.listCustomDirs(skillId);
    for (const dir of customDirs) {
      const files = this.listCustomDirFiles(skillId, dir.path);
      for (const file of files) {
        foundPaths.add(file.path);
        await upsertFileRecord(skillId, 'custom', file.name, file.path, file.size, file.isEditable);

        if (!existingPaths.has(file.path)) {
          stats.added++;
        } else {
          stats.updated++;
        }
      }
    }

    // Remove files that no longer exist
    for (const existingPath of existingPaths) {
      if (!foundPaths.has(existingPath)) {
        await pool.execute(
          `DELETE FROM ${TABLES.skill_files} WHERE skill_id = ? AND path = ?`,
          [skillId, existingPath]
        );
        stats.removed++;
      }
    }

    return stats;
  },

  // Expose parseFrontmatter for external use
  parseFrontmatter
};

module.exports = db;
