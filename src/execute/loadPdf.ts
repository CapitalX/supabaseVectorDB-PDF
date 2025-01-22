import { PdfVectorLoader } from '../utils/PdfVectorLoader';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function loadPdfToSupabase() {
  console.log('Starting PDF loading process...');
  
  try {
    console.log('Checking environment variables...');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.OPENAI_API_KEY) {
      throw new Error('Missing required environment variables');
    }

    // Initialize the loader with your credentials
    console.log('Initializing PdfVectorLoader...');
    const loader = new PdfVectorLoader(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY,
      process.env.OPENAI_API_KEY,
      'text-embedding-ada-002'
    );

    // Just the new reporting PDF
    const pdfPaths = [
      '/path/to/your/pdf.pdf'  // Path to your PDF
    ];
    console.log('PDF paths:', pdfPaths.map(p => path.basename(p)));

    // Load to the existing table
    console.log('Starting PDF processing...');
    await loader.loadPdfsToVectorStore(
      pdfPaths,
      'insert_table_name_here',  
      500,
      50
    );

    // Test a reporting-specific query
    console.log('Testing search functionality...');
    const searchResults = await loader.searchSimilarContent(
      'insert_table_name_here',
      'Ask a question about something?',
      5,
      0.7
    );
    
    console.log('Search results:', JSON.stringify(searchResults, null, 2));
  } catch (error) {
    console.error('Error in loadPdfToSupabase:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: error
    });
    throw error;
  }
}

console.log('Script started');
loadPdfToSupabase()
  .then(() => console.log('Script completed successfully'))
  .catch(error => {
    console.error('Script failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: error
    });
    process.exit(1);
  }); 