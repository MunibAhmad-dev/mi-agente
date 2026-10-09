/**
 * codeIntelligence.js — Fase 5 (Code Intelligence): symbol index + dependency
 * graph + call graph sobre el código del workspace.
 *
 * Diseño: parser LIGERO basado en patrones estructurados (sin dependencias
 * nativas) que extrae definiciones (funciones/clases/métodos/exports) e
 * importaciones. La interfaz es PLUGABLE: un parser basado en tree-sitter
 * puede enchufarse más adelante implementando el mismo contrato
 * (parseSource → { symbols, imports }), sin cambiar los consumidores.
 *
 * Cubre los objetivos del doc (§7 Code Intelligence):
 *   - Symbol index: dónde se define cada símbolo (file + line + kind).
 *   - Dependency graph: qué archivo importa a cuál (impacto de cambios).
 *   - Blast radius: cierre transitivo del grafo (base Fase 6).
 *
 * Regla 2 del doc: independiente del modelo. Minimalismo: sin dependencias
 * nativas, sin Neo4j (grafo en memoria/Map).
 */

const fs = require('fs');
const path = require('path');

/** Tipos de símbolos. */
const SymbolKind = Object.freeze({
  FUNCTION: 'function',
  ARROW_FUNCTION: 'arrow_function',
  CLASS: 'class',
  METHOD: 'method',
  VARIABLE: 'variable',
  EXPORT: 'export',
  IMPORT: 'import',
  INTERFACE: 'interface',
  TYPE: 'type',
});

/** Lenguajes soportados y su configuración. */
const LANGUAGE_CONFIG = Object.freeze({
  js: { name: 'javascript' },
  jsx: { name: 'javascript' },
  mjs: { name: 'javascript' },
  cjs: { name: 'javascript' },
  ts: { name: 'typescript' },
  tsx: { name: 'typescript' },
  py: { name: 'python' },
  rb: { name: 'ruby' },
  go: { name: 'go' },
  java: { name: 'java' },
});

const SUPPORTED_EXTENSIONS = new Set(Object.keys(LANGUAGE_CONFIG));

function languageOf(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return LANGUAGE_CONFIG[ext] ? ext : null;
}

/**
 * Extrae símbolos e importaciones de un texto fuente JS/TS.
 * Patrones estructurados: captura definiciones con nombre y línea.
 * @param {string} source
 * @param {string} ext
 * @returns {{ symbols: object[], imports: object[] }}
 */
function parseJavaScriptSource(source, ext) {
  const symbols = [];
  const imports = [];
  const lines = source.split('\n');
  const lang = LANGUAGE_CONFIG[ext].name;

  const pushSymbol = (name, kind, line, extra = {}) => {
    if (!name || !/^[A-Za-z_$]/.test(name)) return;
    symbols.push({ name, kind, line, ...extra });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    // imports ESM: import X from 'path'; import 'path';
    let m =
      line.match(/^\s*import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/) ||
      line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if (m) {
      const spec = m[1] || '*';
      const from = m[2] || m[1];
      imports.push({ spec, from, line: lineNo, kind: 'esm' });
      continue;
    }
    // require CJS (incluye destructuring: const { a, b } = require('m'))
    m = line.match(/(?:const|let|var)\s+(.+?)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (m) {
      imports.push({ spec: m[1].trim(), from: m[2], line: lineNo, kind: 'cjs' });
      continue;
    }

    // export declarations (marca exported: true)
    m = line.match(
      /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/,
    );
    if (m) {
      pushSymbol(m[1], SymbolKind.EXPORT, lineNo, { exported: true });
    }

    // function declarations
    m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) {
      pushSymbol(m[1], SymbolKind.FUNCTION, lineNo, { exported: /export/.test(line) });
      continue;
    }

    // class declarations
    m = line.match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
    if (m) {
      pushSymbol(m[1], SymbolKind.CLASS, lineNo, { exported: /export/.test(line) });
      continue;
    }

    // interface / type (TS)
    if (lang === 'typescript') {
      m = line.match(/^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/);
      if (m) {
        pushSymbol(m[1], SymbolKind.INTERFACE, lineNo);
        continue;
      }
      m = line.match(/^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<{]/);
      if (m) {
        pushSymbol(m[1], SymbolKind.TYPE, lineNo);
        continue;
      }
    }

    // const X = (...) =>  (arrow function)
    m = line.match(
      /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/,
    );
    if (m) {
      pushSymbol(m[1], SymbolKind.ARROW_FUNCTION, lineNo, { exported: /export/.test(line) });
      continue;
    }

    // class methods (indentado): name(...) {
    m = line.match(
      /^\s+(?:public|private|protected|static|async|get|set|\s)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/,
    );
    if (m && !/^(if|for|while|switch|catch|return|function|class)$/.test(m[1])) {
      pushSymbol(m[1], SymbolKind.METHOD, lineNo);
    }
  }

  return { symbols, imports };
}

