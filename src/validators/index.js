// Validators de payload usados pelos controllers.
// Cada funcao retorna { valid: true, value } ou { valid: false, error }
const { isValidEmail, isValidDiscordId, isValidHexColor } = require('../helpers');

function string(v, { min, max, required } = {}) {
  if (v == null || v === '') return required ? { valid: false, error: 'obrigatorio' } : { valid: true, value: null };
  const s = String(v).trim();
  if (min != null && s.length < min) return { valid: false, error: `mínimo ${min} caracteres` };
  if (max != null && s.length > max) return { valid: false, error: `máximo ${max} caracteres` };
  return { valid: true, value: s };
}

function email(v, opts) {
  const r = string(v, { ...opts, max: 255 });
  if (!r.valid) return r;
  if (r.value && !isValidEmail(r.value)) return { valid: false, error: 'email invalido' };
  return { valid: true, value: r.value ? r.value.toLowerCase() : null };
}

function password(v, { required = true } = {}) {
  if (v == null || v === '') return required ? { valid: false, error: 'senha obrigatoria' } : { valid: true, value: null };
  if (typeof v !== 'string') return { valid: false, error: 'senha invalida' };
  if (v.length < 8) return { valid: false, error: 'senha deve ter pelo menos 8 caracteres' };
  return { valid: true, value: v };
}

function discordId(v, opts) {
  const r = string(v, opts);
  if (!r.valid) return r;
  if (r.value && !isValidDiscordId(r.value)) return { valid: false, error: 'ID do Discord invalido' };
  return r;
}

function integer(v, { min, max, required } = {}) {
  if (v == null || v === '') return required ? { valid: false, error: 'obrigatorio' } : { valid: true, value: null };
  const n = parseInt(v);
  if (Number.isNaN(n)) return { valid: false, error: 'numero invalido' };
  if (min != null && n < min) return { valid: false, error: `mínimo ${min}` };
  if (max != null && n > max) return { valid: false, error: `máximo ${max}` };
  return { valid: true, value: n };
}

function money(v, opts) {
  if (v == null || v === '') return opts?.required ? { valid: false, error: 'obrigatorio' } : { valid: true, value: null };
  const n = parseFloat(v);
  if (Number.isNaN(n) || n < 0) return { valid: false, error: 'valor invalido' };
  return { valid: true, value: Math.round(n * 100) };
}

function hexColor(v, opts) {
  if (v == null || v === '') return opts?.required ? { valid: false, error: 'obrigatorio' } : { valid: true, value: null };
  if (!isValidHexColor(v)) return { valid: false, error: 'cor deve ser #RRGGBB' };
  return { valid: true, value: v };
}

function url(v, opts) {
  if (v == null || v === '') return opts?.required ? { valid: false, error: 'obrigatorio' } : { valid: true, value: null };
  if (!/^https?:\/\//.test(String(v))) return { valid: false, error: 'URL deve começar com http(s)://' };
  return { valid: true, value: String(v) };
}

function enumOf(v, allowed, opts) {
  if (v == null || v === '') return opts?.required ? { valid: false, error: 'obrigatorio' } : { valid: true, value: null };
  if (!allowed.includes(v)) return { valid: false, error: `valor inválido (use: ${allowed.join(', ')})` };
  return { valid: true, value: v };
}

// Validador em batch — retorna { valid, errors, values }
function validate(payload, schema) {
  const values = {};
  const errors = {};
  for (const [key, validator] of Object.entries(schema)) {
    const r = validator(payload?.[key]);
    if (!r.valid) errors[key] = r.error;
    else values[key] = r.value;
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

module.exports = { string, email, password, discordId, integer, money, hexColor, url, enumOf, validate };
