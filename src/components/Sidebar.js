import Link from 'next/link';
import { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
import ExpandMenu from '../../public/expand-menu.svg';
import Spreadsheet from '../../public/spreadsheet-icon-new.svg';
import User from '../../public/person-circle.svg';
import Create from '../../public/plus-circle-fill.svg';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(true); // New state to track if user is anonymous
  const [sentiSheetLinks, setSentiSheetLinks] = useState([]);

  useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setIsAnonymous(!(session?.user && !session.user.is_anonymous));
    if (session?.user && !session.user.is_anonymous) {
      supabase.from('sentisheets')
        .select('id, file_name, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setSentiSheetLinks(data || []));
    }
  });
  }, []); // Empty dependency array to run only on mount

  return (
    <aside className={`bg-background border-r-2 border-foreground/10 min-h-screen p-4 flex flex-col ${isCollapsed ? "w-16" : "w-64"}`}>
      <nav className="flex flex-col flex-1">
        <ul className="flex flex-col gap-2">
          <button onClick={() => setIsCollapsed(!isCollapsed)} className={`!p-0 !m-0 mb-4 rounded-full w-8 h-8 flex items-center justify-center hover:bg-foreground/10 ${!isCollapsed ? 'self-end' : ''}`}>
            {isCollapsed ? <ExpandMenu className="rotate-180 [&_path]:fill-foreground hover:cursor-pointer" /> : <ExpandMenu className="[&_path]:fill-foreground hover:cursor-pointer" />}
          </button>
          <Link href="/create" className={"p-2 rounded-2xl hover:bg-foreground/10 transition-colors flex items-center justify-center gap-2"} title="Create New SentiSheet">
              {!isCollapsed && 'New SentiSheet'}          
            <Create className="shrink-0 [&_path]:from-blue-700 to-violet-600  rainbow-transition " />
          </Link>
          {sentiSheetLinks.map((sheet) => (
            <li key={sheet.id}>
              <Link
                href={`/sentisheet/${sheet.id}`}
                className={`flex items-center gap-2 p-2 rounded-2xl hover:bg-foreground/10 transition-colors ${isCollapsed ? 'justify-center' : ''} `}
                title ={sheet.file_name || 'Untitled'}
              >
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">
                      {sheet.file_name?.replace(/^SentiSheet-\s*/i, '') || 'Untitled'}
                    </span>
                    {sheet.created_at && (
                      <span className="text-xs text-foreground/60">
                        {new Date(sheet.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
                <Spreadsheet width={22} height={22} viewBox="0 0 512 512" className="shrink-0 [&_path]:fill-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        <Link href={`/${isAnonymous ? 'login' : 'account'}`} className=" p-2 rounded-2xl hover:bg-foreground/10 transition-colors flex items-center justify-center gap-2" title={isAnonymous ? 'You are a guest. Please log in for further access.' : 'My Account'}>
          {isCollapsed ? '' : `${isAnonymous ? 'Log In' : 'My Account'}`}
          <User className="shrink-0 [&_path]:fill-foreground" />
        </Link>
      </nav>
    </aside>
  );
}
