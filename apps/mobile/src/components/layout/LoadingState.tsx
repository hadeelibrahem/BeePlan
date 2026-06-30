import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'

function SkeletonBlock({ className = '', color }: { className?: string; color: string }) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return <Animated.View style={{ opacity, backgroundColor: color }} className={`rounded-2xl ${className}`} />
}

type LoadingStateProps = {
  rows?: number
}

export function LoadingState({ rows = 4 }: LoadingStateProps) {
  const { theme } = useTheme()

  return (
    <View className="gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          className="rounded-3xl border p-4"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.card }}
        >
          <View className="flex-row items-center gap-3">
            <SkeletonBlock className="h-10 w-10" color={theme.colors.border} />
            <View className="flex-1 gap-2">
              <SkeletonBlock className="h-3 w-3/4" color={theme.colors.border} />
              <SkeletonBlock className="h-3 w-1/2" color={theme.colors.border} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}
