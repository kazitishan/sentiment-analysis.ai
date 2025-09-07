//pages/create.js
import { useState, useEffect } from 'react';
import { set, useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import { supabase } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr'


export default function NewSentiSheetWithPreview({ isPremiumUser }) {
  const { register, handleSubmit, formState: { errors, isSubmitting, invalid, isSubmitSuccessful }, setValue, watch } = useForm();
  const [previewData, setPreviewData] = useState(null);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(''); //for backend preview errors 
  const [selectedSheet, setSelectedSheet] = useState('');
  const [submitError, setSubmitError] = useState('');  //for backend submission errors upon submission

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressInfo, setProgressInfo] = useState(null);


  /*register: registers individual input fields for validation
    handleSubmit: handles form submission and validation
    formState: contains information about the form's state, including errors
    setValue: programmatically sets the value of a form field
    watch: subscribes to form field changes
  */
  const router = useRouter(); //to redirect when successful POST 

  const calculateProgress = () => {
    let progress = 0;
    if (previewData) progress++;
    if (watch('sentimentClassification')) progress++;
    return progress;
  };


  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setPreviewData(null);
      setSelectedColumn(null);
      setSelectedSheet('');
      return;
    }

    await loadPreview(file, ''); //load with default sheet
  }

  const loadPreview = async (file, sheetName = '') => {
    setIsLoadingPreview(true);
    setPreviewError(''); 
    
    setPreviewData(null);
    setSelectedColumn(null);
    setValue('textColumn', '');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (sheetName) {
        formData.append('sheetName', sheetName);
      }

      console.log('Loading preview for sheet:', sheetName || 'default');

      const response = await fetch('/api/preview', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to preview file');
      }

      const preview = await response.json();
      console.log('Preview response:', preview);
      
      setPreviewData(preview);
      setSelectedSheet(preview.currentSheet || '');
      
      // Auto-select first column by default
      setSelectedColumn(1);
      setValue('textColumn', '1');

    } catch (error) {
      setPreviewError(error.message);
      setPreviewData(null);
    } finally { 
      setIsLoadingPreview(false);
    }
  };

  const handleTextColumnChange = (event) => {
    const value = parseInt(event.target.value);
    if (value >= 1 && value <= (previewData?.headers.length || 0)) {
      setSelectedColumn(value);
    } else {
      setSelectedColumn(null);
      setValue('textColumn', '');
    } 
  };

  const handleColumnSelect = (columnIndex) => {
    setSelectedColumn(columnIndex);
    setValue('textColumn', columnIndex.toString()); //textcolumn: '[index]'
  };
  
  const handleSheetChange = async (sheetName) => {
    if (previewData && sheetName !== selectedSheet) {
      console.log(sheetName);
      setSelectedSheet(sheetName);
      // Get the current file from the watch function
      const currentFiles = watch('file');
      if (currentFiles && currentFiles[0]) {
        await loadPreview(currentFiles[0], sheetName);
      }
    }
  };
  const AIModels = [
    {
      name: 'Google Gemini 2.5 Flash-Lite',
      value: 'gemini-2.5-flash-lite',
      speed: 3,
      intelligence: 1,
      premium: false 
    },
    {
      name: 'Gemini 2.5 Flash',
      value: 'gemini-2.5-flash',
      speed: 2,
      intelligence: 2,
      premium: true
    },
    {
      name: 'Google Gemini 2.5 Pro',
      value: 'gemini-2.5-pro',
      speed: 1,
      intelligence: 3,
      premium: true
    },
    {
      name: 'OpenAI GPT-5-nano',
      value: 'gpt-5-nano',
      speed: 3,
      intelligence: 2,
      premium: true
    },
    {
      name: 'OpenAI GPT-5 mini',
      value: 'gpt-5-mini',
      speed: 4,
      intelligence: 3,
      premium: true
    },
    {
      name: 'OpenAI GPT-5',
      value: 'gpt-5',
      speed: 5,
      intelligence: 4,
      premium: true
    },
    {
      name: 'Anthropic Claude 4 Sonnet',
      value: 'claude-sonnet-4-20250514',
      speed: 4,
      intelligence: 3,
      premium: true
    }
  ]



const onSubmit = async (data) => {
  try {
    setSubmitError(''); //clear any previous errors
    const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) { //supabase errors don't throw, they return errors 
          console.error('Anonymous sign-in failed:', error);
          setSubmitError(error.message);
        }
      }
    const formData = new FormData();
    formData.append('file', data.file[0]);
    formData.append('textColumn', data.textColumn);
    formData.append('sentimentClassification', data.sentimentClassification);
    if (selectedSheet) formData.append('sheetName', selectedSheet);
    formData.append('aiModel', data.aiModel);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) { //since throw new Error() should have a error property
      const errorData = await response.json();
      const errorMessage = errorData.error || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const result = await response.json();
    router.push(`/sentisheet/${result.id}`);
    
  } catch (error) {
    setSubmitError(error.message); // Display to user
  }
};

