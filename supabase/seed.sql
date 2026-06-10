-- ============================================================
-- VERO Pizzaria — Seed inicial (com fotos e bordas)
-- Rodar APÓS a migration 001_initial.sql
-- ============================================================

-- CATEGORIAS
INSERT INTO categorias (nome, descricao, ordem, icone) VALUES
  ('Pizzas Tradicionais', 'Receitas clássicas com ingredientes selecionados', 0, '🍕'),
  ('Pizzas Especiais', 'Criações exclusivas da Vero Artigianale', 1, '⭐'),
  ('Bordas Recheadas', 'Com catupiry, cheddar ou cream cheese', 2, '🧀'),
  ('Bebidas', 'Refrigerantes, sucos e água', 3, '🥤'),
  ('Sobremesas', 'Doces italianos artesanais', 4, '🍮');

-- PIZZAS TRADICIONAIS
INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, destaque_hero, tags, ordem, foto_url)
SELECT c.id, 'Margherita',
  'Molho de tomate San Marzano, mussarela de búfala fresca, manjericão colhido na hora e fio de azeite extravirgem. A mais italiana de todas.',
  42.90, true, false, ARRAY['popular']::text[], 0,
  'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Pizzas Tradicionais';

INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, destaque_hero, tags, ordem, foto_url)
SELECT c.id, 'Calabresa Artesanal',
  'Calabresa defumada artesanal fatiada na hora, cebola caramelizada no azeite, mussarela gratinada e azeitonas verdes. Pura tradição.',
  47.90, true, false, ARRAY['popular']::text[], 1,
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Pizzas Tradicionais';

INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, destaque_hero, tags, ordem, foto_url)
SELECT c.id, 'Portuguesa Vero',
  'Presunto especial, ovos frescos, azeitonas pretas, cebola, pimentão e mussarela sobre molho de tomate artesanal. Fartura de verdade.',
  49.90, true, false, ARRAY['popular']::text[], 2,
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Pizzas Tradicionais';

-- PIZZAS ESPECIAIS
INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, destaque_hero, tags, ordem, foto_url)
SELECT c.id, 'Quattro Formaggi',
  'Mussarela cremosa, gorgonzola italiano, parmesão reggiano e provolone defumado. Para quem entende de queijo — impossível comer só uma fatia.',
  57.90, true, true, ARRAY['chef_indica', 'popular']::text[], 0,
  'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Pizzas Especiais';

INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, destaque_hero, tags, ordem, foto_url)
SELECT c.id, 'Napolitana Speciale',
  'Molho de tomate fresco, alho confitado no azeite, filés de anchova siciliana, alcaparras e orégano selvagem. Nápoles em cada mordida.',
  54.90, true, false, ARRAY['chef_indica']::text[], 1,
  'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Pizzas Especiais';

-- BORDAS RECHEADAS (adicionadas como produtos para o complemento funcionar)
INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, tags, ordem, foto_url)
SELECT c.id, 'Borda de Catupiry',
  'Borda recheada com catupiry cremoso. A favorita dos brasileiros.',
  8.00, true, ARRAY[]::text[], 0,
  'https://images.unsplash.com/photo-1548369937-47519962c11a?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Bordas Recheadas';

INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, tags, ordem, foto_url)
SELECT c.id, 'Borda de Cheddar',
  'Borda recheada com cheddar derretido. Irresistível!',
  8.00, true, ARRAY[]::text[], 1,
  'https://images.unsplash.com/photo-1548369937-47519962c11a?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Bordas Recheadas';

INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, tags, ordem, foto_url)
SELECT c.id, 'Borda de Cream Cheese',
  'Borda recheada com cream cheese suave. Perfeita com qualquer pizza.',
  7.00, true, ARRAY[]::text[], 2,
  'https://images.unsplash.com/photo-1548369937-47519962c11a?w=600&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Bordas Recheadas';

-- BEBIDAS
INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, tags, ordem, foto_url)
SELECT c.id, 'Coca-Cola 2L', 'Gelada, da hora.', 12.90, true, ARRAY['popular']::text[], 0,
  'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Bebidas';

INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, tags, ordem, foto_url)
SELECT c.id, 'Água Mineral 500ml', 'Com ou sem gás.', 4.90, true, ARRAY[]::text[], 1,
  'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&auto=format&fit=crop'
FROM categorias c WHERE c.nome = 'Bebidas';
