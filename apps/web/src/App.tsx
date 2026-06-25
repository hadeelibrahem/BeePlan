import React, { useState } from 'react'
import './App.css'

export default function App() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [shakeActive, setShakeActive] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validate = () => {
    const newErrors: { [key: string]: string } = {}

    if (isSignUp && !name.trim()) {
      newErrors.name = 'Full name is required'
    }

    if (!email.trim()) {
      newErrors.email = 'Email address is required'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (isSignUp) {
      if (!confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password'
      } else if (confirmPassword !== password) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return

    if (!validate()) {
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }

    setIsLoading(true)

    // Simulate API request latency
    setTimeout(() => {
      setIsLoading(false)
      setIsSuccess(true)
    }, 1500)
  }

  const handleToggle = () => {
    setIsSignUp(!isSignUp)
    setName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setErrors({})
  }

  return (
    <div className="min-h-screen flex items-stretch bg-[#2B323F] text-white font-sans relative overflow-hidden">
      
      {/* Premium Honeycomb background overlay */}
      <div className="honeycomb-bg" />

      {/* Futuristic soft yellow glowing blobs for ambient depth */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#FDEF4B] opacity-[0.04] blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[650px] h-[650px] rounded-full bg-[#FDEF4B] opacity-[0.03] blur-[150px] pointer-events-none" />

      {/* LEFT PANEL: Branding & Tagline (Visible only on Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1F242E] relative flex-col justify-between p-16 overflow-hidden border-r border-[#434D62]/40 z-10">
        
        {/* Subtle geometric circle glow decoration */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-[#FDEF4B]/5 opacity-30 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full border border-[#FDEF4B]/3 opacity-20 pointer-events-none" />

        {/* Header Branding */}
        <div className="flex items-center space-x-3.5 relative z-10">
          <BeeLogo size="sm" />
          <span className="text-2xl font-bold tracking-tight">
            Bee<span className="text-[#FDEF4B]">Plan</span>
          </span>
        </div>

        {/* Central Geometric Hive / Honeybee Vector Illustration */}
        <div className="my-auto flex flex-col items-start space-y-6 relative z-10 max-w-md">
          {/* Large brand logo matching the image */}
          <div className="flex flex-col items-start mb-4">
            <BeeLogo size="lg" className="animate-float" />
          </div>

          <h2 className="text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
            Organize reminders, tasks, and <span className="text-[#FDEF4B] text-glow">smart plans</span>.
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Experience intelligent scheduling and seamless task mapping in a clean, minimal workspace crafted for premium productivity.
          </p>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-500 relative z-10">
          <span>&copy; {new Date().getFullYear()} BeePlan Inc. All rights reserved.</span>
        </div>

      </div>

      {/* RIGHT PANEL: Centered Responsive Form Container */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 z-10 relative">
        
        {/* Elevated Form Card */}
        <div className={`bg-[#353D4E]/85 backdrop-blur-md rounded-3xl p-8 sm:p-10 border border-[#434D62] w-full max-w-md shadow-2xl relative transition-all duration-300 ${shakeActive ? 'animate-shake' : ''}`}>
          
          {isSuccess ? (
            /* Success Auth State Screen */
            <div className="text-center py-6 animate-scale-up">
              <div className="w-20 h-20 items-center justify-center flex mx-auto mb-6">
                <svg className="success-circle-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" />
                  <polyline points="30,52 45,65 70,38" fill="none" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Authentication Approved</h3>
              <p className="text-sm text-[#8C9BAE] mt-3">
                Welcome to your dashboard. Preparing your smart productivity plans...
              </p>
              <button
                onClick={() => {
                  setIsSuccess(false)
                  handleResetState()
                }}
                className="mt-8 px-6 py-2.5 rounded-xl border border-[#434D62] bg-[#2B323F] hover:bg-[#434D62] text-xs font-semibold text-white transition-colors"
              >
                Back to Auth Portal
              </button>
            </div>
          ) : (
            /* Sign In / Sign Up Form Flow */
            <div className="animate-scale-up">
              
              {/* Header inside Form Card with Full Brand Logo */}
              <div className="text-center mb-8 flex flex-col items-center">
                {/* Logo Icon */}
                <BeeLogo size="md" className="mb-3" />

                {/* Wordmark */}
                <h2 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                  Bee<span className="text-[#FDEF4B]">Plan</span>
                </h2>
                {/* Tagline */}
                <p className="text-[9px] text-[#8C9BAE] font-bold uppercase tracking-[0.18em] mt-2 mb-6">
                  SMART PRODUCTIVITY
                </p>

                <h3 className="text-xl font-bold text-white mt-2">
                  {isSignUp ? 'Create your account' : 'Welcome back'}
                </h3>
                <p className="text-xs text-[#8C9BAE] mt-1.5 leading-relaxed">
                  {isSignUp 
                    ? 'Start organizing your reminders and plans with BeePlan.' 
                    : 'Sign in to manage your reminders, tasks, and smart plans.'}
                </p>
              </div>

              {/* Form Input fields */}
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Full Name (Sign Up Only) */}
                {isSignUp && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <div className={`bg-[#2B323F] rounded-xl px-4 py-3 border transition-all duration-200 ${errors.name ? 'border-red-500' : 'border-[#434D62] focus-within:border-[#FDEF4B] focus-within:ring-1 focus-within:ring-[#FDEF4B]/20'}`}>
                      <input 
                        type="text" 
                        placeholder="Alex Honeycomb"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value)
                          if (errors.name) setErrors({ ...errors, name: '' })
                        }}
                        className="w-full bg-transparent border-none p-0 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-0"
                      />
                    </div>
                    {errors.name && (
                      <span className="text-red-400 text-xs mt-1.5 block pl-1">{errors.name}</span>
                    )}
                  </div>
                )}

                {/* Email Address */}
                <div>
                  <label className="block text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className={`bg-[#2B323F] rounded-xl px-4 py-3 border transition-all duration-200 ${errors.email ? 'border-red-500' : 'border-[#434D62] focus-within:border-[#FDEF4B] focus-within:ring-1 focus-within:ring-[#FDEF4B]/20'}`}>
                    <input 
                      type="text" 
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (errors.email) setErrors({ ...errors, email: '' })
                      }}
                      className="w-full bg-transparent border-none p-0 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-0"
                    />
                  </div>
                  {errors.email && (
                    <span className="text-red-400 text-xs mt-1.5 block pl-1">{errors.email}</span>
                  )}
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider">
                      Password
                    </label>
                    {!isSignUp && (
                      <a href="#forgot" className="text-[10px] font-bold text-[#FDEF4B] hover:underline hover:text-white transition-colors">
                        Forgot Password?
                      </a>
                    )}
                  </div>
                  
                  <div className={`bg-[#2B323F] rounded-xl px-4 py-3 border flex items-center transition-all duration-200 ${errors.password ? 'border-red-500' : 'border-[#434D62] focus-within:border-[#FDEF4B] focus-within:ring-1 focus-within:ring-[#FDEF4B]/20'}`}>
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (errors.password) setErrors({ ...errors, password: '' })
                      }}
                      className="flex-grow bg-transparent border-none p-0 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-0"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[9px] font-bold text-[#8C9BAE] hover:text-white px-1"
                    >
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="text-red-400 text-xs mt-1.5 block pl-1">{errors.password}</span>
                  )}
                </div>

                {/* Confirm Password (Sign Up Only) */}
                {isSignUp && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider mb-1.5">
                      Confirm Password
                    </label>
                    <div className={`bg-[#2B323F] rounded-xl px-4 py-3 border transition-all duration-200 ${errors.confirmPassword ? 'border-red-500' : 'border-[#434D62] focus-within:border-[#FDEF4B] focus-within:ring-1 focus-within:ring-[#FDEF4B]/20'}`}>
                      <input 
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value)
                          if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' })
                        }}
                        className="w-full bg-transparent border-none p-0 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-0"
                      />
                    </div>
                    {errors.confirmPassword && (
                      <span className="text-red-400 text-xs mt-1.5 block pl-1">{errors.confirmPassword}</span>
                    )}
                  </div>
                )}

                {/* CTA Button */}
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl bg-[#FDEF4B] text-[#2B323F] text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#FDEF4B]/10 cursor-pointer btn-glow"
                >
                  {isLoading ? (
                    <div className="w-5.5 h-5.5 border-2 border-[#2B323F]/30 border-t-[#2B323F] rounded-full animate-spin" />
                  ) : (
                    <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                  )}
                </button>

              </form>

              {/* OAuth Divider */}
              <div className="flex items-center my-5">
                <div className="flex-grow h-px bg-[#434D62]" />
                <span className="text-[9px] text-[#8C9BAE] uppercase tracking-wider font-semibold px-3.5">
                  or continue with
                </span>
                <div className="flex-grow h-px bg-[#434D62]" />
              </div>

              {/* Social Login Buttons */}
              <div className="grid grid-cols-2 gap-3.5">
                <button 
                  type="button"
                  onClick={() => setIsSuccess(true)}
                  className="h-11 bg-[#2B323F] hover:bg-[#434D62] border border-[#434D62] rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer text-white font-medium text-xs active:scale-[0.98]"
                >
                  <span className="w-4.5 h-4.5 rounded-full bg-white text-[#2B323F] font-black text-[9px] flex items-center justify-center shadow-sm">
                    G
                  </span>
                  <span>Google</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setIsSuccess(true)}
                  className="h-11 bg-[#2B323F] hover:bg-[#434D62] border border-[#434D62] rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer text-white font-medium text-xs active:scale-[0.98]"
                >
                  <span className="w-4.5 h-4.5 rounded-full bg-white text-[#2B323F] font-black text-[9px] flex items-center justify-center shadow-sm">
                    
                  </span>
                  <span>Apple</span>
                </button>
              </div>

              {/* Bottom Switch Trigger */}
              <div className="flex justify-center items-center mt-6 text-xs text-[#8C9BAE]">
                <span>
                  {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                </span>
                <button 
                  type="button"
                  onClick={handleToggle}
                  className="text-[#FDEF4B] font-bold underline pl-1.5 focus:outline-none hover:text-white transition-colors"
                >
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  )

  function handleResetState() {
    setName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setErrors({})
  }
}

type BeeLogoProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

function BeeLogo({ className = '', size = 'md' }: BeeLogoProps) {
  const sizes = {
    sm: {
      wrapper: 'w-9 h-9 mb-0',
      glow: 'rounded-xl',
      mark: 'w-7 h-7 rounded-lg',
      stripesBox: 'w-5 h-5 py-0.5',
      stripe: 'h-1',
      dots: 'w-1 h-1',
      dotLeft: 'left-2',
      dotRight: 'right-2',
    },
    md: {
      wrapper: 'w-16 h-16 mb-4',
      glow: 'rounded-2xl',
      mark: 'w-12 h-12 rounded-xl',
      stripesBox: 'w-8 h-8 py-1',
      stripe: 'h-1.5',
      dots: 'w-1.5 h-1.5',
      dotLeft: 'left-4',
      dotRight: 'right-4',
    },
    lg: {
      wrapper: 'w-20 h-20 mb-4',
      glow: 'rounded-[22px]',
      mark: 'w-16 h-16 rounded-2xl',
      stripesBox: 'w-10 h-10 py-1.5',
      stripe: 'h-2',
      dots: 'w-2 h-2',
      dotLeft: 'left-5',
      dotRight: 'right-5',
    },
  }[size]

  return (
    <div
      className={`${sizes.wrapper} items-center justify-center flex relative ${className}`}
      aria-label="BeePlan logo"
    >
      <div className={`absolute inset-0 bg-[#FDEF4B] ${sizes.glow} rotate-45 opacity-20`} />

      <div
        className={`${sizes.mark} bg-[#FDEF4B] items-center justify-center rotate-12 shadow-lg shadow-[#FDEF4B]/50 flex`}
      >
        <div className={`${sizes.stripesBox} justify-between flex flex-col`}>
          <div className={`${sizes.stripe} bg-[#2B323F] rounded-full w-full`} />
          <div className={`${sizes.stripe} bg-[#2B323F] rounded-full w-5/6 self-center`} />
          <div className={`${sizes.stripe} bg-[#2B323F] rounded-full w-2/3 self-center`} />
        </div>
      </div>

      <div
        className={`absolute -top-1 ${sizes.dotLeft} ${sizes.dots} rounded-full bg-[#FDEF4B]`}
      />
      <div
        className={`absolute -top-1 ${sizes.dotRight} ${sizes.dots} rounded-full bg-[#FDEF4B]`}
      />
    </div>
  )
}
