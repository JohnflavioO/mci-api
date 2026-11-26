# Ampliação Store House Pontos

Esta etapa introduz apenas contratos de domínio e testes, sem ligação ao checkout ou ao banco. O programa existente permanece inalterado. Proposta: regras independentes para cliente final e revendedor, pausa global e opções separadas de desconto e brinde. Revendedor começa desabilitado; 1 ponto por R$100 e R$1 por ponto são valores iniciais propostos, não configuração de produção.

## Próxima etapa: persistência e autorização
O SQL existente usa uma configuração singleton e exclui revendedores em loyalty_max_redeem, resgate e trigger de pedido pago. Revisar todos esses caminhos, APIs e interfaces em conjunto. Determinar público por dados confiáveis do servidor, nunca por escolha do cliente. Preservar saldo e lotes existentes. Definir política para mudança de público e valor monetário de pontos antigos antes de ativar.

## Brindes
Catálogo administrativo: nome, imagem, descrição, custo interno, pontos, estoque, elegibilidade, ativo. Custo interno nunca exposto ao cliente. Resgate deve ser transacional: validar elegibilidade, saldo liberado, estoque e preço no servidor; consumir lotes por vencimento, reservar estoque e registrar identificador idempotente. Cancelamento autorizado devolve estoque e pontos uma única vez, preservando vencimentos originais. Estados: solicitado, preparação, enviado/retirada, entregue, cancelado. Definir frete e retirada antes de publicar. Separar integralmente de afiliados.

## Critérios de aceite
Testar concorrência, saldo insuficiente, estoque esgotado, duplicidade, cancelamento, vencimento, isolamento entre usuários, pausa global, desconto desabilitado e regressão do checkout. Migrações e ativação dependem de aprovação e homologação.
