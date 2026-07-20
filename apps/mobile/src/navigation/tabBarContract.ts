import type { MainTabParamList } from './types'

export const TAB_ROUTES = ['Dashboard', 'Tasks', 'Focus', 'Reminders', 'People'] as const satisfies readonly (keyof MainTabParamList)[]

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
