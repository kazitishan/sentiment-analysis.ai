import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';


export default function Account() {
    //redirect if user is not logged in
    const [session, setSession] = useState(null);
    const router = useRouter();
    useEffect(() => {
        const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession(); //client-level trust: check local auth token
        setSession(session);
        if (!session?.user) {
            router.push('/login');
        }
        };
        checkUser();
    }, [router]);

    return ( //make sure any changes for account is checked via supabase.auth.getUser() in API routes
        <>
            {session ? (
                <div>
                    <h1>Your Account</h1>
                    {/* Account details and settings go here */}
                </div>
            ) : (
                <p>You must be logged in to view this page.</p>
            )}
        </>
    );
}
