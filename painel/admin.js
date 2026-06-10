// ============================================================
// VERO Pizzaria — admin.js
// CRUD completo de produtos, categorias e configurações
// ============================================================

// ▶ SUBSTITUA COM AS CREDENCIAIS DO SEU PROJETO SUPABASE
const SUPABASE_URL         = 'https://somgwwrolrsvscukegfm.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbWd3d3JvbHJzdnNjdWtlZ2ZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg5OTIwNywiZXhwIjoyMDkzNDc1MjA3fQ.4Cb_ofoHVRldhWh0YnD27150v1_GXmuvGY4Dt3GN6V4';

// ============================================================
// ESTADO
// ============================================================
const admin = {
  sb: null,
  produtos: [],
  categorias: [],
  config: {},
  tabAtiva: 'produtos',
  editandoId: null,
  fotoArquivo: null,
  fotoAtualUrl: null,
};

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  admin.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  inicializar();
});

async function inicializar() {
  await Promise.all([carregarCategorias(), carregarProdutos(), carregarConfig()]);
  renderTab();
  setupFotoUpload();
}

// ============================================================
// CARREGAMENTO
// ============================================================
async function carregarProdutos() {
  const { data } = await admin.sb.from('produtos').select('*').order('ordem');
  admin.produtos = data || [];
}

async function carregarCategorias() {
  const { data } = await admin.sb.from('categorias').select('*').order('ordem');
  admin.categorias = data || [];
}

async function carregarConfig() {
  const { data } = await admin.sb.from('configuracoes').select('*');
  (data || []).forEach(c => admin.config[c.chave] = c.valor);
}

// ============================================================
// ABAS
// ============================================================
function setTab(tab, btn) {
  admin.tabAtiva = tab;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTab();
}

function renderTab() {
  document.getElementById('loadingAdmin').style.display = 'none';
  if (admin.tabAtiva === 'produtos')      renderProdutos();
  else if (admin.tabAtiva === 'categorias') renderCategorias();
  else if (admin.tabAtiva === 'configuracoes') renderConfiguracoes();
}

// ============================================================
// ABA PRODUTOS
// ============================================================
function renderProdutos() {
  const body = document.getElementById('adminBody');
  if (!admin.produtos.length) {
    body.innerHTML = `
      <div class="admin-section-header">
        <span class="admin-section-title">Produtos</span>
        <button class="btn-new" onclick="novoModalProduto()">+ Novo Produto</button>
      </div>
      <div class="empty-state" style="padding:60px 20px;text-align:center;color:var(--text-3)">
        <div style="font-size:40px;margin-bottom:12px">🍕</div>
        <p>Nenhum produto ainda. Clique em "Novo Produto" para começar.</p>
      </div>`;
    return;
  }

  const agrupado = admin.categorias.map(cat => ({
    cat,
    prods: admin.produtos.filter(p => p.categoria_id === cat.id),
  })).filter(g => g.prods.length > 0);

  const semCat = admin.produtos.filter(p => !p.categoria_id);

  body.innerHTML = `
    <div class="admin-section-header">
      <span class="admin-section-title">Produtos (${admin.produtos.length})</span>
      <button class="btn-new" onclick="novoModalProduto()">+ Novo Produto</button>
    </div>
    ${agrupado.map(g => `
      <div style="margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${g.cat.icone || ''} ${g.cat.nome}</div>
        <div class="produto-admin-list">
          ${g.prods.map(p => produtoAdminItemHTML(p)).join('')}
        </div>
      </div>`).join('')}
    ${semCat.length ? `
      <div style="margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Sem categoria</div>
        <div class="produto-admin-list">${semCat.map(p => produtoAdminItemHTML(p)).join('')}</div>
      </div>` : ''}`;
}

