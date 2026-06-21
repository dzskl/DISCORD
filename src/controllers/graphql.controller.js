// POST /api/graphql — endpoint GraphQL-lite (read-only). Auth via Bearer
// api key (read:sales) ou cookie. Body: { query: "..." }.

const express = require('express');
const { apiKeyOrAuth } = require('../middlewares/api-key.middleware');
const gql = require('../services/graphql-lite.service');

const router = express.Router();

router.post('/', apiKeyOrAuth('read:sales'), (req, res) => {
  const query = req.body?.query;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ errors: [{ message: 'campo "query" obrigatorio' }] });
  }
  if (query.length > 8000) {
    return res.status(400).json({ errors: [{ message: 'query muito longa (max 8000)' }] });
  }
  try {
    const result = gql.execute(query, {
      userId: req.appUser?.id,
      guildId: req.guildId,
      guildScoped: req.guildScoped
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ errors: [{ message: e.message }] });
  }
});

module.exports = router;
