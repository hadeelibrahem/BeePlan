import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

const YELLOW = '#FDEF4B';
const DARK = '#2B323F';
const WHITE = '#FFFFFF';
const MUTED = '#8C9BAE';

type BeePlanLogoProps = {
  size?: number;
  iconOnly?: boolean;
  showTagline?: boolean;
  style?: ViewStyle;
};

function px(size: number, value: number) {
  return (size * value) / 64;
}

function BeeIcon({ size }: { size: number }) {
  const body = px(size, 34);
  const bodyLeft = px(size, 15);
  const bodyTop = px(size, 20);

  return (
    <View style={[styles.icon, { height: size, width: size }]}>
      <View
        style={[
          styles.glow,
          {
            borderRadius: px(size, 18),
            height: px(size, 46),
            left: px(size, 9),
            top: px(size, 15),
            width: px(size, 46),
          },
        ]}
      />

      <View
        style={[
          styles.body,
          {
            borderRadius: px(size, 7),
            height: body,
            left: bodyLeft,
            top: bodyTop,
            width: body,
          },
        ]}
      />

      <View
        style={[
          styles.stripesLayer,
          {
            height: body,
            left: bodyLeft,
            top: bodyTop,
            width: body,
          },
        ]}
      >
        <View
          style={[
            styles.stripe,
            {
              borderRadius: px(size, 2),
              height: px(size, 4.5),
              width: px(size, 17),
            },
          ]}
        />
        <View
          style={[
            styles.stripe,
            {
              borderRadius: px(size, 2),
              height: px(size, 4.5),
              width: px(size, 21),
            },
          ]}
        />
        <View
          style={[
            styles.stripe,
            {
              borderRadius: px(size, 2),
              height: px(size, 4.5),
              width: px(size, 24),
            },
          ]}
        />
      </View>

      <View
        style={[
          styles.dot,
          {
            borderRadius: px(size, 2.2),
            height: px(size, 4.4),
            left: px(size, 22),
            top: px(size, 12),
            width: px(size, 4.4),
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            borderRadius: px(size, 2.2),
            height: px(size, 4.4),
            left: px(size, 38),
            top: px(size, 12),
            width: px(size, 4.4),
          },
        ]}
      />
    </View>
  );
}

export default function BeePlanLogo({
  size = 48,
  iconOnly = false,
  showTagline = false,
  style,
}: BeePlanLogoProps) {
  if (iconOnly) {
    return (
      <View style={style}>
        <BeeIcon size={size} />
      </View>
    );
  }

  return (
    <View style={[styles.logo, style]}>
      <BeeIcon size={size} />
      <Text style={[styles.wordmark, { fontSize: Math.round(size * 0.38), marginTop: px(size, 3) }]}>
        Bee<Text style={styles.wordmarkAccent}>Plan</Text>
      </Text>
      {showTagline && (
        <Text style={[styles.tagline, { fontSize: Math.round(size * 0.11), marginTop: px(size, 5) }]}>
          SMART PRODUCTIVITY
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    alignItems: 'center',
  },
  icon: {
    position: 'relative',
  },
  glow: {
    backgroundColor: YELLOW,
    opacity: 0.18,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  body: {
    backgroundColor: YELLOW,
    elevation: 10,
    position: 'absolute',
    shadowColor: YELLOW,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    transform: [{ rotate: '14deg' }],
  },
  stripesLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    transform: [{ rotate: '14deg' }],
  },
  stripe: {
    backgroundColor: DARK,
    marginVertical: 1.5,
  },
  dot: {
    backgroundColor: YELLOW,
    position: 'absolute',
  },
  wordmark: {
    color: WHITE,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  wordmarkAccent: {
    color: YELLOW,
  },
  tagline: {
    color: MUTED,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
