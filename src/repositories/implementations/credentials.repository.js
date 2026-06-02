// Wrapper limpo do credentials storage que ja existe em database/connection
const { getCredential, setCredential, listCredentialMeta } = require('../../database/connection');

module.exports = {
  get: getCredential,
  set: setCredential,
  listMeta: listCredentialMeta
};
