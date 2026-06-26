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
} from 'react-native';
import BeePlanLogo from '../components/BeePlanLogo';

interface AuthScreenProps {
  onSuccess: (email: string) => void;
  onForgotPassword?: () => void;
}

export default function AuthScreen({ onSuccess, onForgotPassword }: AuthScreenProps) {
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
            <BeePlanLogo size={64} showTagline />
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
                    <Pressable onPress={onForgotPassword}>
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
