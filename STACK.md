# Stack de ideias acumuladas

Tracking de tudo pedido via screenshots. Quando o user mandar "vai/começar",
implementar na ordem da lista PENDENTE → de cima pra baixo.

---

## ✅ JÁ ENTREGUE (não mexer)

### Landing + Pricing
- [x] Calculadora interativa
- [x] Comparação de taxas vs Kirvano/Cartpanda/Hotmart/Kiwify/Ticto
- [x] Simulação de venda animada 5-step
- [x] Carousel "Nossos Clientes"
- [x] Métricas globais no hero (servers/tx/members/volume)
- [x] Feed de vendas em tempo real no hero

### Carteira / Pagamentos
- [x] Carteira completa (4 cards saldo + MED + Premiações + 2FA + saque turbo)
- [x] Saque normal R$0,50 / instantâneo R$3,50
- [x] 2FA TOTP pro user (setup + recovery codes)
- [x] Extrato por Email (CSV/PDF)
- [x] Follow-up de carrinho abandonado (cron 15min)
- [x] Assinaturas recorrentes pro cliente final (Stripe Price recurring)
- [x] Trial 24h opcional + Trial 7 dias

### Bot management
- [x] Bot Telegram skeleton (/start /loja /vips /suporte)
- [x] GA tracking dinâmico via config
- [x] Central de Tutoriais in-app (16 vídeos, 6 categorias)
- [x] Premiações por marcos (6 tiers volume + 5 count)
- [x] Anti-fraude (score, blacklist, threshold)
- [x] Setup em 5min wizard com auto-detect
- [x] Multi-bot lite com switcher na sidebar
- [x] Apelido custom do bot no breadcrumb
- [x] Bot card polido sidebar (avatar + ID + Reiniciar/Desligar)
- [x] Loading modal "Preparando seu bot"
- [x] User dropdown topbar (Minha Conta / Configurações / Sair)
- [x] Warning banner "config faltando"
- [x] Renomeações empresariais (Aplicações/Automações)
- [x] Página Trial Gratuito dedicada
- [x] Breadcrumb na topbar

### Permissões + KYC
- [x] Permissões granulares 26 chaves agrupadas
- [x] Aba Cargos (Discord roles) paralela a Membros
- [x] Bulk save com "● Alterações não salvas" + Limpar/Salvar
- [x] Add membro por busca de username/ID (modal)
- [x] KYC PIX 3-step (Pagamento QR → Comprovante → Concluído)
- [x] Admin de KYC + admin de saques

### Páginas estruturadas entregues
- [x] Configurar Bot (Token + Resgatar Código + Transferência de Posse)
- [x] Personalização (banner + tabs Geral/Embeds + BIO paywall + Prefixo)
- [x] Canais agrupada (6 grupos)
- [x] Cargos agrupada (Administração / Membros)
- [x] Proteção 7 tabs (Anti Fake, Anti Spam, Canais, Cargos, Moderação,
  Segurança Avançada, Permissões de Comandos)
- [x] Boas-vindas v1 (lista + adicionar + autosave)
- [x] Cards Servidor Principal + Auditoria na Visão Geral
- [x] Card Assinatura + Módulos
- [x] Banner "Precisa de ajuda?" embedável
- [x] Rastreamento de Convites (status + mensagens + variáveis chips)

### Backend pesado entregue
- [x] Sistema de Códigos Promocionais (migration + resgate + tipos)
- [x] Transferência de Posse (endpoint + notificação + confirmação)

---

## 🟡 PENDENTE — Ordem de implementação

### 🟢 Rápidas (~15-30min cada)
*(nenhuma — todas as rápidas já entregues)*

### 🟡 Médias (~30-60min cada)

- [ ] **Configurações user-level — tab Segurança**:
  - Card 2FA com botão "Gerenciar 2FA no Perfil"
  - Card "Encerrar Todas as Sessões" com warning vermelho
    ("Isso irá deslogar todos dispositivos. Próximo login será com Discord")

- [ ] **Multi-conta no avatar dropdown**:
  - Botão "+ Adicionar conta"
  - Switcher entre contas com check verde na ativa

- [ ] **Modal "Editar Regra de Proteção" reusável** — substitui edição inline,
  cada toggle de Proteção tem botão Editar que abre modal:
  - Regras de monitoramento (Banimentos/Expulsões): Limite + Intervalo +
    Punição + Cargos Imunes + Canal de Logs
  - Regras de defesa (Deleção/Edição/Criação): Punição + Imunes + Logs
  - Configurações Globais (por tab): fallback dos 3 campos
  - Aplica em: Cargos (3 + Globais), Canais (3 + Globais), Moderação (2),
    Segurança Avançada (5)

