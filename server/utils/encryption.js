const crypto = require('crypto');

// 加密算法
const ALGORITHM = 'aes-256-gcm';
// 密钥长度（字节）
const KEY_LENGTH = 32;
// IV 长度（字节）
const IV_LENGTH = 16;
// 认证标签长度（字节）
const AUTH_TAG_LENGTH = 16;

// 敏感字段列表
const SENSITIVE_FIELDS = ['token', 'password', 'privateKey', 'passphrase', 'secret', 'apiKey', 'api_key'];

// 固定加密密钥（用于生产环境请通过环境变量 ENCRYPTION_KEY 配置）
// 这是一个固定的默认密钥，确保所有实例使用相同的密钥
const DEFAULT_ENCRYPTION_KEY = 'skillhub-encryption-key-2026-fixed';

/**
 * 获取加密密钥
 * 优先使用环境变量 ENCRYPTION_KEY，否则使用固定默认密钥
 */
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;

  if (envKey) {
    // 如果环境变量提供的是 hex 编码的密钥
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    // 如果是普通字符串，使用 PBKDF2 派生密钥
    return crypto.pbkdf2Sync(envKey, 'skillhub-salt', 100000, KEY_LENGTH, 'sha256');
  }

  // 使用固定默认密钥（确保所有实例加密解密一致）
  return crypto.pbkdf2Sync(DEFAULT_ENCRYPTION_KEY, 'skillhub-salt', 100000, KEY_LENGTH, 'sha256');
}

/**
 * 加密文本
 * @param {string} plaintext - 明文
 * @returns {string} - 加密后的文本，格式：iv:authTag:ciphertext（hex 编码）
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    return plaintext;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 返回格式：iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  } catch (err) {
    console.error('[Encryption] Encrypt error:', err.message);
    return plaintext;
  }
}

/**
 * 解密文本
 * @param {string} encryptedData - 加密的文本，格式：iv:authTag:ciphertext
 * @returns {string} - 解密后的明文
 */
function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    return encryptedData;
  }

  // 检查是否是加密格式（包含两个冒号分隔符）
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    // 不是加密格式，返回原文（可能是未加密的旧数据）
    return encryptedData;
  }

  try {
    const [ivHex, authTagHex, ciphertext] = parts;

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (err) {
    console.error('[Encryption] Decrypt error:', err.message);
    // 解密失败，返回原文（可能是未加密的旧数据）
    return encryptedData;
  }
}

/**
 * 检查字符串是否已加密
 * @param {string} str - 待检查的字符串
 * @returns {boolean} - 是否已加密
 */
function isEncrypted(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }

  const parts = str.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  // IV 应该是 16 字节 = 32 hex 字符
  // AuthTag 应该是 16 字节 = 32 hex 字符
  // Ciphertext 至少 1 字节 = 2 hex 字符
  return ivHex.length === 32 && authTagHex.length === 32 && ciphertext.length >= 2 &&
    /^[0-9a-fA-F]+$/.test(ivHex) && /^[0-9a-fA-F]+$/.test(authTagHex) && /^[0-9a-fA-F]+$/.test(ciphertext);
}

/**
 * 加密配置对象中的敏感字段
 * @param {object} config - 配置对象
 * @param {string} channelType - 渠道类型
 * @returns {object} - 加密后的配置对象
 */
function encryptConfig(config, channelType) {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const encrypted = { ...config };

  // 根据渠道类型确定需要加密的字段
  let fieldsToEncrypt = [...SENSITIVE_FIELDS];

  // 特殊处理 headers 中的敏感信息
  if (encrypted.headers && typeof encrypted.headers === 'object') {
    const encryptedHeaders = {};
    for (const [key, value] of Object.entries(encrypted.headers)) {
      // 检查 header key 是否包含敏感关键词
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('auth') || lowerKey.includes('token') || lowerKey.includes('key') || lowerKey.includes('secret')) {
        encryptedHeaders[key] = encrypt(value);
      } else {
        encryptedHeaders[key] = value;
      }
    }
    encrypted.headers = encryptedHeaders;
  }

  // 加密敏感字段
  for (const field of fieldsToEncrypt) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encrypt(encrypted[field]);
    }
  }

  return encrypted;
}

/**
 * 解密配置对象中的敏感字段
 * @param {object} config - 加密的配置对象
 * @param {string} channelType - 渠道类型
 * @returns {object} - 解密后的配置对象
 */
function decryptConfig(config, channelType) {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const decrypted = { ...config };

  // 解密敏感字段
  for (const field of SENSITIVE_FIELDS) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      decrypted[field] = decrypt(decrypted[field]);
    }
  }

  // 特殊处理 headers 中的敏感信息
  if (decrypted.headers && typeof decrypted.headers === 'object') {
    const decryptedHeaders = {};
    for (const [key, value] of Object.entries(decrypted.headers)) {
      if (typeof value === 'string') {
        decryptedHeaders[key] = decrypt(value);
      } else {
        decryptedHeaders[key] = value;
      }
    }
    decrypted.headers = decryptedHeaders;
  }

  return decrypted;
}

/**
 * 生成新的加密密钥（用于配置环境变量）
 * @returns {string} - hex 编码的 32 字节密钥
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptConfig,
  decryptConfig,
  generateKey,
  SENSITIVE_FIELDS
};
