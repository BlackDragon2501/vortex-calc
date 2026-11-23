// Vortex Calc - Motor de calculadora científica (parser propio),
// conversor de unidades offline e historial en IndexedDB.
// 100% local en el navegador, sin backend.

// ---------- Parser matemático ----------

export type AngleMode = 'deg' | 'rad'

interface Tok {
  t: 'num' | 'op' | 'lp' | 'rp' | 'fn' | 'comma'
  v: string
}

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'log2',
  'sqrt', 'abs', 'exp', 'floor', 'ceil', 'round', 'sign',
])

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4, 'u-': 3 }

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t') { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      // notación científica 1.2e-3
      if (j < src.length && /[eE]/.test(src[j]) && (/[0-9]/.test(src[j + 1] ?? '') || src[j + 1] === '-' || src[j + 1] === '+')) {
        j++
        if (src[j] === '-' || src[j] === '+') j++
        while (j < src.length && /[0-9]/.test(src[j])) j++
      }
      toks.push({ t: 'num', v: src.slice(i, j) })
      i = j
      continue
    }
    if (/[a-zA-Zπ]/.test(c)) {
      let j = i
      while (j < src.length && /[a-zA-Z0-9_π]/.test(src[j])) j++
      const word = src.slice(i, j)
      if (word === 'pi' || word === 'π') { toks.push({ t: 'num', v: 'π' }); i = j; continue }
      if (word === 'e') { toks.push({ t: 'num', v: 'e' }); i = j; continue }
      if (FUNCS.has(word)) { toks.push({ t: 'fn', v: word }); i = j; continue }
      throw new Error(`No reconozco «${word}»`)
    }
    if (c === '(') { toks.push({ t: 'lp', v: c }); i++; continue }
    if (c === ')') { toks.push({ t: 'rp', v: c }); i++; continue }
    if (c === ',') { toks.push({ t: 'comma', v: c }); i++; continue }
    if ('+-*/^%!'.includes(c)) {
      toks.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c })
      i++
      continue
    }
    throw new Error(`Carácter no válido: «${c}»`)
  }
  return toks
}

function applyFn(name: string, x: number, mode: AngleMode): number {
  const d2r = (v: number) => (mode === 'deg' ? (v * Math.PI) / 180 : v)
  const r2d = (v: number) => (mode === 'deg' ? (v * 180) / Math.PI : v)
  switch (name) {
    case 'sin': return Math.sin(d2r(x))
    case 'cos': return Math.cos(d2r(x))
    case 'tan': return Math.tan(d2r(x))
    case 'asin': return r2d(Math.asin(x))
    case 'acos': return r2d(Math.acos(x))
    case 'atan': return r2d(Math.atan(x))
    case 'ln': return Math.log(x)
    case 'log': return Math.log10(x)
    case 'log2': return Math.log2(x)
    case 'sqrt': return Math.sqrt(x)
    case 'abs': return Math.abs(x)
    case 'exp': return Math.exp(x)
    case 'floor': return Math.floor(x)
    case 'ceil': return Math.ceil(x)
    case 'round': return Math.round(x)
    case 'sign': return Math.sign(x)
    default: throw new Error(`Función desconocida ${name}`)
  }
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Error('El factorial solo admite enteros ≥ 0')
  if (n > 170) return Infinity
  let r = 1
  for (let k = 2; k <= n; k++) r *= k
  return r
}

