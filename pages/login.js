import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import Navbar from "../src/components/Navbar";
import Link from 'next/link';
import Squares from '@/components/Squares';


export default function LogIn() {
    const router = useRouter();
    const [loginError, setLoginError] = useState('');
    const { register, handleSubmit, formState: { isSubmitting, errors, isValid } } = useForm();
    //redirect if user is already logged in
    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
           
            if (session?.user && !session.user.is_anonymous) {
              router.push('/create');
            }
        };
        checkUser();
    }, []);

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
    <>
      <div className="fixed inset-0 -z-10 blur-[1.5px]">
        <Squares speed={0.2} cellWidth={100} cellHeight={40} direction="up" />
      </div>
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md outlined p-8">
          <h1>Log In</h1>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4  justify-center items-center mt-8 ">
              {loginError && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                      <p className="text-red-600">{loginError}</p>
                  </div>
              )}
              
              <label className="flex flex-col gap-1">
                  Email
                  <input 
                      type="email" 
                      {...register('email', { required: 'Email is required' })} 
                      className='outlined px-2 py-1'
                  />
                  {errors.email && <span className="text-red-500">{errors.email.message}</span>}
              </label>
              
              <label className="flex flex-col gap-1">
                  Password
                  <input 
                      type="password" 
                      {...register('password', { required: 'Password is required' })} 
                      className="outlined px-2 py-1"
                  />
                  {errors.password && <span className="text-red-500">{errors.password.message}</span>}
              </label>


              <button type="submit" disabled={isSubmitting || !isValid} className={`bg-foreground text-background hover:cursor-pointer ${isValid ? 'opacity-100' : 'opacity-50 !cursor-not-allowed'}`}>
                {isSubmitting ? 'Logging in...' : 'Log In'}
              </button>
        </form>
        <div className="flex gap-4 justify-center mt-4">
          <Link className=" outlined p-1 cursor-pointer hover:underline" href="/login/forgot-password">Forgot Password?</Link>
          <Link className=" outlined p-1 cursor-pointer hover:underline" href="/signup">Don't have an account?</Link>
        </div>
      </div>
      </div>
    </>
  );
}
