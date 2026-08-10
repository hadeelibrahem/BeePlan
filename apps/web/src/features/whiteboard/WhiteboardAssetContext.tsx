import { createContext, useContext, type ReactNode } from 'react'
import type { WhiteboardAsset } from './api/whiteboardApi'

type WhiteboardAssetContextValue = {
  assets: WhiteboardAsset[]
  onOpen: (asset: WhiteboardAsset) => Promise<void>
  onRemoveShape: (shapeId: string) => void
}

const Context = createContext<WhiteboardAssetContextValue | null>(null)

export function WhiteboardAssetProvider({ value, children }: { value: WhiteboardAssetContextValue; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useWhiteboardAssetContext() {
  return useContext(Context)
}
