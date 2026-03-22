// pages/api/upload.js
import { createServerClient } from "@supabase/ssr";
import { processFileUpload } from "@/lib/processSentiSheet";
import { IncomingForm } from 'formidable';

export const config = {
  api: {
    bodyParser: false, // Disable default body parser to handle  multipart/form-data
    sizeLimit: '3mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. CSRF Validation - Parse form to get token from body
    // const form = new IncomingForm();
    // const [fields] = await form.parse(req);
    
    // const cookieToken = req.cookies['csrf-token'];
    // const formToken = fields.csrfToken?.[0];

    // if (!cookieToken || !formToken || cookieToken !== formToken) {
    //   return res.status(403).json({ error: 'Invalid CSRF token' });
    // }

    // 2. Authentication
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

    // 2.5. Parse form once (for both captcha and file processing)
    const form = new IncomingForm();
    const [fields, files] = await form.parse(req);

    // 2.6. Captcha verification for anonymous users
    if (!user.email && process.env.NODE_ENV === 'production') {
      const captchaToken = fields.captchaToken?.[0];

      if (!captchaToken) {
        return res.status(400).json({ error: 'Captcha verification required for anonymous users' });
      }

      // Verify captcha with hCaptcha API
      const verifyResponse = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          secret: process.env.HCAPTCHA_SECRET_KEY,
          response: captchaToken,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyData.success) {
        console.error('Captcha verification failed:', verifyData['error-codes']);
        return res.status(403).json({ error: 'Captcha verification failed' });
      }

      console.log('Captcha verified for anonymous user');
    }

    if (!user.email_confirmed_at && !user.is_anonymous) {
      return res.status(403).json({ error: 'As a security measure, all users must confirm their email address before processing SentiSheet requests.' });
    }

    console.log('User authenticated:', user.id, 'Email:', user.email || 'Anonymous');

    // 3. Process file (pass parsed fields and files instead of req)
    const result = await processFileUpload({ fields, files }, user.id, supabase);
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