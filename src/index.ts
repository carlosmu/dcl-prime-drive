import { isServer } from '@dcl/sdk/network'
// Message registration must run on both sides and before main().
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
