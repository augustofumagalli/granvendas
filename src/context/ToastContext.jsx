import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null)
  const toast = useCallback((texto) => {
    setMsg(texto)
    setTimeout(() => setMsg(null), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  )
}
