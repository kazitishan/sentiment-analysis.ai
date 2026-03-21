// src/lib/processSentiSheet.js
import { IncomingForm } from 'formidable';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from '@/lib/supabase';


// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function determineFileType(file) {
  const extension = file.originalFilename?.split('.').pop()?.toLowerCase();
  const mimeType = file.mimetype;

  // routing logic: trust MIME type first (when it's specific)
  if (mimeType === 'text/csv') return 'csv';
  if (mimeType === 'application/vnd.ms-excel' || 
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'excel';
  }

  //edge case: no MIME type at all or application/octet-stream
  if (mimeType === 'application/octet-stream' || !mimeType) {
    if (extension === 'csv') return 'csv';
    if (extension === 'xlsx' || extension === 'xls') return 'excel';
  }
  
  throw new Error("Unsupported file type");
}

function createBatches(data, tokenLimit = 1000) {
  const batches = [];
  let currentBatch = [];
  let currentTokenCount = 0;
  
  for (const item of data) {
    const itemTokens = Math.ceil(item.text.length / 4); // ~4 characters per token
    
    if (currentTokenCount + itemTokens > tokenLimit && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [item];
      currentTokenCount = itemTokens;
    } else {
      currentBatch.push(item);
      currentTokenCount += itemTokens;
    }
  }
  
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  return batches;
}

