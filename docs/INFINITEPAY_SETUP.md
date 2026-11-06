# InfinitePay — configuração do Store House

## Requisitos da conta InfinitePay
1. No App/Conta Web InfinitePay, abra Vendas → Checkout → Configurações.
2. Ative **Checkout Integrado**.
3. Crie uma API Key para a Store House e guarde-a. A chave aparece uma única vez.
4. Copie a InfiniteTag/handle da mesma conta, sem o caractere `$`.

A API Key nunca deve ser enviada pelo chat, colocada em variável `VITE_*`, incluída no frontend ou commitada no GitHub.

## Variáveis de ambiente do servidor (Vercel)
Configure no projeto `mci-xpress`:

| Variável | Valor |
|---|---|
| `INFINITEPAY_ENABLED` | `true` |
| `INFINITEPAY_API_KEY` | API Key criada na InfinitePay (prefixo `inchk_`) |
| `INFINITEPAY_HANDLE` | InfiniteTag sem `$`, da mesma conta da chave |
| `APP_BASE_URL` | URL pública canônica da Store House, com `https://` e sem barra final |
| `SUPABASE_URL` | URL do projeto Supabase `mci-xpress` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret server-side já utilizado pelo backend |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key já utilizada para autenticar o comprador |

Não crie variáveis com prefixo `VITE_` para a API Key ou service role. Configure pelo menos Production e Preview conforme o ambiente que será testado.

## Endpoints usados
- Criar pedido e link: `POST /api/orders` (autenticado).
- Webhook: `POST /api/public/infinitepay-webhook`.
- Retorno do comprador: `/pagamento-retorno`.
- Verificação autoritativa do pagamento: chamada server-side a `POST https://api.checkout.infinitepay.io/payment_check`.

O webhook da InfinitePay não tem assinatura criptográfica. Por isso, o backend não confia no status recebido no corpo: consulta `payment_check` com order NSU, transaction NSU e slug antes de marcar o pedido como pago.

## Regras comerciais e valores
O navegador envia somente IDs de produtos e quantidades. O banco recalcula o preço:
- cliente: preço de cliente cadastrado;
- revendedor: preço de revenda cadastrado, quando existir;
- revendedor: maior regra de desconto por volume aplicável ao produto/quantidade, incluindo desconto por posição de unidade;
- os valores finais são gravados em `order_items.line_total` e `orders.total`;
- o checkout InfinitePay recebe esses valores convertidos em centavos, sem confiar em preços enviados pelo navegador.

O frete é enviado como item separado se `orders.shipping_amount` estiver preenchido. O checkout atual ainda não possui cotação/cálculo de frete nem aplicação de cupom; esses valores permanecem zero/não aplicados até a integração própria de frete/cupons ser concluída. Não configurar desconto Pix na InfinitePay em paralelo ao desconto da loja sem definir uma regra única para evitar desconto duplicado.

## Limitações oficiais importantes
- A InfinitePay usa checkout hospedado; não oferece checkout transparente, iframe, SDK de cartão ou QR Pix via API.
- Cartão permanece habilitado; Pix pode ser habilitado no link. O número de parcelas e a política de taxas são controlados na conta/checkout.
- Não existe sandbox. Um teste pela API cria um link real; o valor mínimo de pagamento é R$ 1,00.
- Estorno/cancelamento de pagamento é feito no App/Conta Web InfinitePay, não pela API de Checkout Integrado. Eventos de cancelamento/estorno sem assinatura não alteram automaticamente o pedido; exigem conciliação operacional.

## Teste controlado
1. Aplicar a migration `20261106120000_infinitepay_checkout.sql` no projeto Supabase correto `mci-xpress`.
2. Configurar as variáveis no Vercel e publicar uma Preview.
3. Usar uma conta de cliente e um produto publicado com estoque confirmado.
4. Conferir no pedido o total do banco e os itens/preços antes de seguir para a InfinitePay.
5. Criar um pagamento real de baixo valor (mínimo R$ 1,00), concluir Pix ou cartão e confirmar que webhook/retorno consultaram `payment_check`.
6. Verificar pedido pago, baixa única de estoque e criação de comissão de afiliado, quando houver atribuição.
7. Fazer eventual estorno manual na InfinitePay e executar a conciliação operacional correspondente.

A migration não deve ser aplicada antes de validar a Preview e confirmar o Supabase de destino.
