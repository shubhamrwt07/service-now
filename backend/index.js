const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const { pool, initDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

initDB();

// OAuth Login Redirect
app.get('/api/oauth/login', (req, res) => {
  const { instanceUrl } = req.query;
  if (!instanceUrl) return res.status(400).send('Missing instanceUrl');

  let baseUrl = instanceUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  try {
    baseUrl = new URL(baseUrl).origin;
  } catch (e) {
    baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  const clientId = process.env.OAUTH_CLIENT_ID || '';
  const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3005';

  const authUrl = `${baseUrl}/oauth_auth.do?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=useraccount`;
  res.redirect(authUrl);
});

// OAuth Callback Exchange
app.post('/api/oauth/token', async (req, res) => {
  const { code, instanceUrl } = req.body;

  if (!code || !instanceUrl) {
    return res.status(400).json({ error: 'Missing code or instanceUrl' });
  }

  let baseUrl = instanceUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  try {
    baseUrl = new URL(baseUrl).origin;
  } catch (e) {
    baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', process.env.OAUTH_REDIRECT_URI || 'http://localhost:5173');
    params.append('client_id', process.env.OAUTH_CLIENT_ID || '');
    params.append('client_secret', process.env.OAUTH_CLIENT_SECRET || '');

    const response = await axios.post(`${baseUrl}/oauth_token.do`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('OAuth Exchange Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange OAuth code. Check Client ID/Secret in .env' });
  }
});

// 1. Fetch available tables dynamically from sys_db_object
app.post('/api/tables', async (req, res) => {
  const { instanceUrl, authType, username, password, token, cookie } = req.body;

  if (!instanceUrl) return res.status(400).json({ error: 'Missing instance URL' });

  try {
    let headers = {
      'Accept': 'application/json'
    };

    if (authType === 'Basic') {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (authType === 'Bearer') {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (authType === 'X-UserToken') {
      headers['X-UserToken'] = token;
      if (cookie) headers['Cookie'] = cookie;
    }

    let baseUrl = instanceUrl.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    try {
      baseUrl = new URL(baseUrl).origin;
    } catch (e) {
      baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    // Request tables from ServiceNow sys_db_object dictionary with pagination to get ALL tables
    let allTables = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(`${baseUrl}/api/now/table/sys_db_object?sysparm_fields=name,label&sysparm_limit=${limit}&sysparm_offset=${offset}`, {
        headers
      });
      const records = response.data.result;
      
      if (!records || records.length === 0) {
        hasMore = false;
        break;
      }
      
      allTables = allTables.concat(records);
      
      const totalCount = parseInt(response.headers['x-total-count'], 10);
      offset += limit;

      if (!isNaN(totalCount) && offset >= totalCount) {
        hasMore = false;
      } else if (isNaN(totalCount) && records.length === 0) {
        hasMore = false;
      }
    }

    const tables = allTables
      .filter(t => t.name) // Ensure it has a name
      .map(t => ({
        label: t.label || t.name,
        name: t.name
      }));

    // Sort alphabetically by label
    tables.sort((a, b) => a.label.localeCompare(b.label));

    res.json(tables);
  } catch (err) {
    console.error('Error fetching tables from ServiceNow:', err.response?.data || err.message);
    const snError = err.response?.data?.error?.message || err.response?.data?.error?.detail || err.message;
    res.status(500).json({ error: `ServiceNow API Error: ${snError}` });
  }
});

// 2. Fetch Data from ServiceNow (Preview)
app.post('/api/preview', async (req, res) => {
  const { instanceUrl, authType, username, password, token, cookie, tableName, sysparm_query, limit = 100, offset = 0 } = req.body;

  if (!instanceUrl || !tableName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let headers = {
      'Accept': 'application/json'
    };

    if (authType === 'Basic') {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (authType === 'Bearer') {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (authType === 'X-UserToken') {
      headers['X-UserToken'] = token;
      if (cookie) headers['Cookie'] = cookie;
    }

    let baseUrl = instanceUrl.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    try {
      baseUrl = new URL(baseUrl).origin;
    } catch (e) {
      baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }
    let url = `${baseUrl}/api/now/table/${tableName}`;
    let params = `sysparm_limit=${limit}&sysparm_offset=${offset}`;
    if (sysparm_query) {
      params += `&sysparm_query=${encodeURIComponent(sysparm_query)}`;
    }
    url += `?${params}`;

    const response = await axios.get(url, { headers });
    const records = response.data.result;
    const totalCount = response.headers['x-total-count'];
    res.json({ records, totalCount: parseInt(totalCount) || records.length });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch data from ServiceNow' });
  }
});

// 3. Save Migrated Data to Postgres (Full Fetch)
app.post('/api/migrate', async (req, res) => {
  const { instanceUrl, authType, username, password, token, cookie, tableName, sysparm_query } = req.body;

  if (!instanceUrl || !tableName) {
    return res.status(400).json({ error: 'Missing instanceUrl or tableName' });
  }

  try {
    // 1. Ensure dynamic table exists
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, ''); // Basic sanitization
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${safeTableName}" (
        sys_id VARCHAR(100) PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Setup ServiceNow API Headers
    let headers = { 'Accept': 'application/json' };
    if (authType === 'Basic') {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (authType === 'Bearer') {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (authType === 'X-UserToken') {
      headers['X-UserToken'] = token;
      if (cookie) headers['Cookie'] = cookie;
    }

    let baseUrl = instanceUrl.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) baseUrl = 'https://' + baseUrl;
    try { baseUrl = new URL(baseUrl).origin; } catch (e) { baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl; }

    let offset = 0;
    const limit = 1000;
    let savedCount = 0;
    let hasMore = true;

    while (hasMore) {
      let url = `${baseUrl}/api/now/table/${tableName}?sysparm_limit=${limit}&sysparm_offset=${offset}`;
      if (sysparm_query) url += `&sysparm_query=${encodeURIComponent(sysparm_query)}`;

      const response = await axios.get(url, { headers });
      const records = response.data.result;

      if (!records || records.length === 0) {
        hasMore = false;
        break;
      }

      for (const record of records) {
        if (record.sys_id) {
          await pool.query(
            `INSERT INTO "${safeTableName}" (sys_id, data) 
             VALUES ($1, $2)
             ON CONFLICT (sys_id) 
             DO UPDATE SET data = EXCLUDED.data, created_at = CURRENT_TIMESTAMP`,
            [record.sys_id, record]
          );
          savedCount++;
        }
      }

      const totalCount = parseInt(response.headers['x-total-count'], 10);
      offset += limit;

      if (!isNaN(totalCount) && offset >= totalCount) {
        hasMore = false;
      } else if (isNaN(totalCount) && records.length === 0) {
        hasMore = false;
      }
    }

    res.json({ message: `Successfully migrated ${savedCount} records to local "${safeTableName}" table.`, count: savedCount });
  } catch (err) {
    console.error('Migration error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to migrate data to local database' });
  }
});

// 4. Get list of local tables
app.get('/api/local-tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    res.json(result.rows.map(row => row.table_name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch local tables' });
  }
});

// 5. Get Migrated Data from Postgres
app.get('/api/data/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  try {
    // Check if table exists first
    const tableExistsResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      );
    `, [safeTableName]);

    if (!tableExistsResult.rows[0].exists) {
       return res.json({ data: [], total: 0 });
    }

    const result = await pool.query(
      `SELECT * FROM "${safeTableName}" ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM "${safeTableName}"`
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
