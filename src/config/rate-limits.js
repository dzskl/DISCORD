// Configuracoes de rate limit centralizadas.
const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('../constants');

const make = ({ window, max, message } = {}) => rateLimit({
  windowMs: window,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: message ? { error: message } : undefined
});

module.exports = {
  api: make(RATE_LIMITS.API_GENERAL),
  checkout: make(RATE_LIMITS.CHECKOUT),
  coupon: make({ ...RATE_LIMITS.COUPON, message: 'muitas tentativas, tente em 1 min' }),
  auth: make(RATE_LIMITS.AUTH),
  login: make({ ...RATE_LIMITS.LOGIN, message: 'muitas tentativas, espere 1 min' }),
  register: make({ ...RATE_LIMITS.REGISTER, message: 'limite de registros por hora atingido' }),
  forgot: make(RATE_LIMITS.FORGOT)
};