### 🟠 Maiores (~1-2h cada)

#### Páginas estruturadas faltando

- [ ] **Configurações user-level — tab Carteira** (config da empresa):
  - Banner 2FA Necessária + Ativar 2FA
  - Card API Key (input + show/hide + copy + Gerar)
  - Card Opções de Pagamento (checkbox Repassar taxa)
  - Card Dados da Empresa (Nome + Logo URL + Cor hex)
  - Card Integrações (Webhook URL + Callback URL)
  - Botão Salvar Configurações

- [ ] **Página "Loja" estruturada** com tabs Produtos / Geral / Cupons:
  - Conceito de **Painéis de Loja** (múltiplos painéis postáveis em
    canais diferentes)
  - Aba Produtos: left panel lista de painéis com busca + right editor
  - Aba **Geral** (config checkout):
    - Chave API YuvexPay + link tutorial
    - Toggle Repassar Taxa pro Cliente (não é taxa do sistema)
    - Localização (Moeda + Idioma + Card Configurações Atuais com formatação)
    - Posições (3 slots default de produtos)
    - Marca do checkout (Cor Central + Cor Borda + Logo QR + Zoom 90-140%
      + Posição Imagem/Thumbnail)
    - Mensagem de Instruções (toggle + textarea + Nome/URL botão opcional)
    - Preview live à direita do embed PIX que o cliente vê
  - Aba Cupons: lista atual + form

- [ ] **Página "Sorteios" avançada** com tabs Geral / Requisitos / Tarefas:
  - Aba Geral: nome, ícone, banner (upload), descrição, Modo de Entrega
    Automática (cargo/código/mensagem), monitorar toggle
  - **Aba Requisitos** (filtros profundos):
    - Toggles: Membro Cliente / Feedback / Verificado / Em Voz / Mutado / Surdo
    - Numéricos: Dias conta min, Convites min, Gasto min/max, Primeira/Última
      compra (dias)
    - Multi-selects: Cargos Obrigatórios, Cargos Bloqueados, Canais de Voz
    - Lista Inviters específicos + Adicionar
    - Textareas (um por linha): Nicknames/Status/Atividades/Bios Customizados
  - **Aba Tarefas** (gamificação):
    - Lista esquerda + editor direito
    - Tipos: seguir Twitter, entrar Discord externo, inscrever YouTube
    - Verificação automática quando possível

- [ ] **Página "Tickets — Painéis de Suporte"**:
  - Lista de painéis com status Postado/Não postado
  - Sincronizar + Novo Painel + Search
  - Painel expandido com tabs Geral / Funções / Embed
  - Configurações de Funcionamento: horário início/fim + dias da semana (pills)
  - Sticky save "Alterações não salvas | Limpar | Salvar"
  - Card **IA de Atendimento** (paywall) — AI auto-responde tickets

- [ ] **Página "eCloud" landing**:
  - Logo grande + "Sistema de verificação OAuth2 e pull de membros"
  - 2 CTAs: Registrar Novo Bot / Vincular Chave Existente

#### Embed Builder + Mensagens Automáticas

- [ ] **Embed Builder reusável com preview live** (componente):
  - Cor (color picker)
  - Autor (avatar upload + nome + link) - 0/256
  - Título (texto + URL) - 0/256
  - Descrição (textarea) - 0/4096
  - Fields (Campos) lista expandível + Adicionar
  - Imagem (drop zone PNG/JPG/GIF até 10MB)
  - Rodapé (avatar + texto) - 0/2048
  - **Coluna direita**: renderização em tempo real estilo Discord
  - Usado em: Boas-vindas, Anúncios, Sugestões, Convites, Mensagens Automáticas

- [ ] **Modal "Adicionar Mensagem Automática"** (reusável):
  - Canal (dropdown)
  - Conteúdo (texto acima do embed)
  - Modo de Envio 3 pills: **Embed (Padrão)** / **Components V2**
    (botões+menus Discord) / **Legacy (Texto)**
  - Intervalo em minutos
  - Embed builder + Preview live
  - Section **BOTÕES (0/4)** + Adicionar Botão — até 4 botões clicáveis

