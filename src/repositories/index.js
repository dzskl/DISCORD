// Repositories — camada de acesso a dados.
// Cada repository encapsula queries de uma tabela.
// Os controllers DEVEM usar repositories em vez de SQL inline (boa pratica),
// mas pra compatibilidade os controllers existentes ainda fazem queries direto.

const { db } = require('../database/connection');

module.exports = {
  users: require('./implementations/users.repository'),
  products: require('./implementations/products.repository'),
  sales: require('./implementations/sales.repository'),
  credentials: require('./implementations/credentials.repository'),
  raw: db // acesso direto pra queries ad-hoc
};
