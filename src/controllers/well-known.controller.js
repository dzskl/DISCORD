// .well-known/* — endpoints publicos pra discovery.
// /.well-known/botdash-keys.json — lista das public keys ed25519 ativas
//   pra verificar webhooks v3.

const express = require('express');
const router = express.Router();

router.get('/botdash-keys.json', (req, res) => {
  const keys = require('../services/signing-keys.service').listPublic();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    keys: keys.map(k => ({
      kid: k.kid,
      algorithm: k.algorithm,
      public_key: k.public_key,
      created_at: k.created_at,
      rotated_at: k.rotated_at || null
    }))
  });
});

module.exports = router;
