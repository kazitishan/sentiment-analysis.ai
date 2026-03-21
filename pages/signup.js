import { useForm } from 'react-hook-form';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import Squares from '@/components/Squares';

export default function SignUp() {
  const router = useRouter();
  const { register, handleSubmit, watch, formState: { errors, isSubmitSuccessful } } = useForm();
  
  //watching both fields in real-time: 
  const password = watch('password', '');
  const confirmPassword = watch('confirmPassword', '');
  
    //redirect if user is already logged in
    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user && !session.user.is_anonymous) {
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
      setTimeout(() => {
        router.push('/login');
      }, 3000); // Redirect after 3 seconds
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
    <>
		<div className="fixed inset-0 -z-10 blur-[1.5px]">
			<Squares speed={0.2} cellWidth={100} cellHeight={40} direction="up" />
		</div>    
    <Navbar />    
    <div className="flex-1 mb-12 border max-w-4xl mx-auto p-6 mt-12 rounded outlined">
      <h1>Sign Up</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 justify-center items-center mt-8">
        <label className="flex flex-col gap-1">
          Email
          <input className="outlined px-2" type="email" {...register('email', {
            required: 'Email address is required',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Invalid email address'
            },
          })} />
          {errors.email && <span className="text-red-500">{errors.email.message}</span>}
        </label>
        
        <label className="flex flex-col gap-1">
          Password
          <input className="outlined px-2 py-1" type="password" {...register('password', {
            required: 'Password is required',
            validate: () => allRequirementsMet || 'Password does not meet all requirements'
          })} />
          {errors.password && <span className="text-red-500">{errors.password.message}</span>}
        </label>

        <label className="flex flex-col gap-1">
          Confirm Password
          <input className="outlined px-2 py-1" type="password" {...register('confirmPassword', {
            required: 'Please confirm your password',
            validate: (value) => value === password || 'Passwords do not match'
          })} />
          {errors.confirmPassword && <span className="text-red-500">{errors.confirmPassword.message}</span>}
        </label>
          <Link className=" outlined p-1 cursor-pointer hover:underline" href="/login">Already have an account?</Link>
        {/* ✅ Real-time password requirements display */}
        {password && (
          <div className=" p-2.5 border border-gray-300 rounded outlined">
            <h4>Password Requirements</h4>
            <ul className="m-0 pl-5">
              <li className={passwordRequirements.minLength ? 'text-green-600' : 'text-red-600'}>
                {passwordRequirements.minLength ? '✓' : '✗'} At least 12 characters
              </li>
              <li className={passwordRequirements.hasUppercase ? 'text-green-600' : 'text-red-600'}>
                {passwordRequirements.hasUppercase ? '✓' : '✗'} One uppercase letter (A-Z)
              </li>
              <li className={passwordRequirements.hasLowercase ? 'text-green-600' : 'text-red-600'}>
                {passwordRequirements.hasLowercase ? '✓' : '✗'} One lowercase letter (a-z)
              </li>
              <li className={passwordRequirements.hasNumber ? 'text-green-600' : 'text-red-600'}>
                {passwordRequirements.hasNumber ? '✓' : '✗'} One number (0-9)
              </li>
              <li className={passwordRequirements.hasSpecialChar ? 'text-green-600' : 'text-red-600'}>
                {passwordRequirements.hasSpecialChar ? '✓' : '✗'} One special character (!@#$%^&*)
              </li>
              <li className={passwordsMatch ? 'text-green-600' : 'text-red-600'}>
                {passwordsMatch ? '✓' : '✗'} Passwords match
              </li>
            </ul>
          </div>
        )}

        <button 
          type="submit" 
          disabled={!allRequirementsMet || !passwordsMatch || isSubmitSuccessful}
          className={`bg-foreground text-background ${(allRequirementsMet && passwordsMatch) ? 'opacity-100 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
        >
          Sign Up
        </button>
      </form>
      {isSubmitSuccessful && <p>Sign up successful! If this is your first time signing up with this email, 
        a verification email has been sent. You will be redirected to log in shortly.</p>}
    </div>
  </>    
  );
}
