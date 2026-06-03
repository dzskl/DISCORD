// Models = definicoes de schema das tabelas SQLite.
// Cada model documenta os campos esperados; usado por repositories e validators.

module.exports = {
  Guild: {
    table: 'guilds',
    fields: ['id', 'name', 'icon_url', 'owner_discord_id', 'bot_joined_at', 'bot_left_at', 'active', 'plan', 'subscription_status', 'subscription_ends_at', 'trial_ends_at', 'stripe_customer_id', 'stripe_subscription_id']
  },
  UserGuild: {
    table: 'user_guilds',
    fields: ['user_id', 'guild_id', 'role', 'added_at']
  },
  User: {
    table: 'users',
    fields: ['id', 'email', 'password_hash', 'role', 'discord_id', 'discord_tag', 'discord_avatar', 'display_name', 'plan', 'stripe_customer_id', 'stripe_subscription_id', 'subscription_status', 'subscription_ends_at', 'trial_ends_at', 'active', 'created_at', 'last_login_at']
  },
  Product: {
    table: 'products',
    fields: ['id', 'name', 'description', 'price_cents', 'cost_cents', 'role_id', 'duration', 'image_url', 'stock', 'accent_color', 'category_id', 'delivery_type', 'hook_url', 'discord_channel', 'discord_message_id', 'active', 'created_at']
  },
  Sale: {
    table: 'sales',
    fields: ['id', 'product_id', 'discord_id', 'discord_tag', 'amount_cents', 'status', 'stripe_session_id', 'stripe_payment_intent', 'role_granted', 'expires_at', 'created_at', 'paid_at', 'expiry_warned', 'cart_items', 'delivery_status', 'affiliate_id', 'commission_cents']
  },
  Coupon: {
    table: 'coupons',
    fields: ['id', 'code', 'discount_percent', 'max_uses', 'uses', 'expires_at', 'active', 'created_at', 'min_amount_cents', 'required_role_id', 'min_quantity', 'max_quantity']
  },
  Category: {
    table: 'categories',
    fields: ['id', 'name', 'description', 'icon', 'display_order', 'created_at']
  },
  Affiliate: {
    table: 'affiliates',
    fields: ['id', 'discord_id', 'discord_tag', 'code', 'commission_percent', 'total_sales', 'total_commission_cents', 'active', 'created_at']
  },
  Giveaway: {
    table: 'giveaways',
    fields: ['id', 'channel_id', 'message_id', 'prize', 'winners_count', 'required_role_id', 'ends_at', 'ended', 'winners', 'created_by', 'created_at']
  },
  Ticket: {
    table: 'tickets',
    fields: ['id', 'discord_id', 'discord_tag', 'channel_id', 'subject', 'ticket_type', 'status', 'created_at', 'closed_at']
  },
  AutoReply: {
    table: 'auto_replies',
    fields: ['id', 'trigger', 'match_type', 'response', 'active', 'uses', 'created_at']
  },
  Wishlist: {
    table: 'wishlist',
    fields: ['id', 'discord_id', 'product_id', 'notified', 'created_at']
  },
  Credential: {
    table: 'credentials',
    fields: ['key', 'encrypted_value', 'updated_at', 'updated_by']
  },
  AuditLog: {
    table: 'audit_log',
    fields: ['id', 'actor_id', 'actor_name', 'action', 'target_type', 'target_id', 'details', 'ip', 'created_at']
  },
  Log: {
    table: 'logs',
    fields: ['id', 'type', 'message', 'discord_id', 'discord_tag', 'channel', 'created_at']
  },
  ModAction: {
    table: 'mod_actions',
    fields: ['id', 'action', 'target_id', 'target_tag', 'moderator_id', 'moderator_tag', 'reason', 'created_at']
  },
  Announcement: {
    table: 'announcements',
    fields: ['id', 'channels', 'body', 'kind', 'embed_title', 'embed_color', 'product_id', 'scheduled_for', 'sent_at', 'status', 'created_at']
  },
  Config: {
    table: 'config',
    fields: ['key', 'value']
  },
  MemberEvent: {
    table: 'member_events',
    fields: ['id', 'discord_id', 'discord_tag', 'event', 'created_at']
  },
  CommandUsage: {
    table: 'command_usage',
    fields: ['id', 'command', 'discord_id', 'created_at']
  },
  StockLog: {
    table: 'stock_log',
    fields: ['id', 'product_id', 'delta', 'before_qty', 'after_qty', 'reason', 'actor', 'created_at']
  },
  GiveawayEntry: {
    table: 'giveaway_entries',
    fields: ['giveaway_id', 'discord_id', 'discord_tag', 'created_at']
  },
  InviteLog: {
    table: 'invites_log',
    fields: ['id', 'member_id', 'member_tag', 'inviter_id', 'inviter_tag', 'invite_code', 'joined_at', 'left_at']
  },
  PasswordReset: {
    table: 'password_resets',
    fields: ['token', 'user_id', 'expires_at', 'used', 'created_at']
  },
  TrialNotification: {
    table: 'trial_notifications',
    fields: ['user_id', 'kind', 'sent_at']
  },
  SubscriptionEvent: {
    table: 'subscription_events',
    fields: ['id', 'user_id', 'event', 'stripe_event_id', 'data', 'created_at']
  }
};
