-- Permissões administrativas delegadas. A autorização efetiva deve ser validada no servidor.
CREATE TABLE IF NOT EXISTS public.admin_user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'custom'
    CHECK (access_level IN ('admin_general', 'operations', 'custom')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(permissions) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_user_permissions ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso direto via cliente; operações administrativas usam API de servidor
-- autenticada e autorizada. service_role ignora RLS.
DROP POLICY IF EXISTS "admin user permissions deny client access" ON public.admin_user_permissions;
CREATE POLICY "admin user permissions deny client access"
  ON public.admin_user_permissions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.admin_user_permissions IS
  'Permissões granulares dos administradores delegados. Gerenciada exclusivamente por API de servidor.';