function produtoAdminItemHTML(p) {
  const fotoHTML = p.foto_url
    ? `<img class="produto-admin-thumb" src="${p.foto_url}" alt="${p.nome}" style="font-size:0">`
    : `<div class="produto-admin-thumb">🍕</div>`;
  const catNome = admin.categorias.find(c => c.id === p.categoria_id)?.nome || '—';
  return `
    <div class="produto-admin-item" id="prod-${p.id}">
      ${fotoHTML}
      <div class="produto-admin-info">
        <div class="produto-admin-nome">${p.nome}</div>
        <div class="produto-admin-cat">${catNome}</div>
      </div>
      <div class="produto-admin-badges">
        ${p.destaque_hero ? '<span class="badge badge-hero">⭐ Hero</span>' : ''}
        ${!p.disponivel ? '<span class="badge badge-inativo">Inativo</span>' : ''}
      </div>
      <span class="produto-admin-preco">R$${Number(p.preco).toFixed(2).replace('.',',')}</span>
      <div class="produto-admin-actions">
        <button class="btn-edit" onclick="editarProduto('${p.id}')" title="Editar">✏️</button>
        <button class="btn-del" onclick="excluirProduto('${p.id}')" title="Excluir">🗑️</button>
      </div>
    </div>`;
}

// ============================================================
// MODAL PRODUTO
// ============================================================
function novoModalProduto() {
  admin.editandoId  = null;
  admin.fotoArquivo = null;
  admin.fotoAtualUrl = null;
  document.getElementById('modalTitle').textContent = 'Novo Produto';
  limparFormProduto();
  preencherSelectCategorias();
  abrirOverlay('produtoOverlay');
}

function editarProduto(id) {
  const p = admin.produtos.find(x => x.id === id);
  if (!p) return;
  admin.editandoId   = id;
  admin.fotoArquivo  = null;
  admin.fotoAtualUrl = p.foto_url || null;
  document.getElementById('modalTitle').textContent = 'Editar Produto';
  preencherSelectCategorias(p.categoria_id);
  document.getElementById('fNome').value     = p.nome || '';
  document.getElementById('fDesc').value     = p.descricao || '';
  document.getElementById('fPreco').value    = p.preco || '';
  document.getElementById('fPrecoOrig').value = p.preco_original || '';
  document.getElementById('fDisponivel').checked = p.disponivel;
  document.getElementById('fHero').checked       = p.destaque_hero;
  document.querySelectorAll('.tag-toggle').forEach(btn => {
    btn.classList.toggle('active', (p.tags || []).includes(btn.dataset.tag));
  });
  const preview = document.getElementById('fotoPreviewImg');
  const placeholder = document.getElementById('fotoPlaceholder');
  if (p.foto_url) {
    preview.src = p.foto_url; preview.hidden = false; placeholder.hidden = true;
  } else {
    preview.hidden = true; placeholder.hidden = false;
  }
  abrirOverlay('produtoOverlay');
}

