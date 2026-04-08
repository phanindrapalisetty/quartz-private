import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Check, ChevronDown, ChevronRight,
  Database, Link2, Loader2, RefreshCw, Table2, Trash2, Upload,
} from 'lucide-react'
import api from '../lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function Alert({ type, msg }) {
  if (!msg) return null
  const isErr = type === 'error'
  const cls = isErr
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700'
  const Icon = isErr ? AlertCircle : Check
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm ${cls}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  )
}

// ── Spreadsheet row with expandable tab list ───────────────────────────────

function SpreadsheetRow({ sheet, onLoad }) {
  const [open, setOpen]           = useState(false)
  const [tabs, setTabs]           = useState(null)
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [tabError, setTabError]   = useState('')
  const [loadingTab, setLoadingTab] = useState('')   // tab name being loaded
  const [tabResults, setTabResults] = useState({})   // tab name → {ok, msg}
  const [aliases, setAliases]       = useState({})   // tab name → custom table name

  async function toggle() {
    setOpen((v) => !v)
    if (!tabs && !open) {
      setLoadingTabs(true)
      setTabError('')
      try {
        const r = await api.get(`/sheets/${sheet.id}/tabs`)
        setTabs(r.data)
        // pre-fill alias with tab name
        setAliases(Object.fromEntries(r.data.map((t) => [t.name, t.name])))
      } catch (e) {
        setTabError(e.response?.data?.detail || 'Could not load tabs')
      } finally {
        setLoadingTabs(false)
      }
    }
  }

  async function loadTab(tabName) {
    setLoadingTab(tabName)
    setTabResults((p) => ({ ...p, [tabName]: null }))
    const alias = aliases[tabName]?.trim() || tabName
    try {
      const r = await api.post(`/sheets/${sheet.id}/load`, { tab_name: tabName, table_alias: alias })
      setTabResults((p) => ({
        ...p,
        [tabName]: { ok: true, msg: `Loaded as "${r.data.table_name}" · ${r.data.rows} rows` },
      }))
      onLoad()
    } catch (e) {
      setTabResults((p) => ({
        ...p,
        [tabName]: { ok: false, msg: e.response?.data?.detail || 'Load failed' },
      }))
    } finally {
      setLoadingTab('')
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Database size={15} className="text-[#20A7C9] shrink-0" />
          <span className="text-sm font-medium text-gray-800 truncate">{sheet.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-gray-400">
          <span className="text-xs">{fmtDate(sheet.modifiedTime)}</span>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
          {loadingTabs && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 size={11} className="animate-spin" /> Loading tabs…
            </p>
          )}
          {tabError && <p className="text-xs text-red-600">{tabError}</p>}
          {tabs?.map((tab) => {
            const res = tabResults[tab.name]
            return (
              <div key={tab.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Table2 size={12} className="text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-700 shrink-0">{tab.name}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="text"
                      value={aliases[tab.name] ?? tab.name}
                      onChange={(e) => setAliases((p) => ({ ...p, [tab.name]: e.target.value }))}
                      placeholder="table name"
                      className="text-xs px-2 py-1 border border-gray-300 rounded w-36 font-mono focus:outline-none focus:ring-1 focus:ring-[#20A7C9]"
                    />
                    <button
                      onClick={() => loadTab(tab.name)}
                      disabled={loadingTab === tab.name}
                      className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 bg-[#20A7C9] text-white rounded hover:bg-[#1A93B0] disabled:opacity-50 transition-colors"
                    >
                      {loadingTab === tab.name && <Loader2 size={11} className="animate-spin" />}
                      Load
                    </button>
                  </div>
                </div>
                {res && (
                  <p className={`text-xs pl-5 ${res.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {res.msg}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Loaded tables list ─────────────────────────────────────────────────────

function LoadedTables({ tables, onDrop }) {
  const [dropping, setDropping] = useState('')

  async function drop(name) {
    setDropping(name)
    try {
      await api.delete(`/sheets/loaded/${name}`)
      onDrop()
    } catch (e) {
      console.error(e)
    } finally {
      setDropping('')
    }
  }

  if (!tables.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-lg">
        No tables loaded yet
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {tables.map((t) => (
        <div
          key={t.name}
          className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
        >
          <div>
            <p className="text-sm font-mono font-medium text-gray-800">{t.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t.schema.length} columns</p>
          </div>
          <button
            onClick={() => drop(t.name)}
            disabled={dropping === t.name}
            title="Drop table"
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
          >
            {dropping === t.name
              ? <Loader2 size={14} className="animate-spin" />
              : <Trash2 size={14} />}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── DB connector form ──────────────────────────────────────────────────────

const DB_TYPES = [
  { value: 'postgres', label: 'PostgreSQL', placeholder: 'postgresql://user:pass@host:5432/dbname' },
  { value: 'mysql',    label: 'MySQL',      placeholder: 'mysql://user:pass@host:3306/dbname' },
  { value: 'sqlite',   label: 'SQLite',     placeholder: '/path/to/database.sqlite' },
]

function DatabasesTab({ onConnect }) {
  const [dbType,    setDbType]    = useState('postgres')
  const [url,       setUrl]       = useState('')
  const [alias,     setAlias]     = useState('')
  const [readOnly,  setReadOnly]  = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [msg,       setMsg]       = useState(null)
  const [dbs,       setDbs]       = useState([])
  const [disconnecting, setDisconnecting] = useState('')

  useEffect(() => { fetchDbs() }, [])

  async function fetchDbs() {
    try {
      const r = await api.get('/connectors/db/list')
      setDbs(r.data)
    } catch (_) {}
  }

  async function connect() {
    if (!url.trim() || !alias.trim()) return
    setConnecting(true)
    setMsg(null)
    try {
      await api.post('/connectors/db/attach', {
        url: url.trim(), alias: alias.trim(), db_type: dbType, read_only: readOnly,
      })
      setMsg({ type: 'success', text: `Connected "${alias.trim()}" successfully` })
      setUrl('')
      setAlias('')
      await fetchDbs()
      onConnect()
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.detail || 'Connection failed' })
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect(dbAlias) {
    setDisconnecting(dbAlias)
    try {
      await api.delete(`/connectors/db/${dbAlias}`)
      await fetchDbs()
      onConnect()
    } catch (e) {
      console.error(e)
    } finally {
      setDisconnecting('')
    }
  }

  const placeholder = DB_TYPES.find(d => d.value === dbType)?.placeholder || ''

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold text-gray-700">Connect a Database</h2>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        {/* DB type */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {DB_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setDbType(value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                dbType === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Connection string */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Connection string</label>
          <input
            type="password"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            className="w-full text-sm font-mono px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#20A7C9]"
          />
          <p className="text-xs text-gray-400 mt-1">Stored in memory only — never logged or persisted.</p>
        </div>

        {/* Alias */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Alias <span className="text-gray-400">(used in SQL as <code className="font-mono">alias.schema.table</code>)</span></label>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="prod_db"
            className="w-full text-sm font-mono px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#20A7C9]"
          />
        </div>

        {/* Read-only toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setReadOnly(v => !v)}
            className={`w-8 h-4 rounded-full transition-colors relative ${readOnly ? 'bg-[#20A7C9]' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${readOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-xs text-gray-600">Read-only <span className="text-gray-400">(recommended for production DBs)</span></span>
        </label>

        <button
          onClick={connect}
          disabled={connecting || !url.trim() || !alias.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-[#20A7C9] text-white text-sm font-medium rounded-lg hover:bg-[#1A93B0] disabled:opacity-50 transition-colors"
        >
          {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
          {connecting ? 'Connecting…' : 'Connect'}
        </button>

        {msg && <Alert type={msg.type} msg={msg.text} />}
      </div>

      {/* Connected databases */}
      {dbs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Connected</h3>
          {dbs.map((db) => (
            <div key={db.alias} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-[#20A7C9]" />
                  <span className="text-sm font-mono font-medium text-gray-800">{db.alias}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{db.db_type}</span>
                  <span className="text-xs text-gray-400">{db.tables.length} tables</span>
                </div>
                <button
                  onClick={() => disconnect(db.alias)}
                  disabled={disconnecting === db.alias}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  {disconnecting === db.alias
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Trash2 size={12} />}
                  Disconnect
                </button>
              </div>
              {db.tables.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 flex flex-wrap gap-1.5">
                  {db.tables.map((t) => (
                    <span key={t.full_name} className="text-xs font-mono bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-600">
                      {t.schema_name}.{t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Load() {
  const [activeTab, setActiveTab]     = useState('sheets')
  const [sheets, setSheets]           = useState([])
  const [loadingSheets, setLoadingSheets] = useState(false)
  const [sheetsError, setSheetsError] = useState('')
  const [loadedTables, setLoadedTables] = useState([])

  // Upload state
  const [file, setFile]           = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileInputRef = useRef(null)

  const navigate = useNavigate()

  useEffect(() => { fetchSheets(); fetchLoaded() }, [])

  async function fetchSheets() {
    setLoadingSheets(true)
    setSheetsError('')
    try {
      const r = await api.get('/sheets/list')
      setSheets(r.data)
    } catch (e) {
      setSheetsError(e.response?.data?.detail || 'Could not load spreadsheets')
    } finally {
      setLoadingSheets(false)
    }
  }

  async function fetchLoaded() {
    try {
      const r = await api.get('/sheets/loaded')
      setLoadedTables(r.data)
    } catch (e) {
      console.error(e)
    }
  }

  async function uploadFile() {
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await api.post('/connectors/upload', form)
      setUploadMsg({ type: 'success', text: `Loaded as "${r.data.table_name}" · ${r.data.rows} rows` })
      setFile(null)
      fetchLoaded()
    } catch (e) {
      setUploadMsg({ type: 'error', text: e.response?.data?.detail || 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {[
            { id: 'sheets',    label: 'Google Sheets' },
            { id: 'upload',    label: 'Upload File' },
            { id: 'databases', label: 'Databases' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Google Sheets ── */}
        {activeTab === 'sheets' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">My Spreadsheets</h2>
              <button
                onClick={fetchSheets}
                disabled={loadingSheets}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                <RefreshCw size={12} className={loadingSheets ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {sheetsError && <Alert type="error" msg={sheetsError} />}

            {loadingSheets ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-10">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : sheets.length === 0 && !sheetsError ? (
              <p className="text-sm text-gray-400 text-center py-10">
                No spreadsheets found in your Google Drive
              </p>
            ) : (
              <div className="space-y-2">
                {sheets.map((s) => (
                  <SpreadsheetRow key={s.id} sheet={s} onLoad={fetchLoaded} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Upload ── */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Upload CSV or Excel</h2>

            <div
              onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0] || null) }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#20A7C9] hover:bg-[#D7EFF5]/20 transition-colors"
            >
              <Upload size={22} className="mx-auto text-gray-400 mb-3" />
              {file ? (
                <p className="text-sm font-medium text-gray-700">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Drop a file here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">CSV, XLSX, XLS</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { setFile(e.target.files[0] || null); setUploadMsg(null) }}
              />
            </div>

            {file && (
              <button
                onClick={uploadFile}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-[#20A7C9] text-white text-sm font-medium rounded-lg hover:bg-[#1A93B0] disabled:opacity-50 transition-colors"
              >
                {uploading && <Loader2 size={14} className="animate-spin" />}
                {uploading ? 'Uploading…' : 'Upload & Load'}
              </button>
            )}

            {uploadMsg && <Alert type={uploadMsg.type} msg={uploadMsg.text} />}
          </div>
        )}

        {/* ── Databases ── */}
        {activeTab === 'databases' && (
          <DatabasesTab onConnect={fetchLoaded} />
        )}

        {/* ── Loaded Tables ── */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Loaded Tables
              {loadedTables.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {loadedTables.length} table{loadedTables.length !== 1 ? 's' : ''}
                </span>
              )}
            </h2>
            {loadedTables.length > 0 && (
              <button
                onClick={() => navigate('/query')}
                className="text-xs text-[#20A7C9] hover:text-[#1A93B0] font-medium transition-colors"
              >
                Go to Query →
              </button>
            )}
          </div>
          <LoadedTables tables={loadedTables} onDrop={fetchLoaded} />
        </div>

      </div>
    </div>
  )
}
