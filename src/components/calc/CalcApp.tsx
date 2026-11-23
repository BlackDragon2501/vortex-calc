'use client'

// Vortex Calc - Calculadora científica con historial local y conversor de unidades.
// Parser propio (shunting-yard), 100% offline.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calculator, ArrowLeftRight, Trash2, Copy, Check, X, Divide, Equal } from 'lucide-react'
import {
  AngleMode,
  CATEGORIES,
  HistoryEntry,
  clearHistory,
  convertUnit,
  evalWithPostfix,
  fmtResult,
  loadHistory,
  saveHistory,
} from '@/lib/calc'

const SUPPORT_EMAIL = 'vortexmusic.soporte.app@gmail.com'
const ACCENT = '#34d399'
const ACCENT2 = '#6ee7b7'

function VortexLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="10" fill="#161616" />
      <circle cx="24" cy="24" r="17" fill="none" stroke={ACCENT} strokeWidth="3.5" />
      <path d="M24 10a14 14 0 1 1-9.9 4.1" fill="none" stroke={ACCENT2} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M24 17a7 7 0 1 0 7 7" fill="none" stroke={ACCENT2} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3" fill={ACCENT2} />
    </svg>
  )
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-[#2b2b31] bg-[#141416] px-6 py-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 text-center">
        <p className="text-[11px] text-[#9b9ba4]">
          Vórtex Calc · Derechos Reservados © 2026 Vortex Company ·{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#6ee7b7] hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-[11px] text-[#9b9ba4]">Gratis · Sin anuncios · 100% local en tu navegador</p>
      </div>
    </footer>
  )
}

