import { PdfVectorLoader } from '../utils/PdfVectorLoader';
import dotenv from 'dotenv';

dotenv.config();

interface SearchResult {
  content: string;
  similarity: number;
  metadata: {
    source_file: string;
    page_number: number;
    doc_type?: string;
  };
}

async function searchPdf(query: string) {
  const loader = new PdfVectorLoader(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!,
    process.env.OPENAI_API_KEY!,
    'text-embedding-ada-002'
  );

  const results = await loader.searchSimilarContent(
    'insert_table_name_here',
    query,
    5,  // Increased to 5 results
    0.7
  );

  console.log('\nResults for:', query);
  results.forEach((result: SearchResult, index: number) => {
    console.log(`\n[Result ${index + 1}] Similarity: ${(result.similarity * 100).toFixed(2)}%`);
    console.log('Content:', result.content);
    console.log('Source:', result.metadata.source_file);
    console.log('Page:', result.metadata.page_number);
  });
}

// Test questions about both release notes and reporting
const testQueries = [
  "What is the main purpose of this document?",
  "Can you summarize the key features?", 
  "How do I get started with this system?",
  "What are the technical requirements?",
  "Tell me about the configuration options"
];

// Run all test queries
async function runTestQueries() {
  for (const query of testQueries) {
    await searchPdf(query);
    console.log('\n' + '-'.repeat(80) + '\n'); // Separator between queries
  }
}

// Run either a specific query from command line or all test queries
const query = process.argv[2];
if (query) {
  searchPdf(query)
    .then(() => console.log('\nSearch completed'))
    .catch(console.error);
} else {
  console.log('Running all test queries...');
  runTestQueries()
    .then(() => console.log('\nAll test queries completed'))
    .catch(console.error);
} 