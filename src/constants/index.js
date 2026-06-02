// Constantes e enums da aplicacao
module.exports = {
  ROLES: {
    OWNER: 'owner',
    ADMIN: 'admin',
    MEMBER: 'member'
  },

  PLAN_IDS: {
    FREE: 'free',
    PRO: 'pro'
  },

  SUBSCRIPTION_STATUS: {
    TRIALING: 'trialing',
    ACTIVE: 'active',
    PAST_DUE: 'past_due',
    CANCELED: 'canceled',
    EXPIRED: 'expired'
  },

  SALE_STATUS: {
    PENDING: 'pending',
    PAID: 'paid',
    REFUNDED: 'refunded',
    EXPIRED: 'expired',
    FAILED: 'failed'
  },

  DELIVERY_TYPE: {
    AUTOMATIC: 'automatic',
    MANUAL: 'manual'
  },

  PAYMENT_GATEWAY: {
    STRIPE: 'stripe',
    MISTICPAY: 'misticpay'
  },

  PRODUCT_DURATION: {
    PERMANENT: 'permanent',
    ONE_DAY: '1d',
    SEVEN_DAYS: '7d',
    THIRTY_DAYS: '30d',
    ONE_YEAR: '1y'
  },

  AUDIT_ACTIONS: {
    USER_REGISTER: 'user.register',
    USER_LOGIN: 'user.login',
    USER_LOGOUT: 'user.logout',
    USER_INVITED: 'user.invited',
    USER_DEACTIVATED: 'user.deactivated',
    USER_PASSWORD_CHANGED: 'user.password_changed',
    USER_PASSWORD_RESET: 'user.password_reset',
    CREDENTIAL_UPDATE: 'credential.update',
    CREDENTIAL_CLEAR: 'credential.clear',
    BOT_RESTART: 'bot.restart',
    PRODUCT_CREATE: 'product.create',
    PRODUCT_UPDATE: 'product.update',
    PRODUCT_DELETE: 'product.delete',
    CATEGORY_CREATE: 'category.create',
    CATEGORY_UPDATE: 'category.update',
    CATEGORY_DELETE: 'category.delete',
    GIVEAWAY_CREATE: 'giveaway.create',
    GIVEAWAY_END: 'giveaway.end',
    GIVEAWAY_DELETE: 'giveaway.delete',
    AFFILIATE_CREATE: 'affiliate.create',
    AFFILIATE_UPDATE: 'affiliate.update',
    AFFILIATE_DEACTIVATE: 'affiliate.deactivate',
    BILLING_CHECKOUT: 'billing.checkout_created'
  },

  RATE_LIMITS: {
    API_GENERAL: { window: 60_000, max: 120 },
    CHECKOUT: { window: 60_000, max: 10 },
    COUPON: { window: 60_000, max: 20 },
    AUTH: { window: 60_000, max: 30 },
    LOGIN: { window: 60_000, max: 8 },
    REGISTER: { window: 3600_000, max: 5 },
    FORGOT: { window: 3600_000, max: 10 }
  },

  TRIAL_DAYS: 7,
  PASSWORD_MIN_LENGTH: 8,
  SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,

  DISCORD_INVITE_PERMISSIONS: '268561921', // Manage Roles, Kick, Ban, Moderate, etc.

  CURRENCIES: {
    BRL: 'brl',
    USD: 'usd',
    EUR: 'eur'
  }
};
