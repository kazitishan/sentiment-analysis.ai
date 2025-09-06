// pages/sentisheet/[id].js
import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr'


//saves previously stored sentisheets

export default function SentisheetResults({ results, error }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h1 className="text-xl font-semibold text-red-800 mb-2">Error</h1>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => router.push('/upload')}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  const handleDownload = async () => {
    setDownloading(true);
    
    // Fix: Use the correct property names from your database
    const filePath = `${results.user_id}/${results.file_name}`; // Changed from 'filename' to 'file_name'
    
    const { data, error } = await supabase.storage
      .from('sentisheet-files')
      .download(filePath);
      
    if (error) {
      console.error('Download error:', error);
      setDownloading(false);
      return;
    }

    // Create a download link for the user
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = results.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setDownloading(false);
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Sentiment Analysis Results</h1>
    <button onClick={handleDownload} disabled={downloading}>
      {downloading ? 'Downloading...' : 'Download Results'}
    </button>
    </div>

  );
}

// Server-side rendering to load the results (fetch data on server → pass as props on the page's component → render immediately on client)
export async function getServerSideProps({ params, req, res }) { //Dynamic route: params contains the route parameters. If the page name is [id].js, then params will look like { id: ... }.
  const { id } = params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return {
      props: {
        error: 'Invalid results ID format'
      }
    };
  }
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
            cookiesToSet.forEach(({ name, value, options }) => {
              res.setHeader('Set-Cookie', `${name}=${value}; Path=/; ${options ? Object.entries(options).map(([k, v]) => `${k}=${v}`).join('; ') : ''}`);
            });
          },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        props: {
          error: 'You must be logged in to view this page.'
        }
      };
    }
  try {
    const {data, error} = await supabase.from('sentisheets').select('*').eq('id', id).single();
    //⚠️TODO: Implement Unauthorized access if the user.id !== data.user_id

    if (error || !data) {
      return {
        props: {
          error: error.message
        }
      };
    }
    console.log('Fetched data:', data);
    return {
      props: {
        results: data
      }
    };
  } catch (error) {
    console.error('Failed to load results:', error);
    return {
      props: {
        error: 'Failed to load results. Please try again.'
      }
    };
  }
}