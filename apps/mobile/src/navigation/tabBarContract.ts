import type { MainTabParamList } from './types'

/** Persistent, high-frequency destinations. Other tab routes remain mounted for
 * linking and state preservation, and are exposed from the More sheet. */
export const TAB_ROUTES = ['Dashboard', 'Tasks', 'Focus'] as const satisfies readonly (keyof MainTabParamList)[]

export function pressTab(
  active: boolean,
  routeName: keyof MainTabParamList,
  routeKey: string,
  emit: () => { defaultPrevented: boolean },
  navigate: (name: keyof MainTabParamList) => void,
) {
  const event = emit()
  if (!active && !event.defaultPrevented) navigate(routeName)
}