function limparFormProduto() {
  ['fNome','fDesc','fPreco','fPrecoOrig'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('fDisponivel').checked = true;
  document.getElementById('fHero').checked       = false;
  document.querySelectorAll('.tag-toggle').forEach(b => b.classList.remove('active'));
  const preview = document.getElementById('fotoPreviewImg');
  const placeholder = document.getElementById('fotoPlaceholder');
  if (preview) { preview.hidden = true; preview.src = ''; }
  if (placeholder) placeholder.hidden = false;
}

function preencherSelectCategorias(selecionadoId = null) {
  const sel = document.getElementById('fCategoria');
  if (!sel) return;
  sel.innerHTML = admin.categorias.map(c =>
    `<option value="${c.id}"${c.id === selecionadoId ? ' selected' : ''}>${c.icone || ''} ${c.nome}</option>`
  ).join('');
}

function toggleTag(btn) {
  btn.classList.toggle('active');
}

function fecharModalProduto() {
  fecharOverlay('produtoOverlay');
  admin.editandoId  = null;
  admin.fotoArquivo = null;
}

async function salvarProduto() {
  const nome = document.getElementById('fNome').value.trim();
  const preco = parseFloat(document.getElementById('fPreco').value);
  if (!nome) { mostrarToast('Informe o nome do produto.', 'error'); return; }
  if (isNaN(preco) || preco <= 0) { mostrarToast('Informe um preço válido.', 'error'); return; }

  const btn = document.getElementById('btnSalvarProduto');
  btn.disabled = true; btn.textContent = 'Salvando...';

  const precoOrig = parseFloat(document.getElementById('fPrecoOrig').value) || null;
  const tags = Array.from(document.querySelectorAll('.tag-toggle.active')).map(b => b.dataset.tag);
  const dados = {
    categoria_id:  document.getElementById('fCategoria').value || null,
    nome,
    descricao:     document.getElementById('fDesc').value.trim() || null,
    preco,
    preco_original: precoOrig,
    disponivel:    document.getElementById('fDisponivel').checked,
    destaque_hero: document.getElementById('fHero').checked,
    tags,
  };

  try {
    let id = admin.editandoId;
    if (id) {
      await admin.sb.from('produtos').update(dados).eq('id', id);
    } else {
      const { data } = await admin.sb.from('produtos').insert(dados).select().single();
      id = data.id;
    }

    if (admin.fotoArquivo) {
      const fotoUrl = await uploadFoto(admin.fotoArquivo, id);
      if (fotoUrl) await admin.sb.from('produtos').update({ foto_url: fotoUrl }).eq('id', id);
    }

    mostrarToast(admin.editandoId ? 'Produto atualizado! ✓' : 'Produto criado! ✓', 'success');
    fecharModalProduto();
    await carregarProdutos();
    renderProdutos();
  } catch(e) {
    mostrarToast('Erro ao salvar. Tente novamente.', 'error');
    console.error(e);
  }
  btn.disabled = false; btn.textContent = 'Salvar Produto';
}

async function excluirProduto(id) {
  if (!confirm('Excluir este produto? Esta ação não pode ser desfeita.')) return;
  const p = admin.produtos.find(x => x.id === id);
  if (p?.foto_url) {
    const nome = p.foto_url.split('/').pop();
    await admin.sb.storage.from('produto-fotos').remove([nome]);
  }
  await admin.sb.from('produtos').delete().eq('id', id);
  mostrarToast('Produto excluído.', 'error');
  await carregarProdutos();
  renderProdutos();
}

// ============================================================
// UPLOAD DE FOTO
// ============================================================
function setupFotoUpload() {
  const input = document.getElementById('fotoInput');
  if (!input) return;
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { mostrarToast('Foto deve ter no máximo 5MB.', 'error'); return; }
    admin.fotoArquivo = file;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.getElementById('fotoPreviewImg');
      const placeholder = document.getElementById('fotoPlaceholder');
      img.src = ev.target.result; img.hidden = false;
      if (placeholder) placeholder.hidden = true;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadFoto(arquivo, produtoId) {
  const redimensionada = await redimensionarImagem(arquivo, 800, 600);
  const ext = arquivo.name.split('.').pop();
  const nome = `${produtoId}-${Date.now()}.${ext}`;
  const { error } = await admin.sb.storage.from('produto-fotos').upload(nome, redimensionada, { contentType: arquivo.type, upsert: true });
  if (error) { console.error(error); return null; }
  const { data } = admin.sb.storage.from('produto-fotos').getPublicUrl(nome);
  return data.publicUrl;
}

function redimensionarImagem(arquivo, maxW, maxH) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW/w, maxH/h);
        w = Math.round(w*r); h = Math.round(h*r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ============================================================
// ABA CATEGORIAS
// ============================================================
function renderCategorias() {
  const body = document.getElementById('adminBody');
  body.innerHTML = `
    <div class="admin-section-header">
      <span class="admin-section-title">Categorias (${admin.categorias.length})</span>
      <button class="btn-new" onclick="novaModalCategoria()">+ Nova Categoria</button>
    </div>
    <div class="produto-admin-list" id="catList">
      ${admin.categorias.map(c => `
        <div class="produto-admin-item">
          <div class="produto-admin-thumb" style="font-size:24px">${c.icone || '📂'}</div>
          <div class="produto-admin-info">
            <div class="produto-admin-nome">${c.nome}</div>
            <div class="produto-admin-cat">${admin.produtos.filter(p=>p.categoria_id===c.id).length} produto(s)</div>
          </div>
          <label class="toggle" title="Ativar/Desativar">
            <input type="checkbox" ${c.ativa ? 'checked' : ''} onchange="toggleCategoria('${c.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <div class="produto-admin-actions">
            <button class="btn-edit" onclick="editarCategoria('${c.id}')">✏️</button>
            <button class="btn-del" onclick="excluirCategoria('${c.id}')">🗑️</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function novaModalCategoria() {
  admin.editandoId = null;
  document.getElementById('catModalTitle').textContent = 'Nova Categoria';
  document.getElementById('cNome').value  = '';
  document.getElementById('cIcone').value = '';
  document.getElementById('cDesc').value  = '';
  abrirOverlay('catOverlay');
}

function editarCategoria(id) {
  const c = admin.categorias.find(x => x.id === id);
  if (!c) return;
  admin.editandoId = id;
  document.getElementById('catModalTitle').textContent = 'Editar Categoria';
  document.getElementById('cNome').value  = c.nome || '';
  document.getElementById('cIcone').value = c.icone || '';
  document.getElementById('cDesc').value  = c.descricao || '';
  abrirOverlay('catOverlay');
}

function fecharModalCat() {
  fecharOverlay('catOverlay');
  admin.editandoId = null;
}

async function salvarCategoria() {
  const nome = document.getElementById('cNome').value.trim();
  if (!nome) { mostrarToast('Informe o nome da categoria.', 'error'); return; }
  const dados = {
    nome,
    icone: document.getElementById('cIcone').value.trim() || null,
    descricao: document.getElementById('cDesc').value.trim() || null,
  };
  if (admin.editandoId) {
    await admin.sb.from('categorias').update(dados).eq('id', admin.editandoId);
  } else {
    await admin.sb.from('categorias').insert({ ...dados, ordem: admin.categorias.length });
  }
  mostrarToast('Categoria salva! ✓', 'success');
  fecharModalCat();
  await carregarCategorias();
  renderCategorias();
}

async function excluirCategoria(id) {
  const prods = admin.produtos.filter(p => p.categoria_id === id);
  if (prods.length) { mostrarToast(`Mova os ${prods.length} produto(s) desta categoria antes de excluir.`, 'error'); return; }
  if (!confirm('Excluir esta categoria?')) return;
  await admin.sb.from('categorias').delete().eq('id', id);
  mostrarToast('Categoria excluída.', 'error');
  await carregarCategorias();
  renderCategorias();
}

async function toggleCategoria(id, ativa) {
  await admin.sb.from('categorias').update({ ativa }).eq('id', id);
  const c = admin.categorias.find(x => x.id === id);
  if (c) c.ativa = ativa;
}

// ============================================================
// ABA CONFIGURAÇÕES
// ============================================================
function renderConfiguracoes() {
  const body = document.getElementById('adminBody');
  const c    = admin.config;
  const lojaAberta = c.loja_aberta !== 'false';
  body.innerHTML = `
    <div class="config-section">
      <div class="config-section-title">Loja</div>
      <div class="config-row">
        <div class="config-row-label">Status da loja</div>
        <label class="toggle">
          <input type="checkbox" id="cfgLoja" ${lojaAberta ? 'checked' : ''} onchange="toggleLoja(this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-section">
      <div class="config-section-title">Delivery</div>
      <div class="config-row">
        <div class="config-row-label">Taxa de entrega (R$)<div class="config-row-sub">Valor fixo cobrado por delivery</div></div>
        <input class="config-input" id="cfgTaxa" type="number" step="0.50" value="${c.taxa_entrega || '7'}">
      </div>
      <div class="config-row">
        <div class="config-row-label">Pedido mínimo (R$)<div class="config-row-sub">0 = sem mínimo</div></div>
        <input class="config-input" id="cfgMinimo" type="number" step="1" value="${c.pedido_minimo || '0'}">
      </div>
      <div class="config-row">
        <div class="config-row-label">Frete grátis acima de (R$)<div class="config-row-sub">0 = desativado</div></div>
        <input class="config-input" id="cfgFreteGratis" type="number" step="5" value="${c.frete_gratis_acima || '0'}">
      </div>
    </div>

    <div class="config-section">
      <div class="config-section-title">Pagamento e Contato</div>
      <div class="config-row">
        <div class="config-row-label">Chave PIX<div class="config-row-sub">Exibida no checkout</div></div>
        <input class="config-input" id="cfgPix" type="text" value="${c.chave_pix || ''}" style="width:200px;text-align:left">
      </div>
      <div class="config-row">
        <div class="config-row-label">WhatsApp<div class="config-row-sub">Com DDD, sem espaços (ex: 11999999999)</div></div>
        <input class="config-input" id="cfgWa" type="text" value="${c.whatsapp || ''}" style="width:160px;text-align:left">
      </div>
      <div class="config-row">
        <div class="config-row-label">URL do cardápio<div class="config-row-sub">Para botão "Admin" no cardápio</div></div>
        <input class="config-input" id="cfgPainelUrl" type="text" value="${c.painel_url || ''}" style="width:200px;text-align:left">
      </div>
    </div>

    <div class="config-section">
      <div class="config-section-title">Segurança</div>
      <div class="config-row">
        <div class="config-row-label">Senha do admin<div class="config-row-sub">Padrão: 0402</div></div>
        <input class="config-input" id="cfgSenha" type="password" value="${c.senha_admin || '0402'}">
      </div>
    </div>

    <button class="btn-save-config" onclick="salvarConfiguracoes()">Salvar Configurações ✓</button>`;
}

async function toggleLoja(ativa) {
  await admin.sb.from('configuracoes').update({ valor: String(ativa) }).eq('chave','loja_aberta');
  admin.config.loja_aberta = String(ativa);
  mostrarToast(ativa ? 'Loja aberta! 🟢' : 'Loja fechada! 🔴');
}

async function salvarConfiguracoes() {
  const updates = [
    { chave: 'taxa_entrega',       valor: document.getElementById('cfgTaxa').value },
    { chave: 'pedido_minimo',      valor: document.getElementById('cfgMinimo').value },
    { chave: 'frete_gratis_acima', valor: document.getElementById('cfgFreteGratis').value },
    { chave: 'chave_pix',          valor: document.getElementById('cfgPix').value.trim() },
    { chave: 'whatsapp',           valor: document.getElementById('cfgWa').value.replace(/\D/g,'') },
    { chave: 'painel_url',         valor: document.getElementById('cfgPainelUrl').value.trim() },
    { chave: 'senha_admin',        valor: document.getElementById('cfgSenha').value },
  ];
  await Promise.all(updates.map(u =>
    admin.sb.from('configuracoes').update({ valor: u.valor }).eq('chave', u.chave)
  ));
  updates.forEach(u => admin.config[u.chave] = u.valor);
  mostrarToast('Configurações salvas! ✓', 'success');
}

// ============================================================
// HELPERS
// ============================================================
function abrirOverlay(id) {
  const o = document.getElementById(id);
  if (o) o.classList.add('active');
}

function fecharOverlay(id) {
  const o = document.getElementById(id);
  if (o) o.classList.remove('active');
}

document.addEventListener('click', e => {
  ['produtoOverlay','catOverlay'].forEach(id => {
    const o = document.getElementById(id);
    if (o && e.target === o) fecharOverlay(id);
  });
});

function mostrarToast(msg, tipo='info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
