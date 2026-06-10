// ============================================================
// VERO Pizzaria — app.js
// Cardápio público + Agente IA (Sofia) via OpenAI
// ============================================================

// ▶ SUBSTITUA AQUI APÓS CRIAR O PROJETO SUPABASE
const SUPABASE_URL     = 'https://somgwwrolrsvscukegfm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbWd3d3JvbHJzdnNjdWtlZ2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTkyMDcsImV4cCI6MjA5MzQ3NTIwN30._5UTaRMemVmYMQXGWTM2szP4PQMx_AQ9FTpuQc0_fok';

// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
  supabase: null,
  categorias: [],
  produtos: [],
  config: {},
  carrinho: JSON.parse(localStorage.getItem('vero_carrinho') || '[]'),
  lojaAberta: true,
};

const agentState = {
  messages: [],
  isOpen: false,
  isLoading: false,
  greeted: false,
};

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await init();
});

async function init() {
  try {
    initHeroParticles();
    await Promise.all([loadConfig(), loadCategorias(), loadProdutos()]);
    renderHeader();
    renderHero();
    initHeroStrip();
    renderCatNav();
    renderProdutos();
    setupRealtime();
    setupEventListeners();
    setupChatWidget();
    setupAdmin();
    document.getElementById('loadingState')?.remove();
  } catch (e) {
    console.error('Erro ao inicializar:', e);
    document.getElementById('loadingState').innerHTML =
      '<p style="color:var(--wine)">Erro ao carregar cardápio. Verifique as credenciais do Supabase.</p>';
  }
}

// ============================================================
// HERO — CARROSSEL + PARTÍCULAS
// ============================================================
function initHeroStrip() {
  const strip = document.getElementById('heroStrip');
  if (!strip) return;
  const imgs = state.produtos
    .filter(p => p.foto_url)
    .map(p => p.foto_url);
  if (!imgs.length) return;
  // Triplica para loop suave
  const all = [...imgs, ...imgs, ...imgs];
  strip.innerHTML = all.map(src =>
    `<img class="hero-strip-img" src="${src}" alt="produto" loading="lazy">`
  ).join('');
}

function initHeroParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'hero-particle';
    const size  = Math.random() * 4 + 2;
    const left  = Math.random() * 100;
    const dur   = Math.random() * 5 + 4;
    const delay = Math.random() * 6;
    p.style.cssText = `width:${size}px;height:${size}px;left:${left}%;animation-duration:${dur}s;animation-delay:${delay}s;opacity:${Math.random()*0.4+0.2}`;
    container.appendChild(p);
  }
}

// ============================================================
// SUPABASE — CARREGAMENTO
// ============================================================
async function loadConfig() {
  const { data } = await state.supabase.from('configuracoes').select('*');
  (data || []).forEach(c => state.config[c.chave] = c.valor);
  state.lojaAberta = state.config.loja_aberta !== 'false';
}

async function loadCategorias() {
  const { data } = await state.supabase.from('categorias')
    .select('*').eq('ativa', true).order('ordem');
  state.categorias = data || [];
}

async function loadProdutos() {
  const { data } = await state.supabase.from('produtos')
    .select('*').eq('disponivel', true).order('ordem');
  state.produtos = data || [];
}

// ============================================================
// REALTIME
// ============================================================
function setupRealtime() {
  state.supabase.channel('produtos-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, payload => {
      if (payload.eventType === 'INSERT' && payload.new.disponivel) {
        state.produtos.push(payload.new);
      } else if (payload.eventType === 'UPDATE') {
        const idx = state.produtos.findIndex(p => p.id === payload.new.id);
        if (!payload.new.disponivel) {
          if (idx >= 0) state.produtos.splice(idx, 1);
        } else if (idx >= 0) {
          state.produtos[idx] = payload.new;
        } else {
          state.produtos.push(payload.new);
        }
      } else if (payload.eventType === 'DELETE') {
        state.produtos = state.produtos.filter(p => p.id !== payload.old.id);
      }
      renderHero();
      renderProdutos();
    })
    .subscribe();

  state.supabase.channel('config-rt')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'configuracoes' }, payload => {
      state.config[payload.new.chave] = payload.new.valor;
      if (payload.new.chave === 'loja_aberta') {
        state.lojaAberta = payload.new.valor !== 'false';
        renderStatusLoja();
      }
    })
    .subscribe();
}

// ============================================================
// RENDER — HEADER
// ============================================================
function renderHeader() {
  renderStatusLoja();
  renderCarrinhoBtn();
}

function renderStatusLoja() {
  const dot  = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  if (!dot || !text) return;
  if (state.lojaAberta) {
    dot.className = 'status-dot';
    text.textContent = 'Aberto agora';
  } else {
    dot.className = 'status-dot closed';
    text.textContent = 'Fechado no momento';
  }
}

function renderCarrinhoBtn() {
  const btn    = document.getElementById('cartBtn');
  const badge  = document.getElementById('cartBadge');
  const total  = document.getElementById('cartTotalHeader');
  const qtd    = state.carrinho.reduce((s, i) => s + i.quantidade, 0);
  const valor  = state.carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0);
  if (!btn) return;
  btn.hidden = qtd === 0;
  if (badge) badge.textContent = qtd;
  if (total) total.textContent = `R$${valor.toFixed(2).replace('.', ',')}`;
}

// ============================================================
// RENDER — HERO
// ============================================================
function renderHero() {
  // O hero agora tem estrutura fixa no HTML — apenas injeta o produto destaque se existir
  const hero = state.produtos.find(p => p.destaque_hero) ||
               state.produtos.slice().sort((a,b) => b.vendas_count - a.vendas_count)[0];
  if (!hero) return;

  // Atualiza o título e subtítulo para o produto destaque
  const line2 = document.querySelector('.hero-title-line2');
  const sub   = document.querySelector('.hero-sub');
  const cta   = document.querySelector('.hero-cta');
  if (line2) line2.textContent = hero.nome;
  if (sub)   sub.textContent   = hero.descricao ? hero.descricao.slice(0, 90) + (hero.descricao.length > 90 ? '...' : '') : 'Massa artesanal, ingredientes selecionados.';
  if (cta)   cta.onclick = () => abrirProduto(hero.id);
}

