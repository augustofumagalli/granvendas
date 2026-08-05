import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Produtos from './pages/Produtos'
import Clientes from './pages/Clientes'
import Orcamentos from './pages/Orcamentos'
import Visitas from './pages/Visitas'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'
import Equipe from './pages/Equipe'

function Protegida({ children }) {
  const { session, carregando } = useAuth()
  if (carregando) return <div className="spin" />
  if (!session) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const { session } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protegida><Home /></Protegida>} />
      <Route path="/produtos" element={<Protegida><Produtos /></Protegida>} />
      <Route path="/clientes" element={<Protegida><Clientes /></Protegida>} />
      <Route path="/orcamentos" element={<Protegida><Orcamentos /></Protegida>} />
      <Route path="/visitas" element={<Protegida><Visitas /></Protegida>} />
      <Route path="/relatorios" element={<Protegida><Relatorios /></Protegida>} />
      <Route path="/configuracoes" element={<Protegida><Configuracoes /></Protegida>} />
      <Route path="/equipe" element={<Protegida><Equipe /></Protegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
