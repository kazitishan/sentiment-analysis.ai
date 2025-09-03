// src/lib/processSentiSheet.js
import { IncomingForm } from 'formidable';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';

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

// =============================================================================
// FORM DATA PARSING
// =============================================================================

async function parseFormData(req) {
  const form = new IncomingForm(); //parse multipart form data 
  const [fields, files] = await form.parse(req); 
  
  const file = files.file?.[0];
  const textColumn = fields.textColumn?.[0];
  const sentimentClassification = fields.sentimentClassification?.[0];
  const sheetName = Array.isArray(fields.sheetName) 
  ? fields.sheetName[0] 
  : fields.sheetName; // For Excel files with multiple sheets
  const model = fields.model?.[0] || 'gemini-2.5-flash-lite'; //defaults to gemini-2.5-flash-lite instead of undefined (or errors without optional chaining)

  if (!file || !textColumn || !sentimentClassification) {
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
  const validClassifications = ['Basic', 'Granular', 'Dr.Ekman'];
  if (!validClassifications.includes(sentimentClassification)) {
    throw new Error("Invalid sentiment classification. Must be Basic, Granular, or Dr.Ekman.");
  }

  return { file, textColumn, sentimentClassification, model, sheetName };
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
    const data = jsonData.slice(1).map(row => {
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

  const config = sentimentOptions[sentimentClassification];
  if (!config) {
    throw new Error(`Invalid sentiment classification: ${sentimentClassification}`);
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
    const sentiments = parseAIResponse(response, batch.length, sentimentClassification);
    
    return sentiments;
  } catch (error) {
    console.error('Batch processing failed:', error);
    // Return default values for failed batch
    return batch.map(() => 'N/A');
  }
}

async function callAIModel(prompt, model) {
  console.log('Calling AI model:', model);
  
  if (model.includes('gemini')) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }
    
    try {
      const ai = new GoogleGenAI(process.env.GEMINI_API_KEY); // ✅ Pass key directly
      const genModel = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' }); // ✅ Get model first
      
      // ✅ Correct API format
      const response = await genModel.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0,
          topP: 1,
          topK: 1,
          maxOutputTokens: 1000
        }
      });
      
      // ✅ Proper response extraction
      const text = response.response.text();
      console.log('AI Response:', text);
      return text;
      
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API failed: ${error.message}`);
    }
  }
  
  // Mock response for testing...
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

async function performSentimentAnalysis(columnData, model, sentimentClassification, onProgress) {
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
      batchResults.forEach((result, batchIndex) => {
        allResults[currentIndex + batchIndex] = result;
      });
      
      // Calculate token usage (approximate)
      const batchTokens = batch.reduce((sum, item) => sum + Math.ceil(item.text.length / 4), 0);
      totalTokensUsed += batchTokens;
      
      currentIndex += batch.length;
      
      // // When we call onProgress here:
      // if (onProgress) {
      //     onProgress({
      //       current: i + 1,
      //       total: batches.length,
      //       percentage: ((i + 1) / batches.length) * 100
      //     });
      // }

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
          
          // Calculate retry token usage
          const retryTokens = retryBatch.reduce((sum, item) => sum + Math.ceil(item.text.length / 4), 0);
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
  const { data, fileType, fileBuffer } = parsedResult; // ← Add fileBuffer
  
  // Create results directory if it doesn't exist
  if (!fs.existsSync('./results')) {
    fs.mkdirSync('./results', { recursive: true });
  }
  
  if (fileType === 'csv') {
    // Create CSV with sentiment
    const csvContent = createCSVWithSentiment(data, analysisResults.sentiments, model);
    
    // Save to file system
    const outputPath = `./results/output_${Date.now()}.csv`;
    fs.writeFileSync(outputPath, csvContent);
    
    return {
      type: 'csv',
      path: outputPath,
      content: csvContent,
      filename: `SentiSheet-${originalFile.originalFilename}`
    };
    
  } else if (fileType === 'excel') {
    // Create Excel with sentiment
    const buffer = createExcelWithSentiment(
      data, 
      analysisResults.sentiments, 
      fileBuffer, // ← Use buffer instead of file.filepath
      sheetName || 'Sheet1',
      model
    );
    
    // Save to file system
    const outputPath = `./results/output_${Date.now()}.xlsx`;
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'excel', 
      path: outputPath,
      buffer: buffer,
      filename: `SentiSheet-${originalFile.originalFilename}`
    };
  }
}

async function saveResults(sheetId, data) {
  // Create results directory if it doesn't exist
  if (!fs.existsSync('./results')) {
    fs.mkdirSync('./results', { recursive: true });
  }
  
  const resultsPath = `./results/${sheetId}.json`;
  fs.writeFileSync(resultsPath, JSON.stringify(data, null, 2));
}

// =============================================================================
// MAIN EXPORT FUNCTION
// =============================================================================

export async function processFileUpload(req, onProgress) {
  try {
    // Parse form data
    const { file, textColumn, sentimentClassification, model, sheetName } = await parseFormData(req);
    const parsedResult = await parseSpreadsheet(file, sheetName);
    const columnData = extractColumnData(parsedResult, textColumn);
    
    // Pass onProgress through to performSentimentAnalysis
    const analysisResults = await performSentimentAnalysis(
      columnData, 
      model, 
      sentimentClassification,
      onProgress  // Pass it through
    );
    
    // Create output file with sentiment results
    const outputFile = await createOutputFile(
      parsedResult, 
      analysisResults, 
      file, 
      sheetName,
      model
    );
    
    // Generate unique ID and save all results
    const sheetId = uuidv4();
    await saveResults(sheetId, {
      originalData: parsedResult.data,
      sentimentResults: analysisResults,
      outputFile: outputFile,
      metadata: {
        ...parsedResult.metadata,
        filename: file.originalFilename,
        textColumn,
        sentimentClassification,
        model,
        processedRows: columnData.length,
        timestamp: new Date().toISOString()
      }
    });
    
    return {
      success: true,
      id: sheetId,
      results: analysisResults,
      downloadUrl: `/api/download/${sheetId}`,
      metadata: {
        ...parsedResult.metadata,
        processedRows: columnData.length,
        model,
        textColumn,
        sentimentClassification
      }
    };
    
  } catch (error) {
    console.error('Processing failed:', error);
    throw new Error(`Processing failed: ${error.message}`);
  }
}