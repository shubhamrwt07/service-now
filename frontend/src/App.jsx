import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Database, Filter, Table2, RefreshCcw, LogIn, Server, Key, Eye, HardDrive } from 'lucide-react';
import './index.css';

const API_URL = 'http://localhost:5000/api';

function App() {
  const [activeView, setActiveView] = useState('migration');

  // Connection & SNOW States
  const [credentials, setCredentials] = useState({ instanceUrl: '', authType: 'Basic', username: '', password: '', token: '', cookie: '' });
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');

  // Table Search & Pagination States
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const TABLES_PER_PAGE = 50;

  // Local DB States
  const [localTablesList, setLocalTablesList] = useState([]);
  const [selectedLocalTable, setSelectedLocalTable] = useState('');

  // Filter Builder state
  const [filters, setFilters] = useState([{ field: '', operator: '=', value: '' }]);

  // Data state
  const [data, setData] = useState([]);
  const [previewData, setPreviewData] = useState(null);

  // Pagination states
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [localOffset, setLocalOffset] = useState(0);
  const [localTotal, setLocalTotal] = useState(0);
  const PAGE_LIMIT = 100;

  // UI states
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const savedInstanceUrl = localStorage.getItem('oauth_instanceUrl');
      if (savedInstanceUrl) {
        exchangeOAuthCode(code, savedInstanceUrl);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const exchangeOAuthCode = async (code, instanceUrl) => {
    setLoading(true);
    setMessage('Exchanging OAuth code...');
    try {
      const res = await axios.post(`${API_URL}/oauth/token`, { code, instanceUrl });
      const accessToken = res.data.access_token;

      setCredentials(prev => ({
        ...prev,
        instanceUrl,
        authType: 'Bearer',
        token: accessToken
      }));
      setMessage('Successfully logged in via OAuth!');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const handleOAuthLogin = () => {
    if (!credentials.instanceUrl) {
      setError('Please enter your Instance URL first.');
      return;
    }
    localStorage.setItem('oauth_instanceUrl', credentials.instanceUrl);
    window.location.href = `${API_URL}/oauth/login?instanceUrl=${encodeURIComponent(credentials.instanceUrl)}`;
  };

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

  const fetchLocalTablesList = async () => {
    try {
      const res = await axios.get(`${API_URL}/local-tables`);
      setLocalTablesList(res.data);
    } catch (err) {
      console.error(err);
    }
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

  const handlePreview = async (offset = 0) => {
    setLoading(true);
    setMessage('');
    setError('');

    const sysparm_query = buildSysparmQuery();

    try {
      const res = await axios.post(`${API_URL}/preview`, {
        ...credentials,
        tableName: selectedTable,
        sysparm_query,
        limit: PAGE_LIMIT,
        offset: offset
      });
      setPreviewData(res.data.records);
      setPreviewTotal(res.data.totalCount);
      setPreviewOffset(offset);
      setMessage(`Fetched ${res.data.records.length} records from ServiceNow.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const handleMigrate = async () => {
    if (!selectedTable) return;
    setLoading(true);
    setMessage('Migration started. This may take a while...');
    setError('');

    const sysparm_query = buildSysparmQuery();

    try {
      const res = await axios.post(`${API_URL}/migrate`, {
        ...credentials,
        tableName: selectedTable,
        sysparm_query
      });
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const fetchMigratedData = async (tableName, offset = 0) => {
    if (!tableName) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/data/${tableName}?limit=${PAGE_LIMIT}&offset=${offset}`);
      setData(res.data.data);
      setLocalTotal(res.data.total);
      setLocalOffset(offset);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const onSelectLocalTable = (table) => {
    setSelectedLocalTable(table);
    fetchMigratedData(table, 0);
  };

  const getDisplayValue = (record) => {
    if (!record) return '';
    const data = record.data || record;
    return data.name || data.short_description || data.number || data.user_name || data.title || data.email || 'N/A';
  };

  const filteredTables = tables.filter(t =>
    (t.name || '').toLowerCase().includes(tableSearch.toLowerCase()) ||
    (t.label || '').toLowerCase().includes(tableSearch.toLowerCase())
  );
  const paginatedTables = filteredTables.slice((tablePage - 1) * TABLES_PER_PAGE, tablePage * TABLES_PER_PAGE);

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>

      {/* Top Navigation */}
      <div style={{ width: '100%', padding: '16px 24px', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ margin: 0, marginRight: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}><Database size={24} /> Data Hub</h2>
        <button className={activeView === 'migration' ? '' : 'btn-secondary'} onClick={() => setActiveView('migration')}>ServiceNow Migration</button>
        <button className={activeView === 'local' ? '' : 'btn-secondary'} onClick={() => { setActiveView('local'); fetchLocalTablesList(); }}>Local DB Explorer</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <div className="sidebar" style={{ overflowY: 'auto' }}>
          {activeView === 'migration' ? (
            <>
              <h1><Server size={24} /> ServiceNow</h1>
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
                  <h2>Select Table ({tables.length})</h2>

                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <input
                      type="text"
                      placeholder="Search table name..."
                      value={tableSearch}
                      onChange={(e) => { setTableSearch(e.target.value); setTablePage(1); }}
                    />
                  </div>

                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <ul style={{ listStyle: 'none', padding: '4px', margin: 0, display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '350px', overflowY: 'auto', overflowX: 'hidden' }}>
                      {paginatedTables.length === 0 && <p style={{ color: 'var(--text-secondary)', padding: '8px', fontSize: '0.9rem' }}>No tables match your search.</p>}
                      {paginatedTables.map(t => (
                        <li
                          key={t.name}
                          onClick={() => { setSelectedTable(t.name); setPreviewData(null); }}
                          style={{
                            padding: '8px 10px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            background: selectedTable === t.name ? 'var(--accent-color)' : 'transparent',
                            color: selectedTable === t.name ? '#fff' : 'var(--text-primary)',
                            transition: 'background 0.2s',
                            wordBreak: 'break-word',
                            lineHeight: '1.3'
                          }}
                          onMouseEnter={(e) => { if (selectedTable !== t.name) e.currentTarget.style.background = 'var(--border-color)'; }}
                          onMouseLeave={(e) => { if (selectedTable !== t.name) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{ fontSize: '0.85rem', fontWeight: selectedTable === t.name ? '600' : '500' }}>{t.label}</div>
                          <div style={{ fontSize: '0.75rem', opacity: selectedTable === t.name ? 0.9 : 0.7, marginTop: '2px', wordBreak: 'break-all' }}>{t.name}</div>
                        </li>
                      ))}
                    </ul>

                    {/* Pagination Controls */}
                    {filteredTables.length > TABLES_PER_PAGE && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderTop: '1px solid var(--border-color)', background: 'var(--panel-bg)', gap: '8px' }}>
                        <button
                          className="btn-secondary"
                          disabled={tablePage === 1}
                          onClick={() => setTablePage(p => p - 1)}
                          style={{ padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap', flex: 1 }}
                        >
                          &larr; Prev
                        </button>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: '500' }}>
                          {tablePage} / {Math.ceil(filteredTables.length / TABLES_PER_PAGE)}
                        </span>
                        <button
                          className="btn-secondary"
                          disabled={tablePage * TABLES_PER_PAGE >= filteredTables.length}
                          onClick={() => setTablePage(p => p + 1)}
                          style={{ padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap', flex: 1 }}
                        >
                          Next &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <h1><HardDrive size={24} /> Local Database</h1>
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ margin: 0 }}>Migrated Tables</h2>
                  <button className="btn-secondary" onClick={fetchLocalTablesList} style={{ padding: '6px' }} title="Refresh">
                    <RefreshCcw size={14} />
                  </button>
                </div>

                {localTablesList.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No tables found.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {localTablesList.map(table => (
                      <li
                        key={table}
                        onClick={() => onSelectLocalTable(table)}
                        style={{
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          background: selectedLocalTable === table ? 'var(--accent-color)' : 'transparent',
                          color: selectedLocalTable === table ? '#fff' : 'var(--text-primary)',
                          transition: 'background 0.2s',
                          fontSize: '0.95rem'
                        }}
                        onMouseEnter={(e) => { if (selectedLocalTable !== table) e.currentTarget.style.background = 'var(--border-color)'; }}
                        onMouseLeave={(e) => { if (selectedLocalTable !== table) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Table2 size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '8px' }} />
                        {table}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div className="main-content">
          {message && <div className="success-text" style={{ marginBottom: '16px' }}>{message}</div>}
          {error && <div className="error-text" style={{ marginBottom: '16px' }}>{error}</div>}

          {activeView === 'migration' ? (
            <>
              {!selectedTable ? (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <h3>Connect to ServiceNow and select a table to begin.</h3>
                </div>
              ) : (
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
                      <button onClick={() => handlePreview(0)} disabled={loading}>
                        {loading ? <RefreshCcw size={18} /> : <Eye size={18} />} Fetch Preview
                      </button>
                    </div>
                  </div>

                  {previewData && (
                    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2><Eye size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> ServiceNow Preview ({previewTotal || previewData.length})</h2>
                        <button onClick={handleMigrate} disabled={loading}>
                          {loading ? <RefreshCcw size={18} /> : <Database size={18} />} Save All to Local DB
                        </button>
                      </div>
                      {previewData.length > 0 ? (
                        <div className="data-table-wrapper" style={{ marginTop: '16px' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Sys ID</th>
                                <th>Name / Identifier</th>
                                <th>Record Data (JSON)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.map((row) => (
                                <tr key={row.sys_id} onClick={() => setSelectedRecord(row)} style={{ cursor: 'pointer' }}>
                                  <td>{row.sys_id}</td>
                                  <td><strong style={{ color: 'var(--text-primary)' }}>{getDisplayValue(row)}</strong></td>
                                  <td>
                                    <pre style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {JSON.stringify(row).substring(0, 100)}...
                                    </pre>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>No records found in ServiceNow.</p>
                      )}

                      {/* Preview Pagination */}
                      {previewData.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '10px', background: 'var(--bg-color)', borderRadius: '6px' }}>
                          <button
                            className="btn-secondary"
                            onClick={() => handlePreview(previewOffset - PAGE_LIMIT)}
                            disabled={previewOffset === 0 || loading}
                            style={{ padding: '6px 12px', width: 'auto' }}
                          >
                            &larr; Previous
                          </button>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Showing {previewOffset + 1} to {previewOffset + previewData.length} of {previewTotal || '...'}
                          </span>
                          <button
                            className="btn-secondary"
                            onClick={() => handlePreview(previewOffset + PAGE_LIMIT)}
                            disabled={previewData.length < PAGE_LIMIT || loading}
                            style={{ padding: '6px 12px', width: 'auto' }}
                          >
                            Next &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {!selectedLocalTable ? (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <h3>Select a table from the sidebar to view local data.</h3>
                </div>
              ) : (
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h2><Table2 size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {selectedLocalTable} ({localTotal})</h2>
                  {loading && <p style={{ color: 'var(--text-secondary)' }}>Loading data...</p>}
                  {!loading && data.length > 0 ? (
                    <div className="data-table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            <th>Sys ID</th>
                            <th>Created At (Local)</th>
                            <th>Name / Identifier</th>
                            <th>Record Data (JSON)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((row) => (
                            <tr key={row.sys_id} onClick={() => setSelectedRecord(row.data || row)} style={{ cursor: 'pointer' }}>
                              <td>{row.sys_id}</td>
                              <td>{new Date(row.created_at).toLocaleString()}</td>
                              <td><strong style={{ color: 'var(--text-primary)' }}>{getDisplayValue(row)}</strong></td>
                              <td>
                                <pre style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {JSON.stringify(row.data).substring(0, 100)}...
                                </pre>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : !loading && (
                    <p style={{ color: 'var(--text-secondary)' }}>No data found in local database for this table.</p>
                  )}

                  {/* Local DB Pagination */}
                  {!loading && localTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '10px', background: 'var(--bg-color)', borderRadius: '6px' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => fetchMigratedData(selectedLocalTable, localOffset - PAGE_LIMIT)}
                        disabled={localOffset === 0}
                        style={{ padding: '6px 12px', width: 'auto' }}
                      >
                        &larr; Previous
                      </button>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Page {Math.floor(localOffset / PAGE_LIMIT) + 1} of {Math.ceil(localTotal / PAGE_LIMIT) || 1}
                      </span>
                      <button
                        className="btn-secondary"
                        onClick={() => fetchMigratedData(selectedLocalTable, localOffset + PAGE_LIMIT)}
                        disabled={localOffset + PAGE_LIMIT >= localTotal}
                        style={{ padding: '6px 12px', width: 'auto' }}
                      >
                        Next &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Record Details Modal */}
      {selectedRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000
        }} onClick={() => setSelectedRecord(null)}>
          <div style={{
            background: 'var(--panel-bg)', padding: '24px', borderRadius: '12px',
            width: '80%', maxWidth: '800px', maxHeight: '80vh', display: 'flex',
            flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid var(--border-color)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Table2 size={20} color="var(--accent-color)" /> Record Details
              </h2>
              <button className="btn-secondary" onClick={() => setSelectedRecord(null)} style={{ padding: '6px 12px' }}>Close</button>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto', background: 'var(--bg-color)',
              borderRadius: '6px', border: '1px solid var(--border-color)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <tbody>
                  {Object.entries(selectedRecord).map(([key, value]) => {
                    let displayValue = value;
                    let isObject = false;

                    if (typeof value === 'object' && value !== null) {
                      isObject = true;
                      displayValue = value.display_value || value.value || JSON.stringify(value);
                    }

                    const isEmpty = displayValue === '' || displayValue === null || displayValue === undefined;

                    return (
                      <tr key={key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{
                          width: '35%',
                          fontWeight: '500',
                          color: 'var(--text-secondary)',
                          padding: '12px 16px',
                          backgroundColor: 'rgba(0,0,0,0.03)',
                          verticalAlign: 'top',
                          wordBreak: 'break-word'
                        }}>
                          {key}
                        </td>
                        <td style={{
                          padding: '12px 16px',
                          color: isEmpty ? 'var(--text-secondary)' : 'var(--text-primary)',
                          fontStyle: isEmpty ? 'italic' : 'normal',
                          wordBreak: 'break-word',
                          verticalAlign: 'top'
                        }}>
                          {isEmpty ? 'empty' : String(displayValue)}
                          {isObject && !isEmpty && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              [Reference Object]
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