/** Parser mínimo para lenguajes no-JS (funciones/clases/imports a nivel módulo). */
function parseMinimalSource(source, ext) {
  const symbols = [];
  const imports = [];
  const lines = source.split('\n');
  const patterns = {
    py: [
      { sym: /^\s*def\s+([A-Za-z_]\w*)\s*\(/, kind: SymbolKind.FUNCTION },
      { sym: /^\s*class\s+([A-Za-z_]\w*)/, kind: SymbolKind.CLASS },
      { imp: /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/ },
    ],
    rb: [
      { sym: /^\s*def\s+([A-Za-z_]\w*)/, kind: SymbolKind.FUNCTION },
      { sym: /^\s*class\s+([A-Za-z_]\w*)/, kind: SymbolKind.CLASS },
      { imp: /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/ },
    ],
    go: [
      { sym: /^\s*func\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)\s*\(/, kind: SymbolKind.FUNCTION },
      { sym: /^\s*type\s+([A-Za-z_]\w*)\s+struct/, kind: SymbolKind.CLASS },
      { imp: /^\s*import\s+"([^"]+)"/ },
    ],
    java: [
      {
        sym: /^\s*(?:public|private|protected|static|\s)*\s+class\s+([A-Za-z_]\w*)/,
        kind: SymbolKind.CLASS,
      },
      {
        sym: /^\s*(?:public|private|protected|static|\s)*\s+\w+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/,
        kind: SymbolKind.METHOD,
      },
      { imp: /^\s*import\s+([\w.]+);/ },
    ],
  };
  const rules = patterns[ext] || [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;
    for (const rule of rules) {
      if (rule.sym) {
        const m = line.match(rule.sym);
        if (m) {
          symbols.push({ name: m[1], kind: rule.kind, line: lineNo });
          break;
        }
      } else if (rule.imp) {
        const m = line.match(rule.imp);
        if (m) {
          imports.push({ spec: m[1] || m[2], from: m[1] || m[2], line: lineNo, kind: 'native' });
          break;
        }
      }
    }
  }
  return { symbols, imports };
}

// ── tree-sitter pluggable parser ──────────────────────────────────────────────

let _treeSitterParsers = null;

function _loadTreeSitter() {
  if (_treeSitterParsers !== null) return _treeSitterParsers;
  try {
    const Parser = require('tree-sitter');
    const JS = require('tree-sitter-javascript');
    const TS = require('tree-sitter-typescript').typescript;
    const PY = require('tree-sitter-python');

    const jsParser = new Parser(); jsParser.setLanguage(JS);
    const tsParser = new Parser(); tsParser.setLanguage(TS);
    const pyParser = new Parser(); pyParser.setLanguage(PY);

    _treeSitterParsers = { js: jsParser, ts: tsParser, py: pyParser };
  } catch {
    _treeSitterParsers = {};
  }
  return _treeSitterParsers;
}

