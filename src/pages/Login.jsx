import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabaseConfigurado } from '../lib/supabase'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const { error } = await login(email.trim(), senha)
    setCarregando(false)
    if (error) setErro('E-mail ou senha inválidos.')
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img className="login-logo" src="/logo-grantubos.png" alt="Grantubos" />
        <p className="center muted" style={{ marginBottom: 20, fontWeight: 700, letterSpacing: 1 }}>GRANVENDAS</p>

        {!supabaseConfigurado && (
          <div className="badge badge-erro" style={{ display: 'block', padding: 10, marginBottom: 14, textAlign: 'center' }}>
            Configure o arquivo .env com as chaves do Supabase.
          </div>
        )}

        <form onSubmit={entrar}>
          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendedor@grantubos.com" required />
          </div>
          <div className="field">
            <label>Senha</label>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" required />
          </div>
          {erro && <p className="badge badge-erro" style={{ display: 'block', padding: 8, marginBottom: 12, textAlign: 'center' }}>{erro}</p>}
          <button className="btn" disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}
