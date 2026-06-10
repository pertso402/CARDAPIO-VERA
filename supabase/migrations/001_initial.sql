-- ============================================================
-- VERO Pizzaria Artigianale — Migration Inicial
-- Rodar no Supabase Dashboard > SQL Editor
-- ============================================================

-- TABELAS

CREATE TABLE categorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  ativa BOOLEAN DEFAULT true,
  icone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco DECIMAL(10,2) NOT NULL,
  preco_original DECIMAL(10,2),
  foto_url TEXT,
  disponivel BOOLEAN DEFAULT true,
  destaque_hero BOOLEAN DEFAULT false,
  tags TEXT[],
  ordem INTEGER DEFAULT 0,
  vendas_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL UNIQUE,
  endereco_rua TEXT,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_complemento TEXT,
  total_pedidos INTEGER DEFAULT 0,
  total_gasto DECIMAL(10,2) DEFAULT 0,
  ultimo_pedido TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero SERIAL,
  cliente_id UUID REFERENCES clientes(id),
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  tipo_entrega TEXT NOT NULL CHECK (tipo_entrega IN ('delivery', 'retirada')),
  endereco_rua TEXT,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_complemento TEXT,
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao')),
  troco_para DECIMAL(10,2),
  subtotal DECIMAL(10,2) NOT NULL,
  taxa_entrega DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN (
    'aguardando_comprovante',
    'aguardando_pagamento',
    'novo',
    'em_preparo',
    'pronto',
    'saiu_entrega',
    'finalizado',
    'cancelado'
  )),
  observacoes TEXT,
  n8n_processado BOOLEAN DEFAULT false,
  via_agente BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE itens_pedido (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL,
  produto_foto_url TEXT,
  preco_unitario DECIMAL(10,2) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  subtotal DECIMAL(10,2) NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE configuracoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  valor TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CONFIGURAÇÕES PADRÃO VERO
INSERT INTO configuracoes (chave, valor) VALUES
  ('loja_aberta', 'true'),
  ('taxa_entrega', '7.00'),
  ('pedido_minimo', '0'),
  ('frete_gratis_acima', '0'),
  ('chave_pix', 'PREENCHER_PIX_VERO'),
  ('whatsapp', '5500000000000'),
  ('nome_restaurante', 'Vero Pizzaria Artigianale'),
  ('senha_admin', '0402'),
  ('n8n_webhook_url', ''),
  ('modo_pix', 'manual'),
  ('painel_url', 'PREENCHER_URL_PAINEL');

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Leitura pública
CREATE POLICY "leitura_publica_categorias" ON categorias
  FOR SELECT USING (true);

CREATE POLICY "leitura_publica_produtos" ON produtos
  FOR SELECT USING (disponivel = true);

CREATE POLICY "leitura_publica_configuracoes" ON configuracoes
  FOR SELECT USING (chave NOT IN ('senha_admin', 'n8n_webhook_url'));

-- Escrita pública (cliente cria pedido)
CREATE POLICY "criar_cliente" ON clientes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "upsert_cliente" ON clientes
  FOR UPDATE USING (true);

CREATE POLICY "criar_pedido" ON pedidos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ler_pedidos" ON pedidos
  FOR SELECT USING (true);

CREATE POLICY "criar_itens_pedido" ON itens_pedido
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ler_itens_pedido" ON itens_pedido
  FOR SELECT USING (true);

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE produtos;
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE itens_pedido;
ALTER PUBLICATION supabase_realtime ADD TABLE configuracoes;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER produtos_updated_at
  BEFORE UPDATE ON produtos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION incrementar_vendas()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE produtos SET vendas_count = vendas_count + NEW.quantidade WHERE id = NEW.produto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incrementar_vendas_trigger
  AFTER INSERT ON itens_pedido
  FOR EACH ROW EXECUTE FUNCTION incrementar_vendas();
