import { isServer } from '@dcl/sdk/network'
// El registro de mensajes tiene que correr en ambos lados y antes de main().
import './shared/messages'
import './shared/schemas'

export async function main() {
  if (isServer()) {
    const { initServer } = await import('./server/server')
    await initServer()
    return
  }

  const { initClient } = await import('./client/setup')
  initClient()
}