// ============================================================
// RENDER — CATEGORIAS
// ============================================================
function renderCatNav() {
  const nav  = document.getElementById('catNav');
  const list = document.getElementById('catList');
  if (!list) return;
  const catsComProd = state.categorias.filter(c =>
    state.produtos.some(p => p.categoria_id === c.id)
  );
  if (!catsComProd.length) return;
  nav.hidden = false;
  list.innerHTML = catsComProd.map((c, i) =>
    `<button class="cat-btn${i===0?' active':''}" data-id="${c.id}" onclick="scrollToCategoria('${c.id}')">${c.icone || ''} ${c.nome}</button>`
  ).join('');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.dataset.id;
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id));
      }
    });
  }, { rootMargin: '-50% 0px -45% 0px' });

  catsComProd.forEach(c => {
    const sec = document.getElementById(`cat-${c.id}`);
    if (sec) { sec.dataset.id = c.id; observer.observe(sec); }
  });
}

function scrollToCategoria(id) {
  const el = document.getElementById(`cat-${id}`);
  if (!el) return;
  const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h') || '68')
               + parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h') || '52');
  window.scrollTo({ top: el.offsetTop - offset - 8, behavior: 'smooth' });
}

// ============================================================
// RENDER — PRODUTOS
// ============================================================
function renderProdutos() {
  const main = document.getElementById('produtosMain');
  if (!main) return;
  const catsComProd = state.categorias.filter(c =>
    state.produtos.some(p => p.categoria_id === c.id)
  );
  if (!catsComProd.length) {
    main.innerHTML = '<p style="text-align:center;padding:60px 20px;color:var(--text-3)">Nenhum produto disponível no momento.</p>';
    return;
  }
  main.innerHTML = catsComProd.map(cat => {
    const prods = state.produtos
      .filter(p => p.categoria_id === cat.id)
      .sort((a, b) => a.ordem - b.ordem);
    return `
      <section class="cat-section" id="cat-${cat.id}" data-id="${cat.id}">
        <div class="cat-section-header">
          <span class="cat-section-icon">${cat.icone || '🍽️'}</span>
          <div>
            <div class="cat-section-title">${cat.nome}</div>
            ${cat.descricao ? `<div class="cat-section-desc">${cat.descricao}</div>` : ''}
          </div>
        </div>
        <div class="produtos-grid">
          ${prods.map((p, i) => produtoCardHTML(p, i, prods.length)).join('')}
        </div>
      </section>`;
  }).join('');
}

function produtoCardHTML(p, idx, total) {
  const isHero = p.destaque_hero && idx === 0 && total > 1;
  const qtyNoCarrinho = state.carrinho.find(c => c.id === p.id)?.quantidade || 0;
  const tags = (p.tags || []).map(t => tagHTML(t)).join('');
  const fotoHTML = p.foto_url
    ? `<img src="${p.foto_url}" alt="${p.nome}" loading="lazy">`
    : `<div class="produto-foto-placeholder">${p.categoria_icone || '🍕'}</div>`;
  const precoOrigHTML = p.preco_original
    ? `<span class="produto-preco-original">R$${Number(p.preco_original).toFixed(2).replace('.',',')}</span> `
    : '';
  const addBtn = qtyNoCarrinho > 0
    ? `<button class="btn-add in-cart" onclick="event.stopPropagation(); adicionarAoCarrinho('${p.id}')"></button>`
    : `<button class="btn-add" onclick="event.stopPropagation(); adicionarAoCarrinho('${p.id}')"><span>+</span></button>`;
  const qtyBadge = qtyNoCarrinho > 0
    ? `<div class="badge-qty">${qtyNoCarrinho}</div>` : '';

  return `
    <div class="produto-card${isHero?' hero-card-item':''}" onclick="abrirProduto('${p.id}')">
      <div class="produto-foto-wrap">
        ${fotoHTML}
        <div class="produto-tags">${tags}</div>
        ${qtyBadge}
      </div>
      <div class="produto-info">
        <div class="produto-nome">${p.nome}</div>
        <div class="produto-desc">${p.descricao || ''}</div>
        <div class="produto-bottom">
          <div>${precoOrigHTML}<span class="produto-preco">R$${Number(p.preco).toFixed(2).replace('.',',')}</span></div>
          ${addBtn}
        </div>
      </div>
    </div>`;
}

function tagHTML(tag) {
  const map = {
    popular:     ['tag-popular', '🔥 Popular'],
    chef_indica: ['tag-chef',    '⭐ Chef'],
    novo:        ['tag-novo',    '🆕 Novo'],
    vegano:      ['tag-vegano',  '🌱 Vegano'],
    sem_gluten:  ['tag-sem_gluten', '🌾 S/ Glúten'],
    picante:     ['tag-picante', '🌶️ Picante'],
  };
  const [cls, label] = map[tag] || ['tag-novo', tag];
  return `<span class="tag ${cls}">${label}</span>`;
}

// ============================================================
// MODAL PRODUTO
// ============================================================
function abrirProduto(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;
  const overlay = document.getElementById('productOverlay');
  const modal   = document.getElementById('productModal');
  const fotoHTML = p.foto_url
    ? `<img class="product-modal-img" src="${p.foto_url}" alt="${p.nome}">`
    : `<div class="product-modal-img-placeholder">🍕</div>`;

  modal.innerHTML = `
    <button class="modal-close" onclick="fecharModal('productOverlay')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
    ${fotoHTML}
    <div class="product-modal-body">
      <div class="product-modal-nome">${p.nome}</div>
      <div class="product-modal-desc">${p.descricao || ''}</div>
      <div class="product-modal-obs-label">Alguma observação?</div>
      <textarea class="product-modal-obs" id="prodObs" rows="2" placeholder="Ex: sem cebola, bem assada..."></textarea>
    </div>
    <div class="product-modal-bottom">
      <div class="product-modal-preco">R$${Number(p.preco).toFixed(2).replace('.',',')}</div>
      <button class="btn-add-modal" onclick="adicionarAoCarrinhoModal('${p.id}')">Adicionar →</button>
    </div>`;

  overlay.classList.add('active', 'center');
  document.body.style.overflow = 'hidden';
}