/** Evalúa una expresión científica. Lanza Error con mensaje legible. */
export function evaluateExpr(src: string, mode: AngleMode): number {
  const raw = src.trim()
  if (!raw) throw new Error('Expresión vacía')
  const toks = tokenize(raw)
  // shunting-yard con salida RPN
  const out: Tok[] = []
  const stack: Tok[] = []
  let prevType: Tok['t'] | null = null
  for (const tk of toks) {
    if (tk.t === 'num') {
      // multiplicación implícita: 2π, 3e(…) o )( tras un número
      if (prevType === 'num' || prevType === 'rp') stack.push({ t: 'op', v: '*' })
      out.push(tk)
    } else if (tk.t === 'fn') {
      stack.push(tk)
    } else if (tk.t === 'op') {
      // unario
      if (tk.v === '-' && (prevType === null || prevType === 'op' || prevType === 'lp' || prevType === 'comma')) {
        stack.push({ t: 'op', v: 'u-' })
      } else {
        while (stack.length) {
          const top = stack[stack.length - 1]
          if (top.t === 'fn' || (top.t === 'op' && top.v !== '(' && (PREC[top.v] > PREC[tk.v] || (PREC[top.v] === PREC[tk.v] && tk.v !== '^')))) {
            out.push(stack.pop()!)
          } else break
        }
        stack.push(tk)
      }
    } else if (tk.t === 'lp') {
      // multiplicación implícita 2(3+1) o 2π(…)
      if (prevType === 'num' || prevType === 'rp') {
        stack.push({ t: 'op', v: '*' })
      }
      stack.push(tk)
    } else if (tk.t === 'rp') {
      while (stack.length && !(stack[stack.length - 1].t === 'lp')) out.push(stack.pop()!)
      if (!stack.length) throw new Error('Paréntesis desbalanceados')
      stack.pop()
      if (stack.length && stack[stack.length - 1].t === 'fn') out.push(stack.pop()!)
    } else if (tk.t === 'comma') {
      while (stack.length && stack[stack.length - 1].t !== 'lp') out.push(stack.pop()!)
    }
    prevType = tk.t
  }
  while (stack.length) {
    const top = stack.pop()!
    if (top.t === 'lp') throw new Error('Paréntesis desbalanceados')
    out.push(top)
  }
  // evaluar RPN
  const st: number[] = []
  for (const tk of out) {
    if (tk.t === 'num') {
      if (tk.v === 'π') st.push(Math.PI)
      else if (tk.v === 'e') st.push(Math.E)
      else {
        const n = parseFloat(tk.v)
        if (isNaN(n)) throw new Error(`Número no válido: ${tk.v}`)
        st.push(n)
      }
    } else if (tk.t === 'fn') {
      const a = st.pop()
      if (a === undefined) throw new Error('Faltan operandos')
      st.push(applyFn(tk.v, a, mode))
    } else if (tk.t === 'op') {
      if (tk.v === 'u-') {
        const a = st.pop()
        if (a === undefined) throw new Error('Faltan operandos')
        st.push(-a)
        continue
      }
      const b = st.pop()
      const a = st.pop()
      if (a === undefined || b === undefined) throw new Error('Faltan operandos')
      switch (tk.v) {
        case '+': st.push(a + b); break
        case '-': st.push(a - b); break
        case '*': st.push(a * b); break
        case '/':
          if (b === 0) throw new Error('División entre cero')
          st.push(a / b)
          break
        case '%': st.push(a % b); break
        case '^': st.push(Math.pow(a, b)); break
        default: throw new Error(`Operador no soportado: ${tk.v}`)
      }
    }
  }
  if (st.length !== 1) throw new Error('Expresión incompleta')
  const r = st[0]
  if (!isFinite(r)) throw new Error(r > 0 ? 'Resultado infinito' : 'Resultado indefinido')
  return r
}

/** Soporte de "N!" (factorial postfijo) */
export function evalWithPostfix(src: string, mode: AngleMode): number {
  const s = src.replace(/(\d+(?:\.\d+)?)\s*!/g, 'fact($1)')
  if (/\bfact\s*\(/.test(s)) {
    return evalFact(s, mode)
  }
  return evaluateExpr(s, mode)
}

function evalFact(src: string, mode: AngleMode): number {
  // reemplaza fact(N) por su valor antes de evaluar
  const re = /fact\((\d+(?:\.\d+)?)\)/g
  let s = src
  let guard = 0
  while (re.test(s)) {
    s = s.replace(re, (_m, n) => String(factorial(parseFloat(n))))
    if (++guard > 200) throw new Error('Expresión demasiado compleja')
  }
  return evaluateExpr(s, mode)
}

/** Formatea el resultado con hasta 12 dígitos significativos */
export function fmtResult(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  const abs = Math.abs(n)
  if (abs !== 0 && (abs < 1e-9 || abs >= 1e15)) {
    return n.toExponential(8).replace(/\.?0+e/, 'e')
  }
  const s = n.toPrecision(12)
  const trimmed = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
  return trimmed
}

// ---------- Historial (IndexedDB) ----------

export interface HistoryEntry {
  id?: number
  expr: string
  result: string
  ts: number
}

const DB_NAME = 'vortex-calc'
const STORE = 'history'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        os.createIndex('ts', 'ts')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHistory(expr: string, result: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).add({ expr, result, ts: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // el historial nunca debe romper la calculadora
  }
}

export async function loadHistory(limit = 100): Promise<HistoryEntry[]> {
  try {
    const db = await openDb()
    const res = await new Promise<HistoryEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const rows = (req.result as HistoryEntry[]).sort((a, b) => b.ts - a.ts).slice(0, limit)
        resolve(rows)
      }
      req.onerror = () => reject(req.error)
    })
    db.close()
    return res
  } catch {
    return []
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // noop
  }
}

// ---------- Conversor de unidades ----------

interface UnitDef {
  id: string
  name: string
  /** factor para pasar a la unidad base de la categoría */
  f: number
  /** conversión especial por función (temperatura) */
  special?: 'celsius'
}

interface Category {
  id: string
  name: string
  units: UnitDef[]
}

const u = (id: string, name: string, f: number): UnitDef => ({ id, name, f })

