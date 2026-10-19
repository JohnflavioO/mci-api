# Correção da prévia autenticada
- [x] Identificar a ausência de login real e confirmar que o endpoint administrativo responde 401 sem credenciais.
- [x] Integrar o login existente e encaminhar a sessão à prévia, sem alterar o backend nem salvar produtos.
- [x] Executar 15 testes e verificar no navegador a exigência de login e a abertura do formulário administrativo, sem erros.
- [ ] Validar login e prévia autenticados contra a VPS: bloqueado por ausência de sessão administrativa; formato da resposta de sucesso ainda não confirmado. O administrador deve entrar pela tela e buscar um link real, sem salvar.