function _treeSitterParse(source, ext) {
  const parsers = _loadTreeSitter();
  const langKey = (ext === 'py') ? 'py' : (ext === 'ts' || ext === 'tsx') ? 'ts' : 'js';
  const parser = parsers[langKey];
  if (!parser) return null;

  try {
    const tree = parser.parse(source);
    const symbols = [];
    const imports = [];

    function walk(node) {
      const t = node.type;
      if (t === 'function_declaration' || t === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) symbols.push({ name: nameNode.text, kind: 'function', line: node.startPosition.row + 1 });
      } else if (t === 'class_declaration' || t === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) symbols.push({ name: nameNode.text, kind: 'class', line: node.startPosition.row + 1 });
      } else if (t === 'arrow_function') {
        // arrow assigned to variable — pick up from variable_declarator parent
      } else if (t === 'variable_declarator') {
        const nameNode = node.childForFieldName('name');
        const valueNode = node.childForFieldName('value');
        if (nameNode && valueNode && valueNode.type === 'arrow_function') {
          symbols.push({ name: nameNode.text, kind: 'arrow_function', line: node.startPosition.row + 1 });
        }
      } else if (t === 'import_statement') {
        const src = node.children.find((c) => c.type === 'string');
        if (src) imports.push({ from: src.text.replace(/['"]/g, ''), line: node.startPosition.row + 1, kind: 'esm' });
      } else if (t === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn && fn.text === 'require') {
          const args = node.childForFieldName('arguments');
          const str = args && args.children.find((c) => c.type === 'string');
          if (str) imports.push({ from: str.text.replace(/['"]/g, ''), line: node.startPosition.row + 1, kind: 'cjs' });
        }
      }
      for (const child of node.children) walk(child);
    }

    walk(tree.rootNode);
    return { symbols, imports };
  } catch {
    return null;
  }
}

/**
 * Parser plugable: devuelve { symbols, imports } para un archivo.
 * Intenta tree-sitter primero; cae al parser de regex si falla.
 * @param {string} source
 * @param {string} ext
 * @returns {{ symbols: object[], imports: object[] }}
 */
function parseSource(source, ext) {
  const lang = ext ? LANGUAGE_CONFIG[ext] : null;
  if (!lang) {
    return { symbols: [], imports: [] };
  }
  const tsResult = _treeSitterParse(source, ext);
  if (tsResult) return tsResult;
  if (lang.name === 'javascript' || lang.name === 'typescript') {
    return parseJavaScriptSource(source, ext);
  }
  return parseMinimalSource(source, ext);
}

/**
 * CodeIntelligenceService: índice de símbolos + grafo de dependencias
 * construido a partir de los archivos del workspace.
 */
class CodeIntelligenceService {
  constructor() {
    this.symbols = new Map(); // name -> [{ file, line, kind }]
    this.dependencies = new Map(); // file -> Set<file>
    this.fileSymbols = new Map(); // file -> [{ name, kind, line }]
    this.fileImports = new Map(); // file -> [import]
    this.indexedFiles = new Set();
  }

  /** Indexa un único archivo. */
  indexFile(filePath, source) {
    const ext = languageOf(filePath);
    if (!ext) {
      return null;
    }
    const { symbols, imports } = parseSource(source, ext);
    this.fileSymbols.set(filePath, symbols);
    this.fileImports.set(filePath, imports);

    for (const sym of symbols) {
      if (!this.symbols.has(sym.name)) {
        this.symbols.set(sym.name, []);
      }
      this.symbols.get(sym.name).push({ file: filePath, line: sym.line, kind: sym.kind });
    }

    this.dependencies.set(filePath, new Set());
    for (const imp of imports) {
      const resolved = this.resolveImport(imp.from, filePath);
      if (resolved) {
        this.dependencies.get(filePath).add(resolved);
      }
    }
    this.indexedFiles.add(filePath);
    return { symbols: symbols.length, imports: imports.length };
  }

  /** Resuelve una ruta de import relativa a un archivo base. */
  resolveImport(from, basePath) {
    if (!from || (!from.startsWith('.') && !from.startsWith('/'))) {
      return null;
    }
    const dir = path.dirname(basePath);
    const candidates = [
      path.resolve(dir, from),
      path.resolve(dir, from + '.js'),
      path.resolve(dir, from + '.ts'),
      path.resolve(dir, from + '.jsx'),
      path.resolve(dir, from + '.tsx'),
      path.resolve(dir, from, 'index.js'),
      path.resolve(dir, from, 'index.ts'),
    ];
    return candidates.find((c) => this.indexedFiles.has(c)) || null;
  }

  /** Indexa un directorio recursivamente (solo extensiones soportadas). */
  indexDirectory(rootDir, maxFiles = 2000) {
    const results = { files: 0, symbols: 0, imports: 0, skipped: 0 };
    const walk = (dir) => {
      if (results.files >= maxFiles) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.files >= maxFiles) break;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (/node_modules|\.git|dist|build|coverage/.test(entry.name)) continue;
          walk(full);
        } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).slice(1))) {
          try {
            const src = fs.readFileSync(full, 'utf8');
            const r = this.indexFile(full, src);
            if (r) {
              results.files += 1;
              results.symbols += r.symbols;
              results.imports += r.imports;
            } else {
              results.skipped += 1;
            }
          } catch {
            results.skipped += 1;
          }
        }
      }
    };
    walk(rootDir);
    return results;
  }

  /** Busca definiciones de un símbolo por nombre. */
  findDefinitions(name) {
    return this.symbols.get(name) || [];
  }

  /** Archivos que importan a `file` (dependientes — impacto de cambios). */
  findDependents(file) {
    const dependents = [];
    for (const [dep, deps] of this.dependencies.entries()) {
      if (deps.has(file)) {
        dependents.push(dep);
      }
    }
    return dependents;
  }

  /** Archivos de los que depende `file`. */
  findDependencies(file) {
    return Array.from(this.dependencies.get(file) || []);
  }

  /**
   * Blast radius: dado un archivo modificado, devuelve el conjunto de
   * archivos transitivamente afectados (cierre del grafo de dependencias).
   * Base para la Fase 6 (Blast Radius).
   * @param {string|string[]} changedFiles
   * @param {number} [maxDepth=10]
   * @returns {string[]} archivos afectados (incluye los cambiados)
   */
  computeBlastRadius(changedFiles, maxDepth = 10) {
    const seeds = Array.isArray(changedFiles) ? changedFiles : [changedFiles];
    const affected = new Set(seeds);
    let frontier = [...seeds];
    for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
      const next = [];
      for (const file of frontier) {
        for (const dep of this.findDependents(file)) {
          if (!affected.has(dep)) {
            affected.add(dep);
            next.push(dep);
          }
        }
      }
      frontier = next;
    }
    return Array.from(affected);
  }

  /** Estadísticas del índice. */
  stats() {
    let totalDeps = 0;
    for (const deps of this.dependencies.values()) totalDeps += deps.size;
    return {
      files: this.indexedFiles.size,
      symbols: this.symbols.size,
      totalEdges: totalDeps,
    };
  }

  clear() {
    this.symbols.clear();
    this.dependencies.clear();
    this.fileSymbols.clear();
    this.fileImports.clear();
    this.indexedFiles.clear();
  }
}

module.exports = {
  SymbolKind,
  LANGUAGE_CONFIG,
  SUPPORTED_EXTENSIONS,
  languageOf,
  parseSource,
  parseJavaScriptSource,
  parseMinimalSource,
  CodeIntelligenceService,
};
