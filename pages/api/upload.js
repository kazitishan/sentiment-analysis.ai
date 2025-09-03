// pages/api/upload.js
import { createServerClient } from "@supabase/ssr";
import { processFileUpload } from "@/lib/processSentiSheet";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {

    // 1. Authentication - Add cookie configuration
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('User authenticated:', user.id);

    // Remove this line - trigger already created the user
    // await ensureUserExists(supabase, user.id);

    // Process file
    const result = await processFileUpload(req);
    console.log('Processing completed:', result.id);

    // Create sentisheet record (this will work because user exists from trigger)
    const { data: sentisheet, error: insertError } = await supabase
      .from('sentisheets')
      .insert({
        user_id: user.id,
        file_name: result.metadata.filename,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    return res.status(200).json({
      success: true,
      id: sentisheet.id,
      redirectUrl: `/sentisheet/${sentisheet.id}`,
      metadata: result.metadata
    });

  } catch (error) {
    console.error('Upload processing failed:', error);
    return res.status(500).json({ error: error.message || 'Processing failed' });
  }
}

// Remove the ensureUserExists function entirely