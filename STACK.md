# Stack de ideias acumuladas

Tracking de tudo pedido via screenshots. Quando o user mandar "começar",
implementar na ordem da lista PENDENTE → de cima pra baixo.

---

## ✅ JÁ ENTREGUE (não mexer)

### Rodada NeverMissApps #1 — Landing + Pricing
- [x] Calculadora interativa na landing
- [x] Comparação de taxas vs Kirvano/Cartpanda/Hotmart/Kiwify/Ticto
- [x] Simulação de venda animada 5-step
- [x] Carteira (saldo + saque normal R$0,50 / instantâneo R$3,50)
- [x] Follow-up de carrinho abandonado (cron 15min)
- [x] Assinaturas recorrentes pro cliente final (Stripe Price recurring)
- [x] Bot Telegram skeleton (/start /loja /vips /suporte)
- [x] GA tracking dinâmico via config
- [x] Trial 24h opcional (plano trial_24h)
- [x] Central de Tutoriais in-app (16 vídeos, 6 categorias)
- [x] Carousel "Nossos Clientes" na landing
- [x] Premiações por marcos (6 tiers de volume + 5 de count)
- [x] Anti-fraude avançado (score, blacklist, threshold, suspicious sales)
- [x] Setup em 5min wizard com auto-detect via polling
- [x] Métricas globais no hero (servers/tx/members/volume)
- [x] Feed de vendas em tempo real no hero

### Rodada Easebot — Permissões + KYC
- [x] Permissões granulares 26 chaves agrupadas (Principal/Geral/Moderação)
- [x] Aba Cargos (Discord roles) paralela a Membros
- [x] Bulk save com "● Alterações não salvas" + Limpar/Salvar
- [x] Add membro por busca de username/ID (modal)
- [x] KYC PIX 3-step (Pagamento QR → Comprovante → Concluído)
- [x] Admin de KYC (aprovar/rejeitar com motivo)
- [x] Admin de saques (aprovar/marcar pago/rejeitar)
- [x] Multi-bot lite com switcher na sidebar
- [x] Stub pages: Personalização, Recursos, Proteção, eCloud, VIPs

---

## 🟡 PENDENTE — Ordem de implementação

### Rodada NeverMissApps #2 — Trial / Sidebar / Visão Geral

#### 🟢 Rápidas (~15-30min)
- [x] **User dropdown no topbar**: avatar → menu com nome+email+último acesso, Minha Conta / Aplicações / Carteira / Configurações / Sair
- [x] **Warning banner "config faltando"** reusável (ex: "Chave API não configurada" + botão "Configurar agora")
- [x] **Renomeações empresariais**: "Aplicações" em vez de "Bots", "Automações" em vez de "Auto-respostas"
- [x] **"Aplicação ativa" label** com dot verde no card do bot
- [x] **"Meus Bots" link** voltando pra listagem
- [x] **Apelido custom do bot** (short name editável usado no breadcrumb)

#### 🟡 Médias (~30-60min)
- [x] **Bot card polido na sidebar**: avatar + ID truncado + status + ID full com copy + Reiniciar (amarelo) + Desligar (vermelho) em destaque
- [x] **Breadcrumb na topbar** mostrando bot ativo (`9498...-TRIAL / Visão Geral`)
- [x] **Card Assinatura + Módulos na Visão Geral**: "X dias restantes" big + Renovar + lista MÓDULOS com dot colorido
- [x] **Cards Servidor Principal + Auditoria** lado a lado na Visão Geral (mesmo vazios)
- [x] **Loading modal "Preparando seu bot"** com progress bar fake (10-30s)
- [x] **Banner "Precisa de ajuda?"** embedável no topo das pages config (botões Ver Tutoriais + Suporte)
- [x] **Página Trial Gratuito dedicada**: 2 cards (features + status elegibilidade com checks)

### Rodada NeverMissApps #4 — Boas-vindas / Loja / Automações / Proteção

#### 🟡 Médias (~30-60min)
- [ ] **Página "Boas-vindas"** com tabs Boas-vindas / Despedida
  - Lista de mensagens configuradas (canal alvo, template)
  - Botão "+ Adicionar Mensagem"
  - Template com placeholders ({user}, {server}, {count})

