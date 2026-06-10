// Supabase Edge Function: chat-agent
// Proxy para OpenAI — protege a API key no servidor
// Deploy: supabase functions deploy chat-agent
// Secret: supabase secrets set OPENAI_API_KEY=sk-...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Adiciona um produto ao carrinho do cliente. Use quando o cliente confirmar que quer um item.",
      parameters: {
        type: "object",
        properties: {
          produto_id: { type: "string", description: "UUID do produto no cardápio" },
          quantidade: { type: "integer", description: "Quantidade desejada", default: 1 },
          observacao: { type: "string", description: "Observação especial ex: sem cebola, bem passada" },
        },
        required: ["produto_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description: "Remove um produto do carrinho.",
      parameters: {
        type: "object",
        properties: {
          produto_id: { type: "string", description: "UUID do produto a remover" },
        },
        required: ["produto_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_cart",
      description: "Consulta o carrinho atual do cliente para confirmar os itens antes de finalizar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_order",
      description: "Finaliza e envia o pedido para a pizzaria. Chamar APENAS após o cliente confirmar TODOS os dados: itens, nome, telefone, endereço (se delivery) e forma de pagamento.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome completo do cliente" },
          telefone: { type: "string", description: "Telefone com DDD, ex: 11999999999" },
          tipo_entrega: { type: "string", enum: ["delivery", "retirada"], description: "Tipo de entrega" },
          rua: { type: "string", description: "Nome da rua (obrigatório se delivery)" },
          numero: { type: "string", description: "Número do endereço (obrigatório se delivery)" },
          bairro: { type: "string", description: "Bairro (obrigatório se delivery)" },
          complemento: { type: "string", description: "Complemento opcional ex: apto 42" },
          forma_pagamento: { type: "string", enum: ["pix", "dinheiro", "cartao"], description: "Forma de pagamento" },
          troco_para: { type: "number", description: "Valor em reais para troco (apenas quando pagamento é dinheiro)" },
          observacoes: { type: "string", description: "Observações gerais do pedido" },
        },
        required: ["nome", "telefone", "tipo_entrega", "forma_pagamento"],
      },
    },
  },
];

function buildSystemPrompt(products: Array<{ id: string; nome: string; descricao: string; preco: number; categoria: string }>, config: Record<string, string>): string {
  const menuText = products.map(p =>
    `• ${p.nome} — ${p.descricao} — R$${Number(p.preco).toFixed(2).replace(".", ",")} (ID: ${p.id}) [${p.categoria}]`
  ).join("\n");

  return `Você é Sofia, a assistente virtual da Vero Pizzaria Artigianale — "Autêntica Como Deve Ser" 🍕

Sua missão é ajudar clientes a fazer pedidos de forma simples e acolhedora, especialmente pessoas mais velhas ou com dificuldade em usar cardápios digitais. Imagine que está atendendo com o carinho de um restaurante de família.

═══════════════════════════
CARDÁPIO ATUAL
═══════════════════════════
${menuText}

Taxa de entrega: R$${Number(config.taxa_entrega || "7").toFixed(2).replace(".", ",")} (para delivery)
Retirada no local: sem taxa
Formas de pagamento: PIX, Dinheiro (com troco), Cartão de crédito/débito na entrega

═══════════════════════════
COMO AGIR
═══════════════════════════
1. Seja calorosa, paciente e use linguagem simples e clara
2. Para quem não sabe o que pedir, faça perguntas gentis: "Prefere algo mais tradicional ou quer experimentar algo especial?"
3. Quando o cliente quiser um item, use add_to_cart imediatamente
4. Colete as informações uma de cada vez, sem sobrecarregar
5. Antes de finalizar, use view_cart para confirmar o pedido com o cliente
6. Só chame submit_order quando o cliente disser "sim, pode mandar" ou equivalente
7. Sempre confirme endereço completo para delivery (rua, número, bairro)
8. Se pedir troco, confirme o valor exato
9. Responda SEMPRE em português brasileiro, de forma calorosa e natural
10. Mensagens curtas e diretas — sem parágrafos longos`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY não configurada" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages, products, config } = await req.json();

    const systemPrompt = buildSystemPrompt(products || [], config || {});

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return new Response(
        JSON.stringify({ error: "Erro ao chamar OpenAI", details: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
