const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const { pool, initDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// initDB();

// 1. Fetch available tables dynamically from sys_db_object
app.post('/api/tables', async (req, res) => {
  const { instanceUrl, authType, username, password, token, cookie } = req.body;

  if (!instanceUrl) return res.status(400).json({ error: 'Missing instance URL' });

  try {frontend/Dockerfile
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

    // Request tables from ServiceNow sys_db_object dictionary
    const response = await axios.get(`${baseUrl}/api/now/table/sys_db_object?sysparm_fields=name,label&sysparm_limit=2000`, {
      headers
    });
    const tables = response.data.result
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

// 2. Fetch and Migrate Data
app.post('/api/migrate', async (req, res) => {
  const { instanceUrl, authType, username, password, token, cookie, tableName, sysparm_query } = req.body;

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
    if (sysparm_query) {
      url += `?sysparm_query=${encodeURIComponent(sysparm_query)}&sysparm_limit=100`;
    } else {
      url += `?sysparm_limit=100`;
    }

    const response = await axios.get(url, { headers });

    const records = response.data.result;

    // Save to PostgreSQL
    let savedCount = 0;
    for (const record of records) {
      const sys_id = record.sys_id;
      if (sys_id) {
        await pool.query(
          `INSERT INTO servicenow_data (table_name, sys_id, data) 
           VALUES ($1, $2, $3)
           ON CONFLICT (table_name, sys_id) 
           DO UPDATE SET data = EXCLUDED.data, created_at = CURRENT_TIMESTAMP`,
          [tableName, sys_id, record]
        );
        savedCount++;
      }
    }

    res.json({ message: `Successfully migrated ${savedCount} records from ${tableName}.`, count: savedCount });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch or migrate data from ServiceNow' });
  }
});

// 3. Get Migrated Data from Postgres
app.get('/api/data/:tableName', async (req, res) => {
  const { tableName } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM servicenow_data WHERE table_name = $1 ORDER BY created_at DESC`,
      [tableName]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