- [ ] **Página "Ações Automáticas"** com 5 sub-tabs:
  - **Mensagens Automáticas**: toggle global + lista + search por canal
    + modal acima
  - **Reações Automáticas**: toggle + canais com emojis + X remove
  - **Repostagem Automática**: toggle + time picker custom (HORA/MIN rolling)
  - **Limpeza Automática**: por canal — dropdown + toggle "limpar ao trancar"
    + horários trancar/destrancar (22:00/08:00 default)
  - **Sugestões**: builder + preview live com botão "Enviar Sugestão"

- [ ] **Boas-vindas v2 — modo Embed completo** (atual é só texto):
  - Tabs Boas-vindas / Despedida (espelhadas)
  - Card "Variáveis disponíveis" no topo (chips):
    {serverName} {user.name} {user} {user.username}
  - **Toggle Modo: Texto / Embed** (pills)
  - Modo Texto: textarea + canais + delay exclusão
  - Modo Embed: Embed Builder esquerda + Preview live direita

#### Proteção — Expansão das configs

- [ ] **Anti Fake config expandida** (toggle existe, expandir):
  - Input Dias Mínimos de Conta
  - Textarea Status Blacklist (um por linha)
  - Textarea Nomes Blacklist (um por linha)

- [ ] **Anti Spam mega-painel** (toggle existe, expandir, ~3h):
  - Section Configurações Gerais:
    - Toggle "Aplicar em comandos"
    - Toggle "Ignorar Administradores"
    - Canal de Logs + multi-selects Canais/Cargos/Usuários Ignorados (Global)
  - Section Ação Padrão para Violações:
    - Toggle Apagar Mensagem + Avisar Usuário + Slider Timeout (segundos)
  - Section Sistema de Tolerância (toggle strikes progressivos)
  - **Sub-card Anti Flood**: toggle + Max msgs + Janela tempo + 6 dropdowns
  - **Sub-card Anti Spam** (repetições): toggle + 3 sliders (similares/janela/
    tamanho mín) + 6 dropdowns
  - **Sub-card Anti Garbage**: toggle + Proporção não-alfanumérico + Max
    repetição letra
  - **Sub-card Anti Link / Convites**:
    - Toggle Bloquear Todos + Permitir Discord invites
    - Whitelist + Blacklist de domínios (textarea por linha)
    - 6 dropdowns aplicar/ignorar
  - **Sub-card Anti Padrão em Massa (Raids)**:
    - 4 sliders (Janela tempo / Min users / Min msgs / Min caracteres)
    - 6 dropdowns
  - Dica amarela: "Lista vazia em 'Aplicar somente' = aplica em todos.
    'Ignorar' sempre exclui."

#### Convites + Permissões de Comandos — Expansões

- [ ] **Cargos por Convite** (Rastreamento de Convites):
  - Cards de Configuração múltiplos:
    - Toggle Habilitado
    - Toggle Persistente (não remove ao perder convites) com tooltip
    - Input Meta de Convites
    - Multi-select Cargos a Atribuir
    - X remove
  - Empty card "+ Nova Configuração"

- [ ] **Permissões de Comandos — expansão**:
  - Por comando colapsável: **Cargos Permitidos** + **Usuários Permitidos**
    (textarea IDs por linha)
  - Adicionar comandos: /convites, /gerar-pix

- [ ] **Convites — Editor de Embed por mensagem**:
  - Botão Abrir/Ocultar Editor em cada mensagem (entrada/saída)
  - Layout 2 colunas: config + preview Discord live

### 🔴 Pesados / Arquitetura

- [ ] **Admin de Códigos Promocionais** (backend pronto, UI ainda não):
  - Página owner pra gerar códigos (kind/value/max_uses/expires_at)
  - Estatísticas de uso

- [ ] **BIO rotativa real** (placeholder existe):
  - Renderização real no Discord profile (rotate via cron)
  - Paywall R$5 já mockado

- [ ] **Servidor Principal conectado** card avançado:
  - Avatar + ID + stats (membros/clientes)
  - Botão "Adicionar [bot] a outro servidor"

- [ ] **IA de Atendimento** em Tickets (paywall):
  - AI auto-responde tickets baseado em FAQ do owner

---

## 📌 Ideias deferidas (do design Claude)

- [ ] Design system com tokens live (accent color, corner radius, density)
- [ ] Redesign visual completo seguindo ref HVAC (light card-based + gauges)

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
3. NÃO duplicar com items já listados
4. Não implementar até pedirem
