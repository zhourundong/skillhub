-- SkillHub MySQL Database Initialization Script
-- Note: Database should be created before running this script
-- This script only creates tables

-- 0. Users table
CREATE TABLE IF NOT EXISTS t_sh_users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1. Skills table
CREATE TABLE IF NOT EXISTS t_sh_skills (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  skill_content LONGTEXT,
  version VARCHAR(50) DEFAULT '1.0.0',
  category VARCHAR(100),
  status ENUM('draft', 'published', 'unpublished') DEFAULT 'draft',
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES t_sh_users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES t_sh_users(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_name (name),
  INDEX idx_created_at (created_at),
  INDEX idx_updated_at (updated_at),
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Channels table
CREATE TABLE IF NOT EXISTS t_sh_channels (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config JSON,
  enabled BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES t_sh_users(id) ON DELETE SET NULL,
  INDEX idx_type (type),
  INDEX idx_enabled (enabled),
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Publish records table
CREATE TABLE IF NOT EXISTS t_sh_publish_records (
  id VARCHAR(36) PRIMARY KEY,
  skill_id VARCHAR(36) NOT NULL,
  channel_id VARCHAR(36) NOT NULL,
  version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  status ENUM('published', 'unpublished') DEFAULT 'published',
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  unpublished_at DATETIME NULL,
  FOREIGN KEY (skill_id) REFERENCES t_sh_skills(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES t_sh_channels(id) ON DELETE CASCADE,
  INDEX idx_skill_id (skill_id),
  INDEX idx_channel_id (channel_id),
  INDEX idx_status (status),
  INDEX idx_published_at (published_at),
  INDEX idx_skill_version (skill_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Custom directories table
CREATE TABLE IF NOT EXISTS t_sh_custom_dirs (
  id VARCHAR(36) PRIMARY KEY,
  skill_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  parent_path VARCHAR(500) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES t_sh_skills(id) ON DELETE CASCADE,
  INDEX idx_skill_id (skill_id),
  UNIQUE KEY uk_skill_path (skill_id, path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Skill files table (optional, for tracking files)
CREATE TABLE IF NOT EXISTS t_sh_skill_files (
  id VARCHAR(36) PRIMARY KEY,
  skill_id VARCHAR(36) NOT NULL,
  type ENUM('script', 'reference', 'asset', 'custom') NOT NULL,
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  size INT DEFAULT 0,
  is_editable BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES t_sh_skills(id) ON DELETE CASCADE,
  INDEX idx_skill_type (skill_id, type),
  INDEX idx_path (path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6、插入管理员账户
INSERT INTO t_sh_users (id, username, password_hash, display_name, `role`) VALUES('7ed0cc80-4207-4b1e-ae83-ff40046193f4', 'admin', '$2b$10$WxHpX94GkJiZU8audH/tmuNAgH3YTCPCFaL3aY9Wkmts0LXXJedn.', '超级管理员', 'admin');

-- ========== 迁移脚本 ==========
-- 以下语句用于现有数据库升级，新数据库可忽略

-- 为发布记录表添加版本号字段（如果不存在）
-- ALTER TABLE t_sh_publish_records ADD COLUMN version VARCHAR(50) NOT NULL DEFAULT '1.0.0' AFTER channel_id;
-- ALTER TABLE t_sh_publish_records ADD INDEX idx_skill_version (skill_id, version);

-- 为现有发布记录设置版本号（从关联的技能表获取）
-- UPDATE t_sh_publish_records pr
-- JOIN t_sh_skills s ON pr.skill_id = s.id
-- SET pr.version = s.version
-- WHERE pr.version = '1.0.0' OR pr.version IS NULL;