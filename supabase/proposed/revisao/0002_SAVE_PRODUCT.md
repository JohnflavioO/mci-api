# Migration 0002 — proposta de gravação transacional

**Não aplicada no Supabase.** Requer a `0001_catalog.up.sql` **revisada (v2)** neste diretório, não a versão original. A 0001 permanece intacta. Não há integração de gravação nas telas, mudança na Oracle, configuração ou publicação.

## Arquivos
- `0002_save_product.up.sql`: RPC, travamento e versão do agregado, checagens de preços adiadas, validação da publicação sobre o estado final e permissão das sequências identity.
- `0002_save_product.down.sql`: remove a RPC e os triggers adicionados e restaura as checagens anteriores, sem apagar produtos ou resetar versões. USAGE das sequências é preservado porque também é necessário para inserções administrativas da 0001; EXECUTE do trigger de integridade permanece revogado. Reverter 0002 antes de 0001; nenhuma operação usa CASCADE.
- `../../tests/0002_save_product.test.sql`: testes de regras/rollback/autorização.
- `../../tests/run_0002_local.py`: cria seu próprio PostgreSQL descartável por socket local, sem aceitar URL externa, simula Auth/RLS e remove o cluster ao terminar. Requer PostgreSQL no PATH e usuário não-root; como root, usa o usuário local `pgt` e troca UID/GID no subprocesso. Nunca lê credenciais PG do ambiente.

## Contrato para futura chamada do frontend (não integrada)
Usar sessão real do **Supabase próprio** de um administrador; o token da Oracle não autentica esta RPC. Não usar chave secret/service_role. Papel verificado em `user_roles` por `has_role`, nunca no navegador.

```ts
const { data, error } = await getSupabase().rpc('save_product', {
  p_id: productId,                       // null para criar
  p_expected_row_version: rowVersion,     // null para criar
  p_data: {
    name: 'Produto', brand: '', sku: 'SKU-001', category: 'Iluminação',
    description: null, status: 'draft',
    pricing: { currency: 'BRL', customerPrice: 100, resellerPrice: 70 },
    images: [{ url: 'https://seu-dominio.example/produto.jpg', position: 0 }],
    specs: [{ label: 'Potência', value: '100 W' }],
  },
});
if (error) {
  // 40001: recarregar e reconciliar; nunca repetir automaticamente com nova versão.
  // 42501: sessão/papel insuficiente; 23505: duplicidade; 23514: regra de negócio.
  // 22023: formato/parâmetros inválidos; P0002: produto não encontrado.
  throw error;
}
// data = { id: UUID, rowVersion: inteiro }; reler o catálogo para obter modelo da tela.
```

Snapshot **completo**, não PATCH: todos os campos do exemplo são obrigatórios; `sku`, `category`, `description` e ambos os preços aceitam null. Listas vazias removem todos os itens anteriores. Campos extras são rejeitados (incluindo autoria, rowVersion, sourceUrl e papéis). Metadados de origem não são editados pela RPC; autoria segue triggers da 0001. Não enviar IDs internos de imagens/specs: são recriados. Preços devem ser números JSON, BRL, de 0 a 9.999.999.999,99, com até duas casas decimais; não há arredondamento silencioso. Textos são aparados nos campos curtos, preservando descrição. SKU/categoria em branco tornam-se null.

Atualização exige UUID e versão >= 1. A função trava o produto **antes** de comparar a versão, inclusive sob concorrência. O retorno é a versão final do agregado: ela pode avançar **mais de uma unidade** por chamada, pois cada alteração de produto/filho a incrementa. Não calcular `versão + 1` no cliente. Reenvio do snapshot também incrementa a versão; não existe deduplicação/idempotency key nesta proposta.

Também são cobertas escritas diretas de produto/preços/specs/imagens: filhos travam o pai antes de escrever e atualizam sua versão após inserir/atualizar/excluir; preços não podem trocar `product_id`. Isto detecta versões antigas, mas **escrita direta não exige versão esperada**: futuros clientes devem usar somente a RPC para edição otimista. Metadados administrativos não fazem parte do snapshot versionado desta função.

`save_product` é **SECURITY INVOKER**, com `search_path = pg_catalog, public`, autorização explícita e EXECUTE somente para `authenticated`. RLS continua obrigatório e restringe usuários comuns; a RPC não eleva privilégios. O SECURITY DEFINER existente no trigger de integridade da 0001 foi preservado com caminho fixo e sem execução pública; não há nova RPC privilegiada nem flag cliente para pular validação.

Erros propagam e revertem a chamada inteira, incluindo produto, preços, metadados e filhos; sequências PostgreSQL podem ter lacunas após rollback (normal). Restrições adiadas validam o estado final ao **commit** da requisição RPC. Dentro de uma transação SQL manual, não tratar o retorno da função como confirmação antes do commit. Valores antigos de preços não impedem transições válidas de ambos os preços para cima/baixo. SKU único, rótulos e posições únicos e limites 20/100 também são impostos pelo banco.

## Testes e pendências
```sh
python3 supabase/tests/run_0002_local.py
bunx vitest run
bun backend/test/unit/errors.test.ts
```

O teste local usa PostgreSQL real descartável, roles/Auth simulados, dois clientes concorrentes (RPC vs RPC e filho direto vs RPC), rollback após escrita, limites, publicação, preços, SKU, permissões e down/up com preservação de dados. **Não valida Supabase Auth/PostgREST real.** Os testes Oracle de integração não devem ser executados: requerem staging autorizado e contrariariam o escopo desta etapa.

Pendências: revisão/aprovação para aplicar 0001 revisada + 0002 no ambiente escolhido; validação de autenticação/RLS/RPC através de PostgREST real; integração futura das gravações no frontend em etapa separada. Nada disso foi executado nesta etapa.
