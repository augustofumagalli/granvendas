import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { soDigitos, formataTelefone, numero } from '../lib/format'

export default function Configuracoes() {
  const { user, perfil, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFim, setHoraFim] = useState('18:00')
  const [metaVisitas, setMetaVisitas] = useState(8)

  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [salvandoExpediente, setSalvandoExpediente] = useState(false)

  // Condições de pagamento (compartilhadas entre gestor e vendedor)
  const CFORM_VAZIO = {
    codigo: '', nome: '', parcelas_manuais: false, parcelas_texto: '',
    prazo_maximo: '', num_parcelas: '', prazo_entre: '', primeira_a_vista: false,
    tipo_juros: 'Juros Simples',
    formas: { cheque: true, cartao: true, boleto: false, carteira: false, transferencia: true },
    inativa: false,
  }
  const [condicoes, setCondicoes] = useState([])
  const [cForm, setCForm] = useState(CFORM_VAZIO)
  const [cEditId, setCEditId] = useState(null)
  const [salvandoCond, setSalvandoCond] = useState(false)
  const setC = (campo, valor) => setCForm((f) => ({ ...f, [campo]: valor }))

  // Gera as parcelas (em dias) a partir do formulário
  function calcularParcelas(f) {
    if (f.parcelas_manuais) {
      return f.parcelas_texto
        .split(/[\/,;\s]+/)
        .map((x) => Number(String(x).replace(',', '.')))
        .filter((n) => Number.isFinite(n) && n >= 0)
    }
    const num = Number(f.num_parcelas) || 0
    const entre = Number(f.prazo_entre) || 0
    const arr = []
    for (let i = 1; i <= num; i++) arr.push(f.primeira_a_vista ? (i - 1) * entre : i * entre)
    return arr
  }
  const prazoMedio = (parc) =>
    parc.length ? Math.round((parc.reduce((s, d) => s + d, 0) / parc.length) * 100) / 100 : 0

  async function carregarCondicoes() {
    const { data } = await supabase
      .from('condicoes_pagamento')
      .select('*')
      .order('codigo', { ascending: true, nullsFirst: false })
      .order('criado_em', { ascending: true })
    setCondicoes(data || [])
  }

  function novaCondicao() {
    setCForm(CFORM_VAZIO)
    setCEditId(null)
  }

  function editarCondicao(c) {
    setCEditId(c.id)
    setCForm({
      codigo: c.codigo ?? '',
      nome: c.nome || '',
      parcelas_manuais: !!c.parcelas_manuais,
      parcelas_texto: Array.isArray(c.parcelas) ? c.parcelas.join('/') : '',
      prazo_maximo: c.prazo_maximo ?? '',
      num_parcelas: c.num_parcelas ?? '',
      prazo_entre: c.prazo_entre ?? '',
      primeira_a_vista: !!c.primeira_a_vista,
      tipo_juros: c.tipo_juros || 'Juros Simples',
      formas: {
        cheque: (c.formas || []).includes('cheque'),
        cartao: (c.formas || []).includes('cartao'),
        boleto: (c.formas || []).includes('boleto'),
        carteira: (c.formas || []).includes('carteira'),
        transferencia: (c.formas || []).includes('transferencia'),
      },
      inativa: c.ativo === false,
    })
  }

  async function gravarCondicao() {
    const nome = cForm.nome.trim()
    if (!nome) { toast('Informe a descrição da condição'); return }
    const parcelas = calcularParcelas(cForm)
    const registro = {
      nome,
      codigo: cForm.codigo === '' ? null : Number(cForm.codigo),
      tipo: 'dias',
      parcelas,
      parcelas_manuais: cForm.parcelas_manuais,
      prazo_maximo: cForm.prazo_maximo === '' ? null : Number(cForm.prazo_maximo),
      num_parcelas: cForm.num_parcelas === '' ? null : Number(cForm.num_parcelas),
      prazo_entre: cForm.prazo_entre === '' ? null : Number(cForm.prazo_entre),
      primeira_a_vista: cForm.primeira_a_vista,
      tipo_juros: cForm.tipo_juros,
      formas: Object.keys(cForm.formas).filter((k) => cForm.formas[k]),
      prazo_medio: prazoMedio(parcelas),
      ativo: !cForm.inativa,
    }
    setSalvandoCond(true)
    const { error } = cEditId
      ? await supabase.from('condicoes_pagamento').update(registro).eq('id', cEditId)
      : await supabase.from('condicoes_pagamento').insert(registro)
    setSalvandoCond(false)
    if (error) { toast('Erro ao gravar condição'); return }
    toast(cEditId ? 'Condição atualizada' : 'Condição adicionada')
    novaCondicao()
    carregarCondicoes()
  }

  async function excluirCondicao() {
    if (!cEditId) { toast('Selecione uma condição na lista para excluir'); return }
    if (!window.confirm('Excluir esta condição de pagamento?')) return
    const { error } = await supabase.from('condicoes_pagamento').delete().eq('id', cEditId)
    if (error) { toast('Erro ao excluir'); return }
    toast('Condição excluída')
    novaCondicao()
    carregarCondicoes()
  }

  useEffect(() => {
    async function carregar() {
      if (!user) return
      setLoading(true)
      const [rPerfil, rConfig] = await Promise.all([
        supabase.from('perfis').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('configuracoes').select('*').eq('perfil_id', user.id).maybeSingle(),
      ])
      if (rPerfil.error || rConfig.error) toast('Erro ao carregar configurações')
      if (rPerfil.data) {
        setNome(rPerfil.data.nome || '')
        setTelefone(rPerfil.data.telefone || '')
      }
      if (rConfig.data) {
        setHoraInicio(rConfig.data.hora_inicio || '08:00')
        setHoraFim(rConfig.data.hora_fim || '18:00')
        setMetaVisitas(rConfig.data.meta_visitas ?? 8)
      }
      await carregarCondicoes()
      setLoading(false)
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function salvarPerfil() {
    if (!nome.trim()) {
      toast('Informe seu nome')
      return
    }
    setSalvandoPerfil(true)
    const { error } = await supabase
      .from('perfis')
      .update({
        nome: nome.trim(),
        telefone: telefone ? soDigitos(telefone) : null,
      })
      .eq('id', user.id)
    setSalvandoPerfil(false)
    toast(error ? 'Erro ao salvar perfil' : 'Perfil salvo')
  }

  async function salvarExpediente() {
    setSalvandoExpediente(true)
    const { error } = await supabase
      .from('configuracoes')
      .upsert(
        {
          perfil_id: user.id,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
          meta_visitas: Number(metaVisitas) || 0,
        },
        { onConflict: 'perfil_id' },
      )
    setSalvandoExpediente(false)
    toast(error ? 'Erro ao salvar expediente' : 'Expediente salvo')
  }

  if (loading) {
    return (
      <div>
        <div className="section-title mb">Configurações</div>
        <div className="center"><div className="spin" /></div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-title mb">Configurações</div>

      {perfil?.papel === 'gestor' && (
        <div className="card mb">
          <div className="section-title">Gestão</div>
          <div className="row mt">
            <button className="btn btn-azul grow" onClick={() => navigate('/equipe')}>
              + Cadastrar vendedor
            </button>
          </div>
        </div>
      )}

      <div className="card mb">
        <div className="section-title">Perfil</div>
        <div className="field">
          <label>Nome</label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="field">
          <label>Telefone</label>
          <input
            type="text"
            inputMode="numeric"
            value={formataTelefone(telefone)}
            onChange={(e) => setTelefone(soDigitos(e.target.value))}
          />
        </div>
        <div className="row mt">
          <button className="btn btn-verde grow" onClick={salvarPerfil} disabled={salvandoPerfil}>
            {salvandoPerfil ? <span className="spin" /> : 'Salvar perfil'}
          </button>
        </div>
      </div>

      <div className="card mb">
        <div className="section-title">Expediente</div>
        <div className="row">
          <div className="field grow">
            <label>Hora de início</label>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          </div>
          <div className="field grow">
            <label>Hora de fim</label>
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Meta de visitas por dia</label>
          <input
            type="number"
            min="0"
            value={metaVisitas}
            onChange={(e) => setMetaVisitas(e.target.value)}
          />
        </div>
        <div className="muted mt">
          Depois do horário de fim, a plataforma avisa para desligar e parar de contar KM.
        </div>
        <div className="row mt">
          <button className="btn btn-verde grow" onClick={salvarExpediente} disabled={salvandoExpediente}>
            {salvandoExpediente ? <span className="spin" /> : 'Salvar expediente'}
          </button>
        </div>
      </div>

      <div className="card mb">
        <div className="section-title">Condição de pagamento</div>
        <div className="muted mb">
          Cadastre as condições. Ficam disponíveis para todos (gestor e vendedor) ao montar um orçamento.
        </div>

        <div className="row">
          <div className="field" style={{ maxWidth: 110 }}>
            <label>Código</label>
            <input type="number" value={cForm.codigo} onChange={(e) => setC('codigo', e.target.value)} />
          </div>
          <div className="field grow">
            <label>Descrição</label>
            <input
              type="text"
              placeholder="Ex.: À VISTA, 30/60/90 DIAS…"
              value={cForm.nome}
              onChange={(e) => setC('nome', e.target.value)}
            />
          </div>
        </div>

        <label className="row" style={{ alignItems: 'center', gap: 8, margin: '4px 0' }}>
          <input type="checkbox" checked={cForm.parcelas_manuais} onChange={(e) => setC('parcelas_manuais', e.target.checked)} />
          <span>Parcelas informadas manualmente</span>
        </label>

        {cForm.parcelas_manuais ? (
          <div className="field">
            <label>Parcelas (dias, separadas por / )</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ex.: 30/60/90"
              value={cForm.parcelas_texto}
              onChange={(e) => setC('parcelas_texto', e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="row">
              <div className="field grow">
                <label>Nº Parcelas</label>
                <input type="number" min="0" value={cForm.num_parcelas} onChange={(e) => setC('num_parcelas', e.target.value)} />
              </div>
              <div className="field grow">
                <label>Prazo entre parc. (dias)</label>
                <input type="number" min="0" value={cForm.prazo_entre} onChange={(e) => setC('prazo_entre', e.target.value)} />
              </div>
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field grow">
                <label>Prazo máximo parcela (dias)</label>
                <input type="number" min="0" value={cForm.prazo_maximo} onChange={(e) => setC('prazo_maximo', e.target.value)} />
              </div>
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={cForm.primeira_a_vista} onChange={(e) => setC('primeira_a_vista', e.target.checked)} />
                <span>1ª parcela à vista</span>
              </label>
            </div>
          </>
        )}

        <div className="field">
          <label>Tipo juros</label>
          <select value={cForm.tipo_juros} onChange={(e) => setC('tipo_juros', e.target.value)}>
            <option>Juros Simples</option>
            <option>Juros Compostos</option>
            <option>Sem juros</option>
          </select>
        </div>

        <div className="field">
          <label>Formas de pagamento permitidas</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {[
              ['cheque', 'Cheque'],
              ['cartao', 'Cartão'],
              ['boleto', 'Boleto'],
              ['carteira', 'Carteira'],
              ['transferencia', 'Transferência'],
            ].map(([k, lbl]) => (
              <label key={k} className="row" style={{ alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={!!cForm.formas[k]}
                  onChange={(e) => setC('formas', { ...cForm.formas, [k]: e.target.checked })}
                />
                <span>{lbl}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="row" style={{ alignItems: 'center', gap: 8, margin: '4px 0' }}>
          <input type="checkbox" checked={cForm.inativa} onChange={(e) => setC('inativa', e.target.checked)} />
          <span>Condição de pagamento inativa?</span>
        </label>

        <div className="row mt">
          <button className="btn btn-outline" onClick={novaCondicao} disabled={salvandoCond}>Novo</button>
          <button className="btn btn-verde grow" onClick={gravarCondicao} disabled={salvandoCond}>
            {salvandoCond ? <span className="spin" /> : cEditId ? 'Gravar alterações' : 'Gravar'}
          </button>
          <button className="btn btn-outline" onClick={excluirCondicao} disabled={salvandoCond || !cEditId} style={{ color: '#c0392b', borderColor: '#e6b0aa' }}>
            Excluir
          </button>
        </div>

        <div className="section-title mt">Condições cadastradas</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '6px 6px' }}>Descrição</th>
                <th style={{ padding: '6px 6px', textAlign: 'right' }}>Cód.</th>
                <th style={{ padding: '6px 6px', textAlign: 'right' }}>Nº Parc.</th>
                <th style={{ padding: '6px 6px', textAlign: 'right' }}>Prazo entre</th>
                <th style={{ padding: '6px 6px', textAlign: 'right' }}>Prazo Médio</th>
              </tr>
            </thead>
            <tbody>
              {condicoes.length === 0 ? (
                <tr><td colSpan={5} className="muted" style={{ padding: '10px 6px' }}>Nenhuma condição cadastrada ainda.</td></tr>
              ) : (
                condicoes.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => editarCondicao(c)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: cEditId === c.id ? 'var(--surface-2, #eef2f6)' : 'transparent' }}
                  >
                    <td style={{ padding: '6px 6px' }}>
                      {c.nome}{c.ativo === false ? ' (inativa)' : ''}
                    </td>
                    <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>{c.codigo ?? '—'}</td>
                    <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>{c.num_parcelas ?? (Array.isArray(c.parcelas) ? c.parcelas.length : 0)}</td>
                    <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>{c.prazo_entre ?? '—'}</td>
                    <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>{c.prazo_medio != null ? numero(c.prazo_medio, 0) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Sobre</div>
        <div className="list-item">
          <div className="grow">
            <div className="title">GranVendas v1.0 · Grantubos</div>
            <div className="sub">{user?.email || '—'}</div>
          </div>
        </div>
        <div className="row mt">
          <button className="btn btn-outline grow" onClick={logout}>Sair</button>
        </div>
      </div>
    </div>
  )
}
