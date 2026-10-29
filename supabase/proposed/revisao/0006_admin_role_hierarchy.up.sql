-- Hierarquia administrativa do MCI Xpress
-- O papel legado "admin" permanece intacto e continua representando o acesso de Super Admin.
-- O novo papel "administrador" destina-se a contas administrativas com privilégios limitados.
-- Nenhuma conta existente é alterada automaticamente; nenhuma migration é aplicada ao banco por este arquivo.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrador';
