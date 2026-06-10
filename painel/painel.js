// ============================================================
// VERO Pizzaria — painel.js
// Painel de pedidos em tempo real
// ============================================================

// ▶ SUBSTITUA COM AS CREDENCIAIS DO SEU PROJETO SUPABASE
// Use a SERVICE KEY aqui (o painel é protegido por senha, nunca público)
const SUPABASE_URL         = 'https://somgwwrolrsvscukegfm.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbWd3d3JvbHJzdnNjdWtlZ2ZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg5OTIwNywiZXhwIjoyMDkzNDc1MjA3fQ.4Cb_ofoHVRldhWh0YnD27150v1_GXmuvGY4Dt3GN6V4';

// ============================================================
// ESTADO
// ============================================================
const state = {
  sb: null,
  pedidos: [],
  itensPorPedido: {},
  config: {},
  abaAtiva: 'aguardando_comprovante',
  periodo: 'hoje',
  audioDesbloqueado: false,
};

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  state.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  setupLogin();
});

// ============================================================
// LOGIN
// ============================================================
function setupLogin() {
  const check = () => sessionStorage.getItem('vero_auth') === '1';
  if (check()) { mostrarPainel(); return; }
  document.getElementById('loginScreen').hidden  = false;
  document.getElementById('painelScreen').hidden = true;

  const btnLogin  = document.getElementById('btnLogin');
  const pwd       = document.getElementById('loginPwd');
  const loginErr  = document.getElementById('loginError');

  const tryLogin = async () => {
    const senha = pwd.value;
    if (!senha) return;
    const { data } = await state.sb.from('configuracoes').select('valor').eq('chave','senha_admin').single();
    if (data?.valor === senha) {
      sessionStorage.setItem('vero_auth', '1');
      loginErr.hidden = true;
      desbloquearAudio();
      mostrarPainel();
    } else {
      loginErr.hidden = false;
      pwd.value = '';
      setTimeout(() => loginErr.hidden=true, 3000);
    }
  };

  btnLogin?.addEventListener('click', tryLogin);
  pwd?.addEventListener('keydown', e => { if(e.key==='Enter') tryLogin(); });
}

function desbloquearAudio() {
  const audio = document.getElementById('notifSound');
  if (audio) {
    audio.volume = 0;
    audio.play().then(() => { audio.pause(); audio.volume = 1; state.audioDesbloqueado = true; }).catch(()=>{});
  }
}

function mostrarPainel() {
  document.getElementById('loginScreen').hidden  = true;
  document.getElementById('painelScreen').hidden = false;
  inicializarPainel();
}

// ============================================================
// INICIALIZAR
// ============================================================
async function inicializarPainel() {
  await Promise.all([carregarConfig(), carregarPedidos()]);
  renderPedidos();
  atualizarContadores();
  atualizarResumo();
  setupRealtime();
  setupEventListeners();
}

async function carregarConfig() {
  const { data } = await state.sb.from('configuracoes').select('*');
  (data||[]).forEach(c => state.config[c.chave] = c.valor);
  atualizarBotaoLoja();
}

async function carregarPedidos() {
  document.getElementById('loadingPedidos').style.display = 'flex';
  const hoje   = new Date();
  let desde;
  if (state.periodo === 'hoje') {
    desde = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
  } else if (state.periodo === 'ontem') {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
    desde   = d.toISOString();
  } else {
    const d = new Date(hoje.getTime() - 7*24*60*60*1000);
    desde   = d.toISOString();
  }

  const { data: pedidos } = await state.sb
    .from('pedidos')
    .select('*')
    .gte('created_at', desde)
    .order('created_at', { ascending: false });

  state.pedidos = pedidos || [];

  if (state.pedidos.length) {
    const ids = state.pedidos.map(p => p.id);
    const { data: itens } = await state.sb
      .from('itens_pedido')
      .select('*')
      .in('pedido_id', ids);
    state.itensPorPedido = {};
    (itens||[]).forEach(i => {
      if (!state.itensPorPedido[i.pedido_id]) state.itensPorPedido[i.pedido_id] = [];
      state.itensPorPedido[i.pedido_id].push(i);
    });
  }

  document.getElementById('loadingPedidos').style.display = 'none';
}