export const CATEGORIES: Category[] = [
  {
    id: 'length', name: 'Longitud',
    units: [
      u('nm', 'Nanómetro', 1e-9), u('um', 'Micrómetro', 1e-6), u('mm', 'Milímetro', 0.001),
      u('cm', 'Centímetro', 0.01), u('m', 'Metro', 1), u('km', 'Kilómetro', 1000),
      u('in', 'Pulgada', 0.0254), u('ft', 'Pie', 0.3048), u('yd', 'Yarda', 0.9144),
      u('mi', 'Milla', 1609.344), u('nmi', 'Milla náutica', 1852), u('ly', 'Año luz', 9.4607e15),
    ],
  },
  {
    id: 'mass', name: 'Masa',
    units: [
      u('mg', 'Miligramo', 1e-6), u('g', 'Gramo', 0.001), u('kg', 'Kilogramo', 1),
      u('t', 'Tonelada', 1000), u('oz', 'Onza', 0.028349523125), u('lb', 'Libra', 0.45359237),
      u('st', 'Stone', 6.35029318),
    ],
  },
  {
    id: 'temp', name: 'Temperatura',
    units: [
      { id: 'C', name: 'Celsius', f: 0, special: 'celsius' },
      { id: 'F', name: 'Fahrenheit', f: 0, special: 'celsius' },
      { id: 'K', name: 'Kelvin', f: 0, special: 'celsius' },
    ],
  },
  {
    id: 'area', name: 'Área',
    units: [
      u('mm2', 'Milímetro²', 1e-6), u('cm2', 'Centímetro²', 1e-4), u('m2', 'Metro²', 1),
      u('ha', 'Hectárea', 1e4), u('km2', 'Kilómetro²', 1e6), u('ft2', 'Pie²', 0.09290304),
      u('ac', 'Acre', 4046.8564224),
    ],
  },
  {
    id: 'volume', name: 'Volumen',
    units: [
      u('ml', 'Mililitro', 0.001), u('l', 'Litro', 1), u('m3', 'Metro³', 1000),
      u('gal', 'Galón (EE. UU.)', 3.785411784), u('galuk', 'Galón (UK)', 4.54609),
      u('qt', 'Cuarto (EE. UU.)', 0.946352946), u('pt', 'Pinta (EE. UU.)', 0.473176473),
      u('cup', 'Taza', 0.2365882365), u('floz', 'Onza líquida (EE. UU.)', 0.0295735295625),
    ],
  },
  {
    id: 'speed', name: 'Velocidad',
    units: [
      u('mps', 'Metro/segundo', 1), u('kmh', 'Kilómetro/hora', 1 / 3.6), u('mph', 'Milla/hora', 0.44704),
      u('kn', 'Nudo', 0.514444), u('ftps', 'Pie/segundo', 0.3048), u('c', 'Velocidad de la luz', 299792458),
    ],
  },
  {
    id: 'time', name: 'Tiempo',
    units: [
      u('ms', 'Milisegundo', 0.001), u('s', 'Segundo', 1), u('min', 'Minuto', 60),
      u('h', 'Hora', 3600), u('d', 'Día', 86400), u('wk', 'Semana', 604800),
      u('mo', 'Mes (30 d)', 2592000), u('yr', 'Año (365 d)', 31536000),
    ],
  },
  {
    id: 'data', name: 'Datos',
    units: [
      u('b', 'Bit', 1 / 8), u('B', 'Byte', 1), u('KB', 'Kilobyte (1000)', 1e3),
      u('KiB', 'Kibibyte (1024)', 1024), u('MB', 'Megabyte', 1e6), u('MiB', 'Mebibyte', 1048576),
      u('GB', 'Gigabyte', 1e9), u('GiB', 'Gibibyte', 1073741824), u('TB', 'Terabyte', 1e12),
      u('TiB', 'Tebibyte', 1099511627776),
    ],
  },
  {
    id: 'pressure', name: 'Presión',
    units: [
      u('pa', 'Pascal', 1), u('kpa', 'Kilopascal', 1000), u('bar', 'Bar', 1e5),
      u('atm', 'Atmósfera', 101325), u('psi', 'PSI', 6894.757293168), u('mmhg', 'mmHg', 133.322387415),
    ],
  },
  {
    id: 'energy', name: 'Energía',
    units: [
      u('j', 'Julio', 1), u('kj', 'Kilojulio', 1000), u('cal', 'Caloría', 4.184),
      u('kcal', 'Kilocaloría', 4184), u('wh', 'Vatio-hora', 3600), u('kwh', 'Kilovatio-hora', 3.6e6),
      u('ev', 'Electronvoltio', 1.602176634e-19),
    ],
  },
]

function tempToCelsius(v: number, from: string): number {
  if (from === 'C') return v
  if (from === 'F') return ((v - 32) * 5) / 9
  return v - 273.15
}

function celsiusTo(c: number, to: string): number {
  if (to === 'C') return c
  if (to === 'F') return (c * 9) / 5 + 32
  return c + 273.15
}

export function convertUnit(value: number, fromId: string, toId: string): number {
  if (fromId === toId) return value
  let cat: Category | undefined
  for (const c of CATEGORIES) {
    if (c.units.some((x) => x.id === fromId) && c.units.some((x) => x.id === toId)) {
      cat = c
      break
    }
  }
  if (!cat) throw new Error('Unidades de categorías distintas')
  const fu = cat.units.find((x) => x.id === fromId)!
  const tu = cat.units.find((x) => x.id === toId)!
  if (cat.id === 'temp') {
    return celsiusTo(tempToCelsius(value, fromId), toId)
  }
  return (value * fu.f) / tu.f
}
