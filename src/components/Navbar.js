import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react'; // ← Add useState
import { supabase } from '@/lib/supabase';

export default function Navbar() {
  // ✅ Add state to store session data
  const [session, setSession] = useState(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error fetching session:', error);
        } else {
          setSession(data.session); // ✅ Store session in state
        }
      } catch (error) {
        console.error('Error:', error);
      } 
    };

    fetchSession();

    // ✅ Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session); //set session state every time an auth event happens
      }
    );

    // ✅ Cleanup subscription
    return () => subscription.unsubscribe();
  }, []);

  return (
    <nav aria-label="Landing page navigation">
      <div className="flex justify-between items-center py-3 px-8">
        <span className="flex items-center space-x-2 text-4xl font-bold">
          <Link href="/">
            <Image width={57} height={57} src="/sentiment-analysis.ai.svg" alt="Sentiment Analysis Logo" />
          </Link>
          <Link href="/" className="hover:underline">
            <span>sentiment-analysis.ai</span>
          </Link>
        </span>
        <ul className="flex space-x-6 text-lg items-center">
          {session && !session.user.is_anonymous ? (
            <>
              <li>
                <Link href="/account" className="hover:underline">
                  <Image src="/person-circle.svg" width={57} height={57} alt="Account" />
                </Link>
              </li>
              <li className="hover:underline cursor-pointer" onClick={async () => await supabase.auth.signOut()}>Log out</li>
            </>
          ) : (
            <>
              <li><Link href="/help" className="hover:underline">Help</Link></li>
              <li><Link href="/login" className="hover:underline">Log in</Link></li>
              <li><Link href="/sign-up" className="hover:underline">Sign up</Link></li>
            </>
          )}
        </ul>
      </div>
    </nav>
  );
}