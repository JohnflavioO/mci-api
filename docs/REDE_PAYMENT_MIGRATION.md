# Migração de InfinitePay para Rede

Fase 1: seleção exclusivamente no servidor. CHECKOUT_PROVIDER ausente ou infinitepay preserva o fluxo atual; rede ou qualquer outro valor bloqueia novos checkouts (503), sem fallback. Não configurar rede antes da implementação e homologação. Nenhuma alteração de banco nesta fase.

A interface atual pressupõe checkout por URL. Confirmar com a documentação contratada da Rede se será necessário um fluxo diferente (tokenização, 3DS, Pix, parcelamento). Não coletar nem armazenar dados de cartão no servidor sem desenho de segurança e conformidade adequado.

Antes da virada: revisar restrições de provider no banco, reconciliação, webhooks, estornos, links pendentes, idempotência e concorrência; homologar totais, frete, pontos, afiliados e descontos. Preparar painel administrativo apenas após definir mecanismo seguro de ativação. Uma única operadora para novas vendas, sem fallback automático. Preservar conciliação e estornos históricos InfinitePay até liquidar pendências. Não aplicar migrations sem aprovação.
