'use strict';

/**
 * safeEval — restricted boolean expression evaluator.
 *
 * Replaces eval() for alert-rule and goal-condition expressions.
 * Grammar (after variable substitution with JSON.stringify values):
 *   expr       := or_expr
 *   or_expr    := and_expr ( '||' and_expr )*
 *   and_expr   := not_expr ( '&&' not_expr )*
 *   not_expr   := '!' not_expr | comparison
 *   comparison := atom ( op atom )?
 *   op         := '===' | '!==' | '>=' | '<=' | '==' | '!=' | '>' | '<'
 *   atom       := NUMBER | 'true' | 'false' | 'null' | STRING | '(' expr ')'
 */

class SafeEvalError extends Error {}

function safeEvalCondition(expr) {
  if (!expr || typeof expr !== 'string') return false;
  try {
    const tokens = tokenize(expr.trim());
    const parser = new Parser(tokens);
    const result = parser.parseExpr();
    if (parser.pos < tokens.length) throw new SafeEvalError('Unexpected token: ' + tokens[parser.pos].value);
    return Boolean(result);
  } catch (e) {
    if (e instanceof SafeEvalError) return false;
    return false;
  }
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

const TOKEN_PATTERNS = [
  { type: 'NUMBER',  re: /^-?\d+(\.\d+)?([eE][+-]?\d+)?/ },
  { type: 'STRING',  re: /^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/ },
  { type: 'BOOL',    re: /^(true|false)\b/ },
  { type: 'NULL',    re: /^null\b/ },
  { type: 'OP',      re: /^(===|!==|>=|<=|==|!=|>|<|\|\||&&|!)/ },
  { type: 'LPAREN',  re: /^\(/ },
  { type: 'RPAREN',  re: /^\)/ },
  { type: 'WS',      re: /^\s+/ },
];

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    let matched = false;
    for (const { type, re } of TOKEN_PATTERNS) {
      const m = input.slice(i).match(re);
      if (m) {
        if (type !== 'WS') tokens.push({ type, value: m[0] });
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) throw new SafeEvalError('Unexpected character: ' + input[i]);
  }
  return tokens;
}

// ── Parser ─────────────────────────────────────────────────────────────────

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }

  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.peek()?.type === 'OP' && this.peek().value === '||') {
      this.consume();
      const right = this.parseAnd();
      left = left || right;
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.peek()?.type === 'OP' && this.peek().value === '&&') {
      this.consume();
      const right = this.parseNot();
      left = left && right;
    }
    return left;
  }

  parseNot() {
    if (this.peek()?.type === 'OP' && this.peek().value === '!') {
      this.consume();
      return !this.parseNot();
    }
    return this.parseComparison();
  }

  parseComparison() {
    const left = this.parseAtom();
    const op = this.peek();
    if (op?.type === 'OP' && ['===','!==','>=','<=','==','!=','>','<'].includes(op.value)) {
      this.consume();
      const right = this.parseAtom();
      switch (op.value) {
        case '===': return left === right;
        case '!==': return left !== right;
        case '==':  return left == right;   // eslint-disable-line eqeqeq
        case '!=':  return left != right;   // eslint-disable-line eqeqeq
        case '>':   return left > right;
        case '<':   return left < right;
        case '>=':  return left >= right;
        case '<=':  return left <= right;
      }
    }
    return left;
  }

  parseAtom() {
    const t = this.peek();
    if (!t) throw new SafeEvalError('Unexpected end of expression');
    if (t.type === 'NUMBER') { this.consume(); return parseFloat(t.value); }
    if (t.type === 'BOOL')   { this.consume(); return t.value === 'true'; }
    if (t.type === 'NULL')   { this.consume(); return null; }
    if (t.type === 'STRING') { this.consume(); return JSON.parse(t.value.replace(/^'|'$/g, '"').replace(/\\'/g, "'")); }
    if (t.type === 'LPAREN') {
      this.consume();
      const val = this.parseExpr();
      if (this.peek()?.type !== 'RPAREN') throw new SafeEvalError('Missing closing paren');
      this.consume();
      return val;
    }
    throw new SafeEvalError('Unexpected token: ' + t.value);
  }
}

module.exports = { safeEvalCondition };
