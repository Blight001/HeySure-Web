import { RemoteWebMirrorSession, type RwmTransport } from './remoteWebMirrorSession'

export type { RwmTransport } from './remoteWebMirrorSession'

export const useRemoteWebMirror = (transport: RwmTransport) => {
  const session = new RemoteWebMirrorSession(transport)
  return {
    phase: session.phase, errorMessage: session.errorMessage, actionMessage: session.actionMessage,
    pageId: session.pageId, attachDocument: (document: Document) => session.attachDocument(document),
    start: () => session.start(), stop: () => session.stop(),
  }
}
