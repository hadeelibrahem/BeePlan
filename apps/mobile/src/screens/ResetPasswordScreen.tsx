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
import BeePlanLogo from '../components/BeePlanLogo';
import { useAuth } from '../hooks/useAuth';

// ─── Brand constants ─────────────────────────────────────────────────────────
const YELLOW = '#FDEF4B';
const DARK_BG = '#2B323F';
const CARD_BG = '#353D4E';
const BORDER = '#434D62';
const MUTED = '#8C9BAE';

interface ResetPasswordScreenProps {
  initialEmail?: string;
  initialCode?: string;
  /** Navigate back to Sign In after success or if user changes mind */
  onBack: () => void;
}

// ─── BeeLogo Component ───────────────────────────────────────────────────────
// ─── Password Strength helper ─────────────────────────────────────────────────
function getStrength(pwd: string): { label: string; color: string; pct: number } | null {
  if (!pwd) return null;
  const len = pwd.length;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /\d/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  const score = (len >= 6 ? 1 : 0) + (len >= 10 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (score <= 1) return { label: 'Weak', color: '#EF4444', pct: 0.25 };
  if (score <= 3) return { label: 'Fair', color: YELLOW, pct: 0.6 };
  return { label: 'Strong', color: '#34D399', pct: 1 };
}

export default function ResetPasswordScreen({ initialEmail = '', initialCode = '', onBack }: ResetPasswordScreenProps) {
  const { updatePassword, verifyRecoveryCode } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [codeVerified, setCodeVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const strength = getStrength(password);

  const handleVerifyCode = async () => {
    const e: { [k: string]: string } = {};
    if (!email.trim()) e.email = 'Email address is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Please enter a valid email';
    if (!code.trim()) e.code = 'Reset code is required';
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSubmitError('');
    setIsLoading(true);
    try {
      await verifyRecoveryCode(email, code);
      setErrors({});
      setCodeVerified(true);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      setSubmitError(err instanceof Error ? err.message : 'Invalid or expired reset code. Please request a new code.');
    }
  };

  const handleSubmit = async () => {
    const e: { [k: string]: string } = {};
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    if (!confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (confirmPassword !== password) e.confirmPassword = 'Passwords do not match';
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSubmitError('');
    setIsLoading(true);
    try {
      await updatePassword(password);
      setIsLoading(false);
      setIsDone(true);
      setTimeout(onBack, 1000);
    } catch (err) {
      setIsLoading(false);
      setSubmitError(err instanceof Error ? err.message : 'Unable to update password. Please open the reset link again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Dot-grid background pattern */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 15 }).map((_, row) =>
          Array.from({ length: 8 }).map((_, col) => (
            <View
              key={`${row}-${col}`}
              style={{
                position: 'absolute',
                top: row * 54 + 14,
                left: col * 54 + 14,
                width: 2,
                height: 2,
                borderRadius: 1,
                backgroundColor: YELLOW,
                opacity: 0.06,
              }}
            />
          ))
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* Brand Header */}
          <BeePlanLogo size={50} showTagline style={styles.logoMark} />

          {isDone ? (
            /* ── Success State ── */
            <View style={styles.successBlock}>
              {/* Animated checkmark (static in RN — drawn via SVG-like shapes) */}
              <View style={styles.checkCircle}>
                <View style={styles.checkMarkL} />
                <View style={styles.checkMarkR} />
              </View>

              <Text style={styles.heading}>Password Updated!</Text>
              <Text style={styles.subText}>
                Your BeePlan password has been reset successfully. Opening your workspace...
              </Text>

              <Pressable
                style={({ pressed }) => [styles.primaryBtn, { marginTop: 8 }, pressed && { opacity: 0.85 }]}
                onPress={onBack}
              >
                <Text style={styles.primaryBtnText}>Open BeePlan</Text>
              </Pressable>
            </View>
          ) : (
            /* ── Password Form ── */
            <>
              {/* Shield icon */}
              <View style={styles.iconBox}>
                <View style={styles.shieldOuter}>
                  <View style={styles.shieldInner} />
                </View>
              </View>

              <Text style={styles.heading}>{codeVerified ? 'Create New Password' : 'Enter Reset Code'}</Text>
              <Text style={styles.subText}>
                {codeVerified
                  ? 'Choose a strong password to protect your BeePlan account.'
                  : 'Enter the code we sent to your email before creating a new password.'}
              </Text>

              {codeVerified ? (
                <>
              {/* New Password */}
              <Text style={styles.inputLabel}>NEW PASSWORD</Text>
              <View style={[styles.inputWrap, !!errors.password && { borderColor: '#EF4444' }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter new password"
                  placeholderTextColor="#556070"
                  value={password}
                  onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: '' })); setSubmitError(''); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
                <Pressable onPress={() => setShowPassword(s => !s)} hitSlop={8}>
                  <Text style={styles.showHide}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                </Pressable>
              </View>
              {!!errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

              {/* Strength Bar */}
              {strength && (
                <View style={styles.strengthRow}>
                  <View style={styles.strengthTrack}>
                    <View style={[styles.strengthFill, { width: `${strength.pct * 100}%` as any, backgroundColor: strength.color }]} />
                  </View>
                  <Text style={styles.strengthLabel}>
                    Strength: <Text style={{ color: '#fff', fontWeight: '700' }}>{strength.label}</Text>
                  </Text>
                </View>
              )}

              {/* Confirm Password */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>CONFIRM NEW PASSWORD</Text>
              <View style={[styles.inputWrap, !!errors.confirmPassword && { borderColor: '#EF4444' }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter new password"
                  placeholderTextColor="#556070"
                  value={confirmPassword}
                  onChangeText={v => { setConfirmPassword(v); setErrors(p => ({ ...p, confirmPassword: '' })); setSubmitError(''); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
              {!!errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
              {!!submitError && <Text style={styles.errorText}>{submitError}</Text>}

              {/* Password Requirements hint */}
              <View style={styles.requirementsBox}>
                <Text style={styles.requirementText}>• At least 8 characters</Text>
                <Text style={styles.requirementText}>• Mix of uppercase, numbers &amp; symbols for best security</Text>
              </View>

              {/* CTA */}
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, { marginTop: 20 }, pressed && { opacity: 0.85 }]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                {isLoading
                  ? <ActivityIndicator color={DARK_BG} />
                  : <Text style={styles.primaryBtnText}>Update Password</Text>
                }
              </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                  <View style={[styles.inputWrap, !!errors.email && { borderColor: '#EF4444' }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="name@example.com"
                      placeholderTextColor="#556070"
                      value={email}
                      onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: '' })); setSubmitError(''); }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      returnKeyType="next"
                    />
                  </View>
                  {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>RESET CODE</Text>
                  <View style={[styles.inputWrap, !!errors.code && { borderColor: '#EF4444' }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter the code from your email"
                      placeholderTextColor="#556070"
                      value={code}
                      onChangeText={v => { setCode(v); setErrors(p => ({ ...p, code: '' })); setSubmitError(''); }}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyCode}
                    />
                  </View>
                  {!!errors.code && <Text style={styles.errorText}>{errors.code}</Text>}
                  {!!submitError && <Text style={styles.errorText}>{submitError}</Text>}
                  {!!initialCode && (
                    <Text style={styles.devCodeText}>
                      Development code: {initialCode}
                    </Text>
                  )}

                  <Pressable
                    style={({ pressed }) => [styles.primaryBtn, { marginTop: 20 }, pressed && { opacity: 0.85 }]}
                    onPress={handleVerifyCode}
                    disabled={isLoading}
                  >
                    {isLoading
                      ? <ActivityIndicator color={DARK_BG} />
                      : <Text style={styles.primaryBtnText}>Verify Code</Text>
                    }
                  </Pressable>
                </>
              )}

              {/* Back link */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Changed your mind? </Text>
                <Pressable onPress={onBack}>
                  <Text style={styles.footerLink}>Back to Sign In</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: CARD_BG,
    borderRadius: 28,
    paddingHorizontal: 26,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    alignItems: 'center',
  },

  // ── Brand ──
  logoMark: {
    marginBottom: 22,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 6,
    marginBottom: 22,
  },

  // ── Logo ──
  logoWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoDiamond: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: YELLOW,
    opacity: 0.18,
    transform: [{ rotate: '45deg' }],
  },
  logoBee: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '32deg' }, { translateX: -1 }, { translateY: 2 }],
    shadowColor: YELLOW,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  stripesContainer: {
    alignItems: 'flex-start',
    gap: 3,
    transform: [{ rotate: '-32deg' }],
  },
  stripe: {
    height: 2,
    backgroundColor: DARK_BG,
    borderRadius: 2,
  },
  antennaDot: {
    position: 'absolute',
    top: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: YELLOW,
  },

  // ── Icon Box ──
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: `${YELLOW}18`,
    borderWidth: 1,
    borderColor: `${YELLOW}40`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  shieldOuter: {
    width: 24,
    height: 26,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldInner: {
    width: 14,
    height: 16,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: `${YELLOW}30`,
    borderWidth: 1.5,
    borderColor: DARK_BG,
  },

  // ── Checkmark (success) ──
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  checkMarkL: {
    position: 'absolute',
    width: 14,
    height: 3,
    backgroundColor: YELLOW,
    borderRadius: 2,
    bottom: 24,
    left: 14,
    transform: [{ rotate: '45deg' }],
  },
  checkMarkR: {
    position: 'absolute',
    width: 24,
    height: 3,
    backgroundColor: YELLOW,
    borderRadius: 2,
    bottom: 26,
    right: 10,
    transform: [{ rotate: '-52deg' }],
  },

  // ── Content ──
  heading: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  subText: {
    color: MUTED,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 10,
  },

  // ── Input ──
  inputLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  inputWrap: {
    width: '100%',
    backgroundColor: DARK_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 0,
  },
  showHide: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingLeft: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 11,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingLeft: 4,
  },
  devCodeText: {
    color: YELLOW,
    fontSize: 11,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingLeft: 4,
    fontWeight: '700',
  },

  // ── Strength Bar ──
  strengthRow: {
    width: '100%',
    marginTop: 8,
    gap: 4,
  },
  strengthTrack: {
    height: 4,
    width: '100%',
    backgroundColor: BORDER,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    color: MUTED,
    fontSize: 10,
  },

  // ── Requirements ──
  requirementsBox: {
    width: '100%',
    marginTop: 12,
    gap: 3,
    paddingLeft: 4,
  },
  requirementText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
  },

  // ── Buttons ──
  primaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: YELLOW,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  primaryBtnText: {
    color: DARK_BG,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Footer ──
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    flexWrap: 'wrap',
  },
  footerText: {
    color: MUTED,
    fontSize: 11,
  },
  footerLink: {
    color: YELLOW,
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  // ── Success block ──
  successBlock: {
    width: '100%',
    alignItems: 'center',
  },
});