const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2b2b31] bg-[#1e1e22] px-3 py-2 text-xs font-medium text-[#ececf1] hover:bg-[#26262b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

const keyBase =
  'rounded-xl border text-sm font-semibold transition-colors select-none active:scale-[0.97]'

function Key({
  label,
  onPress,
  variant = 'num',
  wide = false,
  icon,
}: {
  label: string
  onPress: () => void
  variant?: 'num' | 'fn' | 'op' | 'eq' | 'danger'
  wide?: boolean
  icon?: React.ReactNode
}) {
  const styles: Record<string, string> = {
    num: 'border-[#2b2b31] bg-[#1e1e22] text-[#ececf1] hover:bg-[#26262b]',
    fn: 'border-[#2b2b31] bg-[#17171a] text-[#6ee7b7] hover:bg-[#1d2b24]',
    op: 'border-[#2b2b31] bg-[#1c2723] text-[#34d399] hover:bg-[#243229]',
    eq: 'border-transparent bg-[#34d399] text-[#0f0f10] hover:bg-[#6ee7b7]',
    danger: 'border-[#2b2b31] bg-[#2a1a1c] text-[#f87171] hover:bg-[#35201f]',
  }
  return (
    <button
      onClick={onPress}
      className={`${keyBase} ${styles[variant]} ${wide ? 'col-span-2' : ''} h-11 py-0`}
    >
      {icon ?? label}
    </button>
  )
}

function CopyMini({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      title="Copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setOk(true)
          setTimeout(() => setOk(false), 1000)
        } catch {}
      }}
      className="text-[#9b9ba4] hover:text-[#ececf1]"
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export default function CalcApp() {
  const [tab, setTab] = useState<'calc' | 'conv'>('calc')

  // ----- calculadora -----
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AngleMode>('deg')
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    void loadHistory().then(setHistory)
  }, [])

  const press = useCallback(
    (s: string) => {
      setExpr((e) => e + s)
      setError(null)
    },
    []
  )

  const doEval = useCallback(async () => {
    if (!expr.trim()) return
    try {
      const value = evalWithPostfix(expr, mode)
      const r = fmtResult(value)
      setResult(r)
      setError(null)
      await saveHistory(expr, r)
      setHistory(await loadHistory())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de sintaxis')
      setResult(null)
    }
  }, [expr, mode])

  // teclado físico
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== 'calc') return
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (/^[0-9+\-*/^().%]$/.test(e.key)) {
        press(e.key)
        e.preventDefault()
      } else if (e.key === 'Enter' || e.key === '=') {
        void doEval()
        e.preventDefault()
      } else if (e.key === 'Backspace') {
        setExpr((x) => x.slice(0, -1))
        e.preventDefault()
      } else if (e.key === 'Escape') {
        setExpr('')
        setResult(null)
        setError(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, press, doEval])

  const reuse = (entry: HistoryEntry) => {
    setExpr(entry.expr)
    setResult(entry.result)
    setError(null)
    setTab('calc')
  }

  // ----- conversor -----
  const [catId, setCatId] = useState('length')
  const cat = useMemo(() => CATEGORIES.find((c) => c.id === catId)!, [catId])
  const [fromU, setFromU] = useState('m')
  const [toU, setToU] = useState('km')
  const [val, setVal] = useState('1')

  useEffect(() => {
    setFromU(cat.units[0].id)
    setToU(cat.units[1].id)
  }, [cat])

  const convResult = useMemo(() => {
    const n = parseFloat(val.replace(',', '.'))
    if (isNaN(n)) return null
    try {
      return fmtResult(convertUnit(n, fromU, toU))
    } catch {
      return null
    }
  }, [val, fromU, toU])

  const fromName = cat.units.find((x) => x.id === fromU)?.name ?? ''
  const toName = cat.units.find((x) => x.id === toU)?.name ?? ''

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#2b2b31] bg-[#141416] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <VortexLogo className="w-9 h-9" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">
              Vórtex Calc <span className="font-normal text-[#9b9ba4]">· Calculadora y conversor, sin límites</span>
            </h1>
            <p className="text-[11px] text-[#9b9ba4]">Científica con historial local y conversor de unidades offline</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="mb-4 flex gap-1 rounded-xl border border-[#2b2b31] bg-[#17171a] p-1">
          <button
            onClick={() => setTab('calc')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              tab === 'calc' ? 'bg-[#26262b] text-[#ececf1]' : 'text-[#9b9ba4] hover:text-[#ececf1]'
            }`}
          >
            <Calculator className="h-3.5 w-3.5" /> Calculadora
          </button>
          <button
            onClick={() => setTab('conv')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              tab === 'conv' ? 'bg-[#26262b] text-[#ececf1]' : 'text-[#9b9ba4] hover:text-[#ececf1]'
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Conversor
          </button>
        </div>

        {tab === 'calc' ? (
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="rounded-2xl border border-[#2b2b31] bg-[#17171a] p-4">
              {/* display */}
              <div className="mb-4 rounded-xl border border-[#2b2b31] bg-[#0f0f10] px-4 py-3">
                <input
                  value={expr}
                  onChange={(e) => { setExpr(e.target.value); setError(null) }}
                  placeholder="Escribe o usa el teclado…"
                  className="w-full bg-transparent text-right font-mono text-xl outline-none placeholder:text-[#3f3f46]"
                />
                <div className="mt-1 min-h-[22px] text-right">
                  {error ? (
                    <span className="text-sm text-[#f87171]">{error}</span>
                  ) : result !== null ? (
                    <span className="text-lg font-semibold text-[#34d399]">= {result}</span>
                  ) : (
                    <span className="text-sm text-[#3f3f46]"> </span>
                  )}
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <div className="flex gap-1 rounded-lg border border-[#2b2b31] bg-[#0f0f10] p-1 text-[11px] font-bold">
                  <button
                    onClick={() => setMode('deg')}
                    className={`rounded px-2.5 py-1 ${mode === 'deg' ? 'bg-[#34d399] text-[#0f0f10]' : 'text-[#9b9ba4]'}`}
                  >
                    DEG
                  </button>
                  <button
                    onClick={() => setMode('rad')}
                    className={`rounded px-2.5 py-1 ${mode === 'rad' ? 'bg-[#34d399] text-[#0f0f10]' : 'text-[#9b9ba4]'}`}
                  >
                    RAD
                  </button>
                </div>
                <span className="text-[11px] text-[#9b9ba4]">{mode === 'deg' ? 'Trigonometría en grados' : 'Trigonometría en radianes'}</span>
              </div>

              {/* teclado */}
              <div className="grid grid-cols-5 gap-2">
                <Key label="sin" variant="fn" onPress={() => press('sin(')} />
                <Key label="cos" variant="fn" onPress={() => press('cos(')} />
                <Key label="tan" variant="fn" onPress={() => press('tan(')} />
                <Key label="(" variant="fn" onPress={() => press('(')} />
                <Key label=")" variant="fn" onPress={() => press(')')} />

                <Key label="ln" variant="fn" onPress={() => press('ln(')} />
                <Key label="log" variant="fn" onPress={() => press('log(')} />
                <Key label="√" variant="fn" onPress={() => press('sqrt(')} />
                <Key label="xʸ" variant="fn" onPress={() => press('^')} />
                <Key label="!" variant="fn" onPress={() => press('!')} />

                <Key label="7" variant="num" onPress={() => press('7')} />
                <Key label="8" variant="num" onPress={() => press('8')} />
                <Key label="9" variant="num" onPress={() => press('9')} />
                <Key label="÷" variant="op" onPress={() => press('/')} icon={<Divide className="h-4 w-4" />} />
                <Key label="AC" variant="danger" onPress={() => { setExpr(''); setResult(null); setError(null) }} />

                <Key label="4" variant="num" onPress={() => press('4')} />
                <Key label="5" variant="num" onPress={() => press('5')} />
                <Key label="6" variant="num" onPress={() => press('6')} />
                <Key label="×" variant="op" onPress={() => press('*')} />
                <Key label="⌫" variant="danger" onPress={() => setExpr((e) => e.slice(0, -1))} />

                <Key label="1" variant="num" onPress={() => press('1')} />
                <Key label="2" variant="num" onPress={() => press('2')} />
                <Key label="3" variant="num" onPress={() => press('3')} />
                <Key label="−" variant="op" onPress={() => press('-')} />
                <Key label="%" variant="op" onPress={() => press('%')} />

                <Key label="0" variant="num" onPress={() => press('0')} />
                <Key label="." variant="num" onPress={() => press('.')} />
                <Key label="π" variant="fn" onPress={() => press('π')} />
                <Key label="e" variant="fn" onPress={() => press('e')} />
                <Key label="=" variant="eq" onPress={() => void doEval()} icon={<Equal className="h-4 w-4" />} />
              </div>
            </div>

            {/* historial */}
            <div className="flex flex-col rounded-2xl border border-[#2b2b31] bg-[#17171a] p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9b9ba4]">Historial</p>
                {history.length > 0 && (
                  <button
                    title="Vaciar historial"
                    onClick={async () => {
                      await clearHistory()
                      setHistory([])
                    }}
                    className="text-[#9b9ba4] hover:text-[#f87171]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="max-h-[430px] min-h-[120px] space-y-1.5 overflow-y-auto pr-1">
                {history.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-[#3f3f46]">
                    Tus cálculos se guardan solo en este navegador.
                  </p>
                )}
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => reuse(h)}
                    className="w-full rounded-lg border border-[#2b2b31] bg-[#0f0f10] px-2.5 py-2 text-left hover:border-[#34d399]"
                  >
                    <div className="truncate font-mono text-[11px] text-[#9b9ba4]">{h.expr}</div>
                    <div className="flex items-center justify-between">
                      <span className="truncate font-mono text-sm text-[#6ee7b7]">= {h.result}</span>
                      <CopyMini text={h.result} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-2xl border border-[#2b2b31] bg-[#17171a] p-5">
            <label className="mb-1 block text-xs text-[#9b9ba4]">Categoría</label>
            <select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              className="mb-4 w-full rounded-xl border border-[#2b2b31] bg-[#0f0f10] px-3 py-2.5 text-sm outline-none focus:border-[#34d399]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <label className="mb-1 block text-xs text-[#9b9ba4]">De</label>
                <input
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  inputMode="decimal"
                  className="mb-2 w-full rounded-xl border border-[#2b2b31] bg-[#0f0f10] px-3 py-2.5 font-mono text-lg outline-none focus:border-[#34d399]"
                />
                <select
                  value={fromU}
                  onChange={(e) => setFromU(e.target.value)}
                  className="w-full rounded-xl border border-[#2b2b31] bg-[#0f0f10] px-3 py-2 text-sm outline-none focus:border-[#34d399]"
                >
                  {cat.units.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                title="Invertir"
                onClick={() => {
                  setFromU(toU)
                  setToU(fromU)
                }}
                className="mb-2 flex h-10 w-10 items-center justify-center self-center rounded-xl border border-[#2b2b31] bg-[#1e1e22] text-[#34d399] hover:bg-[#26262b]"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>

              <div>
                <label className="mb-1 block text-xs text-[#9b9ba4]">A</label>
                <div className="mb-2 w-full rounded-xl border border-[#34d399] bg-[#12211b] px-3 py-2.5 font-mono text-lg text-[#6ee7b7]">
                  {convResult ?? '—'}
                </div>
                <select
                  value={toU}
                  onChange={(e) => setToU(e.target.value)}
                  className="w-full rounded-xl border border-[#2b2b31] bg-[#0f0f10] px-3 py-2 text-sm outline-none focus:border-[#34d399]"
                >
                  {cat.units.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {convResult && (
              <p className="mt-4 text-center text-sm text-[#9b9ba4]">
                {val || '0'} {fromName} = <span className="font-semibold text-[#6ee7b7]">{convResult} {toName}</span>
                <CopyMini text={convResult} />
              </p>
            )}
            <p className="mt-4 text-center text-[11px] text-[#9b9ba4]">
              Tablas de conversión integradas en la app: funcionan sin conexión.
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
