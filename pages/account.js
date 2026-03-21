import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { createServerClient } from '@supabase/ssr'
import { useSearchParams } from 'next/navigation'
import CheckoutForm from '@/components/CheckoutForm';
import ReturnCheckout from '@/components/ReturnCheckout';
import Stripe from 'stripe';
import Squares from '@/components/Squares';
import Sidebar from '@/components/Sidebar';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


export default function Account({ isPremiumUser, subscriptionPrice, userEmail }) {
    //redirect if user is not logged in
    const [session, setSession] = useState(undefined);
    const [changePasswordClicked, setChangePasswordClicked] = useState(false);
    const [deleteAccountClicked, setDeleteAccountClicked] = useState(false);
    const [changePasswordResult, setChangePasswordResult] = useState('');
    const [deleteAccountResult, setDeleteAccountResult] = useState('');
    const {register: registerPassword, handleSubmit: handleSubmitPassword, watch: watchPassword, formState: { errors: passwordErrors, isSubmitSuccessful: isPasswordSubmitSuccessful } } = useForm();
    const {register: registerDelete, handleSubmit: handleSubmitDelete, watch: watchDelete, formState: { errors: deleteErrors, isSubmitSuccessful: isDeleteSubmitSuccessful } } = useForm();
    const [isBuyingSubscription, setIsBuyingSubscription] = useState(false);
  const router = useRouter();

  const buyingSubscription = useSearchParams();
  const getBuyingSubscription = buyingSubscription.get('buyingSubscription');
  const boughtSubscription = buyingSubscription.get('session_id');
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    }
    getSession();
  }, []);
  useEffect(() => {
    if (session === null) {
      const timeout = setTimeout(() => {
        router.push(isBuyingSubscription ? '/login?buyingSubscription=true' : '/login');
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [session, isBuyingSubscription, router]);

  useEffect(() => {
    if (getBuyingSubscription === 'true') {
      setIsBuyingSubscription(true);
    }
  }, [getBuyingSubscription]);

  const password = watchPassword('password', '');
  const confirmPassword = watchPassword('confirmPassword', '');    
  const passwordRequirements = {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };

  const onSubmitChangePassword = async (data) => {
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: data.password }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error updating password:', result.error);
        setChangePasswordResult(`Error: ${result.error}`);
      } else {
        console.log('Password updated successfully');
        setChangePasswordClicked(false);
        setChangePasswordResult('Password updated successfully.');
      }
    } catch (error) {
      console.error('Request failed:', error);
    }
  };
  const allRequirementsMet = Object.values(passwordRequirements).every(req => req);

  const newPasswordOptions = {
    required: "Password is required",
    validate: () => allRequirementsMet || "Password does not meet all requirements"
  };
  const confirmPasswordOptions = {
    required: "Please confirm your password",
    validate: (value) => value === password || "Passwords do not match"
  };
  const deletePasswordOptions = {
    required: "Password is required"
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        router.push('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);
const onSubmitDeleteAccount = async (data) => {
  try {
    const response = await fetch('/api/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password: data.password }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('Error deleting account:', result.error);
      setDeleteAccountResult(`Error: ${result.error}`);
    } else {
      console.log('Account deleted successfully');
      setDeleteAccountClicked(false);
      setDeleteAccountResult('Account deleted successfully. You will be redirected to the homepage shortly.');
      setTimeout(() => {
      router.push('/');
      }, 3000); // Redirect after 3 seconds
    }
  } catch (error) {
    console.error('Request failed:', error);
    setDeleteAccountResult('Request failed. Please try again later.');
  }
};

  return (
    <div className="flex h-screen overflow-hidden">
    <Sidebar />
    <main className="relative flex-1 p-8 flex flex-col gap-6 overflow-y-auto">
        <div className="fixed inset-0 -z-10 blur-[1.5px]">
          <Squares
            speed={0.2}
            cellWidth={100}
            cellHeight={40}
            direction="up"
          />
        </div>

      {session ? (
        <div className="flex flex-col gap-4 bg-foreground rounded-2xl p-12 mx-auto outlined w-full max-w-2xl">
          <h1 className="text-4xl font-bold ">Your Account</h1>

          {/* Change Password */}
          <div className=" p-6 flex flex-col gap-4 outlined ">
            <div className="flex items-center justify-between gap-2">
              <h2 >Change Password</h2>
              <button onClick={() => setChangePasswordClicked(!changePasswordClicked)} className="!px-4 !py-2 text-sm bg-foreground text-background hover:cursor-pointer">
                {changePasswordClicked ? "Cancel" : "Change"}
              </button>
            </div>
            {changePasswordResult && <p className="text-sm">{changePasswordResult}</p>}
            {changePasswordClicked && (
              <form onSubmit={handleSubmitPassword(onSubmitChangePassword)} className="flex flex-col gap-3">
                <input type="password" placeholder="New Password" className="border border-foreground/20 rounded-xl px-4 py-2 bg-background text-foreground w-full" {...registerPassword("password", newPasswordOptions)} />
                <input type="password" placeholder="Confirm New Password" className="border border-foreground/20 rounded-xl px-4 py-2 bg-background text-foreground w-full" {...registerPassword("confirmPassword", confirmPasswordOptions)} />
                {passwordErrors.password && <span className="text-red-500 text-sm">{passwordErrors.password.message}</span>}
                {passwordErrors.confirmPassword && <span className="text-red-500 text-sm">{passwordErrors.confirmPassword.message}</span>}
                <button type="submit" className="bg-foreground text-background self-start hover:cursor-pointer">
                  Update Password
                </button>
              </form>
            )}
          </div>

          {/* Delete Account */}
          <div className="rounded-2xl border-2 border-red-500/20 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-red-500">Delete Account</h2>
              <button onClick={() => setDeleteAccountClicked(!deleteAccountClicked)} className="!px-4 !py-2 text-sm bg-red-500 text-white hover:cursor-pointer">
                {deleteAccountClicked ? "Cancel" : "Delete"}
              </button>
            </div>
            {deleteAccountResult && <p className="text-sm">{deleteAccountResult}</p>}
            {deleteAccountClicked && (
              <form onSubmit={handleSubmitDelete(onSubmitDeleteAccount)} className="flex flex-col gap-3">
                <input type="password" placeholder="Confirm your password" className="!bg-red-500 text-foreground w-full" {...registerDelete("password", deletePasswordOptions)} />
                {deleteErrors.password && <span className="text-red-500 text-sm">{deleteErrors.password.message}</span>}
                <button type="submit" className="bg-red-500 text-white self-start hover:cursor-pointer">
                  Confirm Deletion
                </button>
              </form>
            )}
          </div>

          {/* Subscription */}
          {!isPremiumUser && !isBuyingSubscription && (
            <button onClick={() => setIsBuyingSubscription(true)} className="mx-auto rainbow-transition bg-gradient-to-b from-blue-700 to-violet-600 text-white self-start hover:cursor-pointer">
              Upgrade to Pro
            </button>
          )}
          {isBuyingSubscription && !isPremiumUser && (
            <div className="rounded-2xl border-2 border-foreground/10 p-6 flex flex-col gap-4 items-center text-background text-center">
              <h2>You&apos;re one step away from unlocking all of sentiment-analysis.ai.</h2>
              <p className="text-center text-background">Upgrade to Pro for more features and insights.</p>
              <CheckoutForm userEmail={userEmail} />
            </div>
          )}
          {boughtSubscription && <ReturnCheckout />}

          <button onClick={async () => {
            await supabase.auth.signOut();
            router.push('/login');
          }} className="outlined text-foreground  self-start cursor-pointer hover:cursor-pointer mx-auto">Log Out</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 bg-background rounded-2xl p-12  mx-auto items-center outlined">
          <h1 className="text-4xl font-bold text-foreground">You must be logged in to view your account.</h1>
          <p className="text-foreground">You will be redirected shortly.</p>
        </div>
      )}
    </main>
    </div>
  );
}


export async function getServerSideProps({ params, req, res }) { 
  let isPremiumUser = false;
  let userInfo = null;
  let subscriptionPrice = null;
  try {
    // 1. Create Supabase client (may set auth cookies)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return Object.keys(req.cookies).map(name => ({
              name,
              value: req.cookies[name]
            }));
          },
          setAll(cookiesToSet) {
            const cookies = cookiesToSet.map(({ name, value, options }) => {
              const optStr = options ? Object.entries(options).map(([k, v]) => `${k}=${v}`).join('; ') : '';
              return `${name}=${value}; Path=/; ${optStr}`;
            });
            
            const existing = res.getHeader('Set-Cookie') || [];
            const existingArray = Array.isArray(existing) ? existing : [existing];
            
            // Append new cookies
            res.setHeader('Set-Cookie', [...existingArray, ...cookies]);
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    
    userInfo = user;
    if (user) {
      // Check if user exists in users table and has subscription_id
      const { data: userData, error } = await supabase
        .from('users')
        .select('subscription_id')
        .eq('id', user.id)
        .single();
      
      if (!error && userData?.subscription_id) {
        isPremiumUser = true;
      }
    }


  } catch (error) {
    console.error('Error checking user subscription:', error);
    isPremiumUser = false;
  }

  try {
  subscriptionPrice = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID, {
    expand: ['product'],
  });
  } catch (error) {
    console.error('Error finding Stripe price:', error);

  }
  return {
    props: {
      userEmail: userInfo ? userInfo.email : null,
      subscriptionPrice: subscriptionPrice, //const displayPrice = `$${price.unit_amount / 100}/${price.recurring.interval}`;
      isPremiumUser,
    },
  };
}

