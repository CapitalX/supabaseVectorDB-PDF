import { createClient } from '@supabase/supabase-js';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { Document } from 'langchain/document';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import * as path from 'path';
import crypto from 'crypto';

export class PdfVectorLoader {
  private supabase;
  private embeddings;
  
  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    openAiKey: string,
    private readonly modelName: string = 'text-embedding-ada-002'
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.embeddings = new OpenAIEmbeddings({ 
      openAIApiKey: openAiKey,
      modelName: this.modelName
    });
  }

  private async createTableIfNotExists(tableName: string) {
    console.log(`Checking/creating table ${tableName}...`);
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGSERIAL PRIMARY KEY,
        content TEXT,
        embedding vector(1536),
        metadata JSONB,
        source TEXT,
        chunk_hash TEXT UNIQUE
      );

      -- Use IVFFlat index since we're now under 2000 dimensions
      CREATE INDEX IF NOT EXISTS ${tableName}_embedding_idx 
      ON ${tableName} 
      USING ivfflat (embedding vector_l2_ops)
      WITH (lists = 100);

      CREATE INDEX IF NOT EXISTS ${tableName}_chunk_hash_idx 
      ON ${tableName}(chunk_hash);
    `;

    // First, ensure vector extension is enabled
    await this.supabase.rpc('exec_sql', {
      sql_string: 'CREATE EXTENSION IF NOT EXISTS vector;'
    });

    // Then create the table
    const { error: sqlError } = await this.supabase.rpc('exec_sql', {
      sql_string: createTableSQL
    });

    if (sqlError) {
      console.error('Failed to create table:', sqlError);
      throw new Error(`Failed to create table: ${sqlError.message}`);
    }

    console.log(`Table ${tableName} is ready`);
  }

  async loadPdfsToVectorStore(
    pdfPaths: string[],
    tableName: string,
    chunkSize: number = 500,
    chunkOverlap: number = 50
  ) {
    try {
      console.log('Starting PDF processing...');
      
      // Check if table exists first
      const { data: tableExists } = await this.supabase
        .from(tableName)
        .select('id')
        .limit(1);
      
      // Only create table if it doesn't exist
      if (!tableExists) {
        await this.createTableIfNotExists(tableName);
      } else {
        console.log(`Table ${tableName} already exists, skipping creation...`);
      }
      
      for (const pdfPath of pdfPaths) {
        console.log(`Processing PDF: ${pdfPath}`);
        const loader = new PDFLoader(pdfPath, {
          splitPages: true,
          parsedItemSeparator: '\n',
        });
        
        const docs = await loader.load();
        console.log(`Loaded ${docs.length} pages from PDF`);

        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
          separators: ["\n\n", "\n", ".", "!", "?", ";", ":", " ", ""],
        });
        
        const chunks = await textSplitter.splitDocuments(docs);
        console.log(`Split into ${chunks.length} chunks`);
        
        const validChunks = chunks.filter(chunk => {
          if (!chunk.pageContent || chunk.pageContent.trim().length === 0) {
            console.warn('Skipping empty chunk');
            return false;
          }
          return true;
        });
        
        console.log(`Processing ${validChunks.length} valid chunks...`);
        await this.processAndStoreChunks(validChunks, tableName, pdfPath);
      }

      console.log('PDF processing completed successfully');
    } catch (error) {
      console.error('Error processing PDFs:', error);
      throw error;
    }
  }

  private async processAndStoreChunks(chunks: Document[], tableName: string, source: string) {
    console.log(`Processing ${chunks.length} chunks...`);
    const batchSize = 20; // Process 20 chunks at a time
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      try {
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);
        
        // Process embeddings in smaller sub-batches
        const subBatchSize = 5;
        const batchData = [];
        
        for (let j = 0; j < batch.length; j += subBatchSize) {
          const subBatch = batch.slice(j, j + subBatchSize);
          const subBatchData = await Promise.all(
            subBatch.map(async (chunk, index) => {
              const absoluteIndex = i + j + index;
              const timestamp = Date.now();
              const metadata = {
                chunk_hash: this.generateHash(chunk.pageContent + timestamp),
                doc_id: `doc_${timestamp}_${crypto.randomBytes(4).toString('hex')}`,
                source_file: path.basename(source),
                file_path: source,
                file_type: 'pdf',
                doc_type: source.toLowerCase().includes('reporting') ? 'reporting_guide' : 'release_notes',
                page_number: chunk.metadata.loc?.pageNumber || absoluteIndex + 1,
                chunk_index: absoluteIndex,
                total_chunks: chunks.length,
                processed_at: new Date().toISOString(),
                model_version: this.modelName,
                chunk_size: chunk.pageContent.length,
                original_metadata: chunk.metadata,
                estimated_word_count: chunk.pageContent.split(/\s+/).length,
                contains_code: this.detectCodeSnippet(chunk.pageContent),
                status: 'processed',
                version: '1.0'
              };

              console.log(`Generating embedding for chunk ${absoluteIndex + 1}/${chunks.length}`);
              const embedding = await this.embeddings.embedQuery(chunk.pageContent);

              return {
                content: chunk.pageContent,
                embedding,
                metadata,
                source,
                chunk_hash: metadata.chunk_hash
              };
            })
          );
          
          batchData.push(...subBatchData);
          // Small delay between sub-batches
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`Storing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);
        
        // First try to upsert
        const { error: upsertError } = await this.supabase
          .from(tableName)
          .upsert(batchData, {
            onConflict: 'chunk_hash',
            ignoreDuplicates: true
          });

        if (upsertError && upsertError.code !== '23505') { // Ignore duplicate key errors
          console.error('Upsert error:', upsertError);
          throw new Error(`Failed to store batch: ${upsertError.message}`);
        }

        console.log(`Successfully stored batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);
        
        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate key value')) {
          console.warn('Skipping duplicate chunks in batch...');
          continue;
        }
        console.error('Error processing batch:', {
          batchIndex: Math.floor(i/batchSize),
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          details: error
        });
        throw error;
      }
    }
  }

  async searchSimilarContent(
    tableName: string,
    query: string,
    limit: number = 5,
    threshold: number = 0.8
  ) {
    const embedding = await this.embeddings.embedQuery(query);

    // Enhanced similarity search with L2 distance
    const { data: results, error } = await this.supabase.rpc('match_documents_enhanced', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      table_name: tableName
    });

    if (error) throw error;
    return results;
  }

  private generateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private detectCodeSnippet(content: string): boolean {
    const codeIndicators = [
      /```[\s\S]*?```/,  // Markdown code blocks
      /{[\s\S]*?}/,      // Curly braces blocks
      /function\s*\(/,    // Function declarations
      /class\s+\w+/,      // Class declarations
      /import\s+.*from/,  // Import statements
      /const\s+\w+\s*=/,  // Const declarations
      /let\s+\w+\s*=/,    // Let declarations
      /var\s+\w+\s*=/,    // Var declarations
    ];

    return codeIndicators.some(pattern => pattern.test(content));
  }
} 