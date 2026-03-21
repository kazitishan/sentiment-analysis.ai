import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Squares from '@/components/Squares';

export default function ForgotPassword() {
	const router = useRouter();
	const [ForgotPasswordError, setForgotPasswordError] = useState('');
	//redirect if user is already logged in
	useEffect(() => {
		const checkUser = async () => {
			const { data: { session } } = await supabase.auth.getSession();
			if (session?.user && !session.user.is_anonymous) {
				router.push('/');
			}
		};
		checkUser();
	}, []);
	const { register, handleSubmit, watch, formState: { isSubmitting, isSubmitSuccessful, errors } } = useForm();
	const onSubmit = async (data) => {
		const { email } = data;
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: 'http://localhost:3000/login/reset',
				// Disable PKCE for email magic links - they don't work with code verifiers
				options: {
					emailRedirectTo: 'http://localhost:3000/login/reset',
				}
			});
			if (error) {
				setForgotPasswordError(error.message);
			}
		} catch (error) {
			setForgotPasswordError(error.message);
		}
	};
	const email = watch('email', '');

	return (
		<>
			<div className="fixed inset-0 -z-10 blur-[1.5px]">
				<Squares speed={0.2} cellWidth={100} cellHeight={40} direction="up" />
			</div>
			<Navbar />
			<div className="flex-1 flex items-center justify-center p-6">
				<div className="w-full max-w-md outlined p-8">
					{!isSubmitSuccessful ? (
						<>
							<h1>Forgot Password</h1>
							<form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 items-center mt-8">
								<input type="email" placeholder="Email" {...register('email', { required: 'Email address is required', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })} />
								<button type="submit" disabled={isSubmitting} className="bg-foreground text-background hover:cursor-pointer">
									{isSubmitting ? 'Sending...' : 'Send Reset Link'}
								</button>
								{errors.email && <span className="text-red-500">{errors.email.message}</span>}
								{ForgotPasswordError && <p className="text-red-500">{ForgotPasswordError}</p>}
							</form>
						</>
					) : (
						<>
							<h1>Forgot Password</h1>
							<p className="text-center">Successfully sent password reset link to {email}.</p>
						</>
					)}
				</div>
			</div>
		</>
	);
}
