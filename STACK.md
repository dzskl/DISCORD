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
- [ ] **User dropdown no topbar**: avatar → menu com nome+email+último acesso, Minha Conta / Aplicações / Carteira / Configurações / Sair
- [ ] **Warning banner "config faltando"** reusável (ex: "Chave API não configurada" + botão "Configurar agora")
- [ ] **Renomeações empresariais**: "Aplicações" em vez de "Bots", "Automações" em vez de "Auto-respostas"
- [ ] **"Aplicação ativa" label** com dot verde no card do bot
- [ ] **"Meus Bots" link** voltando pra listagem
- [ ] **Apelido custom do bot** (short name editável usado no breadcrumb)

#### 🟡 Médias (~30-60min)
- [ ] **Bot card polido na sidebar**: avatar + ID truncado + status + ID full com copy + Reiniciar (amarelo) + Desligar (vermelho) em destaque
- [ ] **Breadcrumb na topbar** mostrando bot ativo (`9498...-TRIAL / Visão Geral`)
- [ ] **Card Assinatura + Módulos na Visão Geral**: "X dias restantes" big + Renovar + lista MÓDULOS com dot colorido
- [ ] **Cards Servidor Principal + Auditoria** lado a lado na Visão Geral (mesmo vazios)
- [ ] **Loading modal "Preparando seu bot"** com progress bar fake (10-30s)
- [ ] **Banner "Precisa de ajuda?"** embedável no topo das pages config (botões Ver Tutoriais + Suporte)
- [ ] **Página Trial Gratuito dedicada**: 2 cards (features + status elegibilidade com checks)

### Rodada NeverMissApps #3 — Configurar Bot / Personalização / Canais / Cargos

#### 🟠 Maiores (~1-2h cada)
- [ ] **Página "Configurar Bot"** completa:
  - [ ] Card Token do Bot (input + show/hide + Atualizar)
  - [ ] Card Resgatar Código de Presente (`NEVER-XXXX-XXXX-XXXX`)
  - [ ] Card Transferência de Posse (input Discord ID + warning irreversível + botão vermelho)
- [ ] **Página "Personalização" estruturada**:
  - [ ] Banner header customizável (image upload)
  - [ ] Tabs Geral / Embeds
  - [ ] Card BIO Personalizada com paywall R$5 (status rotativo)
  - [ ] Card Informações readonly (Nome, ID, Status)
  - [ ] Card Prefixo do bot Discord
- [ ] **Página "Canais" agrupada** por contexto:
  - [ ] Sistema (Logs, Comandos)
  - [ ] Loja (Compras, Eventos de Compras, Feedback)
  - [ ] Membros (Entrada, Saída, Mensagens, Tráfego)
  - [ ] Convites (Log de Convites, Boas-vindas/Despedida)
  - [ ] Moderação (Bans, Kicks, Timeouts)
  - [ ] Cargos (Adicionados, Removidos, Criados)
- [ ] **Página "Cargos" agrupada**:
  - [ ] Administração (Admin, Staff Vendas, Staff Ticket)
  - [ ] Membros (Verificado eCloud, Cliente, Membro Auto-Role)

#### 🔴 Backend pesado
- [ ] **Sistema de Códigos Promocionais**:
  - [ ] Migration `promo_codes` (code, kind, value, max_uses, expires_at)
  - [ ] Admin page pra gerar códigos
  - [ ] User resgata via página Configurar Bot
  - [ ] Tipos: extension trial, créditos saldo, módulo desbloqueado
- [ ] **Transferência de Posse** real:
  - [ ] Endpoint que valida Discord ID destino
  - [ ] Cria notificação pro novo dono confirmar
  - [ ] Move ownership + zera permissões antigas
- [ ] **BIO rotativa** (renderização real no Discord profile + paywall R$5)
- [ ] **Servidor Principal conectado** card com avatar+ID+stats+botão "Adicionar a outro servidor"

---

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
