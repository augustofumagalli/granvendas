import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/*
  Mostra um aviso quando há uma versão nova do app publicada.
  Ao tocar em "Atualizar", ativa o novo service worker e recarrega,
  trazendo a versão nova sem o usuário precisar fechar o app manualmente.
*/
export default function AtualizacaoPWA() {
  const [precisaAtualizar, setPrecisaAtualizar] = useState(false)
  const atualizarRef = useRef(null)

  useEffect(() => {
    atualizarRef.current = registerSW({
      onNeedRefresh() { setPrecisaAtualizar(true) },
    })
  }, [])

  if (!precisaAtualizar) return null

  return (
    <div className="pwa-update">
      <span>Nova versão disponível.</span>
      <button
        className="btn btn-sm btn-verde"
        onClick={() => atualizarRef.current && atualizarRef.current(true)}
      >
        Atualizar
      </button>
    </div>
  )
}
