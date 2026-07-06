const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDB = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS servicenow_data (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      sys_id VARCHAR(100) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(table_name, sys_id)
    );
  `;
  try {
    await pool.query(query);
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

module.exports = { pool, initDB };
