const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'skillhub-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Generate JWT token for user
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function getTokenExpiresAt(token) {
  const decoded = jwt.decode(token);
  return decoded?.exp ? decoded.exp * 1000 : null;
}

/**
 * Verify JWT token and attach user to request
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({
        error: err.name === 'TokenExpiredError' ? '登录已过期，请重新登录' : '登录无效，请重新登录'
      });
    }

    req.user = user;
    next();
  });
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '未登录' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  next();
}

/**
 * Require resource owner or admin
 * @param {Function} getResourceUserId - Function to get resource owner ID from request
 */
function requireOwnerOrAdmin(getResourceUserId) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    try {
      const resourceUserId = await getResourceUserId(req);

      if (req.user.id !== resourceUserId) {
        return res.status(403).json({ error: '没有权限操作此资源' });
      }

      next();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    req.user = err ? null : user;
    next();
  });
}

module.exports = {
  generateToken,
  getTokenExpiresAt,
  authenticateToken,
  requireAdmin,
  requireOwnerOrAdmin,
  optionalAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
