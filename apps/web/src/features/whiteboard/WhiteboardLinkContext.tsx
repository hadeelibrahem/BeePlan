import { createContext, useContext, type ReactNode } from 'react'

export type WhiteboardLinkContextValue = {
  onOpen: (url: string) => void
  onCopy: (url: string) => Promise<void>
  onEdit: (shapeId: string, url: string, title: string) => void
}

const Context = createContext<WhiteboardLinkContextValue | null>(null)

export function WhiteboardLinkProvider({ value, children }: { value: WhiteboardLinkContextValue; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useWhiteboardLinkContext() { return useContext(Context) }