#### 🟠 Maiores (~1-2h cada)
- [ ] **Página "Loja"** estruturada:
  - Warning banner "Chave API não configurada" + Configurar agora
  - Tabs **Produtos / Geral / Cupons**
  - Conceito de **Painéis de Loja** — múltiplos painéis postáveis em canais diferentes
  - Left panel: lista de painéis com busca + botão +
  - Right panel: editor do painel selecionado

- [ ] **Página "Ações Automáticas"** com 5 tabs:
  - **Mensagens Automáticas** (broadcasts agendados)
  - **Reações Automáticas** (auto-react em mensagens)
  - **Repostagem Automática** (repostar produtos/anúncios pra manter fresh)
  - **Limpeza Automática** (auto-delete mensagens antigas em canais)
  - **Sugestões** (sistema de sugestões com canal)
  - Cada uma: configuração + preview live do embed

- [ ] **Embed Builder com preview live** (reusável):
  - Color picker
  - Autor (nome + link + avatar)
  - Título + Descrição com char counter (X/256, Y/4096)
  - Fields (campos) adicionáveis
  - Rodapé (footer) com imagem
  - Coluna direita: **renderização em tempo real** estilo Discord
  - Reusável em: anúncios, sugestões, boas-vindas, etc.

- [ ] **Página "Proteção" anti-raid completa** (7 tabs, ~3h pra tudo):
  - **Anti Fake** (toggle global) — detecta contas fake/bots novos
  - **Anti Spam** (toggle global + warning se off) — flood, spam, links
  - **Canais** — defesas contra ataques de destruição:
    - Defesa contra Deleção de Canais (toggle + editar)
    - Defesa contra Edição de Canais (toggle + editar)
    - Defesa contra Criação de Canais (toggle + editar)
    - Configurações Globais (punição + cargos imunes + canal de logs)
  - **Cargos** — espelha estrutura de Canais:
    - Defesa contra Deleção de Cargos
    - Defesa contra Edição de Cargos
    - Defesa contra Criação de Cargos
    - Configurações Globais
  - **Moderação** — abusos de moderadores:
    - Monitoramento de Banimentos Massivos
    - Monitoramento de Expulsões Massivas
  - **Segurança Avançada** — 5 toggles:
    - Proteção de Permissões Administrativas
    - Controle de Menções Abusivas (@everyone, @here)
    - Gestão de Punições do Sistema (auditoria + controle)
    - Monitoramento de Integrações (Bots maliciosos)
    - Controle de Adição de Cargos Privados
  - **Permissões de Comandos** — lista colapsável de comandos:
    - /ban, /unban, /kick, /mute, /unmute, /lock, /clear, /cleardm,
      /nuke, /say, /dm — cada um expandível pra setar cargos permitidos

### Rodada NeverMissApps #3 — Configurar Bot / Personalização / Canais / Cargos

#### 🟠 Maiores (~1-2h cada)
- [x] **Página "Configurar Bot"** completa:
  - [x] Card Token do Bot (input + show/hide + Atualizar)
  - [x] Card Resgatar Código de Presente (`NEVER-XXXX-XXXX-XXXX`)
  - [x] Card Transferência de Posse (input Discord ID + warning irreversível + botão vermelho)
- [ ] **Página "Personalização" estruturada**:
  - [ ] Banner header customizável (image upload)
  - [ ] Tabs Geral / Embeds
  - [ ] Card BIO Personalizada com paywall R$5 (status rotativo)
  - [ ] Card Informações readonly (Nome, ID, Status)
  - [ ] Card Prefixo do bot Discord
- [x] **Página "Canais" agrupada** por contexto (6 grupos)
- [x] **Página "Cargos" agrupada** (Administração / Membros)

#### 🔴 Backend pesado
- [x] **Sistema de Códigos Promocionais**:
  - [x] Migration `promo_codes` (code, kind, value, max_uses, expires_at)
  - [ ] Admin page pra gerar códigos (backend pronto, UI ainda nao)
  - [x] User resgata via página Configurar Bot
  - [x] Tipos: extension trial, créditos saldo, módulo desbloqueado
- [x] **Transferência de Posse** real:
  - [x] Endpoint que valida Discord ID destino
  - [x] Cria notificação pro novo dono
  - [x] Move ownership (com confirmacao IRREVERSIVEL)
