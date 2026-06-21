// Interface (contrato) do users repository.
// JS nao tem interfaces de verdade, isso documenta o contrato esperado.

module.exports = {
  findById: '(id: number) -> User|null',
  findByEmail: '(email: string) -> User|null',
  findByDiscordId: '(discordId: string) -> User|null',
  countActive: '() -> number',
  create: '(data: {email, password_hash, role, display_name, ...}) -> User',
  update: '(id, data) -> User',
  deactivate: '(id) -> void',
  listAll: '() -> User[]',
  firstOwner: '() -> User|null'
};
