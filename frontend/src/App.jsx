import React, { useState } from 'react';
import axios from 'axios';
import { Database, Filter, Table2, RefreshCcw, LogIn, Server, Key, Eye } from 'lucide-react';
import './index.css';

const API_URL = 'http://localhost:5000/api';

function App() {
  const [credentials, setCredentials] = useState({ instanceUrl: '', authType: 'Basic', username: '', password: '', token: '', cookie: '' });
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');

  // Filter Builder state
  const [filters, setFilters] = useState([{ field: '', operator: '=', value: '' }]);

  // Data state
  const [data, setData] = useState([]);

  // UI states
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleCredentialChange = (e) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const fetchTables = async () => {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await axios.post(`${API_URL}/tables`, credentials);
      setTables(res.data);
      setMessage('Successfully connected and fetched tables.');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const handleAddFilter = () => {
    setFilters([...filters, { field: '', operator: '=', value: '' }]);
  };

  const handleFilterChange = (index, field, value) => {
    const newFilters = [...filters];
    newFilters[index][field] = value;
    setFilters(newFilters);
  };

  const buildSysparmQuery = () => {
    return filters
      .filter(f => f.field && f.value)
      .map(f => `${f.field}${f.operator}${f.value}`)
      .join('^');
  };

  const handleMigrate = async () => {
    setLoading(true);
    setMessage('');
    setError('');

    const sysparm_query = buildSysparmQuery();

    try {
      const res = await axios.post(`${API_URL}/migrate`, {
        ...credentials,
        tableName: selectedTable,
        sysparm_query
      });
      setMessage(res.data.message);

      // After migrating, fetch from local postgres
      fetchMigratedData();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const fetchMigratedData = async () => {
    try {
      const res = await axios.get(`${API_URL}/data/${selectedTable}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar for connection */}
      <div className="sidebar">
        <h1><Database size={24} /> ServiceNow</h1>

        <div className="card">
          <h2>Connection</h2>
          <div className="form-group">
            <label>Instance URL</label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <Server size={16} color="var(--text-secondary)" style={{ margin: '0 10px' }} />
              <input
                type="text"
                name="instanceUrl"
                placeholder="https://dev12345.service-now.com"
                value={credentials.instanceUrl}
                onChange={handleCredentialChange}
                style={{ border: 'none', flex: 1, paddingLeft: 0, outline: 'none' }}
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Auth Type</label>
            <select name="authType" value={credentials.authType} onChange={handleCredentialChange}>
              <option value="Basic">Basic (Username/Password)</option>
              <option value="Bearer">OAuth Bearer Token</option>
              <option value="X-UserToken">X-UserToken (UI Session)</option>
            </select>
          </div>

          {credentials.authType === 'Basic' && (
            <>
              <div className="form-group">
                <label>Username</label>
                <input type="text" name="username" value={credentials.username} onChange={handleCredentialChange} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" name="password" value={credentials.password} onChange={handleCredentialChange} />
              </div>
            </>
          )}

          {credentials.authType === 'Bearer' && (
            <div className="form-group">
              <label>Bearer Token</label>
              <input type="text" name="token" placeholder="eyJhbGciOi..." value={credentials.token} onChange={handleCredentialChange} />
            </div>
          )}

          {credentials.authType === 'X-UserToken' && (
            <>
              <div className="form-group">
                <label>X-UserToken</label>
                <input type="text" name="token" placeholder="378b035bc..." value={credentials.token} onChange={handleCredentialChange} />
              </div>
              <div className="form-group">
                <label>Cookie Header (Optional)</label>
                <input type="text" name="cookie" placeholder="JSESSIONID=..." value={credentials.cookie} onChange={handleCredentialChange} />
              </div>
            </>
          )}

          <button onClick={fetchTables} disabled={loading} style={{ width: '100%', marginTop: '10px' }}>
            {loading ? <RefreshCcw size={18} /> : <LogIn size={18} />} Connect
          </button>
        </div>

        {tables.length > 0 && (
          <div className="card">
            <h2>Select Table</h2>
            <div className="form-group">
              <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}>
                <option value="">-- Choose Table --</option>
                {tables.map(t => (
                  <option key={t.name} value={t.name}>{t.label} ({t.name})</option>
                ))}
              </select>
            </div>
            {selectedTable && (
              <button className="btn-secondary" onClick={fetchMigratedData} style={{ width: '100%' }}>
                <Eye size={18} /> View Local Data
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="main-content">
        <h1>Data Migration Dashboard</h1>

        {message && <div className="success-text">{message}</div>}
        {error && <div className="error-text">{error}</div>}

        {selectedTable && (
          <>
            <div className="card">
              <h2><Filter size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Builder</h2>
              {filters.map((filter, idx) => (
                <div key={idx} className="filter-builder">
                  <input
                    type="text"
                    placeholder="Field name (e.g., active)"
                    value={filter.field}
                    onChange={(e) => handleFilterChange(idx, 'field', e.target.value)}
                  />
                  <select value={filter.operator} onChange={(e) => handleFilterChange(idx, 'operator', e.target.value)} style={{ flex: 0.5 }}>
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value="LIKE">contains</option>
                    <option value="IN">in</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Value (e.g., true)"
                    value={filter.value}
                    onChange={(e) => handleFilterChange(idx, 'value', e.target.value)}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button className="btn-secondary" onClick={handleAddFilter}>+ Add Filter</button>
                <button onClick={handleMigrate} disabled={loading}>
                  {loading ? <RefreshCcw size={18} /> : <Database size={18} />} Migrate Data
                </button>
              </div>
            </div>

            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2><Table2 size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Migrated Data ({data.length})</h2>
              {data.length > 0 ? (
                <div className="data-table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Sys ID</th>
                        <th>Created At (Local)</th>
                        <th>Record Data (JSON)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row) => (
                        <tr key={row.sys_id}>
                          <td>{row.sys_id}</td>
                          <td>{new Date(row.created_at).toLocaleString()}</td>
                          <td>
                            <pre style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {JSON.stringify(row.data).substring(0, 100)}...
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>No data found in local database for this table.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