function createCSVWithSentiment(originalData, sentimentResults, model) {
  // Add sentiment column to each row
  const updatedData = originalData.map((row, index) => {
    return {
      ...row,
      [`${model} Sentiment`]: sentimentResults[index] || 'N/A'
    };
  });

  // Convert to CSV string
  const headers = Object.keys(updatedData[0]);
  const csvContent = [
    headers.join(','), // Header row
    ...updatedData.map(row => 
      headers.map(header => `"${String(row[header]).replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n');

  return csvContent;
}

function createExcelWithSentiment(originalData, sentimentResults, fileBuffer, sheetName, model) {
  // Read from buffer instead of file path
  const originalWorkbook = XLSX.read(fileBuffer, { type: 'buffer' }); //raw file content from parseExcel()
  
  // Add sentiment column to the data
  const updatedData = originalData.map((row, index) => {
    return {
      ...row,
      [`${model} Sentiment`]: sentimentResults[index] || 'N/A' //property names are expected to be either a simple identifier (e.g a variable) or a string literal, so not template literals directly 
    };
  });

  // Create new worksheet with updated data
  const newWorksheet = XLSX.utils.json_to_sheet(updatedData);
  
  // Replace the original sheet
  originalWorkbook.Sheets[sheetName] = newWorksheet;
  
  // Write to buffer
  const buffer = XLSX.write(originalWorkbook, { 
    type: 'buffer', 
    bookType: 'xlsx' 
  });
  
  return buffer;
}

function estimateTokenUsage(columnData, sentimentClassification) {
  // Calculate the fixed prompt template size
  let config; 
  const sentimentOptions = {
    'Basic': {
      options: ['1: Positive', '2: Neutral', '3: Negative'],
      description: 'basic sentiment'
    },
    'Granular': {
      options: ['1: Very Positive', '2: Positive', '3: Neutral', '4: Negative', '5: Very Negative'],
      description: 'granular sentiment'
    },
    'Dr.Ekman': {
      options: ['1: Anger', '2: Disgust', '3: Fear', '4: Happiness', '5: Sadness', '6: Surprise'],
      description: 'emotion according to Dr. Ekman\'s six basic emotions'
    }
  };

  if (!sentimentClassification.includes('Basic') &&
      !sentimentClassification.includes('Granular') &&
      !sentimentClassification.includes('Dr.Ekman')
  ) {
    console.log('Custom sentiment detected');
    sentimentOptions['Custom'] = {
      options: sentimentClassification.split(',').map((sentiment, index) => `${index + 1}: ${sentiment.trim()}`),
      description: 'custom sentiment'
    };
     config = {
      options: sentimentClassification.split(',').map((sentiment, index) => `${index + 1}: ${sentiment.trim()}`),
      description: 'custom sentiment'
    };
    const pattern = /^[\p{L}\p{M}\s,''\-]+$/u;
    const sentiments = sentimentClassification.split(',').map(s => s.trim());
    for (const sentiment of sentiments) {
      if (!pattern.test(sentiment)) {
        throw new Error("Custom sentiments may only contain letters, spaces, commas, apostrophes, and hyphens (no numbers or special symbols)");
      }
    }

  }
  else {
    config = sentimentOptions[sentimentClassification];
  }
  
  // Calculate fixed template tokens (the parts that don't change)
  const templateStart = `Classify the ${config.description} for each text. Answer only with an array of the corresponding numbers:\n\n`;
  const templateOptions = config.options.join('\n');
  const templateMiddle = '\n\nHere is the list of texts to analyze:\n\n';
  const templateEnd = '\n\nResponse format: [number, number, number, ...]';
  
  const fixedTemplate = templateStart + templateOptions + templateMiddle + templateEnd;
  const fixedTemplateTokens = Math.ceil(fixedTemplate.length / 4);
  
  // Calculate variable content tokens (the actual text data)
  const textContentTokens = columnData.reduce((sum, item) => {
    // Account for the numbering format: "1. "text""
    const itemWithFormatting = `${item.rowIndex}. "${item.text}"`;
    return sum + Math.ceil(itemWithFormatting.length / 4);
  }, 0);
  
  // Calculate how many batches we'll need
  const batches = createBatches(columnData);
  const totalBatches = batches.length;
  
  // Total input tokens = (fixed template × number of batches) + all text content
  const totalInputTokens = (fixedTemplateTokens * totalBatches) + textContentTokens;
  
  // Response tokens are very predictable: [1, 2, 3, ...] format
  // Each number + comma + space ≈ 1 token, plus brackets
  const avgResponseTokensPerBatch = Math.ceil(batches.reduce((sum, batch) => sum + batch.length, 0) / totalBatches) + 2; // +2 for brackets
  const totalResponseTokens = avgResponseTokensPerBatch * totalBatches;
  
  const estimatedTotalTokens = totalInputTokens + totalResponseTokens;
  console.log(`Estimated token usage: ${estimatedTotalTokens} tokens (${totalInputTokens} input + ${totalResponseTokens} output)`);
  return estimatedTotalTokens;
}

async function checkUserStatus(userId, estimatedTokens, supabase, model, sentimentClassification) { 
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select()
      .eq('id', userId)
      .single(); 

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Failed to retrieve user data:', error);
      throw new Error(`Failed to retrieve user data: ${error.message}`);
    }
    const premiumModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-5-nano', 'gpt-5-mini', 'gpt-5', 'claude-sonnet-4-20250514'];
    if (model && premiumModels.includes(model) && !users?.subscription_id) {
      throw new Error(`The selected AI model "${model}" is available for premium users only. Please upgrade your account to access this model.`);
    }
    const validFreeClassifications = ['Basic', 'Granular', 'Dr.Ekman'];    
    if (!validFreeClassifications.includes(sentimentClassification)) {
      if (!users?.subscription_id) {
        throw new Error(`Custom sentiment classification is available for premium users only. Please upgrade your account to access this classification.`);
      }
    }
    console.log('User data retrieved:', users);
    return checkLimitsAndReturn(users.daily_usage_count, estimatedTokens, supabase, users.subscription_id);
  } catch (error) {
    console.error('Authentication check failed:', error);
    throw new Error(`Usage check failed: ${error.message}`);
  }
}

// Helper function to check limits and return usage info
async function checkLimitsAndReturn(currentUsage, estimatedTokens, supabase, subscriptionId) {
  //TODO ⚠️: integrate with Stripe to get actual subscription plan limits
  try {
  const { data: { user }, error } = await supabase.auth.getUser();
  let dailyLimit;
  if (error) {
    console.error('Failed to retrieve user information:', error);
    throw new Error(`Failed to retrieve user information: ${error.message}`);
  }
  if (user?.is_anonymous) {
    console.log('Anonymous user detected');
    dailyLimit = 25000;
  } else {
    console.log('Registered user detected');
    dailyLimit = 250000;
  }

  const totalAfterProcessing = currentUsage + estimatedTokens;
  
  if (totalAfterProcessing > dailyLimit) {
    throw new Error(`Daily token limit exceeded. Current usage: ${currentUsage}, Estimated tokens needed: ${estimatedTokens}, Daily limit: ${dailyLimit}`);
  }

  return {
    currentUsage,
    estimatedTokens,
    totalAfterProcessing,
    dailyLimit,
    remainingTokens: dailyLimit - currentUsage
  };
  } catch (error) {
    console.error('Error determining user limits:', error);
    throw new Error(`Error determining user limits: ${error.message}`);
  }
}

async function updateDailyUsage(userId, tokensUsed, supabase) {
  try {
    // Get current usage first
    const { data: currentUser } = await supabase
      .from('users')
      .select('daily_usage_count')
      .eq('id', userId)
      .single();

    const newUsage = (currentUser?.daily_usage_count || 0) + tokensUsed;

    // Update with the new total
    const { error } = await supabase
      .from('users')
      .update({
        daily_usage_count: newUsage
      })
      .eq('id', userId)

    if (error) {
      console.error('Failed to update usage:', error);
    } else {
      console.log(`Updated usage for user ${userId}: ${newUsage} tokens`);
    }
  } catch (error) {
    console.error('Usage update failed:', error);
  }
}

// =============================================================================
// FORM DATA PARSING
// =============================================================================

async function parseFormData({fields, files}) {
  // const form = new IncomingForm(); //parse multipart form data 
  // const [fields, files] = await form.parse(req); 
  
  const file = files.file?.[0];
  const textColumn = fields.textColumn?.[0];
  const sentimentClassification = fields.sentimentClassification?.[0];
  const sheetName = Array.isArray(fields.sheetName) 
  ? fields.sheetName[0] 
  : fields.sheetName; // For Excel files with multiple sheets
  const aiModel = fields.aiModel?.[0] || 'gemini-2.5-flash-lite'; //defaults to gemini-2.5-flash-lite instead of undefined (or errors without optional chaining)

  if (!file || !textColumn || !sentimentClassification) {
    console.log('Form data missing:', { file, textColumn, sentimentClassification });
    throw new Error("Missing required fields: file, textColumn, or sentimentClassification");
  }

  // Validate file type
  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error("Invalid file type. Please upload CSV or Excel files only.");
  }

  // Validate sentiment classification
  // const validClassifications = ['Basic', 'Granular', 'Dr.Ekman'];
  // if (!validClassifications.includes(sentimentClassification)) {
  //   throw new Error("Invalid sentiment classification. Must be Basic, Granular, Dr.Ekman.");
  // }
  return { file, textColumn, sentimentClassification, aiModel, sheetName };
}

// =============================================================================
// FILE PARSING FUNCTIONS (directly verifies file type)
// =============================================================================

async function parseCSV(file) {
  try {
    const csvContent = fs.readFileSync(file.filepath, 'utf8');
    
    const parsed = Papa.parse(csvContent, { 
      header: true, //TODO: determine by user's input
      skipEmptyLines: true,
      dynamicTyping: false, //disabled to avoid ReDoS risk
      transformHeader: (header) => header.trim(),
    });
    
    if (parsed.errors.length > 0) {
      console.warn('CSV parsing warnings:', parsed.errors);
    }
    
    return {
      data: parsed.data,
      headers: parsed.meta.fields,
      fileType: 'csv',
      metadata: {
        rows: parsed.data.length,
        columns: parsed.meta.fields?.length || 0
      }
    };
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
}

async function parseExcel(file, requestedSheetName) {
  try {
    const fileBuffer = fs.readFileSync(file.filepath); //read file into buffer (raw content) via the filepath 
    
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',  //specify we're reading from buffer
      cellFormula: false,
      cellDates: false,
      cellNF: false,
      cellStyles: false
    });
  
    const availableSheets = workbook.SheetNames;
    let targetSheet = requestedSheetName || availableSheets[0];
    
    if (!availableSheets.includes(targetSheet)) {
      throw new Error(`Sheet "${targetSheet}" not found. Available sheets: ${availableSheets.join(', ')}`);
    }
    
    const worksheet = workbook.Sheets[targetSheet];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false
    });
    
    if (jsonData.length === 0) {
      throw new Error("Excel sheet is empty");
    }
    
    const headers = jsonData[0].map(header => String(header).trim());
    const data = jsonData.slice(1)
      .filter(row => {
        // Skip completely empty rows (where all cells are empty or whitespace)
        return row.some(cell => cell !== '' && String(cell).trim() !== '');
      })
      .map(row => {
        const rowObj = {};
        headers.forEach((header, index) => {
          rowObj[header] = row[index] || '';
        });
        return rowObj;
      });
    
    return {
      data: data,
      headers: headers,
      fileType: 'excel',
      fileBuffer: fileBuffer, //raw content instead of having to rely on the temporary file 
      metadata: {
        rows: data.length,
        columns: headers.length,
        sheetName: targetSheet,
        availableSheets: availableSheets
      }
    };
  } catch (error) {
    throw new Error(`Excel parsing failed: ${error.message}`);
  }
}

async function parseSpreadsheet(file, sheetName) {
  const fileType = determineFileType(file);
  
  switch (fileType) {
    case 'csv':
      return await parseCSV(file);
    case 'excel':
      return await parseExcel(file, sheetName);
    default:
      throw new Error("Unsupported file format");
  }
}

// =============================================================================
// DATA PROCESSING FUNCTIONS
// =============================================================================

function extractColumnData(parsedResult, textColumn) {
  const { data, headers } = parsedResult;
  
  const columnIndex = parseInt(textColumn);
  
  if (isNaN(columnIndex) || columnIndex < 1 || columnIndex > headers.length) {
    throw new Error(`Column index "${textColumn}" is out of range. Available columns (1-${headers.length}): ${headers.join(', ')}`);
  }
  
  const targetColumn = headers[columnIndex - 1]; // Convert to 0-based for array access
  console.log(`Using column ${columnIndex}: "${targetColumn}"`);
  console.log(`Using column: "${targetColumn}" (from input: "${textColumn}")`);
  
  const columnData = data
    .map((row, index) => ({
      rowIndex: index + 1, // 1-based for user reference
      text: String(row[targetColumn] || '').trim(),
      originalRow: row
    }))
    .filter(item => {
      return item.text.length > 0; //filter non-whitespace 
    });
  
  if (columnData.length === 0) {
    throw new Error(`No valid text data found in column "${targetColumn}"`);
  }
  
  // Check for the 20% rule from your document
  const shortTextCount = columnData.filter(item => item.text.length < 2).length;
  const totalRows = columnData.length;
  const shortTextPercentage = (shortTextCount / totalRows) * 100;
  
  if (shortTextPercentage > 20) {
    throw new Error("More than 20% of cells in your selected column have less than 2 characters. Please check your spreadsheet again for malformed data.");
  }
  
  return columnData;
}

// =============================================================================
// SENTIMENT ANALYSIS FUNCTIONS
// =============================================================================

function generatePrompt(batchTexts, sentimentClassification) {
  let config;
  const sentimentOptions = {
    'Basic': {
      options: ['1: Positive', '2: Neutral', '3: Negative'],
      description: 'basic sentiment'
    },
    'Granular': {
      options: ['1: Very Positive', '2: Positive', '3: Neutral', '4: Negative', '5: Very Negative'],
      description: 'granular sentiment'
    },
    'Dr.Ekman': {
      options: ['1: Anger', '2: Disgust', '3: Fear', '4: Happiness', '5: Sadness', '6: Surprise'],
      description: 'emotion according to Dr. Ekman\'s six basic emotions'
    },
  };
  if (!sentimentClassification.includes('Basic') &&
      !sentimentClassification.includes('Granular') &&
      !sentimentClassification.includes('Dr.Ekman')
  ) {
    console.log('Custom sentiment detected');
    sentimentOptions['Custom'] = {
      options: sentimentClassification.split(',').map((sentiment, index) => `${index + 1}: ${sentiment.trim()}`),
      description: 'custom sentiment'
    };
     config = {
      options: sentimentClassification.split(',').map((sentiment, index) => `${index + 1}: ${sentiment.trim()}`),
      description: 'custom sentiment'
    };
  }
  else {
    config = sentimentOptions[sentimentClassification];
  }

  return `Classify the ${config.description} for each text. Answer only with an array of the corresponding numbers:

  ${config.options.join('\n')}

  Here is the list of texts to analyze:

  ${batchTexts.map((text, index) => `${index + 1}. "${text}"`).join('\n')}

  Response format: [number, number, number, ...]`;
}

async function processBatch(batch, model, sentimentClassification) {
  const batchTexts = batch.map(item => item.text);
  const prompt = generatePrompt(batchTexts, sentimentClassification);

  try {
    // Call the AI model with the dynamic prompt
    const response = await callAIModel(prompt, model);
    
    // Parse the response and match it back to the batch items
    const sentiments = parseAIResponse(response.textContent, batch.length, sentimentClassification);
    
    return {sentiments, tokenUsage: response.tokenUsage};
  } catch (error) {
    console.error('Batch processing failed:', error);
    // Return default values for failed batch
    return batch.map(() => 'N/A');
  }
}

async function callAIModel(prompt, model) {
  console.log('Calling AI model:', model);
  console.log('Prompt:', prompt);
  let response;
  let textContent; 
  let tokenUsage;  

  if (model.includes('gemini')) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY environment variable not set');
    try {
      const Gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      switch(model) {
        case 'gemini-2.5-flash-lite':
          response = await Gemini.models.generateContent({
          model: model,
          contents: prompt,
          generationConfig: {
            temperature: 0,  // Match Google AI Studio setting
            topP: 1,
            topK: 1,
            maxOutputTokens: 1000
        }
        });
        break;
        case 'gemini-2.5-flash':
          response = await Gemini.models.generateContent({
            model: model,
            contents: prompt,
            generationConfig: {
              temperature: 0,
              topP: 1,
              topK: 1,
              maxOutputTokens: 1000
            },
            config: {
              thinkingConfig: {
                thinkingBudget: 50
              }
            }
          });
          break;
        case 'gemini-2.5-pro':
          response = await Gemini.models.generateContent({
            model: model,
            contents: prompt,
            generationConfig: {
              temperature: 0,
              topP: 1,
              topK: 1,
              maxOutputTokens: 1000
            },
            config: {
              thinkingConfig: {
                thinkingBudget: 128
              }
            }
          });
        break;
        default:
          throw new Error(`Unsupported Gemini model: ${model}`);  
        }
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`We were unable to process your Gemini SentiSheet request: ${error.message}`);
    }
  }          
  if (model.startsWith('gpt')) {
    try {
        const GPT = new OpenAI();
        switch(model) {
          case 'gpt-5-nano':
          response = await GPT.responses.create({
            model: model,
            input: prompt,
            reasoning: {
              effort: 'minimal'
            },            
            text: {
              verbosity: 'low'
            }
          });
          break;
          case 'gpt-5-mini':
          response = await GPT.responses.create({
            model: model,
            input: prompt,
            reasoning: {
              effort: 'minimal'
            },            
            text: {
              verbosity: 'low'
            }
          });
          break;
          case 'gpt-5':
          response = await GPT.responses.create({
            model: model,
            input: prompt,
            temperature: 0,
            reasoning: {
              effort: 'minimal'
            },
            text: {
              verbosity: 'low'
            }
          });
          break;
          default:
            throw new Error(`Unsupported GPT model: ${model}`);
        }
    } catch (error) {
      console.error('GPT API error:', error);
      throw new Error(`We were unable to process your GPT SentiSheet request: ${error.message}`);
    }
  }
  if (model.startsWith('claude-sonnet')) {
    try {
      const Claude = new Anthropic();
      response = await Claude.messages.create({
        model: model,
        max_tokens: 1000,
        messages: [
           {
            role: 'user',
            content: prompt
          }
          ]
        });
      } catch (error) {
        console.error('Claude API error:', error);
        throw new Error(`We were unable to process your Claude SentiSheet request: ${error.message}`);
      }
    }

    console.log('Raw AI Response:', response);
      
    // Extract the actual text content from the response
    if (model.startsWith('gemini')) {
      textContent = response.text;
      tokenUsage = response.usageMetadata.totalTokenCount;
    } 
    if (model.startsWith('gpt')) {
      textContent = response.output_text;
      tokenUsage = response.usage.total_tokens;
    }
    if (model.startsWith('claude-sonnet')) {
      textContent = response.content[0].text
      tokenUsage = response.usage.input_tokens + response.usage.output_tokens;
    }
      
    console.log('Extracted text:', textContent);
    console.log('Token usage:', tokenUsage);

    return { textContent, tokenUsage };
}

function parseAIResponse(response, expectedCount, sentimentClassification) {
  // Parse the AI response that should be an array of numbers [1, 2, 3, ...]
  // Convert numbers to sentiment labels based on classification type
  const sentimentMaps = {
    'Basic': {
      1: 'Positive',
      2: 'Neutral', 
      3: 'Negative'
    },
    'Granular': {
      1: 'Very Positive',
      2: 'Positive',
      3: 'Neutral',
      4: 'Negative',
      5: 'Very Negative'
    },
    'Dr.Ekman': {
      1: 'Anger',
      2: 'Disgust',
      3: 'Fear',
      4: 'Happiness',
      5: 'Sadness',
      6: 'Surprise'
    }
  };
    if (!sentimentClassification.includes('Basic') &&
      !sentimentClassification.includes('Granular') &&
      !sentimentClassification.includes('Dr.Ekman')) {
    // Custom sentiment classification
    const customSentiments = sentimentClassification.split(',').map(s => s.trim());
    const customMap = {};
    customSentiments.forEach((sentiment, index) => {
      customMap[index + 1] = sentiment;
    });
    sentimentMaps['Custom'] = customMap;
    sentimentClassification = 'Custom';
  }

  const sentimentMap = sentimentMaps[sentimentClassification];
  const validRange = Object.keys(sentimentMap).map(k => parseInt(k));
  const minValid = Math.min(...validRange);
  const maxValid = Math.max(...validRange);
  
  try {
    // Try to extract array from response (handle different formats AI might return)
    let numbersArray = [];
    
    // Look for array pattern like [1, 2, 3] or [1,2,3]
    const arrayMatch = response.match(/\[([\d,\s]+)\]/);
    if (arrayMatch) {
      numbersArray = arrayMatch[1].split(',').map(n => parseInt(n.trim()));
    } else {
      // Fallback: look for individual numbers in the response
      const numbers = response.match(/\d+/g);
      if (numbers) {
        numbersArray = numbers.slice(0, expectedCount).map(n => parseInt(n));
      }
    }
    
    // Convert numbers to sentiment labels
    const sentiments = [];
    for (let i = 0; i < expectedCount; i++) {
      const sentimentNumber = numbersArray[i];
      
      if (sentimentNumber >= minValid && sentimentNumber <= maxValid) {
        sentiments.push(sentimentMap[sentimentNumber]);
      } else {
        // Default fallback based on classification type
        const defaultValues = {
          'Basic': 'Neutral',
          'Granular': 'Neutral', 
          'Dr.Ekman': 'Happiness'
        };
        sentiments.push(defaultValues[sentimentClassification]);
      }
    }
    
    return sentiments;
    
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    console.log('Raw response:', response);
    
    // Return default sentiments if parsing fails
    const defaultValues = {
      'Basic': 'Neutral',
      'Granular': 'Neutral',
      'Dr.Ekman': 'Happiness'
    };
    
    return Array(expectedCount).fill(defaultValues[sentimentClassification]);
  }
}

async function performSentimentAnalysis(columnData, model, sentimentClassification) {
  const batches = createBatches(columnData);
  const allResults = new Array(columnData.length); // Pre-allocate array to track positions
  let totalTokensUsed = 0;
  let failedItems = []; // Track items that need retry
  
  console.log(`Processing ${batches.length} batches for sentiment analysis...`);
  
  // First pass: Process all batches
  let currentIndex = 0;
  for (let i = 0; i < batches.length; i++) {
    console.log(`Processing batch ${i + 1} of ${batches.length}`);

    try {
      const batch = batches[i];
      const batchResults = await processBatch(batch, model, sentimentClassification); 
      
      // Store results in correct positions
      batchResults.sentiments.forEach((result, batchIndex) => {
        allResults[currentIndex + batchIndex] = result;
      });
      
      // Calculate token usage (exact from processBatch)
      const batchTokens = batchResults.tokenUsage;  
      totalTokensUsed += batchTokens;
      
      currentIndex += batch.length;

    } catch (error) {
      console.error(`Batch ${i + 1} failed:`, error);
      
      // Track failed items for retry
      const batch = batches[i];
      batch.forEach((item, batchIndex) => {
        failedItems.push({
          item: item,
          originalIndex: currentIndex + batchIndex
        });
      });
      
      currentIndex += batch.length;
    }
  }
  
  // Second pass: Retry failed items (only once per SentiSheet)
  if (failedItems.length > 0) {
    console.log(`Retrying ${failedItems.length} failed items...`);
    
    try {
      // Create new batches from failed items
      const retryBatches = createBatches(failedItems.map(item => item.item));
      
      let retryIndex = 0;
      for (let i = 0; i < retryBatches.length; i++) {
        console.log(`Processing retry batch ${i + 1} of ${retryBatches.length}`);
        
        try {
          const retryBatch = retryBatches[i];
          const retryResults = await processBatch(retryBatch, model, sentimentClassification);
          
          // Store retry results in original positions
          retryResults.forEach((result, batchIndex) => {
            const failedItem = failedItems[retryIndex + batchIndex];
            allResults[failedItem.originalIndex] = result;
          });
          
          // Calculate precise token usage
          const retryTokens = retryResults.tokenUsage;
          totalTokensUsed += retryTokens;
          
          retryIndex += retryBatch.length;
          
        } catch (retryError) {
          console.error(`Retry batch ${i + 1} failed:`, retryError);
          
          // Fill remaining retry batch with defaults
          const retryBatch = retryBatches[i];
          const defaultValues = {
            'Basic': 'Neutral',
            'Granular': 'Neutral',
            'Dr.Ekman': 'Happiness'
          };
          
          retryBatch.forEach((item, batchIndex) => {
            const failedItem = failedItems[retryIndex + batchIndex];
            allResults[failedItem.originalIndex] = defaultValues[sentimentClassification];
          });
          
          retryIndex += retryBatch.length;
        }
      }
      
    } catch (retryError) {
      console.error('Retry process failed:', retryError);
    }
  }
  
  // Fill any remaining null positions with defaults (edge case safety)
  // const defaultValues = {
  //   'Basic': 'Neutral',
  //   'Granular': 'Neutral',
  //   'Dr.Ekman': 'Happiness'
  // };
  
  // for (let i = 0; i < allResults.length; i++) {
  //   if (allResults[i] === undefined || allResults[i] === null) {
  //     allResults[i] = defaultValues[sentimentClassification];
  //   }
  // }
  
  return {
    sentiments: allResults,
    tokenUsage: totalTokensUsed,
    cost: calculateCost(totalTokensUsed, model),
    processingDetails: {
      totalRows: columnData.length,
      batchesProcessed: batches.length,
      itemsRetried: failedItems.length,
      sentimentClassification
    }
  };
}

function calculateCost(tokens, model) {
  // Calculate cost based on your pricing document
  const pricing = {
    'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 }, // per 1M tokens
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    // Add other models as needed
  };
  
  const modelPricing = pricing[model] || pricing['gemini-2.5-flash-lite'];
  return (tokens / 1000000) * modelPricing.input; // Simplified calculation
}

// =============================================================================
// OUTPUT FILE CREATION
// =============================================================================

async function createOutputFile(parsedResult, analysisResults, originalFile, sheetName, model) {
  const { data, fileType, fileBuffer } = parsedResult;
  
  const timestamp = Date.now();
  const fileName = `SentiSheet-${originalFile.originalFilename}-${timestamp}`;
  
  if (fileType === 'csv') {
    // Create CSV with sentiment
    const csvContent = createCSVWithSentiment(data, analysisResults.sentiments, model);
    const csvBuffer = Buffer.from(csvContent, 'utf8');
    
    return {
      type: 'csv',
      buffer: csvBuffer,
      content: csvContent,
      filename: `${fileName}.csv`,
      contentType: 'text/csv'
    };
    
  } else if (fileType === 'excel') {
    // Create Excel with sentiment
    const buffer = createExcelWithSentiment(
      data, 
      analysisResults.sentiments, 
      fileBuffer,
      sheetName || 'Sheet1',
      model
    );
    
    return {
      type: 'excel', 
      buffer: buffer,
      filename: `${fileName}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }
}

async function saveResults(sheetId, data) {
  // Just return the data - no file system operations
  return {
    sheetId,
    data,
    timestamp: new Date().toISOString()
  };
}

// =============================================================================
// MAIN EXPORT FUNCTION
// =============================================================================

export async function processFileUpload(parsedFormData, userId, supabase) {
  try {
    // Parse form data
    const { file, textColumn, sentimentClassification, aiModel, sheetName } = await parseFormData(parsedFormData);
    const parsedResult = await parseSpreadsheet(file, sheetName);
    const columnData = extractColumnData(parsedResult, textColumn);

    const estimatedTokens = estimateTokenUsage(columnData, sentimentClassification);
    console.log(`Estimated token usage: ${estimatedTokens}`);

    const usageCheck = await checkUserStatus(userId, estimatedTokens, supabase, aiModel, sentimentClassification);
    console.log('Usage check passed:', usageCheck);

    // Pass userId through to performSentimentAnalysis
    const analysisResults = await performSentimentAnalysis(
      columnData, 
      aiModel, 
      sentimentClassification,
    );
    
    // Update actual usage after processing
    await updateDailyUsage(userId, analysisResults.tokenUsage, supabase);
    
    // Create output file with sentiment results - returns buffer and metadata
    const outputFile = await createOutputFile(
      parsedResult, 
      analysisResults, 
      file, 
      sheetName,
      aiModel
    );
    
    // Generate unique ID and prepare results data
    const sheetId = randomUUID();
    const resultsData = await saveResults(sheetId, {
      originalData: parsedResult.data,
      sentimentResults: analysisResults,
      outputFile: outputFile,
      metadata: {
        ...parsedResult.metadata,
        filename: file.originalFilename,
        textColumn,
        sentimentClassification,
        aiModel,
        processedRows: columnData.length,
        timestamp: new Date().toISOString()
      }
    });
    
    return {
      success: true,
      id: sheetId,
      results: analysisResults,
      outputFile: outputFile,
      resultsData: resultsData,
      usageInfo: usageCheck, // Include usage info in response
      metadata: {
        ...parsedResult.metadata,
        filename: file.originalFilename,
        processedRows: columnData.length,
        aiModel,
        textColumn,
        sentimentClassification
      }
    };
    
  } catch (error) {
    console.error('Processing failed:', error);
    throw new Error(error.message); //an error would previously look like "Processing failed: Usage check failed: The selected AI model "gemini-2.5-flash" is available for premium users only. Please upgrade your account to access this model."
  }
}