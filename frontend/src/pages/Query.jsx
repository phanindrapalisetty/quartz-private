import React, { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import {
  BrainCircuit, Check, ChevronDown, ChevronRight, Database,
  Download, Loader2, Play, Plus, Save, Share2, Table2, X,
} from 'lucide-react'
import api from '../lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitialTabs() {
  // If a share link has ?q=<base64>, pre-load that query
  const params = new URLSearchParams(window.location.search)
  const q = params.get('q')
  let initialQuery = '-- Write your SQL here\nSELECT *\nFROM your_table\nLIMIT 100;'
  if (q) {
    try {
      initialQuery = decodeURIComponent(atob(q))
      window.history.replaceState({}, '', '/query')
    } catch (_) {}
  }
  return [{ id: 1, name: 'Query 1', query: initialQuery, result: null, error: '' }]
}

// ── Schema sidebar ─────────────────────────────────────────────────────────

function SchemaPanel({ tables, extDbs, onInsert }) {
  const [open, setOpen] = useState({})
  const toggle = (key) => setOpen((p) => ({ ...p, [key]: !p[key] }))

  const hasAnything = tables.length > 0 || extDbs.length > 0

  if (!hasAnything) {
    return (
      <div className="p-4 text-center space-y-1">
        <p className="text-xs text-gray-500">No tables loaded.</p>
        <a href="/load" className="text-xs text-[#20A7C9] hover:text-[#1A93B0]">Load data →</a>
      </div>
    )
  }

  function TableRow({ keyName, label, cols, onInsertName }) {
    return (
      <div>
        <button
          onClick={() => toggle(keyName)}
          className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-[#164050] transition-colors text-left"
        >
          {open[keyName]
            ? <ChevronDown  size={11} className="text-gray-500 shrink-0" />
            : <ChevronRight size={11} className="text-gray-500 shrink-0" />}
          <Table2 size={12} className="text-[#20A7C9] shrink-0" />
          <span
            className="text-sm text-gray-200 font-mono truncate flex-1"
            onClick={(e) => { e.stopPropagation(); onInsertName() }}
            title="Click to insert"
          >
            {label}
          </span>
          <span className="text-xs text-gray-600 shrink-0">{cols.length}</span>
        </button>
        {open[keyName] && (
          <div className="ml-5 border-l border-[#164050] pb-1">
            {cols.map((col) => (
              <div
                key={col.column}
                onClick={() => onInsert(col.column)}
                className="flex items-center justify-between px-3 py-1 hover:bg-[#164050]/60 cursor-pointer"
              >
                <span className="text-xs text-gray-300 font-mono truncate">{col.column}</span>
                <span className="text-xs text-gray-600 font-mono ml-2 shrink-0">{col.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-y-auto flex-1 py-1">
      {/* In-memory tables */}
      {tables.map((t) => (
        <TableRow
          key={t.name}
          keyName={t.name}
          label={t.name}
          cols={t.schema}
          onInsertName={() => onInsert(t.name)}
        />
      ))}

      {/* Attached external databases */}
      {extDbs.map((db) => (
        <div key={db.alias}>
          <div className="px-3 py-1.5 mt-1 flex items-center gap-1.5">
            <Database size={11} className="text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">{db.alias}</span>
            <span className="text-xs text-gray-600">({db.db_type})</span>
          </div>
          {db.tables.map((t) => (
            <TableRow
              key={t.full_name}
              keyName={t.full_name}
              label={`${t.schema_name}.${t.name}`}
              cols={t.columns}
              onInsertName={() => onInsert(t.full_name)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Results table ──────────────────────────────────────────────────────────

function ResultsTable({ columns, data }) {
  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 last:border-r-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/50' : ''} hover:bg-[#D7EFF5]/30`}>
              {columns.map((c) => {
                const val = row[c]
                return (
                  <td key={c} className="px-3 py-1.5 whitespace-nowrap border-r border-gray-100 last:border-r-0 font-mono">
                    {val === null || val === undefined
                      ? <span className="text-gray-300 italic">null</span>
                      : <span className="text-gray-700">{String(val)}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Ask AI modal ───────────────────────────────────────────────────────────

function AskAIModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-[#D7EFF5] flex items-center justify-center mx-auto mb-4">
          <BrainCircuit size={24} className="text-[#20A7C9]" />
        </div>
        <h3 className="font-semibold text-gray-900 mb-2">Ask AI</h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          Something is brewing. <br />
          Stay tuned.
        </p>
        <button
          onClick={onClose}
          className="mt-6 px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Query() {
  const [tables,   setTables]   = useState([])
  const [extDbs,   setExtDbs]   = useState([])
  const [tabs,     setTabs]     = useState(getInitialTabs)
  const [activeId, setActiveId] = useState(1)
  const [editingTabId, setEditingTabId] = useState(null)
  const [running,  setRunning]  = useState(false)
  const [showAI,   setShowAI]   = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const nextId = useRef(2)

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0]

  useEffect(() => {
    api.get('/sheets/loaded').then((r) => setTables(r.data)).catch(() => {})
    api.get('/connectors/db/list').then((r) => setExtDbs(r.data)).catch(() => {})
  }, [])

  // ── Tab management ───────────────────────────────────────────────────────

  function patchTab(id, patch) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function addTab() {
    const id = nextId.current++
    setTabs((prev) => [...prev, { id, name: `Query ${id}`, query: '', result: null, error: '' }])
    setActiveId(id)
  }

  function closeTab(id, e) {
    e.stopPropagation()
    if (tabs.length === 1) return
    const idx = tabs.findIndex((t) => t.id === id)
    const next = tabs.filter((t) => t.id !== id)
    setTabs(next)
    if (activeId === id) setActiveId(next[Math.max(0, idx - 1)].id)
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function runQuery() {
    const q = activeTab.query.trim()
    if (!q) return
    setRunning(true)
    patchTab(activeId, { result: null, error: '' })
    try {
      const r = await api.post('/query/', { sql: q })
      patchTab(activeId, { result: r.data })
    } catch (e) {
      patchTab(activeId, { error: e.response?.data?.detail || 'Query failed' })
    } finally {
      setRunning(false)
    }
  }

  function saveQuery() {
    const blob = new Blob([activeTab.query], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${activeTab.name.replace(/\s+/g, '_').toLowerCase()}.sql`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function shareQuery() {
    const encoded = btoa(encodeURIComponent(activeTab.query))
    const url = `${window.location.origin}/query?q=${encoded}`
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }

  function downloadCSV() {
    const { result } = activeTab
    if (!result) return
    const header = result.columns.join(',')
    const rows = result.data.map((row) =>
      result.columns.map((c) => {
        const v = row[c]
        if (v === null || v === undefined) return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }).join(',')
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${activeTab.name.replace(/\s+/g, '_').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function insertText(text) {
    patchTab(activeId, {
      query: activeTab.query.trimEnd() + (activeTab.query.trimEnd() ? ' ' : '') + text,
    })
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      runQuery()
    }
  }

  // SQL autocomplete schema — includes both in-memory tables and attached DB tables
  const sqlSchema = {}
  tables.forEach((t) => { sqlSchema[t.name] = t.schema.map((c) => c.column) })
  extDbs.forEach((db) => {
    db.tables.forEach((t) => { sqlSchema[t.full_name] = t.columns.map((c) => c.column) })
  })

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── Schema sidebar ── */}
      <div className="w-52 bg-[#0D2E37] flex flex-col shrink-0 border-r border-[#164050]">
        <div className="px-3 py-2.5 border-b border-[#164050]">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Schema</span>
        </div>
        <SchemaPanel tables={tables} extDbs={extDbs} onInsert={insertText} />
      </div>

      {/* ── Editor + Results ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center bg-white border-b border-gray-200 overflow-x-auto shrink-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-r border-gray-200 cursor-pointer shrink-0 group select-none ${
                tab.id === activeId
                  ? 'bg-white text-gray-900 border-b-2 border-b-[#20A7C9] -mb-px'
                  : 'bg-gray-50 text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {editingTabId === tab.id ? (
                <input
                  autoFocus
                  value={tab.name}
                  onChange={(e) => patchTab(tab.id, { name: e.target.value })}
                  onBlur={() => setEditingTabId(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTabId(null) }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-none outline-none w-24 text-sm font-medium"
                />
              ) : (
                <span
                  className="font-medium"
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id) }}
                  title="Double-click to rename"
                >
                  {tab.name}
                </span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-all"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            className="px-3 py-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
            title="New tab"
          >
            <Plus size={14} />
          </button>

          {/* Toolbar — pushed to the right */}
          <div className="ml-auto flex items-center gap-1 px-3 shrink-0">
            <button
              onClick={saveQuery}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title="Save as .sql"
            >
              <Save size={13} /> Save
            </button>
            <button
              onClick={shareQuery}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title="Copy share link"
            >
              {shareCopied ? <Check size={13} className="text-green-500" /> : <Share2 size={13} />}
              {shareCopied ? 'Copied!' : 'Share'}
            </button>
            <button
              onClick={() => setShowAI(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#20A7C9] hover:text-[#1A93B0] hover:bg-[#D7EFF5] rounded transition-colors font-medium"
            >
              <BrainCircuit size={13} /> Ask AI
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="border-b border-gray-200 shrink-0" onKeyDown={handleKeyDown}>
          <CodeMirror
            key={activeId}
            value={activeTab.query}
            onChange={(val) => patchTab(activeId, { query: val })}
            extensions={[sql({ dialect: PostgreSQL, schema: sqlSchema })]}
            basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
            style={{ minHeight: 160, maxHeight: 280 }}
          />
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌘' : 'Ctrl'} + Enter to run
            </span>
            <button
              onClick={runQuery}
              disabled={running}
              className="flex items-center gap-2 px-4 py-1.5 bg-[#20A7C9] text-white text-sm font-medium rounded-md hover:bg-[#1A93B0] disabled:opacity-50 transition-colors"
            >
              {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Run
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab.error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-mono whitespace-pre-wrap">
              {activeTab.error}
            </div>
          )}

          {activeTab.result && (
            <>
              <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500 font-medium">{activeTab.result.rows} rows</span>
                <span className="text-gray-200">·</span>
                <span className="text-xs text-gray-400">{activeTab.result.execution_time_ms} ms</span>
                <button
                  onClick={downloadCSV}
                  className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Download size={13} /> Download CSV
                </button>
              </div>
              <ResultsTable columns={activeTab.result.columns} data={activeTab.result.data} />
            </>
          )}

          {!activeTab.result && !activeTab.error && !running && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-400">Run a query to see results</p>
            </div>
          )}

          {running && (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Running…
            </div>
          )}
        </div>
      </div>

      {showAI && <AskAIModal onClose={() => setShowAI(false)} />}
    </div>
  )
}
