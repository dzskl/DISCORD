// API versioning Stripe-style. Cliente envia header BotDash-Version:
// YYYY-MM-DD. Servidor expoe versao atual via req.apiVersion e aplica
// transformacoes pra requests/responses antigos.
//
// Comeco simples: trackeamos a versao em req mas nao temos breaking
// changes ainda. Quando precisar, adicionamos transforms aqui.
//
// Comportamento:
//   - Cliente sem header  -> usa CURRENT_VERSION (latest)
//   - Header valido       -> req.apiVersion setado
//   - Header invalido     -> 400 com lista de versions suportadas
//   - Versao antiga       -> deprecated warning header

const CURRENT_VERSION = '2026-06-15';
const SUPPORTED = [
  '2026-06-15',   // initial
  // ... versoes futuras vao aqui em ordem cronologica
];
const DEPRECATED = new Set([]);    // versoes que ainda funcionam mas terao sunset

function isValidVersion(v) {
  return SUPPORTED.includes(v);
}

function versionMiddleware(req, res, next) {
  const v = String(req.headers['botdash-version'] || '').trim();
  if (!v) {
    req.apiVersion = CURRENT_VERSION;
    res.setHeader('BotDash-Version', CURRENT_VERSION);
    return next();
  }
  if (!isValidVersion(v)) {
    return res.status(400).json({
      error: 'BotDash-Version invalida',
      code: 'invalid_version',
      received: v,
      supported: SUPPORTED,
      current: CURRENT_VERSION
    });
  }
  req.apiVersion = v;
  res.setHeader('BotDash-Version', v);
  if (DEPRECATED.has(v)) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', '2027-12-31');
    res.setHeader('Warning', `299 - "BotDash-Version ${v} deprecated; upgrade para ${CURRENT_VERSION}"`);
  }
  next();
}

module.exports = { versionMiddleware, CURRENT_VERSION, SUPPORTED, DEPRECATED, isValidVersion };