const timeEstimation = (previewData) => {
  if (!previewData) return null;

  const totalRows = previewData.totalRows || 0;
  const estimatedTime = Math.ceil(totalRows / 100) * 2; // Estimate 2 seconds per 100 rows

  return estimatedTime
};

  return (
  
    <>
    {!isSubmitting && 
      <>
      <Header bodyText="Submit SentiSheet request" className="text-center " />
      <progress value={calculateProgress()} max="2" className="w-full mt-2" /> {/*function is always called per render*/}

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-9xl mx-auto p-6">
        <label className="text-lg font-medium">Spreadsheet file upload
          <input 
              {...register("file", {
                required: "No spreadsheet selected.",
                validate: {
                    fileType: (fileList) => {
                      if (!fileList || fileList.length === 0) return true; 
                      const file = fileList[0];
                      const allowedTypes = [
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/vnd.ms-excel",
                        "text/csv"
                      ];
                      if (!allowedTypes.includes(file.type)) return "Please upload a valid spreadsheet file (.xlsx, .xls, or .csv)";
                      return true;
                    },
                    fileSize: (fileList) => {
                      if (!fileList || fileList.length === 0) return true;
                      const file = fileList[0];
                      const maxSize = 2 * 1024 * 1024; // 2MB
                      if (file.size > maxSize) {
                        return "File size must be less than 2MB";
                      }
                      return true;
                    }
                  }
              })} 
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
            />
        </label>
        {previewError && <span className="text-red-500 text-sm">{previewError}</span>}
        {errors.file && <span className="text-red-500 text-sm">{errors.file.message}</span>} 

        {/* Loading State */}
        {isLoadingPreview && (
          <div className="w-full text-center py-8">
            <div className="inline-flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading preview...
            </div>
          </div>
        )}

        {previewData && (
          <div className="w-full space-y-4">
            <h2 className="text-2xl font-semibold">Spreadsheet Preview</h2>
            <p className="text-gray-600">
              Showing {previewData.previewData.length} of {previewData.totalRows} rows. Click on a column to select it for sentiment analysis.
            </p>
            {/* Column Selection Input */}
            <div className="flex items-center space-x-4 bg-blue-50 p-4 rounded-lg">
              <label className="text-lg font-medium">
                Selected Column:
                <input 
                  {...register("textColumn", { 
                    required: "Column number is required.", 
                    min: { value: 1, message: "Column number must be at least 1" },
                    max: { value: previewData.headers.length, message: `Column number must be at most ${previewData.headers.length}` },
                    pattern: { value: /^[0-9]+$/, message: "Column number must be a positive integer" }
                  })}
                  type="number" 
                  min="1"
                  max={previewData.headers.length}
                  className="border border-gray-300 rounded px-3 py-2 w-20 text-center" 
                  onChange={handleTextColumnChange}
                />
              </label>
              <span className="text-gray-600">
                of {previewData.headers.length} 
                {selectedColumn && (
                  <span className="font-medium text-blue-600">
                    → "{previewData.headers[selectedColumn - 1]}"
                  </span>
                )}
              </span>
            </div>
            {errors.textColumn && <span className="text-red-500 text-sm">{errors.textColumn.message}</span>}
            {/* Preview Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full">
                  {/* table header: */}
                  <thead className="bg-gray-50"> 
                    {/*table row:*/}
                    <tr>
                      {previewData.headers.map((header, index) => (
                        <th 
                          key={index}
                          onClick={() => handleColumnSelect(index + 1)} 
                          className={`px-4 py-3 text-left text-sm font-medium cursor-pointer transition-colors border-r last:border-r-0 ${
                            selectedColumn === index + 1 
                              ? 'bg-blue-100 text-blue-900 border-blue-300' 
                              : 'text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate">{header}</span>
                            <span className="text-xs text-gray-500 ml-2">#{index + 1}</span>
                          </div>
                          {selectedColumn === index + 1 && (
                            <div className="text-xs text-blue-600 mt-1">Selected for analysis</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {previewData.previewData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t">
                        {previewData.headers.map((header, colIndex) => (
                          <td 
                            key={colIndex}
                            onClick={() => handleColumnSelect(colIndex + 1)}
                            className={`px-4 py-3 text-sm cursor-pointer transition-colors border-r last:border-r-0 ${
                              selectedColumn === colIndex + 1 
                                ? 'bg-blue-50 border-blue-200' 
                                : 'hover:bg-gray-50'
                            }`}
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
              <div className="bg-gray-100 border-t p-2">
                <div className="flex space-x-1">
                  {/*FIX: buttons default to submit when inside a form*/}
                  {previewData.availableSheets.map((sheet, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSheetChange(sheet)}
                    >
                      {sheet}
                    </button> 
                  ))}
                </div>
              </div>
            )}
            {previewData.fileType === 'excel' && previewData.availableSheets && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
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
        {/* Sentiment Classification - Always visible */}
        <fieldset className="w-full">
          <legend className="text-2xl font-semibold mb-4">Sentiment Classification</legend>
          
          <div className="space-y-4">
            <label className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input 
                {...register("sentimentClassification", { required: "Sentiment classification is required." })}
                type="radio"
                value="Basic"
                className="mt-1"
              />
              <div>
                <p className="font-semibold">Basic Sentiment Classification</p>
                <div className="flex space-x-4 text-sm text-gray-600 mt-1">
                  <span>Positive</span>
                  <span>Neutral</span>
                  <span>Negative</span>
                </div>
              </div>
            </label>
            <label className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input 
                {...register("sentimentClassification", { required: "Sentiment classification is required." })}
                type="radio"
                value="Granular"
                className="mt-1"
              />
              <div>
                <p className="font-semibold">Granular Sentiment Classification</p>
                <div className="flex space-x-4 text-sm text-gray-600 mt-1">
                  <span>Very Positive</span>
                  <span>Positive</span>
                  <span>Neutral</span>
                  <span>Negative</span>
                  <span>Very Negative</span>
                </div>
              </div>
            </label>
              <label className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input 
                {...register("sentimentClassification", { required: "Sentiment classification is required." })}
                type="radio"
                value="Dr.Ekman"
                className="mt-1"
              />
              <div>
                <p className="font-semibold">Dr. Ekman's Six Basic Emotions</p>
                <div className="flex space-x-4 text-sm text-gray-600 mt-1">
                  <span>Anger</span>
                  <span>Disgust</span>
                  <span>Fear</span>
                  <span>Happiness</span>
                  <span>Sadness</span>
                  <span>Surprise</span>
                </div>
              </div>
            </label>
          </div>
          {errors.sentimentClassification && <span className="text-red-500 text-sm">{errors.sentimentClassification.message}</span>}
        </fieldset>
        <fieldset className="w-full">
        <legend className="text-2xl font-semibold mb-4">AI Model</legend>
        <table className="w-full text-left border-collapse border">
          <thead>
            <tr className="">
              <th className="p-3">Model name</th>
              <th className="p-3">Speed</th>
              <th className="p-3">Intelligence</th>
            </tr>
          </thead>
          <tbody>
            {AIModels.map((model, index) => (
              <tr key={index} className="hover:bg-gray-50 cursor-pointer">
                <td>
                  <label className="flex items-start space-x-3 p-4 cursor-pointer">
                    <input
                      {...register("aiModel", { required: "AI model is required." })}
                      type="radio"
                      value={model.value}
                      className="mt-2"
                      disabled={model.premium && !isPremiumUser}
                    />
                    <p className="font-semibold">{model.name}</p>
                  </label>
                </td>
                <td>
                  <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-sm font-medium rounded">
                    {model.speed}
                  </span>
                </td>
                <td>
                  <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded">
                    {model.intelligence}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {errors.aiModel && <span className="text-red-500 text-sm">{errors.aiModel.message}</span>}
      </fieldset>
{/* Submit Button - Always visible but disabled until requirements met */}
        <button 
          type="submit"
          disabled={isSubmitting || !selectedColumn}
          className={`px-8 py-3 rounded-lg text-xl font-semibold transition-colors ${
            isSubmitting || !selectedColumn
              ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {isSubmitting ? 'Processing...' : 'Analyze Sentiment'}
        </button>
        {submitError && <span className="text-red-500 text-sm">{submitError}</span>}
      </form>
    </>
  }
  {isSubmitting && (
    <>
      <Header bodyText="Processing request" className="text-center " />
      <p> We received your SentiSheet request and are currently processing your request right now. </p>
      <p> Estimated processing time: {timeEstimation(previewData)} seconds </p>
    </>
  )}
  </>
  )
}

export async function getServerSideProps({ params, req, res }) { //parameter that contains 
  try {
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
    // Get the session
    const { data: { session } } = await supabase.auth.getSession();
    
    let isPremiumUser = false;
    
    if (session?.user) {
      // Check if user exists in users table and has subscription_id
      const { data: userData, error } = await supabase
        .from('users')
        .select('subscription_id')
        .eq('id', session.user.id)
        .single();
      
      if (!error && userData?.subscription_id) {
        isPremiumUser = true;
      }
    }
    console.log('isPremiumUser:', isPremiumUser);
    
    return {
      props: {
        isPremiumUser
      }
    };
  } catch (error) {
    console.error('Error checking user subscription:', error);
    return {
      props: {
        isPremiumUser: false
      }
    };
  }
}