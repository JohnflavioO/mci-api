# Configuração de frete — MCI Store House

## Dados iniciais confirmados

- CEP de postagem/origem: 88313-000
- CNPJ remetente: 05.502.390/0002-00
- Jamef: Sandbox
- Correios: contrato informado como disponível
- Retirada: Armazém Sanco

## Estado da integração

O módulo `src/server/shipping/config.ts` centraliza as configurações exclusivamente no servidor e informa a prontidão de cada modalidade. Nenhuma credencial é enviada ao navegador.

- **Retirada no Armazém Sanco:** pode ser habilitada sem transportadora; ainda é necessário cadastrar endereço completo e instruções para exibição correta ao comprador.
- **Correios:** requer token de API e os códigos dos serviços de encomenda habilitados no contrato (por exemplo, PAC/SEDEX conforme o contrato real). O manual oficial informa que a cotação nacional recebe CEP de origem/destino, peso em gramas, tipo de objeto e dimensões para pacote. Não presumir códigos de serviço.
- **Jamef:** usar Sandbox até aprovação. A integração final depende do OpenAPI/Swagger e das credenciais emitidas no portal Jamef; não fixar endpoints ou payloads sem essa especificação.

## Variáveis privadas

Copiar as variáveis do arquivo `.env.example` para os Environment Variables do ambiente server-side (Vercel). Não adicionar prefixo `VITE_`, não commitar valores reais e não compartilhar tokens/senhas no chat.

## Dados ainda necessários para ativar as cotações

1. Correios: token/API key (armazenado diretamente no Vercel), códigos de serviço habilitados no contrato e DR/contrato, se exigidos pelo método de autenticação contratado.
2. Jamef: usuário e senha de Sandbox, URL base indicada pelo portal e arquivo OpenAPI/Swagger da API de cotação.
3. Retirada: endereço completo do Armazém Sanco e instruções/horários que devem aparecer no checkout.
4. Regra de embalagem: confirmar se cada produto será enviado em embalagem individual ou se haverá uma regra de consolidação em caixas. Não somar dimensões de produtos como se fossem uma única caixa sem regra logística.

## Segurança e ativação

- Manter Jamef em `sandbox` até testes e aprovação formal para produção.
- Não habilitar Correios enquanto token e serviços não estiverem validados.
- A cotação precisa acontecer no servidor, com preço/prazo retornados pela transportadora; o checkout deve persistir a modalidade e o valor selecionados antes de gerar o link InfinitePay.
- A migration de dimensões dos produtos e as migrations de dados de entrega devem estar aplicadas no projeto Supabase correto antes de depender desses campos em produção.
