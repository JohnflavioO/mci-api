# Ativação da confirmação manual de estoque

**Estado: proposta no repositório; não executada no Supabase.**

## Pré-requisitos e ordem

1. Validar e aplicar a cadeia de catálogo revisada (0001 a 0004) conforme o procedimento do projeto.
2. Revisar `0006_stock_confirmation_setting.up.sql` e aplicá-la no SQL Editor do projeto Supabase correto.
3. Publicar o frontend após o PR ser aprovado/mesclado.
4. No Super Admin, abrir **Configurações → Confirmação de estoque** e definir se a confirmação manual será obrigatória.
5. Em **Produtos**, informar a quantidade e marcar **Estoque confirmado pela MCI** somente depois de conferir a quantidade real.

## Regra de disponibilidade

- Confirmação manual ligada (padrão): quantidade precisa ser maior que zero **e** `stock_confirmed = true`.
- Confirmação manual desligada: quantidade ainda precisa estar informada e ser maior que zero.
- Estoque nulo ou zero nunca permite adicionar ao carrinho.
- Importação de produto não confirma estoque; a coluna inicia como `false`.
- A migration 0006 não é executada automaticamente. Não aplicar sem validar a cadeia anterior no ambiente de destino.

## Limite atual

A finalização de pedidos ainda retorna HTTP 501 na aplicação e não cria pedidos. A disponibilidade do catálogo e o carrinho são protegidos no frontend; antes de habilitar checkout/pagamento, a API transacional de pedidos também deverá validar o estoque e baixá-lo atomicamente no banco (a função `confirm_sale_stock` da proposta 0004 é restrita a admin e não é uma API pública de checkout).
