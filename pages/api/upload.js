// pages/api/upload.js
import { createServerClient } from "@supabase/ssr";
import { processFileUpload } from "@/lib/processSentiSheet";

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '3mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Authentication
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
      console.error('Authentication error:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('User authenticated:', user.id, 'Email:', user.email || 'Anonymous');

    // Debug: Check if user exists in public.users table using a simple query
    const { data: userExists, error: userCheckError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();

    if (userCheckError) {
      console.error('User check failed:', userCheckError);
      // Try a different approach - check via a test insert on another table or use RLS
      console.log('Proceeding without user verification...');
    } else {
      console.log('User found in auth.users:', userExists.id);
    }

    // 2. Process file (creates buffer in memory)
    const result = await processFileUpload(req, user.id, supabase);
    console.log('Processing completed:', result.id);

    // 3. Upload processed file to Supabase storage
    const filePath = `${user.id}/${result.outputFile.filename}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('sentisheet-files')
      .upload(filePath, result.outputFile.buffer, {
        contentType: result.outputFile.contentType,
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
    }

    console.log('File uploaded successfully');

    // 4. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('sentisheet-files')
      .getPublicUrl(filePath);

    // 5. Optional: Save results JSON for debugging/backup
    if (result.resultsData) {
      const resultsJson = JSON.stringify(result.resultsData.data, null, 2);
      const resultsBuffer = Buffer.from(resultsJson, 'utf8');
      const resultsPath = `${user.id}/results/${result.id}.json`;
      
      const { error: resultsError } = await supabase.storage
        .from('sentisheet-files')
        .upload(resultsPath, resultsBuffer, {
          contentType: 'application/json',
          upsert: true
        });

      if (resultsError) {
        console.warn('Results upload failed:', resultsError);
      }
    }

    // 6. Create sentisheet record
    console.log('Attempting database insert with user_id:', user.id);
    
    const { data: sentisheet, error: insertError } = await supabase
      .from('sentisheets')
      .insert({
        user_id: user.id,
        id: result.id,
        file_name: result.outputFile.filename,
        file_url: publicUrl,
        analysis_results: {...result.results, ...result.metadata}, //previously result.metadata union type | indicates additional properties for excel files
        created_at: new Date().toISOString()
      })
      .select()
      .single();
      //Without the .select() method, the insert() operation will primarily return a success or error indication, but not the actual inserted row(s).
    if (insertError) {
      console.error('Database insert error:', insertError);
      console.error('Insert data was:', {
        user_id: user.id,
        id: result.id,
        file_name: result.outputFile.filename,
        file_url: publicUrl,
        analysis_results: {...result.results, ...result.metadata},
        created_at: new Date().toISOString()
      });
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    console.log('Database insert successful:', sentisheet.id);

    return res.status(200).json({
      success: true,
      id: sentisheet.id,
      redirectUrl: `/sentisheet/${sentisheet.id}`,
      metadata: result.metadata,
      fileUrl: publicUrl
    });

  } catch (error) {
    console.error('Upload processing failed:', error);
    return res.status(500).json({ error: error.message || 'Processing failed' });
  }
}