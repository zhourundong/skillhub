/**
 * Migration: Add created_by to channels table
 * Run this script if upgrading from a previous version
 *
 * Usage: node server/db/migrate-channels.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../server/.env.development') });

const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'skillhub',
    multipleStatements: true
  });

  try {
    console.log('Checking if created_by column exists...');

    // Check if column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 't_sh_channels'
      AND COLUMN_NAME = 'created_by'
    `, [process.env.MYSQL_DATABASE || 'skillhub']);

    if (columns.length > 0) {
      console.log('Column created_by already exists. Skipping migration.');
      return;
    }

    console.log('Adding created_by column to t_sh_channels table...');

    // Add created_by column
    await connection.execute(`
      ALTER TABLE t_sh_channels
      ADD COLUMN created_by VARCHAR(36) NULL,
      ADD INDEX idx_created_by (created_by)
    `);

    // Add foreign key constraint (optional, may fail if users table doesn't exist)
    try {
      await connection.execute(`
        ALTER TABLE t_sh_channels
        ADD CONSTRAINT fk_channels_created_by
        FOREIGN KEY (created_by) REFERENCES t_sh_users(id) ON DELETE SET NULL
      `);
      console.log('Foreign key constraint added.');
    } catch (fkErr) {
      console.log('Warning: Could not add foreign key constraint:', fkErr.message);
    }

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
