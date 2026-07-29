import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTheme } from '../../../theme/useTheme';
import { isValidRadiusMeters, validateRadiusMetersText } from '../utils/radiusValidation';

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export function RadiusMetersInput({ value, onChange }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (isValidRadiusMeters(value)) setText(String(value));
  }, [value]);

  const error = validateRadiusMetersText(text);

  const handleChange = (next: string) => {
    setText(next);
    onChange(/^\d+$/.test(next) ? Number(next) : Number.NaN);
  };

  return (
    <View>
      <Text
        className="mb-2 text-xs font-black uppercase tracking-widest"
        style={{ color: colors.secondaryText }}
      >
        Radius (meters)
      </Text>
      <View className="flex-row items-center">
        <TextInput
          accessibilityLabel="Radius (meters)"
          value={text}
          onChangeText={handleChange}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: error ? colors.error : colors.border,
            backgroundColor: colors.input,
            color: colors.text,
          }}
        />
        <Text className="ml-2 text-sm font-semibold" style={{ color: colors.secondaryText }}>
          m
        </Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="mt-1.5 text-xs font-semibold" style={{ color: colors.error }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
