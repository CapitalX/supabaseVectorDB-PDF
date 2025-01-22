# PDF to Supabase Importer Documentation

A TypeScript-based system for processing ServiceNow PDF documentation into a vector database with semantic search capabilities. The system uses LangChain, OpenAI embeddings, and Supabase for vector storage.

## Features

### PDF Processing
- Automatic PDF loading and text extraction
- Smart text chunking with configurable size and overlap
- Batch processing with rate limiting
- Empty chunk filtering
- Code snippet detection

### Vector Storage
- Supabase vector database integration
- Automatic table creation and indexing
- Efficient batch uploading
- Duplicate detection and handling
- Comprehensive metadata tracking including:
  - Document source
  - Page numbers
  - Document type (release notes/reporting guide)
  - Processing timestamps
  - Content statistics

### Search Capabilities
- Semantic similarity search
- Configurable similarity thresholds
- Adjustable result limits
- Rich search results including:
  - Content matches
  - Similarity scores
  - Source metadata
  - Page references

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with required credentials:
```env
OPENAI_API_KEY=your-openai-key
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
```

3. Configure Supabase:
   - Enable vector extension
   - Create necessary tables (automatic on first run)

## Usage

### Loading PDFs
```bash
npx ts-node src/execute/loadPdf.ts
```

### Searching Content
```bash
# Run all test queries
npx ts-node src/execute/searchPdf.ts

# Run specific query
npx ts-node src/execute/searchPdf.ts "your search query here"
```

## Technical Details

### Vector Storage Schema
- Content storage with 1536-dimensional embeddings
- IVFFlat indexing for efficient similarity search
- Unique chunk hashing for deduplication
- Comprehensive metadata storage

### Processing Pipeline
1. PDF Loading
2. Text Chunking
3. Embedding Generation
4. Vector Storage
5. Semantic Search

## Project Structure
```
src/
├── execute/
│   ├── loadPdf.ts    # PDF processing script
│   └── searchPdf.ts  # Search functionality
└── utils/
    └── PdfVectorLoader.ts  # Core processing class
```

## Dependencies
- LangChain for document processing
- OpenAI for embeddings
- Supabase for vector storage
- PDF-parse for PDF handling

## Performance Considerations
- Batch processing with configurable sizes
- Rate limiting for API calls
- Efficient vector indexing
- Duplicate handling
- Error recovery

## Error Handling
- Comprehensive error logging
- Duplicate content detection
- API rate limit handling
- Process recovery capabilities

## Future Enhancements
- Chat interface for interactive queries
- Multi-document correlation
- Advanced filtering options
- Custom embedding models support
