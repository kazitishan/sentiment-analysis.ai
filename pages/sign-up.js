import { useForm } from 'react-hook-form';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function SignUp() {
  const router = useRouter();
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  
  //watching both fields in real-time: 
  const password = watch('password', '');
  const confirmPassword = watch('confirmPassword', '');
  
    //redirect if user is already logged in
    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                router.push('/create');
            }
        };
        checkUser();
    }, [router]);

  const onSubmit = async (data) => {
    const { email, password } = data;
    const { user, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error('Error signing up:', error);
    } else {
      console.log('User signed up successfully:', user);
      router.push('/create');
    }
  };

  // ✅ Real-time password requirement checks
  const passwordRequirements = {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };

  const allRequirementsMet = Object.values(passwordRequirements).every(req => req);
  const passwordsMatch = password === confirmPassword;

  return (
    <div>
      <h1>Sign Up</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label>
          Email:
          <input type="email" {...register('email', {
            required: 'Email address is required',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Invalid email address'
            },
          })} />
          {errors.email && <span style={{color: 'red'}}>{errors.email.message}</span>}
        </label>
        
        <label>
          Password:
          <input type="password" {...register('password', {
            required: 'Password is required',
            validate: () => allRequirementsMet || 'Password does not meet all requirements'
          })} />
          {errors.password && <span style={{color: 'red'}}>{errors.password.message}</span>}
        </label>

        <label>
          Confirm Password:
          <input type="password" {...register('confirmPassword', {
            required: 'Please confirm your password',
            validate: (value) => value === password || 'Passwords do not match'
          })} />
          {errors.confirmPassword && <span style={{color: 'red'}}>{errors.confirmPassword.message}</span>}
        </label>

        {/* ✅ Real-time password requirements display */}
        {password && (
          <div style={{ 
            marginTop: '10px', 
            padding: '10px', 
            border: '1px solid #ccc', 
            borderRadius: '4px',
            backgroundColor: '#f9f9f9'
          }}>
            <h4>Password Requirements:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li style={{ 
                color: passwordRequirements.minLength ? 'green' : 'red' 
              }}>
                {passwordRequirements.minLength ? '✓' : '✗'} At least 12 characters
              </li>
              <li style={{ 
                color: passwordRequirements.hasUppercase ? 'green' : 'red' 
              }}>
                {passwordRequirements.hasUppercase ? '✓' : '✗'} One uppercase letter (A-Z)
              </li>
              <li style={{ 
                color: passwordRequirements.hasLowercase ? 'green' : 'red' 
              }}>
                {passwordRequirements.hasLowercase ? '✓' : '✗'} One lowercase letter (a-z)
              </li>
              <li style={{ 
                color: passwordRequirements.hasNumber ? 'green' : 'red' 
              }}>
                {passwordRequirements.hasNumber ? '✓' : '✗'} One number (0-9)
              </li>
              <li style={{ 
                color: passwordRequirements.hasSpecialChar ? 'green' : 'red' 
              }}>
                {passwordRequirements.hasSpecialChar ? '✓' : '✗'} One special character (!@#$%^&*)
              </li>
              <li style={{ 
                color: passwordsMatch ? 'green' : 'red' 
              }}>
                {passwordsMatch ? '✓' : '✗'} Passwords match
              </li>
            </ul>
          </div>
        )}

        <button 
          type="submit" 
          disabled={!allRequirementsMet || !passwordsMatch}
          style={{
            opacity: (allRequirementsMet && passwordsMatch) ? 1 : 0.5,
            cursor: (allRequirementsMet && passwordsMatch) ? 'pointer' : 'not-allowed'
          }}
        >
          Sign Up
        </button>
      </form>
    </div>
  );
}
