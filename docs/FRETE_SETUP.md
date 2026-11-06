# Configuração de frete — MCI Store House

## Dados iniciais confirmados

- CEP de origem: 88313-000
- CNPJ remetente: 05.502.390/0002-00
- Jamef: Sandbox
- Filial Jamef de origem: Itajaí/SC — CNPJ 20.147.617/0056-15; CEP 88318-112; Rodovia Antônio Heil, 6.250, KM 06, Galpão B, Blocos 29 e 30, Itaipava.
- CNPJ da filial é identificação cadastral da unidade transportadora; remetente permanece MCI (05.502.390/0002-00). Não usar o código `02` do exemplo de Belo Horizonte.
- Correios: contrato disponível; credenciais CWS a cadastrar
- Retirada: Armazém Sanco

## Correios — secrets necessários

Cadastrar diretamente como Environment Variables privadas na Vercel:

- `CORREIOS_USUARIO`: login do portal CWS
- `CORREIOS_CODIGO_ACESSO`: código curto gerado em “Gerar código de acesso às API's”; não é a chave longa do portal
- `CORREIOS_CARTAO_POSTAGEM`: número do cartão de postagem
- `CORREIOS_CONTRATO`: número do contrato
- `CORREIOS_DR`: diretoria regional (DR)
- `CORREIOS_SERVICE_CODES`: códigos dos serviços contratados que serão cotados

O módulo lê esses nomes exatos e mantém os valores apenas no servidor. O fluxo de autenticação/token e a cotação só devem ser ativados após validar a especificação CWS correspondente à conta.

## Jamef

- `JAMEF_USERNAME`: usuário do portal/API
- `JAMEF_PASSWORD`: senha de acesso (somente em secret server-side)
- `JAMEF_ENVIRONMENT=sandbox`
- `JAMEF_API_BASE_URL`: URL de Sandbox indicada no portal
- Filial de origem configurada por dados cadastrais de Itajaí; nenhum código interno de filial foi presumido.
- `JAMEF_ENABLED=false` até confirmar a API de cotação e testar autenticação

**Segurança:** a imagem enviada contém uma senha de acesso Jamef legível. Como ela foi compartilhada em uma conversa, recomendo alterá-la imediatamente no portal e cadastrar a nova senha somente nas variáveis privadas da Vercel. Não vou copiar a senha para o repositório, logs ou respostas.

## Ativação

- Correios permanece desabilitado até que os secrets e códigos de serviço sejam cadastrados e validados.
- Jamef permanece em Sandbox e desabilitado até receber URL/base e autenticação validadas da API de cotação. Os dados cadastrais da filial de Itajaí já estão registrados; não presumir código interno de filial.
- Retirada precisa do endereço completo e instruções/horários do Armazém Sanco.
- Confirmar regra de embalagem para combinar itens de um mesmo pedido.
- A cotação deve ser calculada no servidor, persistida no pedido e somada ao total antes da criação do checkout InfinitePay.
