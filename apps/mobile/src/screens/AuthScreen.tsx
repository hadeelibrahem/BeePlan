import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

interface AuthScreenProps {
  onSuccess: (email: string) => void;
}

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (isSignUp && !name.trim()) {
      newErrors.name = 'Full name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (isSignUp) {
      if (!confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password';
      } else if (confirmPassword !== password) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    setIsLoading(true);
    // Simulate API Request
    setTimeout(() => {
      setIsLoading(false);
      onSuccess(email);
    }, 1200);
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setErrors({});
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#2B323F]"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        className="px-6"
      >
        <View className="py-10">
          {/* Logo / Brand Header */}
          <View className="items-center mb-8">
            {/* Minimal Geometric Honeycomb Bee Logo */}
            <GlowingIcon />

            <Text className="text-3xl font-extrabold text-white tracking-tight">
              Bee<Text className="text-[#FDEF4B]">Plan</Text>
            </Text>
            <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.18em] mt-2">
              SMART PRODUCTIVITY
            </Text>
          </View>

          {/* Form Card */}
          <View className="bg-[#353D4E] rounded-3xl p-6 border border-[#434D62] shadow-2xl">
            {/* Header within card */}
            <Text className="text-2xl font-bold text-white text-center">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text className="text-sm text-[#8C9BAE] text-center mt-2 mb-6">
              {isSignUp
                ? 'Start organizing your reminders and plans with BeePlan.'
                : 'Sign in to manage your reminders, tasks, and smart plans.'}
            </Text>

            {/* Inputs Container */}
            <View className="gap-4">
              {/* Full Name Input (Sign Up Only) */}
              {isSignUp && (
                <View>
                  <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider mb-2">
                    Full Name
                  </Text>
                  <View
                    className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border ${
                      errors.name ? 'border-red-500' : 'border-[#434D62]'
                    }`}
                  >
                    <TextInput
                      placeholder="e.g. John Doe"
                      placeholderTextColor="#64748B"
                      value={name}
                      onChangeText={setName}
                      className="text-white text-base"
                    />
                  </View>
                  {errors.name && (
                    <Text className="text-red-400 text-xs mt-1 ml-1">{errors.name}</Text>
                  )}
                </View>
              )}

              {/* Email Input */}
              <View>
                <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider mb-2">
                  Email Address
                </Text>
                <View
                  className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border ${
                    errors.email ? 'border-red-500' : 'border-[#434D62]'
                  }`}
                >
                  <TextInput
                    placeholder="name@example.com"
                    placeholderTextColor="#64748B"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="text-white text-base"
                  />
                </View>
                {errors.email && (
                  <Text className="text-red-400 text-xs mt-1 ml-1">{errors.email}</Text>
                )}
              </View>

              {/* Password Input */}
              <View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider">
                    Password
                  </Text>
                  {!isSignUp && (
                    <Pressable>
                      <Text className="text-xs font-semibold text-[#FDEF4B]">
                        Forgot Password?
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View
                  className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border flex-row justify-between items-center ${
                    errors.password ? 'border-red-500' : 'border-[#434D62]'
                  }`}
                >
                  <TextInput
                    placeholder="Enter password"
                    placeholderTextColor="#64748B"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="text-white text-base flex-1"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Text className="text-xs font-semibold text-[#8C9BAE] px-2">
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </Text>
                  </Pressable>
                </View>
                {errors.password && (
                  <Text className="text-red-400 text-xs mt-1 ml-1">{errors.password}</Text>
                )}
              </View>

              {/* Confirm Password Input (Sign Up Only) */}
              {isSignUp && (
                <View>
                  <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider mb-2">
                    Confirm Password
                  </Text>
                  <View
                    className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border ${
                      errors.confirmPassword ? 'border-red-500' : 'border-[#434D62]'
                    }`}
                  >
                    <TextInput
                      placeholder="Re-enter password"
                      placeholderTextColor="#64748B"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="text-white text-base"
                    />
                  </View>
                  {errors.confirmPassword && (
                    <Text className="text-red-400 text-xs mt-1 ml-1">
                      {errors.confirmPassword}
                    </Text>
                  )}
                </View>
              )}

              {/* Submit CTA Button */}
              <Pressable
                onPress={handleSubmit}
                disabled={isLoading}
                className={`h-14 rounded-2xl bg-[#FDEF4B] items-center justify-center mt-4 shadow-lg shadow-[#FDEF4B]/20 active:opacity-90 ${
                  isLoading ? 'opacity-70' : ''
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="#2B323F" />
                ) : (
                  <Text className="text-[#2B323F] font-bold text-base uppercase tracking-wider">
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Divider */}
            <View className="flex-row items-center my-6">
              <View className="flex-1 h-px bg-[#434D62]" />
              <Text className="text-[#8C9BAE] text-xs font-semibold uppercase tracking-wider px-3">
                or continue with
              </Text>
              <View className="flex-1 h-px bg-[#434D62]" />
            </View>

            {/* Social Authentication Buttons */}
            <View className="flex-row gap-3">
              {/* Google Button */}
              <Pressable className="flex-1 h-12 border border-[#434D62] bg-[#2B323F] rounded-2xl flex-row items-center justify-center active:bg-[#353D4E]">
                {/* Custom Google Logo drawing using layout */}
                <View className="flex-row items-center">
                  <View className="w-5 h-5 rounded-full bg-white mr-2 items-center justify-center">
                    <Text className="text-xs font-black text-[#2B323F]">G</Text>
                  </View>
                  <Text className="text-white font-semibold text-sm">Google</Text>
                </View>
              </Pressable>

              {/* Apple Button */}
              <Pressable className="flex-1 h-12 border border-[#434D62] bg-[#2B323F] rounded-2xl flex-row items-center justify-center active:bg-[#353D4E]">
                {/* Apple icon representation */}
                <View className="flex-row items-center">
                  <View className="w-5 h-5 rounded-full bg-white mr-2 items-center justify-center">
                    <Text className="text-xs font-black text-[#2B323F]">A</Text>
                  </View>
                  <Text className="text-white font-semibold text-sm">Apple</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Bottom Switch Toggle */}
          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-[#8C9BAE] text-sm">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <Pressable onPress={toggleMode}>
              <Text className="text-[#FDEF4B] text-sm font-bold underline">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GlowingIcon() {
  return (
    <View style={logoStyles.wrapper}>
      <View style={logoStyles.glow} />

      <View style={logoStyles.mark}>
        <View style={logoStyles.stripesBox}>
          <View style={[logoStyles.stripe, logoStyles.stripeFull]} />
          <View style={[logoStyles.stripe, logoStyles.stripeFiveSixths]} />
          <View style={[logoStyles.stripe, logoStyles.stripeTwoThirds]} />
        </View>
      </View>

      <View style={[logoStyles.dot, logoStyles.dotLeft]} />
      <View style={[logoStyles.dot, logoStyles.dotRight]} />
    </View>
  );
}

const logoStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
    width: 64,
  },
  glow: {
    backgroundColor: '#FDEF4B',
    borderRadius: 16,
    bottom: 0,
    left: 0,
    opacity: 0.2,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: [{ rotate: '45deg' }],
  },
  mark: {
    alignItems: 'center',
    backgroundColor: '#FDEF4B',
    borderRadius: 12,
    elevation: 10,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#FDEF4B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    transform: [{ rotate: '12deg' }],
    width: 48,
  },
  stripesBox: {
    height: 32,
    justifyContent: 'space-between',
    paddingVertical: 4,
    width: 32,
  },
  stripe: {
    backgroundColor: '#2B323F',
    borderRadius: 3,
    height: 6,
  },
  stripeFull: {
    width: 32,
  },
  stripeFiveSixths: {
    alignSelf: 'center',
    width: 27,
  },
  stripeTwoThirds: {
    alignSelf: 'center',
    width: 21,
  },
  dot: {
    backgroundColor: '#FDEF4B',
    borderRadius: 3,
    height: 6,
    position: 'absolute',
    top: -4,
    width: 6,
  },
  dotLeft: {
    left: 16,
  },
  dotRight: {
    right: 16,
  },
});
