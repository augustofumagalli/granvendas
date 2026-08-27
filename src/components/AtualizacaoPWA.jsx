import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/*
  Mostra um aviso quando há uma versão nova do app publicada.
  Ao tocar em "Atualizar", ativa o novo service worker e recarrega,
  trazendo a versão nova sem o usuário precisar fechar o app manualmente.

  O navegador só procura versão nova ao recarregar a página — num PWA que
  fica aberto o dia todo isso nunca acontece. Por isso o próprio app checa
  a cada 15 minutos e sempre que volta ao primeiro plano.
*/
const CHECAGEM_MS = 15 * 60 * 1000

export default function AtualizacaoPWA() {
  const [precisaAtualizar, setPrecisaAtualizar] = useState(false)
  const atualizarRef = useRef(null)

  useEffect(() => {
    let timer = null
    atualizarRef.current = registerSW({
      onNeedRefresh() { setPrecisaAtualizar(true) },
      onRegisteredSW(_url, reg) {
        if (!reg) return
        const checar = () => reg.update().catch(() => {})
        timer = setInterval(checar, CHECAGEM_MS)
        document.addEventListener('visibilitychange', function checarAoVoltar() {
          if (document.visibilityState === 'visible') checar()
        })
        checar()
      },
    })
    return () => { if (timer) clearInterval(timer) }
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
