// Mini Lucene-like query parser pra audit search. Suporta:
//   action:refund                  — campo:valor (exact)
//   action:refund*                 — prefix match
//   status:>=400                   — operadores >= > <= < em campos numericos
//   ip:1.2.3.4 status:200          — AND implicit
//   action:refund OR action:dispute — OR explicito
//
// Output: { wheres: [...sql], args: [...] } pra usar com WHERE clause.

const NUMERIC_FIELDS = new Set(['status_code', 'duration_ms', 'created_at']);
const ALLOWED_FIELDS = new Set([
  'method', 'path', 'status_code', 'ip', 'user_agent',
  'test_mode', 'duration_ms', 'created_at',
  'action', 'target_type', 'target_id', 'actor_id', 'actor_name', 'details'
]);

function parse(query) {
  if (!query || typeof query !== 'string') return { wheres: [], args: [] };
  // Tokeniza simples: split por espaco, mas preserva "..." em valores
  const tokens = [];
  const rx = /([^\s:]+):(?:"([^"]*)"|([^\s]+))|\b(OR|AND)\b/gi;
  let m;
  while ((m = rx.exec(query)) !== null) {
    if (m[4]) { tokens.push({ type: 'op', value: m[4].toUpperCase() }); continue; }
    const field = m[1];
    const value = m[2] != null ? m[2] : m[3];
    if (!ALLOWED_FIELDS.has(field)) continue;
    tokens.push({ type: 'term', field, value });
  }

  const wheres = [];
  const args = [];
  let pendingOR = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'op') { pendingOR = (t.value === 'OR'); continue; }

    let sql, val = t.value;
    // Numerico com operador
    const opMatch = String(val).match(/^(>=|<=|>|<)(.+)$/);
    if (NUMERIC_FIELDS.has(t.field) && opMatch) {
      sql = `${t.field} ${opMatch[1]} ?`;
      args.push(Number(opMatch[2]));
    } else if (String(val).endsWith('*')) {
      sql = `${t.field} LIKE ?`;
      args.push(String(val).slice(0, -1) + '%');
    } else {
      sql = `${t.field} = ?`;
      args.push(NUMERIC_FIELDS.has(t.field) ? Number(val) : String(val));
    }

    if (wheres.length === 0) {
      wheres.push(sql);
    } else if (pendingOR) {
      wheres[wheres.length - 1] = `(${wheres[wheres.length - 1]} OR ${sql})`;
      pendingOR = false;
    } else {
      wheres.push(sql);
    }
  }
  return { wheres, args };
}

module.exports = { parse, ALLOWED_FIELDS };
