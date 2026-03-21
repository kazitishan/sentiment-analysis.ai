// pages/sentisheet/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr'
import Sidebar from '@/components/Sidebar';
import Squares from '@/components/Squares';


//saves previously stored sentisheets

export default function SentisheetResults({ results, error, sentiSheetLinks }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [previewData, setPreviewData] = useState();
  const [previewError, setPreviewError] = useState();
  const [selectedSheet, setSelectedSheet] = useState('');

  useEffect(() => {
    if (results) {
      loadPreview(null, results.analysis_results?.sheetName || ''); //initial load without file (will fetch from storage)
    }
  }, [results]);

  const loadPreview = async (file = null, sheetName = '') => {
    try {
      let fileData = file;

      // If no file provided, download from storage
      if (!fileData) {
        const { data, error } = await supabase.storage
          .from('sentisheet-files')
          .download(`${results.user_id}/${results.file_name}`);

        if (error) throw error;
        fileData = data;
      }

      const formData = new FormData();
      formData.append('file', fileData);

      // Add sheet name if provided
      if (sheetName) {
        formData.append('sheetName', sheetName);
      }

      const previewResponse = await fetch('/api/preview', {
        method: 'POST',
        body: formData
      });
      const preview = await previewResponse.json();
      if (previewResponse.ok) {
        setPreviewData(preview);
        setSelectedSheet(preview.currentSheet || '');
      } else {
        setPreviewError(preview.error || 'Failed to load preview');
      }
      console.log('Preview loaded:', preview);
    } catch (error) {
      console.error('Error loading preview:', error);
      setPreviewError(error.message);
      setPreviewData(null);
    }

  }
  const handleSheetChange = async (sheetName) => {
    if (previewData && sheetName !== selectedSheet) {
      console.log(sheetName);
      setSelectedSheet(sheetName);
    const filePath = `${results.user_id}/${results.file_name}`; // Changed from 'filename' to 'file_name'
    
    const { data, error } = await supabase.storage
      .from('sentisheet-files')
      .download(filePath);
      
      if (data) {
        await loadPreview(data, sheetName);
      }
      if (error) {
        setPreviewError(error.message);
      }
    }
  };

  if (error) {
    return (
      <div className="flex">
        <Sidebar/>
        <main className="container mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h1 className="text-xl font-semibold text-red-800 mb-2">Error</h1>
            <p className="text-red-600">{error}</p>
          </div>
        </main>
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
    } else {
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
  }
  const sentimentStatistics =  (sentiments) => {
    const stats = {};
    sentiments.forEach(sentiment => {
      stats[sentiment] = (stats[sentiment] || 0) + 1;
    });
    for (const sentiment in stats) {
      stats[sentiment] =  ((stats[sentiment] / sentiments.length) * 100).toFixed(2) + '%';
    }

    console.log('Sentiment statistics:', stats);
    return stats;
  }
  let sentiStatistics = Object.entries(sentimentStatistics(results.analysis_results.sentiments)); //object to an array of [key, value] pairs to map over an array
  return (
    <div className="flex">
      <Sidebar/>
    <div className="fixed inset-0 -z-10 blur-[1.5px]">
			<Squares speed={0.2} cellWidth={100} cellHeight={40} direction="up" />
		</div>  
    <main className="flex-col mx-auto p-6 bg-background rounded-2xl outlined  max-w-7xl my-8">
      <h1 className="text-2xl font-bold mb-4">{results.file_name} Sentiment Analysis Results</h1>
    <button onClick={handleDownload} disabled={downloading} className="mx-auto block outlined hover:cursor-pointer">
      {downloading ? 'Downloading...' : 'Download Results'}
    </button>
    <div className="mt-6">
    </div>
    {previewError && <p className="text-red-600 mt-4">Preview Error: {previewError}</p>}        {previewData && (
          <div className="w-full space-y-4">
            <h2 className="text-2xl font-semibold">Spreadsheet Preview</h2>
            <p className="text-gray-600">
              Showing {previewData.previewData.length} of {previewData.totalRows} rows. 
            </p>
            <p>
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">Sentiment Statistics:</h3>
                <ul className="list-disc list-inside">
                  {sentiStatistics.map(([sentiment, percentage]) => (
                    <li key={sentiment}>
                      <strong>{sentiment}:</strong> {percentage}
                    </li>
                  ))}  
                </ul>
                </div>
            </p>
            {/* Preview Table */}
            <div className="rounded-2xl overflow-hidden border-2 border-foreground/10">
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full border-collapse text-left">
                  {/* table header: */}
                  <thead className="bg-background">
                    {/*table row:*/}
                    <tr className="border-b-2 border-foreground/10">
                      {previewData.headers.map((header, index) => (
                        <th
                          key={index}
                          className="px-4 py-3 text-left text-sm font-medium"
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate">{header}</span>
                            <span className="text-xs text-foreground/60 ml-2">#{index + 1}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-background">
                    {previewData.previewData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t-2 border-foreground/10 hover:bg-foreground/5 transition-colors">
                        {previewData.headers.map((header, colIndex) => (
                          <td
                            key={colIndex}
                            className="px-4 py-3 text-sm"
                          >
                            <div className="max-w-xs truncate">
                              {row[header] || ''}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            {/* Sheet Tabs for Excel - Moved to bottom like real Excel */}
            {previewData.fileType === 'excel' && previewData.availableSheets && previewData.availableSheets.length > 1 && (
              <div className="border-t-2 border-foreground/10 p-2">
                <div className="flex space-x-1">
                  {/*FIX: buttons default to submit when inside a form*/}
                  {previewData.availableSheets.map((sheet, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSheetChange(sheet)}
                      className="hover:cursor-pointer"
                    >
                      {sheet}
                    </button> 
                  ))}
                </div>
              </div>
            )}
            {previewData.fileType === 'excel' && previewData.availableSheets && (
              <div className="bg-foreground/5 rounded-lg p-4">
                <p className="text-sm text-foreground/60">
                  <strong>Current Sheet:</strong> {previewData.currentSheet}
                  {previewData.availableSheets.length > 1 && (
                    <>
                      {' • '}
                      <strong>Available Sheets:</strong> {previewData.availableSheets.join(', ')}
                    </>
                  )}
                </p>
              </div>
            )}
            </div>
          </div>
        )}    
  </main>
  </div>
  
  );
}

// Server-side rendering to load the results (fetch data on server → pass as props on the page's component → render immediately on client)
export async function getServerSideProps({ params, req, res }) { //Dynamic route: params contains the route parameters. If the page name is [id].js, then params will look like { id: ... }.
  //NOTE: throwing errors here will show the default Next.js status code 500 page. Instead, return an error prop to handle it gracefully in the component.
  const { id } = params;
  let sentiSheetLinks = [];
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
    //When this fetches data from the database, any JSON or JSONB columns are automatically parsed into JavaScript objects by the Supabase client. 
    const {data, error} = await supabase.from('sentisheets').select('*').eq('id', id).single();
    
    if (data?.user_id !== user.id) {
      return {
        props: {
          error: 'You are unauthorized to view this sentisheet.'
        }
      };
    }
    const sheetsResult = await supabase
      .from('sentisheets')
      .select('id, file_name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!sheetsResult.error && sheetsResult.data) {
      sentiSheetLinks = sheetsResult.data;
    }

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
        results: data,
        sentiSheetLinks: sentiSheetLinks || []
      }
    };
  } catch (error) {
    console.error('Failed to load results:', error);
    return {
      props: {
        error: error.message
      }
    };
  }
}