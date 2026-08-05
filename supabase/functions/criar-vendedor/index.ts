// Edge Function: criar-vendedor
// Cria um usuário vendedor. Somente um usuário com papel 'gestor' pode chamar.
// Fluxo:
//   1. Valida o JWT do chamador (verify_jwt = true no deploy).
//   2. Confere que o chamador tem papel 'gestor' na tabela perfis.
//   3. Usa a service_role para criar o usuário (email + senha) já confirmado.
//   4. O trigger on_auth_user_created_granvendas cria o perfil (nome vem do metadata,
//      papel default 'vendedor'). Fazemos um upsert de segurança caso o trigger não rode.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'Configuração do servidor incompleta' }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) return json({ error: 'Não autenticado' }, 401)

  // Cliente no contexto do chamador — para descobrir quem é e conferir o papel.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'Não autenticado' }, 401)

  const { data: perfil, error: perfilErr } = await userClient
    .from('perfis')
    .select('papel')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (perfilErr) return json({ error: 'Erro ao verificar permissão' }, 500)
  if (perfil?.papel !== 'gestor') {
    return json({ error: 'Apenas o gestor pode cadastrar vendedores' }, 403)
  }

  // Corpo da requisição.
  let body: { nome?: string; email?: string; senha?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }
  const nome = (body?.nome || '').trim()
  const email = (body?.email || '').trim().toLowerCase()
  const senha = body?.senha || ''
  if (!nome) return json({ error: 'Informe o nome' }, 400)
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'E-mail inválido' }, 400)
  }
  if (!senha || senha.length < 6) {
    return json({ error: 'A senha deve ter ao menos 6 caracteres' }, 400)
  }

  // Cliente admin (service_role) — cria o usuário.
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (createErr || !created?.user) {
    const msg = /already|registered|exists|duplicate/i.test(createErr?.message || '')
      ? 'Já existe um usuário com este e-mail'
      : createErr?.message || 'Erro ao criar vendedor'
    return json({ error: msg }, 400)
  }

  // Garante o perfil correto (o trigger já deve ter criado; upsert é rede de segurança).
  const newId = created.user.id
  const { error: upErr } = await adminClient
    .from('perfis')
    .upsert({ id: newId, nome, papel: 'vendedor' }, { onConflict: 'id' })
  if (upErr) {
    return json({ error: 'Vendedor criado, mas houve erro ao salvar o perfil' }, 500)
  }

  return json({ ok: true, id: newId })
})
