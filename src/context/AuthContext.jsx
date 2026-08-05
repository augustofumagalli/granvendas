import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setPerfil(null); return }
    supabase.from('perfis').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setPerfil(data))
  }, [session])

  const login = (email, senha) => supabase.auth.signInWithPassword({ email, password: senha })
  const logout = () => supabase.auth.signOut()

  return (
    <AuthCtx.Provider value={{ session, user: session?.user, perfil, carregando, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}
