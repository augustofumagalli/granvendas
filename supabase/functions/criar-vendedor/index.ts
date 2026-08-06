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

  let vendedorId: string
  let atualizado = false

  if (createErr || !created?.user) {
    const jaExiste = /already|registered|exists|duplicate/i.test(createErr?.message || '')
    if (!jaExiste) {
      return json({ error: createErr?.message || 'Erro ao criar vendedor' }, 400)
    }

    // E-mail já existe: localiza o usuário e o adota (atualiza nome + senha), em vez de travar.
    const existente = await acharUsuarioPorEmail(adminClient, email)
    if (!existente) {
      return json({ error: 'Já existe um usuário com este e-mail' }, 400)
    }
    const { error: updErr } = await adminClient.auth.admin.updateUserById(existente.id, {
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (updErr) {
      return json({ error: 'Vendedor já existe e não foi possível atualizá-lo: ' + updErr.message }, 500)
    }
    vendedorId = existente.id
    atualizado = true
  } else {
    vendedorId = created.user.id
  }

  // Garante o perfil correto (o trigger já deve ter criado; upsert é rede de segurança).
  const { error: upErr } = await adminClient
    .from('perfis')
    .upsert({ id: vendedorId, nome, papel: 'vendedor' }, { onConflict: 'id' })
  if (upErr) {
    return json({ error: 'Vendedor salvo, mas houve erro ao salvar o perfil' }, 500)
  }

  return json({ ok: true, id: vendedorId, atualizado })
})

// Procura um usuário pelo e-mail percorrendo as páginas do Admin API.
async function acharUsuarioPorEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const alvo = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const achado = (data?.users || []).find((u) => (u.email || '').toLowerCase() === alvo)
    if (achado) return { id: achado.id, email: achado.email ?? undefined }
    if (!data?.users || data.users.length < 200) break // última página
  }
  return null
}
