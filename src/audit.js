const { db } = require('./db');

function log({ req, action, target_type, target_id, details }) {
  const actor_id = req?.user?.id || null;
  const actor_name = req?.user?.username || (actor_id ? null : 'system');
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || null;
  db.prepare(`
    INSERT INTO audit_log (actor_id,actor_name,action,target_type,target_id,details,ip)
    VALUES (?,?,?,?,?,?,?)
  `).run(actor_id, actor_name, action, target_type || null, String(target_id ?? ''), details ? JSON.stringify(details) : null, ip);
}

function middleware(action, target_type) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        log({ req, action, target_type, target_id: req.params.id, details: req.body });
      }
    });
    next();
  };
}

module.exports = { log, middleware };
