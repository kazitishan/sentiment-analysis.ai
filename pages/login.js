import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Link from 'next/link';

export default function LogIn() {
    const router = useRouter();
    const [loginError, setLoginError] = useState('');
    const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm();
    
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
        setLoginError('');
        const { email, password } = data;
        
        const { data: authData, error } = await supabase.auth.signInWithPassword({ 
            email, 
            password 
        });
        
        if (error) {
            console.error('Error logging in:', error);
            setLoginError(error.message);
        } else {
            console.log('User logged in successfully:', authData.user);
            router.push('/create');
        }
    };

    return (
        <div>
            <Header />
            <form onSubmit={handleSubmit(onSubmit)}>
                {loginError && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                        <p className="text-red-600">{loginError}</p>
                    </div>
                )}
                
                <label>
                    Email:
                    <input 
                        type="email" 
                        {...register('email', { required: 'Email is required' })} 
                    />
                    {errors.email && <span style={{color: 'red'}}>{errors.email.message}</span>}
                </label>
                
                <label>
                    Password:
                    <input 
                        type="password" 
                        {...register('password', { required: 'Password is required' })} 
                    />
                    {errors.password && <span style={{color: 'red'}}>{errors.password.message}</span>}
                </label>
                <Link className="cursor-pointer hover:underline" href="/login/forgot-password">Forgot Password?</Link>
                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Logging in...' : 'Log In'}
                </button>
            </form>
        </div>
    );
}