- [ ] **BIO rotativa** (renderização real no Discord profile + paywall R$5)
- [ ] **Servidor Principal conectado** card com avatar+ID+stats+botão "Adicionar a outro servidor"

---

### Rodada NeverMissApps #5 — Convites / Sorteios / Tickets / eCloud / Carteira

#### 🟠 Maiores (~1-2h cada)
- [ ] **Página "Rastreamento de Convites" estruturada**:
  - Status do Sistema (toggle global) + Canal de Logs
  - Mensagens do Sistema (Entrada / Saída) com:
    - Variáveis copiáveis em chips: `{member}` `{membername}` `{inviter}` `{invitername}` `{invites}`
    - Textarea de conteúdo + "Abrir Editor" pra embed
  - **Cargos por Convite** — atribuição automática baseada em metas
    (10 convites → cargo X, 50 → cargo Y, etc)

- [ ] **Página "Sorteios" avançada** com tabs Geral / Requisitos / Tarefas:
  - Geral: nome, ícone, banner (upload), descrição, **Modo de Entrega
    Automática** (cargo / código / mensagem), monitorar toggle
  - Requisitos: cargos exigidos, mínimo de convites, idade da conta
  - **Tarefas** (gamificação): seguir IG, entrar em outro server, etc

- [ ] **Página "Tickets — Painéis de Suporte"** estruturada:
  - Lista de painéis com status Postado/Não postado
  - Sincronizar + Novo Painel buttons
  - Search
  - Painel expandido com tabs Geral / Funções / Embed
  - **Configurações de Funcionamento**:
    - Horário de início/fim (opcional)
    - Dias de funcionamento (pills Seg-Dom selecionáveis)
  - Sticky save "Alterações não salvas | Limpar | Salvar"
  - Card **IA de Atendimento** (paywall) — AI auto-responde tickets

- [ ] **Página "eCloud" landing**:
  - Logo grande + "Sistema de verificação OAuth2 e pull de membros"
  - 2 CTAs: **Registrar Novo Bot** / **Vincular Chave Existente**

#### 🔴 Backend pesado / nova arquitetura
- [ ] **Página "Carteira" completa** (substitui modal de saque):
  - **4 cards de saldo**: Disponível / Bloqueado pelo Banco / Congelado (MED) / Total
  - Conceito de **MED** (Mecanismo Especial de Devolução — bloqueio PIX BC)
  - **Premiações de Faturamento**: progress bar com marcos
    R$0 / R$100k / R$500k / R$1M + placas trofeu
  - Banner "2FA Necessária pra sacar" + botão Ativar 2FA
  - **Solicitar Saque** card:
    - Validar chave PIX (botão valida no gateway)
    - **Saque Turbo** checkbox (Instantâneo R$3,50 vs Normal R$0,50)
    - Resumo: disponível / congelado / mínimo / taxa
    - Botão disabled até 2FA ativo
  - **Resumo** card:
    - Estatísticas: Total de Vendas / Volume Total / Total Sacado / MEDs Ativos
    - Status: Aprovadas / Pendentes / Reembolsadas / Canceladas
    - Gráfico de receita com filtros Hoje/Semanal/Mensal/Total/Período
  - Botões topo: **Extrato por Email** + Atualizar

- [ ] **2FA pro user** (TOTP):
  - Setup QR code (Google Authenticator etc)
  - Validação obrigatória antes de saques
  - Recovery codes
  - Desativar com password

- [ ] **Extrato por Email**:
  - Backend gera CSV/PDF do período
  - Envia pro email cadastrado
  - Async com confirmação visual

## 📌 Ideias deferidas (do design Claude)

- [ ] Design system com tokens live (accent color, corner radius, density)
- [ ] Redesign visual completo seguindo ref HVAC (light card-based + gauge meters)

---

## Como continuar

Quando o user mandar **"vai"** ou **"começar"**:
1. Pegar a primeira não-checada da seção PENDENTE
2. Implementar + commitar
3. Marcar `[x]` aqui
4. Próxima

Quando mandar mais screenshot:
1. Extrair ideias novas
2. Adicionar na seção apropriada (Rápida/Média/Maior)
3. Não implementar até pedirem
