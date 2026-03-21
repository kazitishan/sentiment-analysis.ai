import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import Navbar from '@/components/Navbar';



export default function ResetPassword() {
	const { register, handleSubmit, watch, formState: { isSubmitting, isSubmitSuccessful, errors  } } = useForm();
	const [user, setUser] = useState(''); //to show the user's email
	const [error, setError] = useState('');
	const router = useRouter();

	const password = watch('password', ''); //returns initially empty string instead of undefined
	const confirmPassword = watch('confirmPassword', '');//returns initially empty string instead of undefined

	// Password requirements
	const passwordRequirements = {
			minLength: password.length >= 12,
			hasUppercase: /[A-Z]/.test(password),
			hasLowercase: /[a-z]/.test(password),
			hasNumber: /\d/.test(password),
			hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
	};

	const allRequirementsMet = Object.values(passwordRequirements).every(req => req);
	const passwordsMatch = password === confirmPassword;

	useEffect(() => {
			const checkSession = async () => {
					// Supabase automatically handles the auth callback
					// Just check if we have a session
					const { data: { session }, error } = await supabase.auth.getSession();
					
					console.log('Session check:', { hasSession: !!session, error: error?.message });
					
					if (session?.user) {
							console.log('User authenticated:', session.user.email);
							setUser(session.user);
					} else {
							// Only show error if there's no code in URL (meaning it's not a fresh callback)
							const queryParams = new URLSearchParams(window.location.search);
							const hashParams = new URLSearchParams(window.location.hash.substring(1));
							const hasCode = queryParams.get('code');
							const hasTokens = hashParams.get('access_token');
							
							if (!hasCode && !hasTokens) {
									setError("We're sorry, but this reset password link is expired or invalid.");
							}
					}
			};

			// Listen for auth state changes
			const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
					console.log('Auth state changed:', event, session?.user?.email);
					if (event === 'PASSWORD_RECOVERY') {
							setUser(session?.user);
							// Clean up URL
							window.history.replaceState(null, null, window.location.pathname);
					}
			});

			checkSession();

			return () => subscription.unsubscribe();
	}, []);

	if (error === "We're sorry, but this reset password link is expired or invalid.") {
			return (
					<div>
							<h1>Reset Your Password</h1>
							<p className="text-red-500">{error}</p>
							<p><a href="/login">Go back to login</a></p>
					</div>
			);
	}

	const onSubmit = async (data) => {
	//removes naive approach of trusting client-side validation, new flow: client →  server → Supabase
	const response = await fetch('/api/reset-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: data.password })
	});

	if (!response.ok) {
			const { error } = await response.json();
			setError(error);
	} else {
			// Refresh the session to ensure it's valid after password update
			await supabase.auth.refreshSession();
			router.push('/');
	}
	};

	return (

	<>
	<Navbar />		
	<div className="border max-w-4xl mx-auto p-6 mt-12 rounded outlined">
			<h1>Reset Your Password</h1>
			<form onSubmit={handleSubmit(onSubmit)} className='flex flex-col gap-4 justify-center items-center mt-8"'>
					<label className="flex flex-col gap-1">
							Email
							<input 
									type="email" 
									value={user?.email || ''}
									readOnly
									className=" cursor-not-allowed"
							/>
					</label>
					<label className="flex flex-col gap-1">
							New Password
							<input type="password" {...register('password', {
									required: 'Password is required',
									validate: () => allRequirementsMet || 'Password does not meet all requirements'
							})} />
							{errors.password && <span className="text-red-500">{errors.password.message}</span>}
					</label>
					<label className="flex flex-col gap-1">
							Confirm New Password
							<input type="password" {...register('confirmPassword', {
									required: 'Please confirm your password',
									validate: (value) => value === password || 'Passwords do not match'
							})} />
							{errors.confirmPassword && <span className="text-red-500">{errors.confirmPassword.message}</span>}
					</label>
					{password && (
					<div className="mt-2.5 p-2.5 border border-gray-300 rounded bg-gray-50">
							<h4>Password Requirements:</h4>
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
					<button type="submit" disabled={isSubmitting}>
							{isSubmitting ? 'Resetting password...' : 'Reset password'}
					</button>
					{error && <p className="text-red-500">{error}</p>}
			</form>
	</div>
	</>
	);
}