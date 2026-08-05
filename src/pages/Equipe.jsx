import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

export default function Equipe() {
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [vendedores, setVendedores] = useState([])
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('papel', 'vendedor')
      .order('nome', { ascending: true })
    if (error) toast('Erro ao carregar vendedores')
    setVendedores(data || [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function cadastrar() {
    if (!nome.trim()) {
      toast('Informe o nome')
      return
    }
    if (!email.trim()) {
      toast('Informe o e-mail')
      return
    }
    if (!senha.trim()) {
      toast('Informe a senha')
      return
    }
    setSalvando(true)
    const { data, error } = await supabase.functions.invoke('criar-vendedor', {
      body: { nome: nome.trim(), email: email.trim(), senha },
    })
    setSalvando(false)
    if (error || data?.error) {
      toast(data?.error || error?.message || 'Erro ao cadastrar vendedor')
      return
    }
    toast('Vendedor cadastrado!')
    setNome('')
    setEmail('')
    setSenha('')
    carregar()
  }

  return (
    <div>
      <div className="section-title mb">Equipe</div>

      <div className="card mb">
        <div className="section-title">Novo vendedor</div>
        <div className="field">
          <label>Nome</label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="field">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        <div className="row mt">
          <button className="btn btn-verde grow" onClick={cadastrar} disabled={salvando}>
            {salvando ? <span className="spin" /> : 'Cadastrar vendedor'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Vendedores</div>
        {loading ? (
          <div className="center"><div className="spin" /></div>
        ) : vendedores.length === 0 ? (
          <div className="empty">Nenhum vendedor cadastrado ainda.</div>
        ) : (
          vendedores.map((v) => (
            <div key={v.id} className="list-item">
              <div className="grow">
                <div className="title">{v.nome || '—'}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
