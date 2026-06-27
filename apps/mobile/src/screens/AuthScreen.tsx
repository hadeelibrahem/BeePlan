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
import { signUp } from '../lib/api';
import {
  getPasswordStrength,
  hasNoErrors,
  validateSignIn,
  validateSignUp,
  type AuthErrors,
} from '../lib/authValidation';

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
  const [errors, setErrors] = useState<AuthErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const signUpFields = { name, email, password, confirmPassword };
  const passwordStrength = getPasswordStrength(password);
  const isSignUpValid = hasNoErrors(validateSignUp(signUpFields));
  const isSubmitDisabled = isLoading || (isSignUp && !isSignUpValid);

  const validate = () => {
    const newErrors = isSignUp ? validateSignUp(signUpFields) : validateSignIn(email, password);
    setErrors(newErrors);
    return hasNoErrors(newErrors);
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSuccessMessage('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      if (isSignUp) {
        await signUp({ fullName: name.trim(), email: email.trim(), password });
        setSuccessMessage('Account created successfully.');
        setTimeout(() => onSuccess(email), 700);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 900));
        onSuccess(email);
      }
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      setSubmitError(
        error instanceof Error
          ? error.message
          : isSignUp
            ? 'Sign up failed. Please try again.'
            : 'Sign in failed. Please try again.',
      );
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setErrors({});
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setSubmitError('');
    setSuccessMessage('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#0E1116]"
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
          <View className="rounded-3xl border border-[#272D36] bg-[#15181E] p-6 shadow-2xl">
            {/* Header within card */}
            <Text className="text-2xl font-bold text-white text-center">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text className="mb-6 mt-2 text-center text-sm text-[#A1A7B3]">
              {isSignUp
                ? 'Start organizing your reminders and plans with BeePlan.'
                : 'Sign in to manage your reminders, tasks, and smart plans.'}
            </Text>

            {/* Inputs Container */}
            <View className="gap-4">
              {/* Full Name Input (Sign Up Only) */}
              {isSignUp && (
                <View>
                  <Text className="mb-2 text-xs font-black uppercase tracking-widest text-[#7F8794]">
                    Full Name
                  </Text>
                  <View
                    className={`rounded-2xl border bg-[#0E1116] px-4 py-3.5 ${
                      errors.name ? 'border-red-500' : 'border-[#272D36]'
                    }`}
                  >
                    <TextInput
                      placeholder="e.g. John Doe"
                      placeholderTextColor="#64748B"
                      value={name}
                      onChangeText={(value) => {
                        setName(value);
                        setErrors((previous) => ({
                          ...previous,
                          name: isSignUp && !value.trim() ? 'Full name is required' : undefined,
                        }));
                        setSubmitError('');
                        setSuccessMessage('');
                      }}
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
                <Text className="mb-2 text-xs font-black uppercase tracking-widest text-[#7F8794]">
                  Email Address
                </Text>
                <View
                  className={`rounded-2xl border bg-[#0E1116] px-4 py-3.5 ${
                    errors.email ? 'border-red-500' : 'border-[#272D36]'
                  }`}
                >
                  <TextInput
                    placeholder="name@example.com"
                    placeholderTextColor="#64748B"
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      setErrors((previous) => ({
                        ...previous,
                        email: validateSignUp({ ...signUpFields, email: value }).email,
                      }));
                      setSubmitError('');
                      setSuccessMessage('');
                    }}
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
                  <Text className="text-xs font-black uppercase tracking-widest text-[#7F8794]">
                    Password
                  </Text>
                  {!isSignUp && (
                    <Pressable onPress={onForgotPassword}>
                      <Text className="text-xs font-semibold text-[#F5C542]">
                        Forgot Password?
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View
                  className={`flex-row items-center justify-between rounded-2xl border bg-[#0E1116] px-4 py-3.5 ${
                    errors.password ? 'border-red-500' : 'border-[#272D36]'
                  }`}
                >
                  <TextInput
                    placeholder="Enter password"
                    placeholderTextColor="#64748B"
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      setErrors((previous) => ({
                        ...previous,
                        password: isSignUp
                          ? validateSignUp({ ...signUpFields, password: value }).password
                          : undefined,
                        confirmPassword:
                          isSignUp && confirmPassword && confirmPassword !== value
                            ? 'Passwords do not match'
                            : undefined,
                      }));
                      setSubmitError('');
                      setSuccessMessage('');
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="text-white text-base flex-1"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Text className="px-2 text-xs font-semibold text-[#A1A7B3]">
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </Text>
                  </Pressable>
                </View>
                {errors.password && (
                  <Text className="text-red-400 text-xs mt-1 ml-1">{errors.password}</Text>
                )}
                {isSignUp && password && (
                  <Text className="ml-1 mt-1 text-xs text-[#A1A7B3]">
                    Password strength: <Text className="text-white font-bold">{passwordStrength}</Text>
                  </Text>
                )}
              </View>

              {/* Confirm Password Input (Sign Up Only) */}
              {isSignUp && (
                <View>
                  <Text className="mb-2 text-xs font-black uppercase tracking-widest text-[#7F8794]">
                    Confirm Password
                  </Text>
                  <View
                    className={`rounded-2xl border bg-[#0E1116] px-4 py-3.5 ${
                      errors.confirmPassword ? 'border-red-500' : 'border-[#272D36]'
                    }`}
                  >
                    <TextInput
                      placeholder="Re-enter password"
                      placeholderTextColor="#64748B"
                      value={confirmPassword}
                      onChangeText={(value) => {
                        setConfirmPassword(value);
                        setErrors((previous) => ({
                          ...previous,
                          confirmPassword:
                            validateSignUp({ ...signUpFields, confirmPassword: value }).confirmPassword,
                        }));
                        setSubmitError('');
                        setSuccessMessage('');
                      }}
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
              {submitError && (
                <Text className="text-red-400 text-xs mt-1 ml-1">{submitError}</Text>
              )}
              {successMessage && (
                <Text className="text-emerald-400 text-xs mt-1 ml-1">{successMessage}</Text>
              )}

              {/* Submit CTA Button */}
              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                className={`mt-4 h-14 items-center justify-center rounded-2xl bg-[#F5C542] shadow-lg shadow-[#F5C542]/20 active:opacity-90 ${
                  isSubmitDisabled ? 'opacity-70' : ''
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="#121820" />
                ) : (
                  <Text className="text-base font-bold uppercase tracking-wider text-[#121820]">
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Divider */}
            <View className="flex-row items-center my-6">
              <View className="h-px flex-1 bg-[#272D36]" />
              <Text className="px-3 text-xs font-semibold uppercase tracking-wider text-[#A1A7B3]">
                or continue with
              </Text>
              <View className="h-px flex-1 bg-[#272D36]" />
            </View>

            {/* Social Authentication Buttons */}
            <View className="flex-row gap-3">
              {/* Google Button */}
              <Pressable className="h-12 flex-1 flex-row items-center justify-center rounded-2xl border border-[#272D36] bg-[#0E1116] active:bg-[#15181E]">
                {/* Custom Google Logo drawing using layout */}
                <View className="flex-row items-center">
                  <View className="w-5 h-5 rounded-full bg-white mr-2 items-center justify-center">
                    <Text className="text-xs font-black text-[#121820]">G</Text>
                  </View>
                  <Text className="text-white font-semibold text-sm">Google</Text>
                </View>
              </Pressable>

              {/* Apple Button */}
              <Pressable className="h-12 flex-1 flex-row items-center justify-center rounded-2xl border border-[#272D36] bg-[#0E1116] active:bg-[#15181E]">
                {/* Apple icon representation */}
                <View className="flex-row items-center">
                  <View className="w-5 h-5 rounded-full bg-white mr-2 items-center justify-center">
                    <Text className="text-xs font-black text-[#121820]">A</Text>
                  </View>
                  <Text className="text-white font-semibold text-sm">Apple</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Bottom Switch Toggle */}
          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-sm text-[#A1A7B3]">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <Pressable onPress={toggleMode}>
              <Text className="text-sm font-bold text-[#F5C542] underline">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
