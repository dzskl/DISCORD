// Serve docs/openapi.yaml (sem auth) e Swagger UI inline em /api/docs.

const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

router.get('/openapi.yaml', (req, res) => {
  const file = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  res.setHeader('Content-Type', 'application/yaml');
  res.send(fs.readFileSync(file, 'utf8'));
});

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>BotDash API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
<style>body{margin:0;background:#fafafa;} .topbar{display:none;}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"></script>
<script>
  window.onload = () => {
    window.ui = SwaggerUIBundle({
      url: '/api/docs/openapi.yaml',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout'
    });
  };
</script>
</body>
</html>`);
});

module.exports = router;