// ============================================================
// REALTIME
// ============================================================
function setupRealtime() {
  state.sb.channel('pedidos-painel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, async payload => {
      state.pedidos.unshift(payload.new);
      const { data: itens } = await state.sb.from('itens_pedido').select('*').eq('pedido_id', payload.new.id);
      state.itensPorPedido[payload.new.id] = itens || [];
      tocarSom();
      mostrarNotificacao(payload.new);
      renderPedidos();
      atualizarContadores();
      atualizarResumo();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, payload => {
      const idx = state.pedidos.findIndex(p => p.id === payload.new.id);
      if (idx >= 0) state.pedidos[idx] = payload.new;
      else state.pedidos.unshift(payload.new);
      renderPedidos();
      atualizarContadores();
      atualizarResumo();
    })
    .subscribe();

  state.sb.channel('config-painel')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'configuracoes' }, payload => {
      state.config[payload.new.chave] = payload.new.valor;
      if (payload.new.chave === 'loja_aberta') atualizarBotaoLoja();
    })
    .subscribe();
}

// ============================================================
// RENDER
// ============================================================
function renderPedidos() {
  const main = document.getElementById('pedidosMain');
  if (!main) return;
  const filtrados = state.pedidos.filter(p => p.status === state.abaAtiva);
  if (!filtrados.length) {
    main.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><p>Nenhum pedido aqui agora.</p></div>`;
    return;
  }
  main.innerHTML = `<div class="pedidos-grid">${filtrados.map(p => cardPedidoHTML(p)).join('')}</div>`;
}

function cardPedidoHTML(p) {
  const itens   = state.itensPorPedido[p.id] || [];
  const tempoStr = tempoAtras(p.created_at);
  const pagClass = { pix:'pix', dinheiro:'dinheiro', cartao:'cartao' }[p.forma_pagamento] || 'cartao';
  const pagLabel = { pix:'PIX', dinheiro:'Dinheiro', cartao:'Cartão' }[p.forma_pagamento] || p.forma_pagamento;
  const proxStatus = proximoStatus(p.status);
  const proxLabel  = labelProxStatus(p.status, p.tipo_entrega);
  const enderecoHTML = p.tipo_entrega === 'delivery'
    ? `🛵 ${p.endereco_rua}, ${p.endereco_numero} — ${p.endereco_bairro}${p.endereco_complemento ? ' · '+p.endereco_complemento : ''}`
    : '🏠 Retirada no local';
  const waLink = `https://wa.me/55${p.cliente_telefone.replace(/\D/g,'')}`;

  return `
    <div class="order-card ${p.status}" id="card-${p.id}">
      <div class="order-header">
        <span class="order-number">#${String(p.numero).padStart(3,'0')}</span>
        <span class="order-time">${tempoStr}</span>
        ${p.via_agente ? '<span class="order-via-agente">🤖 IA</span>' : ''}
        <span class="order-pag ${pagClass}">${pagLabel}</span>
      </div>
      <div class="order-body">
        <div class="order-client">
          <strong>${p.cliente_nome}</strong>
          <a href="${waLink}" target="_blank">${formatarTelefone(p.cliente_telefone)}</a>
        </div>
        <div class="order-delivery">${enderecoHTML}</div>
        <div class="order-items">
          ${itens.map(i => `
            <div class="order-item">
              <span class="qty">${i.quantidade}x</span>
              <span class="name">${i.produto_nome}${i.observacao ? ` <em style="color:var(--text-3)">(${i.observacao})</em>` : ''}</span>
              <span class="price">R$${Number(i.subtotal).toFixed(2).replace('.',',')}</span>
            </div>`).join('')}
        </div>
        ${p.observacoes ? `<div class="order-obs">📝 ${p.observacoes}</div>` : ''}
        <div class="order-total">
          ${p.taxa_entrega > 0 ? `<span>+R$${Number(p.taxa_entrega).toFixed(2).replace('.',',')} entrega</span>` : ''}
          ${p.troco_para ? `<span class="order-troco">Troco p/ R$${Number(p.troco_para).toFixed(2).replace('.',',')}</span>` : ''}
          <strong>R$${Number(p.total).toFixed(2).replace('.',',')}</strong>
        </div>
      </div>
      <div class="order-actions">
        <button class="btn-print" onclick="imprimirPedido('${p.id}')">🖨️</button>
        ${proxStatus ? `<button class="btn-next" onclick="avancarStatus('${p.id}','${proxStatus}')">${proxLabel} →</button>` : '<span style="flex:1;text-align:center;font-size:12px;color:var(--text-3)">Finalizado</span>'}
        ${p.status !== 'finalizado' && p.status !== 'cancelado' ? `<button class="btn-cancel" onclick="cancelarPedido('${p.id}')">✕</button>` : ''}
      </div>
    </div>`;
}

function proximoStatus(atual) {
  const mapa = {
    'aguardando_comprovante': 'novo',
    'aguardando_pagamento':   'novo',
    'novo':                   'em_preparo',
    'em_preparo':             'pronto',
    'pronto':                 'saiu_entrega',
    'saiu_entrega':           'finalizado',
  };
  return mapa[atual] || null;
}

function labelProxStatus(atual, tipoEntrega) {
  const mapa = {
    'aguardando_comprovante': 'Confirmar Pagamento',
    'aguardando_pagamento':   'Confirmar',
    'novo':                   'Iniciar Preparo',
    'em_preparo':             tipoEntrega === 'delivery' ? 'Saiu p/ Entrega' : 'Pronto p/ Retirada',
    'pronto':                 'Finalizar',
    'saiu_entrega':           'Finalizar',
  };
  return mapa[atual] || 'Avançar';
}

// ============================================================
// AÇÕES
// ============================================================
async function avancarStatus(id, novoStatus) {
  await state.sb.from('pedidos').update({ status: novoStatus }).eq('id', id);
  const pedido = state.pedidos.find(p => p.id === id);
  if (pedido) pedido.status = novoStatus;
  renderPedidos();
  atualizarContadores();
}

async function cancelarPedido(id) {
  if (!confirm('Cancelar este pedido?')) return;
  await state.sb.from('pedidos').update({ status: 'cancelado' }).eq('id', id);
  const pedido = state.pedidos.find(p => p.id === id);
  if (pedido) pedido.status = 'cancelado';
  renderPedidos();
  atualizarContadores();
  mostrarToast('Pedido cancelado.', 'error');
}

function imprimirPedido(id) {
  const pedido = state.pedidos.find(p => p.id === id);
  const itens  = state.itensPorPedido[id] || [];
  if (!pedido) return;
  const win = window.open('', '_blank');
  const enderecoLine = pedido.tipo_entrega === 'delivery'
    ? `<p><strong>Endereço:</strong> ${pedido.endereco_rua}, ${pedido.endereco_numero} — ${pedido.endereco_bairro}${pedido.endereco_complemento ? ' / '+pedido.endereco_complemento : ''}</p>`
    : '<p><strong>Retirada no local</strong></p>';
  win.document.write(`<!DOCTYPE html><html><head><style>
    body{font-family:monospace;font-size:14px;max-width:300px;margin:0 auto;padding:10px}
    hr{border:1px dashed #000;margin:6px 0}
    h2,h3{margin:4px 0}
    .item{display:flex;justify-content:space-between;padding:2px 0}
    .totais div{display:flex;justify-content:space-between}
    .total-final{font-size:16px;font-weight:bold;margin-top:4px}
    @media print{body{margin:0}}
  </style></head><body>
    <h2>Vero Pizzaria</h2>
    <h3>Pedido #${String(pedido.numero).padStart(3,'0')}</h3>
    <p style="font-size:12px">${new Date(pedido.created_at).toLocaleString('pt-BR')}</p>
    <hr>
    <p><strong>Cliente:</strong> ${pedido.cliente_nome}</p>
    <p><strong>Tel:</strong> ${pedido.cliente_telefone}</p>
    ${enderecoLine}
    <hr>
    ${itens.map(i => `<div class="item"><span>${i.quantidade}x ${i.produto_nome}</span><span>R$${Number(i.subtotal).toFixed(2).replace('.',',')}</span></div>`).join('')}
    <hr>
    <div class="totais">
      <div><span>Subtotal</span><span>R$${Number(pedido.subtotal).toFixed(2).replace('.',',')}</span></div>
      ${pedido.taxa_entrega > 0 ? `<div><span>Entrega</span><span>R$${Number(pedido.taxa_entrega).toFixed(2).replace('.',',')}</span></div>` : ''}
      <div class="total-final"><span>TOTAL</span><span>R$${Number(pedido.total).toFixed(2).replace('.',',')}</span></div>
    </div>
    <p><strong>Pagamento:</strong> ${pedido.forma_pagamento.toUpperCase()}${pedido.troco_para ? ` | Troco p/ R$${Number(pedido.troco_para).toFixed(2).replace('.',',')}` : ''}</p>
    ${pedido.observacoes ? `<p><strong>Obs:</strong> ${pedido.observacoes}</p>` : ''}
    ${pedido.via_agente ? '<p><em>Pedido via Assistente IA</em></p>' : ''}
  </body></html>`);
  win.document.close();
  win.print();
}

// ============================================================
// CONTADORES E RESUMO
// ============================================================
function atualizarContadores() {
  const statusList = ['aguardando_comprovante','aguardando_pagamento','novo','em_preparo','pronto','saiu_entrega','finalizado','cancelado'];
  const contagens = {};
  statusList.forEach(s => contagens[s] = 0);
  state.pedidos.forEach(p => { if (contagens[p.status] !== undefined) contagens[p.status]++; });

  const mapAba = {
    'aguardando_comprovante': contagens['aguardando_comprovante'],
    'novo':      contagens['novo'] + contagens['aguardando_pagamento'],
    'em_preparo': contagens['em_preparo'],
    'pronto':     contagens['pronto'] + contagens['saiu_entrega'],
    'finalizado': contagens['finalizado'],
  };
  Object.entries(mapAba).forEach(([status, count]) => {
    const el = document.getElementById(`count-${status}`);
    if (!el) return;
    el.textContent = count;
    el.className = 'aba-count' + (count > 0 && status === 'novo' ? ' novo' : count > 0 ? ' has-items' : '');
  });
}

function atualizarResumo() {
  const total = state.pedidos
    .filter(p => p.status !== 'cancelado')
    .reduce((s, p) => s + Number(p.total), 0);
  const count = state.pedidos.filter(p => p.status !== 'cancelado').length;
  document.getElementById('statTotal').textContent = `R$${total.toFixed(2).replace('.',',')}`;
  document.getElementById('statQtd').textContent   = `${count} ${count===1?'pedido':'pedidos'}`;
}

function atualizarBotaoLoja() {
  const aberta = state.config.loja_aberta !== 'false';
  const btn = document.getElementById('lojaToggle');
  const txt = document.getElementById('lojaStatus');
  if (!btn || !txt) return;
  txt.textContent = aberta ? '🟢 Aberta' : '🔴 Fechada';
  btn.style.background = aberta ? 'rgba(110,231,160,0.2)' : 'rgba(248,113,113,0.2)';
}

// ============================================================
// HELPERS
// ============================================================
function tempoAtras(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60 ? (min%60)+'min' : ''}`;
}

function formatarTelefone(tel) {
  const t = tel.replace(/\D/g,'');
  if (t.length === 11) return `(${t.slice(0,2)}) ${t.slice(2,7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0,2)}) ${t.slice(2,6)}-${t.slice(6)}`;
  return tel;
}

function tocarSom() {
  if (!state.audioDesbloqueado) return;
  const audio = document.getElementById('notifSound');
  if (audio) { audio.currentTime = 0; audio.play().catch(()=>{}); }
}

function mostrarNotificacao(pedido) {
  mostrarToast(`🍕 Novo pedido #${String(pedido.numero).padStart(3,'0')} — ${pedido.cliente_nome}!`, 'success');
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Novo Pedido — Vero!', { body: `#${String(pedido.numero).padStart(3,'0')} de ${pedido.cliente_nome}` });
  }
}

function mostrarToast(msg, tipo='info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ============================================================
// ABAS E PERÍODO
// ============================================================
function setAba(status, btn) {
  state.abaAtiva = status;
  document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPedidos();
}

async function setPeriodo(periodo, btn) {
  state.periodo = periodo;
  document.querySelectorAll('.periodo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await carregarPedidos();
  renderPedidos();
  atualizarContadores();
  atualizarResumo();
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    sessionStorage.removeItem('vero_auth');
    location.reload();
  });

  document.getElementById('lojaToggle')?.addEventListener('click', async () => {
    const aberta = state.config.loja_aberta !== 'false';
    const novo   = String(!aberta);
    await state.sb.from('configuracoes').update({ valor: novo }).eq('chave','loja_aberta');
    state.config.loja_aberta = novo;
    atualizarBotaoLoja();
    mostrarToast(novo === 'true' ? 'Loja aberta! 🟢' : 'Loja fechada! 🔴');
  });

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
