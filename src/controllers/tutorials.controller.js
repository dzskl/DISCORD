// Central de tutoriais — videos em destaque.
// Os videos sao referenciados por URL (YouTube), nao hospedados aqui.
// Lista estatica por enquanto — edit aqui pra publicar mais.

const express = require('express');
const router = express.Router();

const TUTORIALS = [
  // Configuracao
  { slug: 'primeiros-passos',          category: 'configuracao', title: 'Primeiros Passos: criando sua conta', description: 'Crie sua conta, faça login e conheça o painel.', duration: '01:47', thumb: null, video_url: null, views: 0 },
  { slug: 'configurando-bot',          category: 'configuracao', title: 'Configurando e ligando o bot',         description: 'Configure seu bot Discord — token, intents e primeiro start.', duration: '03:17', thumb: null, video_url: null, views: 0 },
  { slug: 'aparencia',                 category: 'configuracao', title: 'Personalizando a aparência da loja',   description: 'Nome, avatar, cores e mensagens.', duration: '02:30', thumb: null, video_url: null, views: 0 },
  { slug: 'guilds-multitenancy',       category: 'configuracao', title: 'Trabalhando com múltiplos servidores',  description: 'Como o bot opera em vários servidores ao mesmo tempo.', duration: '04:10', thumb: null, video_url: null, views: 0 },
  { slug: 'equipe-permissoes',         category: 'configuracao', title: 'Equipe e permissões granulares',       description: 'Adicione membros e configure permissões por usuário e cargo.', duration: '03:45', thumb: null, video_url: null, views: 0 },

  // Vendas
  { slug: 'vendas-inicial',            category: 'vendas',       title: 'Configurando sistema de vendas',        description: 'Crie produtos, defina preços, entrega automática.', duration: '03:33', thumb: null, video_url: null, views: 0 },
  { slug: 'cupons-descontos',          category: 'vendas',       title: 'Cupons de desconto',                    description: 'Crie cupons com porcentagem, expiração e regras.', duration: '02:20', thumb: null, video_url: null, views: 0 },
  { slug: 'afiliados',                 category: 'vendas',       title: 'Programa de afiliados',                 description: 'Comissione vendedores que indicam clientes.', duration: '02:50', thumb: null, video_url: null, views: 0 },

  // Ticket
  { slug: 'tickets-setup',             category: 'ticket',       title: 'Setup de tickets profissionais',        description: 'Categorias, prioridades e atendimento organizado.', duration: '03:25', thumb: null, video_url: null, views: 0 },
  { slug: 'tickets-fluxo',             category: 'ticket',       title: 'Fluxo de atendimento por tickets',      description: 'Como receber, responder e fechar tickets.', duration: '02:15', thumb: null, video_url: null, views: 0 },

  // Auth
  { slug: 'oauth-discord',             category: 'auth',         title: 'OAuth2 e verificação anti-fraude',      description: 'Como o OAuth do Discord protege contra contas fake.', duration: '03:00', thumb: null, video_url: null, views: 0 },

  // Comandos
  { slug: 'comandos-basicos',          category: 'comandos',     title: 'Comandos básicos do bot',               description: '/ajuda /loja /comprar /tickets — todos os comandos.', duration: '02:40', thumb: null, video_url: null, views: 0 },
  { slug: 'comandos-mod',              category: 'comandos',     title: 'Comandos de moderação',                 description: 'Ban, kick, timeout, warn — direto do painel.', duration: '03:10', thumb: null, video_url: null, views: 0 },
  { slug: 'sorteios',                  category: 'comandos',     title: 'Sorteios automatizados',                description: 'Como criar sorteios com reações no Discord.', duration: '02:55', thumb: null, video_url: null, views: 0 },

  // Bancos / Saque
  { slug: 'verificacao-pix',           category: 'bancos',       title: 'Verificação PIX e saque',               description: 'Como verificar sua chave PIX e fazer o primeiro saque.', duration: '04:20', thumb: null, video_url: null, views: 0 },
  { slug: 'taxas',                     category: 'bancos',       title: 'Taxas e prazos de saque',               description: 'Saque normal vs instantâneo — qual escolher?', duration: '01:50', thumb: null, video_url: null, views: 0 }
];

const CATEGORIES = [
  { slug: '',              label: 'Todos' },
  { slug: 'configuracao',  label: 'Configuração' },
  { slug: 'vendas',        label: 'Vendas' },
  { slug: 'ticket',        label: 'Ticket' },
  { slug: 'auth',          label: 'Auth' },
  { slug: 'comandos',      label: 'Comandos' },
  { slug: 'bancos',        label: 'Bancos' }
];

router.get('/', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const cat = String(req.query.category || '').toLowerCase().trim();
  let list = TUTORIALS;
  if (cat) list = list.filter(t => t.category === cat);
  if (q) list = list.filter(t =>
    t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  );
  res.json({
    tutorials: list,
    categories: CATEGORIES.map(c => ({
      ...c,
      count: c.slug ? TUTORIALS.filter(t => t.category === c.slug).length : TUTORIALS.length
    }))
  });
});

module.exports = router;
