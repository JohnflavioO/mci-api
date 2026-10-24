# Recuperação de senha — configuração de e-mail Supabase

## Redirect URL obrigatória

No Supabase Dashboard, em **Authentication → URL Configuration**, inclua a URL de produção:

- Site URL: `https://mci-xpress.vercel.app`
- Redirect URL permitida: `https://mci-xpress.vercel.app/redefinir-senha`

Se o projeto estiver em domínio customizado, inclua também a URL equivalente nesse domínio. Para Preview do Vercel, adicione apenas URLs de preview confiáveis usadas em testes; não use wildcard amplo em produção.

## Template de e-mail recomendado

Em **Authentication → Email Templates → Reset Password**, use um assunto como:

`MCI Xpress | Redefina sua senha`

HTML recomendado:

```html
<div style="margin:0;padding:32px 12px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#15171b">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e5e8;border-radius:14px;overflow:hidden">
    <div style="padding:24px 32px;background:#15171b;color:#ffffff">
      <div style="font-size:22px;font-weight:800;letter-spacing:-.5px">MCI<span style="color:#ff6900">.</span> <span style="font-size:11px;letter-spacing:3px;color:#c4c7ce">XPRESS</span></div>
      <div style="margin-top:20px;color:#ff6900;font-size:11px;font-weight:700;letter-spacing:2px">SEGURANÇA DA CONTA</div>
      <h1 style="margin:10px 0 0;font-size:25px;line-height:1.25">Redefina sua senha</h1>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7">Recebemos uma solicitação para criar uma nova senha para sua conta MCI Xpress.</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7">Clique no botão abaixo para escolher uma senha nova. Se você não fez essa solicitação, ignore este e-mail; sua senha atual continuará válida.</p>
      <p style="margin:0 0 28px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;background:#15171b;color:#ffffff;text-decoration:none;border-radius:7px;font-size:14px;font-weight:700">Criar nova senha</a></p>
      <p style="margin:0;font-size:12px;line-height:1.7;color:#656b75">Por segurança, o link é temporário e pode ser usado apenas para redefinir a senha. Não compartilhe este e-mail.</p>
      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e7e9ed;font-size:11px;line-height:1.6;color:#8a9099">MCI Xpress · Portal de clientes e parceiros<br>Esta é uma mensagem automática; não responda a este e-mail.</div>
    </div>
  </div>
</div>
```

## Teste controlado

1. Cadastre uma conta de teste em `/cadastro?tipo=revendedor` usando um endereço de e-mail que você controla.
2. Confirme o e-mail recebido pelo fluxo de cadastro, se a confirmação estiver habilitada.
3. No Super Admin, aprove o cadastro de teste para validar o acesso ao portal.
4. Na tela de login, clique em **Esqueci minha senha**, solicite o e-mail e confira o layout em desktop e celular.
5. Abra o link e defina uma senha nova; valide o login com a senha atualizada.
6. Depois do teste, exclua a conta de teste pelo fluxo administrativo apropriado. A remoção do cadastro comercial não garante, por si só, a exclusão do usuário em `auth.users`; se for necessário remover completamente a conta, faça isso no Supabase Authentication como administrador autorizado.

**Não criar contas ou excluir usuários diretamente em produção sem autorização explícita e acesso administrativo.**
