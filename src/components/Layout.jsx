import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useExpediente } from '../context/ExpedienteContext'

const itens = [
  { to: '/', ico: '🏠', label: 'Início', end: true },
  { to: '/orcamentos', ico: '📄', label: 'Orçamentos' },
  { to: '/visitas', ico: '📍', label: 'Visitas' },
  { to: '/produtos', ico: '📦', label: 'Produtos' },
  { to: '/clientes', ico: '🤝', label: 'Clientes' }
]

export default function Layout({ children }) {
  const { perfil, logout } = useAuth()
  const { ligada } = useExpediente()
  const nav = useNavigate()

  return (
    <div className="app-shell">
      <header className="topbar">
        <img src="/logo-branco.png" alt="Grantubos" onError={(e) => { e.target.src = '/logo-grantubos.png' }} />
        <div className="spacer" />
        {ligada && <span className="badge badge-verde" style={{ marginRight: 8 }}>● Em rota</span>}
        <button className="btn-ghost" style={{ color: '#fff' }} onClick={() => nav('/relatorios')} title="Relatórios">📊</button>
        <button className="btn-ghost" style={{ color: '#fff' }} onClick={() => nav('/configuracoes')} title="Configurações">⚙️</button>
        <button className="btn-ghost" style={{ color: '#fff' }} onClick={logout} title="Sair">⏻</button>
      </header>
      <main className="content">{children}</main>
      <nav className="bottom-nav">
        {itens.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{i.ico}</span>
            {i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
