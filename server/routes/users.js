const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const DEFAULT_PASSWORD = 'abc123';
const SALT_ROUNDS = 10;

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/users
 * List all users
 */
router.get('/', async (req, res) => {
  try {
    const { page, pageSize, keyword } = req.query;
    const result = await db.listUsers({ page, pageSize, keyword });
    res.json(result);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

/**
 * POST /api/users
 * Create a new user
 */
router.post('/', async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;

    if (!username) {
      return res.status(400).json({ error: '用户名不能为空' });
    }

    if (username.length < 2 || username.length > 50) {
      return res.status(400).json({ error: '用户名长度2-50位' });
    }

    // Check if username exists
    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const passwordHash = await bcrypt.hash(password || DEFAULT_PASSWORD, SALT_ROUNDS);

    const user = await db.createUser({
      username,
      passwordHash,
      displayName: displayName || username,
      role: role || 'user'
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

/**
 * PUT /api/users/:id
 * Update a user
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, role } = req.body;

    const user = await db.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // Prevent changing own role from admin to user
    if (req.user.id === id && role === 'user' && user.role === 'admin') {
      const adminCount = await db.countAdminUsers();
      if (adminCount <= 1) {
        return res.status(400).json({ error: '不能取消最后一个管理员的权限' });
      }
    }

    const updated = await db.updateUser(id, { displayName, role });

    res.json({
      id: updated.id,
      username: updated.username,
      displayName: updated.display_name,
      role: updated.role
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: '更新用户失败' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a user
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({ error: '不能删除自己' });
    }

    const user = await db.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // Prevent deleting last admin
    if (user.role === 'admin') {
      const adminCount = await db.countAdminUsers();
      if (adminCount <= 1) {
        return res.status(400).json({ error: '不能删除最后一个管理员' });
      }
    }

    await db.deleteUser(id);
    res.json({ message: '用户已删除' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: '删除用户失败' });
  }
});

/**
 * PUT /api/users/:id/reset-password
 * Reset user's password to default
 */
router.put('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const user = await db.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const password = newPassword || DEFAULT_PASSWORD;
    if (password.length < 3) {
      return res.status(400).json({ error: '密码长度至少3位' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.updateUser(id, { passwordHash });

    res.json({ message: '密码已重置' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

module.exports = router;
