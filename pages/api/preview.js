// pages/api/preview.js
import { IncomingForm } from 'formidable';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '3mb',
  },
};

function determineFileType(file) { //ripped straight from processSentiSheet.js
  const extension = file.originalFilename?.split('.').pop()?.toLowerCase();
  const mimeType = file.mimetype;

  // Trust MIME type first (when it's specific)
  if (mimeType === 'text/csv') return 'csv';
  if (mimeType === 'application/vnd.ms-excel' || 
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'excel';
  }

  // Fallback to extension when MIME type is generic/unknown
  if (mimeType === 'application/octet-stream' || !mimeType) {
    if (extension === 'csv') return 'csv';
    if (extension === 'xlsx' || extension === 'xls') return 'excel';
  }
  
  throw new Error("Unsupported file type");
}

async function parseFormData(req) {
  const form = new IncomingForm();
  const [fields, files] = await form.parse(req);

  const file = files.file?.[0];
  const sheetName = fields.sheetName?.[0] ?? null; // <-- capture requested sheet

  if (!file) {
    throw new Error("No file provided");
  }

  // Validate using our robust detector (mimetype OR extension)
  const fileType = determineFileType(file);
  if (!['csv', 'excel'].includes(fileType)) {
    throw new Error("Invalid file type. Please upload CSV or Excel files only.");
  }

  return { file, sheetName };
}

async function parseCSVPreview(file) {
  try {
    const csvContent = fs.readFileSync(file.filepath, 'utf8');
    
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
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
        totalRows: parsed.data.length,
        columns: parsed.meta.fields?.length || 0
      }
    };
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
}

async function parseExcelPreview(file, requestedSheetName) {
  try {
    // Read file into buffer
    const fileBuffer = fs.readFileSync(file.filepath);
    
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellFormula: false,
      cellDates: false,
      cellNF: false,
      cellStyles: false
    });
    
    // Handle multiple sheets
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
      metadata: {
        totalRows: data.length,
        columns: headers.length,
        sheetName: targetSheet,
        availableSheets: availableSheets
      }
    };
  } catch (error) {
    throw new Error(`Excel parsing failed: ${error.message}`);
  }
}

async function parseSpreadsheetPreview(file, sheetName) {
  const fileType = determineFileType(file);
  
  switch (fileType) {
    case 'csv':
      return await parseCSVPreview(file);
    case 'excel':
      return await parseExcelPreview(file, sheetName);
    default:
      throw new Error("Unsupported file format");
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form data (now includes sheetName)
    const { file, sheetName } = await parseFormData(req);

    // Pass sheetName to the parser so switching works
    const parsedResult = await parseSpreadsheetPreview(file, sheetName);

    // Return only preview data
    const previewData = parsedResult.data.slice(0, 5);

    res.status(200).json({
      headers: parsedResult.headers,
      previewData,
      totalRows: parsedResult.metadata.totalRows,
      fileType: parsedResult.fileType,
      ...(parsedResult.fileType === 'excel' && {
        availableSheets: parsedResult.metadata.availableSheets,
        currentSheet: parsedResult.metadata.sheetName
      })
    });
  } catch (error) {
    console.error('Preview failed:', error);
    
    const clientErrors = [
      'No file provided',
      'Unsupported file type', 
      'Invalid file type',
      'not found',
      'is empty'
    ];
    
    const isClientError = clientErrors.some(msg => 
      error.message.toLowerCase().includes(msg.toLowerCase())
    );
    
    if (isClientError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'The server failed to process file.' });
    }
  }
}