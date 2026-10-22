# Correção da prévia autenticada
- [x] Identificar a ausência de login real e confirmar que o endpoint administrativo responde 401 sem credenciais.
- [x] Integrar o login existente e encaminhar a sessão à prévia, sem alterar o backend nem salvar produtos.
- [x] Executar 15 testes e verificar no navegador a exigência de login e a abertura do formulário administrativo, sem erros.
- [x] Login e prévia autenticados na VPS confirmados pelo usuário.

# Investigação do erro ao salvar
- [x] Comparar payload e erros já registrados: brand null provoca 400; brand preenchida, SKU 5542, categoria Iluminação, preços 4210/2500, specs vazias e imagem posicionada provocam 500 em draft e published. O schema implantado não está disponível localmente.
- [x] Corrigir apenas brand null para string sem inventar valor; executar 18 testes isolados, incluindo propagação do 500. Nenhuma chamada externa ou gravação foi feita nesta investigação.
- [x] Identificar que apiFetch preserva error, mas descarta fields; os 500 observados só contêm error: Erro interno, portanto não há detalhe do 500 ocultado pelo frontend.
- [ ] Confirmar a causa do 500: aguarda schema/handler implantado de POST /api/v1/admin/products/import e log sanitizado da falha já ocorrida na VPS. Não alterar backend/banco/autenticação nem considerar o salvamento corrigido sem essa evidência.
# Módulo de produtos (API própria + Oracle)
- [x] Auditoria: backend/ local só tem /health; login, prévia e importação existem só na VPS.
- [ ] Listagem, consulta, criação/edição, importação e publicação reais: aguarda código atual do backend da VPS e DDL das tabelas Oracle de produtos/preços/specs/imagens.

# Migration 0002 proposta (Supabase próprio)
- [x] Criar save_product transacional, controle de versão e permissões, sem execução externa.
- [x] Criar e executar testes em PostgreSQL local descartável: 45 verificações SQL, dois cenários concorrentes e down/up.
- [x] Documentar chamada futura do frontend e reversão; manter telas e Oracle intactos.
- [ ] Aplicação e validação real: aguardam aprovação explícita para executar 0001 revisada + 0002 e testar Auth/PostgREST no ambiente escolhido.

# Cadastro de revendedores
- [x] Formulário com CNPJ/IE por UF validados, pedido Pendente, revisão admin (aprovar/rejeitar/solicitar documentação) e portal liberado só com papel revendedor.
- [ ] Aplicar 0001 v2 + 0003 no Supabase: aguarda aprovação explícita.
- [ ] Consulta automática de situação cadastral: aguarda fonte oficial contratada (hoje é conferência manual obrigatória antes de aprovar).