function adicionarAoCarrinhoModal(id) {
  const obs = document.getElementById('prodObs')?.value.trim() || '';
  fecharModal('productOverlay');
  adicionarAoCarrinho(id, obs);
}

function fecharModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (overlay) overlay.classList.remove('active', 'center');
  document.body.style.overflow = '';
}

// ============================================================
// COMPLEMENTO (bottom sheet ao adicionar pizza)
// ============================================================
let _pendingAdd = null; // { id, obs, selectedComplementoId }

function abrirComplemento(produtoId, obs = '') {
  const p = state.produtos.find(x => x.id === produtoId);
  if (!p) return;

  // Pega categoria da pizza para saber se é pizza
  const cat = state.categorias.find(c => c.id === p.categoria_id);
  const isPizza = cat && (cat.nome.toLowerCase().includes('pizza') || cat.nome.toLowerCase().includes('especiai'));

  // Busca bordas se for pizza, senão busca bebidas
  let complementos;
  if (isPizza) {
    const catBorda = state.categorias.find(c => c.nome.toLowerCase().includes('borda'));
    complementos = catBorda
      ? state.produtos.filter(x => x.categoria_id === catBorda.id && x.disponivel)
      : [];
  }
  // Fallback: bebidas não adicionadas ainda
  if (!complementos || !complementos.length) {
    const catBeb = state.categorias.find(c => c.nome.toLowerCase().includes('bebida'));
    if (catBeb) {
      const idsNoCarrinho = new Set(state.carrinho.map(i => i.id));
      complementos = state.produtos.filter(x => x.categoria_id === catBeb.id && !idsNoCarrinho.has(x.id)).slice(0, 3);
    }
  }

  // Se não tem complementos, adiciona direto
  if (!complementos || !complementos.length) {
    adicionarAoCarrinhoInterno(produtoId, obs);
    return;
  }

  _pendingAdd = { id: produtoId, obs, selectedComplementoId: null };

  const title  = document.getElementById('complementoTitle');
  const sub    = document.querySelector('.complemento-sub');
  const opts   = document.getElementById('complementoOptions');
  const isPizzaComp = isPizza && complementos[0]?.nome?.toLowerCase().includes('borda');

  if (title) title.textContent = isPizzaComp ? `Escolha a borda — ${p.nome}` : '✨ Vai bem com isso...';
  if (sub)   sub.textContent   = isPizzaComp ? 'Personalize sua pizza' : 'Aproveite e adicione uma bebida';

  opts.innerHTML = complementos.map(c => {
    const imgHtml = c.foto_url
      ? `<img class="complemento-opt-img" src="${c.foto_url}" alt="${c.nome}" loading="lazy">`
      : `<div class="complemento-opt-emoji">🧀</div>`;
    return `
      <div class="complemento-opt" id="comp-${c.id}" onclick="selecionarComplemento('${c.id}')">
        <div class="complemento-opt-info">
          ${imgHtml}
          <div>
            <div class="complemento-opt-nome">${c.nome}</div>
            <div class="complemento-opt-desc">${c.descricao || ''}</div>
          </div>
        </div>
        <div class="complemento-opt-preco">+R$${Number(c.preco).toFixed(2).replace('.',',')}</div>
      </div>`;
  }).join('');

  const confirmBtn = document.getElementById('complementoConfirm');
  if (confirmBtn) {
    confirmBtn.textContent = isPizzaComp ? 'Adicionar com borda' : 'Adicionar ao carrinho';
    confirmBtn.onclick = confirmarComplemento;
  }

  const overlay = document.getElementById('complementoOverlay');
  if (overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function selecionarComplemento(id) {
  if (!_pendingAdd) return;
  // Toggle: clica de novo desseleciona
  if (_pendingAdd.selectedComplementoId === id) {
    _pendingAdd.selectedComplementoId = null;
    document.getElementById(`comp-${id}`)?.classList.remove('selected');
    return;
  }
  document.querySelectorAll('.complemento-opt').forEach(el => el.classList.remove('selected'));
  document.getElementById(`comp-${id}`)?.classList.add('selected');
  _pendingAdd.selectedComplementoId = id;
}

function confirmarComplemento() {
  if (!_pendingAdd) return;
  const { id, obs, selectedComplementoId } = _pendingAdd;
  fecharComplemento();
  adicionarAoCarrinhoInterno(id, obs);
  if (selectedComplementoId) {
    adicionarAoCarrinhoInterno(selectedComplementoId, '');
  }
}

function confirmarSemComplemento() {
  if (!_pendingAdd) return;
  const { id, obs } = _pendingAdd;
  fecharComplemento();
  adicionarAoCarrinhoInterno(id, obs);
}

function fecharComplemento(e) {
  if (e && e.target !== document.getElementById('complementoOverlay')) return;
  _pendingAdd = null;
  const overlay = document.getElementById('complementoOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ============================================================
// CARRINHO
// ============================================================
function adicionarAoCarrinho(id, obs = '') {
  if (!state.lojaAberta) { mostrarToast('Loja fechada no momento.', 'error'); return; }
  // Verifica se é produto que merece modal de complemento
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;
  const cat = state.categorias.find(c => c.id === p.categoria_id);
  const isBorda = cat && cat.nome.toLowerCase().includes('borda');
  const isBebida = cat && cat.nome.toLowerCase().includes('bebida');
  // Se for pizza principal, abre complemento em vez de adicionar direto
  if (!isBorda && !isBebida) {
    abrirComplemento(id, obs);
  } else {
    adicionarAoCarrinhoInterno(id, obs);
  }
}

function adicionarAoCarrinhoInterno(id, obs = '') {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;
  const item = state.carrinho.find(i => i.id === id);
  if (item) {
    item.quantidade++;
  } else {
    state.carrinho.push({ id: p.id, nome: p.nome, preco: p.preco, foto_url: p.foto_url || '', quantidade: 1, observacao: obs });
  }
  salvarCarrinho();
  renderCarrinhoBtn();
  atualizarFloatingBar();
  renderProdutos();
  animarCarrinho();
  mostrarToast(`${p.nome} adicionado! 🍕`, 'success');
}

function removerDoCarrinho(id) {
  const item = state.carrinho.find(i => i.id === id);
  if (!item) return;
  if (item.quantidade > 1) {
    item.quantidade--;
  } else {
    state.carrinho = state.carrinho.filter(i => i.id !== id);
  }
  salvarCarrinho();
  renderCarrinhoBtn();
  atualizarFloatingBar();
  renderProdutos();
  renderDrawerItens();
}

function atualizarFloatingBar() {
  const bar    = document.getElementById('floatingBar');
  const count  = document.getElementById('floatingBarCount');
  const total  = document.getElementById('floatingBarTotal');
  if (!bar) return;
  const qtd  = state.carrinho.reduce((s, i) => s + i.quantidade, 0);
  const val  = state.carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0);
  if (qtd > 0) {
    bar.classList.add('show');
    if (count) count.textContent = `${qtd} ${qtd===1?'item':'itens'}`;
    if (total) total.textContent = `R$${val.toFixed(2).replace('.',',')}`;
  } else {
    bar.classList.remove('show');
  }
}

function salvarCarrinho() {
  localStorage.setItem('vero_carrinho', JSON.stringify(state.carrinho));
}

function calcularTotais() {
  const subtotal    = state.carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const taxaEntrega = Number(state.config.taxa_entrega || 7);
  const freteGratis = Number(state.config.frete_gratis_acima || 0);
  const temTaxa     = freteGratis === 0 || subtotal < freteGratis;
  return { subtotal, entrega: temTaxa ? taxaEntrega : 0, total: subtotal + (temTaxa ? taxaEntrega : 0) };
}

function animarCarrinho() {
  const btn = document.getElementById('cartBtn');
  if (!btn) return;
  btn.classList.remove('shake');
  setTimeout(() => btn.classList.add('shake'), 10);
  setTimeout(() => btn.classList.remove('shake'), 500);
}

function mostrarUpsell(produtoAdicionado) {
  const zona   = document.getElementById('upsellZone');
  const itens  = document.getElementById('upsellItems');
  if (!zona || !itens) return;
  const idsNoCarrinho = new Set(state.carrinho.map(i => i.id));
  const sugestoes = state.produtos
    .filter(p => p.categoria_id === produtoAdicionado.categoria_id && !idsNoCarrinho.has(p.id))
    .slice(0, 3);
  if (!sugestoes.length) { zona.hidden = true; return; }
  zona.hidden = false;
  itens.innerHTML = sugestoes.map(p => `
    <div class="upsell-item" onclick="adicionarAoCarrinho('${p.id}')">
      ${p.foto_url ? `<img src="${p.foto_url}" alt="${p.nome}">` : '<div style="width:36px;height:36px;background:var(--cream-dark);border-radius:6px;display:flex;align-items:center;justify-content:center">🍕</div>'}
      <div>
        <div class="nome">${p.nome}</div>
        <div class="preco">R$${Number(p.preco).toFixed(2).replace('.',',')}</div>
      </div>
    </div>`).join('');
}

// ============================================================
// DRAWER CARRINHO
// ============================================================
function abrirCarrinho() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  renderDrawerItens();
}

function fecharCarrinho() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function renderDrawerItens() {
  const container = document.getElementById('cartItems');
  const footer    = document.getElementById('cartFooter');
  const empty     = document.getElementById('cartEmpty');
  const label     = document.getElementById('cartItemsCount');
  if (!container) return;
  const qtd = state.carrinho.reduce((s, i) => s + i.quantidade, 0);
  if (label) label.textContent = qtd > 0 ? `${qtd} ${qtd === 1 ? 'item' : 'itens'}` : '';
  if (!state.carrinho.length) {
    container.innerHTML = `<div class="cart-empty" id="cartEmpty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <p>Seu carrinho está vazio</p></div>`;
    if (footer) footer.hidden = true;
    return;
  }
  container.innerHTML = state.carrinho.map(item => `
    <div class="cart-item">
      ${item.foto_url ? `<img class="cart-item-img" src="${item.foto_url}" alt="${item.nome}">` : '<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:24px">🍕</div>'}
      <div class="cart-item-info">
        <div class="cart-item-nome">${item.nome}</div>
        ${item.observacao ? `<div class="cart-item-obs">${item.observacao}</div>` : ''}
        <div class="cart-item-preco">R$${(item.preco * item.quantidade).toFixed(2).replace('.',',')}</div>
      </div>
      <div class="cart-item-controls">
        <button class="btn-qty remove" onclick="removerDoCarrinho('${item.id}')">−</button>
        <span class="qty-num">${item.quantidade}</span>
        <button class="btn-qty" onclick="adicionarAoCarrinho('${item.id}')">+</button>
      </div>
    </div>`).join('');

  const { subtotal, entrega, total } = calcularTotais();
  document.getElementById('cartSubtotal').textContent = `R$${subtotal.toFixed(2).replace('.',',')}`;
  const delRow = document.getElementById('deliveryRow');
  if (delRow) delRow.hidden = entrega === 0;
  document.getElementById('deliveryFee').textContent = `R$${entrega.toFixed(2).replace('.',',')}`;
  document.getElementById('cartTotal').textContent = `R$${total.toFixed(2).replace('.',',')}`;
  if (footer) footer.hidden = false;
}

// ============================================================
// CHECKOUT
// ============================================================
let checkoutData = {};

function abrirCheckout() {
  if (!state.carrinho.length) return;
  checkoutData = {};
  const overlay = document.getElementById('checkoutOverlay');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  renderCheckoutStep1();
}

function renderCheckoutStep1() {
  const modal = document.getElementById('checkoutModal');
  const { subtotal, entrega, total } = calcularTotais();
  const itensHTML = state.carrinho.map(i => `
    <div class="resumo-item">
      <span class="resumo-item-nome">${i.nome} <span class="resumo-item-qty">x${i.quantidade}</span></span>
      <span class="resumo-item-preco">R$${(i.preco * i.quantidade).toFixed(2).replace('.',',')}</span>
    </div>`).join('');
  modal.innerHTML = `
    <div class="checkout-step">
      <div class="checkout-header">
        <div><div class="checkout-step-indicator">Passo 1 de 4</div><div class="checkout-title">Resumo do Pedido</div></div>
        <button onclick="fecharCheckout()" style="margin-left:auto;color:var(--text-3)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="checkout-resumo">${itensHTML}
        <div class="resumo-item">
          <span>Taxa de entrega</span>
          <span class="resumo-item-preco">R$${entrega.toFixed(2).replace('.',',')}</span>
        </div>
        <div class="resumo-total"><span>Total</span><span>R$${total.toFixed(2).replace('.',',')}</span></div>
      </div>
      <div class="form-group">
        <label class="form-label">Alguma observação geral?</label>
        <textarea class="form-input" id="obsGeral" rows="2" placeholder="Ex: sem cebola em tudo..."></textarea>
      </div>
      <div class="checkout-nav">
        <button class="btn-secondary" onclick="fecharCheckout()">Cancelar</button>
        <button class="btn-primary" onclick="checkoutData.obs=document.getElementById('obsGeral').value; renderCheckoutStep2()">Continuar →</button>
      </div>
    </div>`;
}

function renderCheckoutStep2() {
  const modal = document.getElementById('checkoutModal');
  const saved = JSON.parse(localStorage.getItem('vero_cliente') || '{}');
  modal.innerHTML = `
    <div class="checkout-step">
      <div class="checkout-header">
        <div><div class="checkout-step-indicator">Passo 2 de 4</div><div class="checkout-title">Seus Dados</div></div>
        <button onclick="renderCheckoutStep1()" style="color:var(--text-3)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
      </div>
      <div class="form-group">
        <label class="form-label">Nome completo *</label>
        <input class="form-input" id="cNome" type="text" placeholder="Seu nome" value="${saved.nome || ''}" autocomplete="name">
      </div>
      <div class="form-group">
        <label class="form-label">WhatsApp *</label>
        <input class="form-input" id="cTelefone" type="tel" placeholder="(11) 99999-9999" value="${saved.telefone || ''}" autocomplete="tel">
      </div>
      <div class="checkout-nav">
        <button class="btn-secondary" onclick="renderCheckoutStep1()">Voltar</button>
        <button class="btn-primary" onclick="validarStep2()">Continuar →</button>
      </div>
    </div>`;
}

function validarStep2() {
  const nome = document.getElementById('cNome').value.trim();
  const tel  = document.getElementById('cTelefone').value.replace(/\D/g,'');
  if (!nome) { mostrarToast('Informe seu nome.', 'error'); return; }
  if (tel.length < 10) { mostrarToast('Informe um telefone válido.', 'error'); return; }
  checkoutData.nome     = nome;
  checkoutData.telefone = tel;
  localStorage.setItem('vero_cliente', JSON.stringify({ nome, telefone: tel }));
  renderCheckoutStep3();
}

function renderCheckoutStep3() {
  const modal  = document.getElementById('checkoutModal');
  const saved  = JSON.parse(localStorage.getItem('vero_cliente') || '{}');
  const tipoSalvo = checkoutData.tipoEntrega || '';
  modal.innerHTML = `
    <div class="checkout-step">
      <div class="checkout-header">
        <div><div class="checkout-step-indicator">Passo 3 de 4</div><div class="checkout-title">Entrega</div></div>
        <button onclick="renderCheckoutStep2()" style="color:var(--text-3)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
      </div>
      <div class="entrega-options">
        <div class="entrega-opt${tipoSalvo==='delivery'?' selected':''}" onclick="selecionarEntrega('delivery')">
          <div class="entrega-opt-icon">🛵</div>
          <div class="entrega-opt-label">Delivery</div>
          <div class="entrega-opt-sub">Entrega em casa · R$7,00</div>
        </div>
        <div class="entrega-opt${tipoSalvo==='retirada'?' selected':''}" onclick="selecionarEntrega('retirada')">
          <div class="entrega-opt-icon">🏠</div>
          <div class="entrega-opt-label">Retirada</div>
          <div class="entrega-opt-sub">Buscar no local · Grátis</div>
        </div>
      </div>
      <div id="enderecoFields" style="display:${tipoSalvo==='delivery'?'block':'none'}">
        <div class="form-group">
          <label class="form-label">Rua *</label>
          <input class="form-input" id="eRua" placeholder="Nome da rua" value="${saved.rua || ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Número *</label>
            <input class="form-input" id="eNumero" placeholder="123" value="${saved.numero || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Bairro *</label>
            <input class="form-input" id="eBairro" placeholder="Bairro" value="${saved.bairro || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Complemento</label>
          <input class="form-input" id="eCompl" placeholder="Apto, bloco, ponto de referência..." value="${saved.complemento || ''}">
        </div>
      </div>
      <div class="checkout-nav">
        <button class="btn-secondary" onclick="renderCheckoutStep2()">Voltar</button>
        <button class="btn-primary" onclick="validarStep3()">Continuar →</button>
      </div>
    </div>`;
}

function selecionarEntrega(tipo) {
  checkoutData.tipoEntrega = tipo;
  document.querySelectorAll('.entrega-opt').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  document.getElementById('enderecoFields').style.display = tipo === 'delivery' ? 'block' : 'none';
}

function validarStep3() {
  if (!checkoutData.tipoEntrega) { mostrarToast('Escolha o tipo de entrega.', 'error'); return; }
  if (checkoutData.tipoEntrega === 'delivery') {
    const rua    = document.getElementById('eRua')?.value.trim();
    const numero = document.getElementById('eNumero')?.value.trim();
    const bairro = document.getElementById('eBairro')?.value.trim();
    if (!rua || !numero || !bairro) { mostrarToast('Preencha o endereço completo.', 'error'); return; }
    checkoutData.rua    = rua;
    checkoutData.numero = numero;
    checkoutData.bairro = bairro;
    checkoutData.complemento = document.getElementById('eCompl')?.value.trim() || '';
    const saved = JSON.parse(localStorage.getItem('vero_cliente') || '{}');
    localStorage.setItem('vero_cliente', JSON.stringify({ ...saved, rua, numero, bairro, complemento: checkoutData.complemento }));
  }
  renderCheckoutStep4();
}

function renderCheckoutStep4() {
  const modal = document.getElementById('checkoutModal');
  modal.innerHTML = `
    <div class="checkout-step">
      <div class="checkout-header">
        <div><div class="checkout-step-indicator">Passo 4 de 4</div><div class="checkout-title">Pagamento</div></div>
        <button onclick="renderCheckoutStep3()" style="color:var(--text-3)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
      </div>
      <div class="pagamento-options">
        <div class="pag-opt" onclick="selecionarPagamento('pix', this)">
          <span class="pag-opt-icon">💚</span>
          <div><div class="pag-opt-name">PIX</div><div class="pag-opt-sub">Confirmação rápida</div></div>
        </div>
        <div class="pag-opt" onclick="selecionarPagamento('dinheiro', this)">
          <span class="pag-opt-icon">💵</span>
          <div><div class="pag-opt-name">Dinheiro</div><div class="pag-opt-sub">Troco disponível</div></div>
        </div>
        <div class="pag-opt" onclick="selecionarPagamento('cartao', this)">
          <span class="pag-opt-icon">💳</span>
          <div><div class="pag-opt-name">Cartão</div><div class="pag-opt-sub">Crédito ou débito na entrega</div></div>
        </div>
      </div>
      <div id="trocoField" hidden>
        <div class="form-group">
          <label class="form-label">Troco para quanto?</label>
          <input class="form-input" id="trocoValor" type="number" step="0.50" placeholder="Ex: 100.00">
        </div>
      </div>
      <div class="checkout-nav">
        <button class="btn-secondary" onclick="renderCheckoutStep3()">Voltar</button>
        <button class="btn-primary" id="btnFinalizarPedido" onclick="finalizarPedido()" disabled>Fazer Pedido ✓</button>
      </div>
    </div>`;
}

function selecionarPagamento(metodo, el) {
  checkoutData.pagamento = metodo;
  document.querySelectorAll('.pag-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('trocoField').hidden = metodo !== 'dinheiro';
  document.getElementById('btnFinalizarPedido').disabled = false;
}

async function finalizarPedido(dadosAgente = null) {
  const dados = dadosAgente || checkoutData;
  const btn   = document.getElementById('btnFinalizarPedido');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    const { subtotal, entrega, total } = calcularTotais();
    let status = 'novo';
    if (dados.pagamento === 'pix') status = 'aguardando_comprovante';

    // Upsert cliente
    const { data: cliente } = await state.supabase.from('clientes')
      .upsert({ nome: dados.nome, telefone: dados.telefone, endereco_rua: dados.rua, endereco_numero: dados.numero, endereco_bairro: dados.bairro, endereco_complemento: dados.complemento }, { onConflict: 'telefone' })
      .select().single();

    // Criar pedido
    const { data: pedido } = await state.supabase.from('pedidos').insert({
      cliente_id: cliente?.id,
      cliente_nome: dados.nome, cliente_telefone: dados.telefone,
      tipo_entrega: dados.tipoEntrega,
      endereco_rua: dados.rua, endereco_numero: dados.numero,
      endereco_bairro: dados.bairro, endereco_complemento: dados.complemento,
      forma_pagamento: dados.pagamento,
      troco_para: dados.troco || null,
      subtotal, taxa_entrega: entrega, total, status,
      observacoes: dados.obs || dados.observacoes || '',
      via_agente: !!dadosAgente,
    }).select().single();

    // Criar itens
    await state.supabase.from('itens_pedido').insert(
      state.carrinho.map(i => ({
        pedido_id: pedido.id, produto_id: i.id,
        produto_nome: i.nome, produto_foto_url: i.foto_url,
        preco_unitario: i.preco, quantidade: i.quantidade,
        subtotal: i.preco * i.quantidade, observacao: i.observacao || '',
      }))
    );

    // Limpar carrinho
    state.carrinho = [];
    salvarCarrinho();
    renderCarrinhoBtn();
    fecharCarrinho();

    if (dados.pagamento === 'pix') {
      mostrarTelaPix(pedido, dados, subtotal, entrega, total);
    } else {
      mostrarTelaConfirmacao(pedido);
    }
  } catch (e) {
    console.error('Erro ao finalizar pedido:', e);
    mostrarToast('Erro ao enviar pedido. Tente novamente.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Fazer Pedido ✓'; }
  }
}

function mostrarTelaConfirmacao(pedido) {
  const modal = document.getElementById('checkoutModal');
  modal.innerHTML = `
    <div class="checkout-step sucesso-tela">
      <div class="sucesso-icon">🍕</div>
      <div class="sucesso-num">Pedido #${String(pedido.numero).padStart(3,'0')}</div>
      <div class="checkout-title" style="margin-bottom:8px">Recebido!</div>
      <p class="sucesso-msg">Seu pedido já chegou pra gente. <br>Acompanhe pelo WhatsApp.</p>
      <button class="btn-primary full-width" onclick="fecharCheckout()">Perfeito, obrigado!</button>
    </div>`;
}

function mostrarTelaPix(pedido, dados, subtotal, entrega, total) {
  const chave   = state.config.chave_pix || 'Aguarde, em breve enviaremos a chave!';
  const waNum   = (state.config.whatsapp || '').replace(/\D/g,'');
  const itensMsg = state.carrinho.length
    ? state.carrinho.map(i => `${i.quantidade}x ${i.nome}  R$${(i.preco*i.quantidade).toFixed(2).replace('.',',')}`).join('\n')
    : '';
  const waMsg   = encodeURIComponent(
    `Olá! Quero confirmar meu pedido 🍕\n\n*Pedido #${String(pedido.numero).padStart(3,'0')}*\n━━━━━━━━━━━━━━━\n${itensMsg}\n━━━━━━━━━━━━━━━\nSubtotal: R$${subtotal.toFixed(2).replace('.',',')}\nEntrega: R$${entrega.toFixed(2).replace('.',',')}\n*Total: R$${total.toFixed(2).replace('.',',')}*\n\n${dados.tipoEntrega==='delivery'?`📍 ${dados.rua}, ${dados.numero} - ${dados.bairro}`:'🏠 Retirada no local'}\n\n💳 Pagamento: PIX\n\nAguardo a chave! 🙏`
  );
  const modal = document.getElementById('checkoutModal');
  modal.innerHTML = `
    <div class="checkout-step sucesso-tela">
      <div class="sucesso-icon">✅</div>
      <div class="sucesso-num">Pedido #${String(pedido.numero).padStart(3,'0')}</div>
      <div class="checkout-title" style="margin-bottom:8px">Recebido!</div>
      <p class="sucesso-msg">Agora clique abaixo para enviar o pedido pelo WhatsApp — vamos te mandar a chave PIX! 🙏</p>
      <div class="pix-info">
        <div class="pix-chave-label">Chave PIX da Vero:</div>
        <div class="pix-chave">${chave}</div>
      </div>
      ${waNum ? `<a class="btn-whatsapp" href="https://wa.me/${waNum}?text=${waMsg}" target="_blank">📱 Enviar pelo WhatsApp</a>` : ''}
      <span class="btn-fechar" onclick="fecharCheckout()">Fechar</span>
    </div>`;
}

function fecharCheckout() {
  fecharModal('checkoutOverlay');
  checkoutData = {};
}

// ============================================================
// ADMIN
// ============================================================
function setupAdmin() {
  const btn   = document.getElementById('btnAdmin');
  const over  = document.getElementById('adminOverlay');
  const close = document.getElementById('adminClose');
  const pwd   = document.getElementById('adminPwd');
  const enter = document.getElementById('btnAdminEnter');
  const err   = document.getElementById('adminError');
  if (!btn) return;
  btn.addEventListener('click', () => {
    over.classList.add('active', 'center');
    setTimeout(() => pwd?.focus(), 200);
  });
  close?.addEventListener('click', () => { over.classList.remove('active', 'center'); if(err) err.hidden=true; });
  over?.addEventListener('click', e => { if(e.target === over) { over.classList.remove('active','center'); if(err) err.hidden=true; } });
  const checkPwd = async () => {
    const input = pwd.value;
    const senhaCorreta = state.config.senha_admin || '0402';
    if (input === senhaCorreta) {
      window.open('../painel/admin.html', '_blank');
      over.classList.remove('active','center');
      pwd.value = '';
    } else {
      if(err) { err.hidden = false; }
      pwd.value = '';
      setTimeout(() => { if(err) err.hidden=true; }, 3000);
    }
  };
  enter?.addEventListener('click', checkPwd);
  pwd?.addEventListener('keydown', e => { if(e.key === 'Enter') checkPwd(); });
}

// ============================================================
// CHAT WIDGET — SOFIA (Agente IA)
// ============================================================
function setupChatWidget() {
  const toggle   = document.getElementById('chatToggle');
  const panel    = document.getElementById('chatPanel');
  const minimize = document.getElementById('chatMinimize');
  const input    = document.getElementById('chatInput');
  const send     = document.getElementById('chatSend');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    agentState.isOpen = !agentState.isOpen;
    panel.classList.toggle('open', agentState.isOpen);
    toggle.querySelector('.icon-chat').style.display = agentState.isOpen ? 'none' : '';
    toggle.querySelector('.icon-close').style.display = agentState.isOpen ? '' : 'none';
    const ping = toggle.querySelector('.chat-ping');
    if (ping) ping.style.display = 'none';
    if (agentState.isOpen && !agentState.greeted) {
      agentState.greeted = true;
      setTimeout(() => saudacaoInicial(), 400);
    }
    if (agentState.isOpen) setTimeout(() => input?.focus(), 350);
  });

  minimize?.addEventListener('click', () => {
    agentState.isOpen = false;
    panel.classList.remove('open');
    toggle.querySelector('.icon-chat').style.display = '';
    toggle.querySelector('.icon-close').style.display = 'none';
  });

  input?.addEventListener('input', () => {
    if (send) send.disabled = input.value.trim().length === 0 || agentState.isLoading;
  });

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !send.disabled) {
      e.preventDefault(); enviarMensagem();
    }
  });

  send?.addEventListener('click', () => { if (!send.disabled) enviarMensagem(); });
}

