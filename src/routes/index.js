// Roteador central — registra todas as rotas no app Express.
// Cada controller já é um Router pronto.

function register(app) {
  // System / setup
  app.use('/api/session', require('../controllers/session-health.controller'));
  app.use('/api/setup', require('../controllers/setup.controller'));
  app.use('/api/onboarding', require('../controllers/onboarding.controller'));
  app.use('/api/credentials', require('../controllers/credentials.controller'));
  app.use('/api/billing', require('../controllers/billing.controller'));
  app.use('/api/guilds', require('../controllers/guilds.controller'));
  app.use('/api/wallet', require('../controllers/wallet.controller'));
  app.use('/api/verification', require('../controllers/verification.controller'));
  app.use('/api/notifications', require('../controllers/notifications.controller'));
  app.use('/api/bot', require('../controllers/bot-control.controller'));
  app.use('/api/team', require('../controllers/team.controller'));
  app.use('/api/features', require('../controllers/features.controller'));
  app.use('/api/bots', require('../controllers/bot-instances.controller'));
  app.use('/api/bot-config', require('../controllers/bot-config.controller'));
  app.use('/api/channel-config', require('../controllers/channel-config.controller'));
  app.use('/api/role-config', require('../controllers/role-config.controller'));
  app.use('/api/protection-v2', require('../controllers/protection.controller'));
  app.use('/api/conta', require('../controllers/conta.controller'));
  app.use('/api/shop', require('../controllers/shop-panels.controller'));
  app.use('/api/giveaway-advanced', require('../controllers/giveaway-advanced.controller'));
  app.use('/api/support-panels', require('../controllers/support-panels.controller'));
  app.use('/api/auto-messages', require('../controllers/auto-messages.controller'));
  app.use('/api/auto-actions', require('../controllers/auto-actions.controller'));
  app.use('/api/bio-rotation', require('../controllers/bio-rotation.controller'));
  app.use('/api/support-ai', require('../controllers/support-ai.controller'));
  app.use('/api/2fa', require('../controllers/twofa.controller').router);
  app.use('/api/extras', require('../controllers/extras.controller'));
  app.use('/api/achievements', require('../controllers/achievements.controller'));
  app.use('/api/tutorials', require('../controllers/tutorials.controller'));
  app.use('/api/public-stats', require('../controllers/public-stats.controller'));
  app.use('/api/subscriptions', require('../controllers/subscriptions.controller'));
  app.use('/api/support-inquiries', require('../controllers/support-inquiries.controller'));
  app.use('/api/featured', require('../controllers/featured-products.controller'));
  app.use('/api/verified-badge', require('../controllers/verified-badge.controller'));

  // Auth
  app.use('/auth', require('../controllers/auth.controller'));

  // Dashboard
  app.use('/api/stats', require('../controllers/stats.controller'));
  app.use('/api/members', require('../controllers/members.controller'));
  app.use('/api/logs', require('../controllers/logs.controller'));
  app.use('/api/mod', require('../controllers/mod.controller'));
  app.use('/api/products', require('../controllers/products.controller'));
  app.use('/api/sales', require('../controllers/sales.controller'));
  app.use('/api/announcements', require('../controllers/announcements.controller'));
  app.use('/api/config', require('../controllers/config.controller'));
  app.use('/api/coupons', require('../controllers/coupons.controller'));
  app.use('/api/customers', require('../controllers/customers.controller'));
  app.use('/api/auto-replies', require('../controllers/auto_replies.controller'));
  app.use('/api/wishlist', require('../controllers/wishlist.controller'));
  app.use('/api/tickets', require('../controllers/tickets.controller'));
  app.use('/api/categories', require('../controllers/categories.controller'));
  app.use('/api/giveaways', require('../controllers/giveaways.controller'));
  app.use('/api/audit', require('../controllers/audit.controller'));
  app.use('/api/affiliates', require('../controllers/affiliates.controller'));
  app.use('/api/invites', require('../controllers/invites.controller'));

  // Payment gateways
  app.use('/api/checkout', require('../controllers/checkout.controller'));
}

module.exports = { register };
