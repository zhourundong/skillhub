const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');
const { generateToken, getTokenExpiresAt, authenticateToken } = require('../middleware/auth');

const DEFAULT_PASSWORD = 'abc123';
const SALT_ROUNDS = 10;

/**
 * Initialize default admin user if no users exist
 */
async function initializeDefaultAdmin() {
  try {
    const count = await db.countUsers();
    if (count === 0) {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
      await db.createUser({
        username: 'admin',
        passwordHash,
        displayName: '超级管理员',
        role: 'admin'
      });
      console.log('Default admin user created: admin / abc123');
    }
  } catch (err) {
    console.error('Error initializing default admin:', err.message);
  }
}

initializeDefaultAdmin();

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);

    res.json({
      token,
      expiresAt: getTokenExpiresAt(token),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

/**
 * PUT /api/auth/password
 * Change current user's password
 */
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '原密码和新密码不能为空' });
    }

    if (newPassword.length < 3) {
      return res.status(400).json({ error: '新密码长度至少 3 位' });
    }

    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const isValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: '原密码错误' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.updateUser(user.id, { passwordHash });

    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: '密码修改失败' });
  }
});

module.exports = router;