function saudacaoInicial() {
  appendChatMsg('assistant', 'Olá! Sou a Sofia, assistente da Vero Pizzaria. 🍕\n\nPosso te ajudar a montar seu pedido! Quer uma sugestão, ou já sabe o que vai querer?');
}

function appendChatMsg(role, texto) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `msg ${role === 'assistant' ? 'bot' : 'user'}`;
  div.innerHTML = texto.replace(/\n/g,'<br>');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.id = 'chatTyping';
  div.className = 'msg bot';
  div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function hideTyping() {
  document.getElementById('chatTyping')?.remove();
}

async function enviarMensagem() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const texto = input.value.trim();
  if (!texto || agentState.isLoading) return;
  input.value = '';
  document.getElementById('chatSend').disabled = true;
  appendChatMsg('user', texto);
  agentState.messages.push({ role: 'user', content: texto });
  await chamarAgente();
}

// ⚠️ Substitua pela sua chave OpenAI (nunca versionar a chave real)
const OPENAI_KEY = 'SUA_CHAVE_OPENAI_AQUI';

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: 'Adiciona um produto ao carrinho do cliente.',
      parameters: {
        type: 'object',
        properties: {
          produto_id:  { type: 'string', description: 'UUID do produto' },
          quantidade:  { type: 'integer', description: 'Quantidade a adicionar', default: 1 },
          observacao:  { type: 'string', description: 'Observação opcional sobre o item' },
        },
        required: ['produto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_cart',
      description: 'Remove um produto do carrinho.',
      parameters: {
        type: 'object',
        properties: {
          produto_id: { type: 'string', description: 'UUID do produto' },
        },
        required: ['produto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_cart',
      description: 'Consulta os itens atuais no carrinho e o total.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_order',
      description: 'Finaliza e envia o pedido ao painel da pizzaria após confirmar TODOS os dados com o cliente.',
      parameters: {
        type: 'object',
        properties: {
          nome:             { type: 'string', description: 'Nome completo do cliente' },
          telefone:         { type: 'string', description: 'Telefone/WhatsApp do cliente' },
          tipo_entrega:     { type: 'string', enum: ['delivery', 'retirada'] },
          rua:              { type: 'string' },
          numero:           { type: 'string' },
          bairro:           { type: 'string' },
          complemento:      { type: 'string' },
          forma_pagamento:  { type: 'string', enum: ['pix', 'dinheiro', 'cartao'] },
          troco_para:       { type: 'number', description: 'Valor do troco se pagamento em dinheiro' },
          observacoes:      { type: 'string' },
        },
        required: ['nome', 'telefone', 'tipo_entrega', 'forma_pagamento'],
      },
    },
  },
];

async function chamarAgente() {
  agentState.isLoading = true;
  showTyping();

  const menuTexto = state.produtos.map(p => {
    const cat = state.categorias.find(c => c.id === p.categoria_id)?.nome || '';
    return `- ${p.nome} (ID: ${p.id}) | ${cat} | R$${Number(p.preco).toFixed(2)} | ${p.descricao || ''}`;
  }).join('\n');

  const systemPrompt = `Você é Sofia, assistente virtual da Vero Pizzaria Artigianale. Seu trabalho é ajudar clientes a fazer pedidos de forma simples e acolhedora — especialmente idosos e pessoas com dificuldade em usar cardápios digitais.

CARDÁPIO ATUAL:
${menuTexto}

TAXA DE ENTREGA: R$${Number(state.config.taxa_entrega || 7).toFixed(2)}

REGRAS:
1. Seja simpática, paciente e fale de forma simples e clara.
2. Colete os dados necessários um de cada vez: itens desejados, nome, telefone, tipo de entrega (delivery ou retirada), endereço se delivery, forma de pagamento (pix, dinheiro ou cartão).
3. Antes de finalizar, leia o resumo completo e peça confirmação do cliente.
4. Só chame submit_order após o cliente confirmar tudo.
5. Se o cliente quiser dinheiro, pergunte se precisa de troco e para quanto.
6. Para delivery, o endereço é obrigatório (rua, número, bairro).
7. Nunca invente informações — pergunte ao cliente.
8. Responda sempre em português do Brasil.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...agentState.messages],
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    hideTyping();

    if (!response.ok) throw new Error(data.error || 'Erro na API');

    const choice = data.choices?.[0];
    if (!choice) throw new Error('Resposta inválida');

    const msg = choice.message;

    if (msg.tool_calls?.length) {
      agentState.messages.push(msg);
      for (const tc of msg.tool_calls) {
        await executarTool(tc);
      }
      await chamarAgente();
    } else if (msg.content) {
      agentState.messages.push({ role: 'assistant', content: msg.content });
      appendChatMsg('assistant', msg.content);
    }
  } catch (e) {
    hideTyping();
    console.error('Agente error:', e);
    appendChatMsg('assistant', 'Desculpe, tive um probleminha técnico. Pode tentar novamente? 😊');
  }
  agentState.isLoading = false;
  const send = document.getElementById('chatSend');
  const input = document.getElementById('chatInput');
  if (send && input) send.disabled = input.value.trim().length === 0;
}

async function executarTool(toolCall) {
  const name = toolCall.function.name;
  let args = {};
  try { args = JSON.parse(toolCall.function.arguments); } catch(_) {}
  let result = '';

  if (name === 'add_to_cart') {
    const p = state.produtos.find(x => x.id === args.produto_id);
    if (p) {
      const qty = args.quantidade || 1;
      for (let i = 0; i < qty; i++) adicionarAoCarrinhoInterno(args.produto_id, args.observacao || '');
      result = `${qty}x ${p.nome} adicionado ao carrinho. Preço: R$${(p.preco * qty).toFixed(2).replace('.',',')}`;
    } else {
      result = 'Produto não encontrado no cardápio.';
    }
  } else if (name === 'remove_from_cart') {
    removerDoCarrinho(args.produto_id);
    result = 'Item removido do carrinho.';
  } else if (name === 'view_cart') {
    if (!state.carrinho.length) {
      result = 'Carrinho vazio.';
    } else {
      const { total, entrega } = calcularTotais();
      const itens = state.carrinho.map(i => `${i.quantidade}x ${i.nome} = R$${(i.preco*i.quantidade).toFixed(2).replace('.',',')}`).join('; ');
      result = `Carrinho: ${itens} | Subtotal: R$${(total-entrega).toFixed(2).replace('.',',')} | Taxa entrega: R$${entrega.toFixed(2).replace('.',',')} | Total: R$${total.toFixed(2).replace('.',',')}`;
    }
  } else if (name === 'submit_order') {
    if (!state.carrinho.length) {
      result = 'Carrinho está vazio — adicione itens primeiro.';
    } else {
      try {
        await finalizarPedido({
          nome:         args.nome,
          telefone:     args.telefone.replace(/\D/g,''),
          tipoEntrega:  args.tipo_entrega,
          rua:          args.rua || '',
          numero:       args.numero || '',
          bairro:       args.bairro || '',
          complemento:  args.complemento || '',
          pagamento:    args.forma_pagamento,
          troco:        args.troco_para || null,
          observacoes:  args.observacoes || '',
        });
        fecharCheckout();
        agentState.isOpen = false;
        document.getElementById('chatPanel')?.classList.remove('open');
        document.getElementById('chatToggle')?.querySelector('.icon-chat') && (document.getElementById('chatToggle').querySelector('.icon-chat').style.display = '');
        document.getElementById('chatToggle')?.querySelector('.icon-close') && (document.getElementById('chatToggle').querySelector('.icon-close').style.display = 'none');
        result = 'Pedido criado com sucesso! Número: #' + '???';
      } catch(e) {
        result = 'Erro ao criar pedido: ' + e.message;
      }
    }
  }

  agentState.messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: result,
  });
}

// ============================================================
// TOAST
// ============================================================
function mostrarToast(msg, tipo = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  document.getElementById('cartBtn')?.addEventListener('click', abrirCarrinho);
  document.getElementById('cartClose')?.addEventListener('click', fecharCarrinho);
  document.getElementById('cartOverlay')?.addEventListener('click', fecharCarrinho);
  document.getElementById('btnCheckout')?.addEventListener('click', abrirCheckout);
  document.getElementById('checkoutOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('checkoutOverlay')) fecharCheckout();
  });
  document.getElementById('productOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('productOverlay')) fecharModal('productOverlay');
  });
}
