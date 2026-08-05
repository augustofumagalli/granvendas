import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { soDigitos, formataTelefone } from '../lib/format'

export default function Configuracoes() {
  const { user, logout } = useAuth()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFim, setHoraFim] = useState('18:00')
  const [metaVisitas, setMetaVisitas] = useState(8)

  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [salvandoExpediente, setSalvandoExpediente] = useState(false)

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
      setLoading(false)
    }
    carregar()
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
