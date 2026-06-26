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

// ─── Brand constants ─────────────────────────────────────────────────────────
const YELLOW = '#FDEF4B';
const DARK_BG = '#2B323F';
const CARD_BG = '#353D4E';
const BORDER = '#434D62';
const MUTED = '#8C9BAE';

interface ForgotPasswordScreenProps {
  /** Navigate back to Sign In */
  onBack: () => void;
  /** Navigate forward to Reset Password entry */
  onReset: () => void;
}

// ─── BeeLogo Component ───────────────────────────────────────────────────────
export default function ForgotPasswordScreen({ onBack, onReset }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!email.trim()) { setError('Email address is required'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Please enter a valid email'); return; }
    setError('');
    setIsLoading(true);
    setTimeout(() => { setIsLoading(false); setSent(true); }, 1400);
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
        {/* Auth Card */}
        <View style={styles.card}>
          {/* Brand Header */}
          <BeePlanLogo size={50} showTagline style={styles.logoMark} />

          {sent ? (
            /* ── Email Sent Success ── */
            <View style={styles.successBlock}>
              {/* Mail icon */}
              <View style={styles.iconBox}>
                <View style={styles.envelopeBody}>
                  <View style={styles.envelopeLine} />
                  <View style={[styles.envelopeLine, { width: 22 }]} />
                </View>
              </View>

              <Text style={styles.heading}>Check your email</Text>
              <Text style={styles.subText}>
                We sent a password reset link to{'\n'}
                <Text style={{ color: YELLOW, fontWeight: '700' }}>{email}</Text>
                {'\n'}Open it to create a new password.
              </Text>

              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
                onPress={onReset}
              >
                <Text style={styles.primaryBtnText}>Create New Password</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}
                onPress={() => { setSent(false); setEmail(''); }}
              >
                <Text style={styles.ghostBtnText}>Resend Email</Text>
              </Pressable>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Remember your password? </Text>
                <Pressable onPress={onBack}>
                  <Text style={styles.footerLink}>Back to Sign In</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            /* ── Email Form ── */
            <>
              {/* Lock icon */}
              <View style={styles.iconBox}>
                <View style={styles.lockArc} />
                <View style={styles.lockBody} />
              </View>

              <Text style={styles.heading}>Forgot Password?</Text>
              <Text style={styles.subText}>
                Enter your email and we'll send you a reset link to get back into your account.
              </Text>

              {/* Email Field */}
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View style={[styles.inputWrap, !!error && { borderColor: '#EF4444' }]}>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#556070"
                  value={email}
                  onChangeText={v => { setEmail(v); setError(''); }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                />
              </View>
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <Text style={styles.helperText}>
                Make sure you enter the email associated with your BeePlan account.
              </Text>

              {/* CTA */}
              <View style={styles.sendResetBtnShell}>
                <Pressable
                  style={({ pressed }) => [
                    styles.sendResetBtnPressable,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={handleSend}
                  disabled={isLoading}
                >
                  {isLoading
                    ? <ActivityIndicator color={DARK_BG} />
                    : <Text style={styles.sendResetBtnText}>Send Reset Link</Text>
                  }
                </Pressable>
              </View>

              {/* Back */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Remember your password? </Text>
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

  // ── Brand Header ──
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
    position: 'relative',
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
  lockArc: {
    width: 18,
    height: 10,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 2.5,
    borderBottomWidth: 0,
    borderColor: YELLOW,
    marginBottom: -1,
  },
  lockBody: {
    width: 22,
    height: 16,
    borderRadius: 5,
    backgroundColor: YELLOW,
  },
  envelopeBody: {
    width: 28,
    height: 20,
    borderWidth: 2,
    borderColor: YELLOW,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  envelopeLine: {
    width: 16,
    height: 2,
    backgroundColor: YELLOW,
    borderRadius: 1,
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
    marginBottom: 4,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 0,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 11,
    alignSelf: 'flex-start',
    marginBottom: 4,
    paddingLeft: 4,
  },
  helperText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    alignSelf: 'flex-start',
    marginTop: 6,
  },

  // ── Buttons ──
  primaryBtn: {
    width: '100%',
    minHeight: 52,
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
    color: '#1F242E',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sendResetBtnShell: {
    width: '100%',
    height: 54,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#FDEF4B',
    marginTop: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FDEF4B',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sendResetBtnPressable: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FDEF4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendResetBtnText: {
    color: '#1F242E',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  ghostBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  ghostBtnText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
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
