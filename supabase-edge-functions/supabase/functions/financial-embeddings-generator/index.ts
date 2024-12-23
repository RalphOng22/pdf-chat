import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

// Interfaces for table detection and document structure
interface TableStructure {
  title: string;
  startPage: number;
  endPage: number;
  headers: string[];
  footers?: string[];
  continuationMarkers: string[];
  rows: TableRow[];
}

interface TableRow {
  content: string[];
  pageNumber: number;
  rowIndex: number;
}

interface FinancialChunk {
  text: string;
  pageNumber: number;
  tableId?: string;
  references?: Reference[];
  metadata: {
    isTable: boolean;
    tableType?: string;
    isNumeric: boolean;
    containsDates: boolean;
    continuedFromPage?: number;
    continuesOnPage?: number;
  };
}

interface Reference {
  type: 'note' | 'table' | 'section';
  targetPage: number;
  identifier: string;
  context: string;
}

// Pattern matching for financial tables
const FINANCIAL_PATTERNS = {
  incomeStatement: {
    headers: [
      /consolidated\s+statements?\s+of\s+operations/i,
      /consolidated\s+statements?\s+of\s+income/i,
      /consolidated\s+income\s+statements?/i,
    ],
    keywords: [
      /revenues?/i, /sales/i, /income/i,
      /expenses?/i, /costs?/i,
      /gross\s+profit/i,
      /operating\s+income/i,
      /net\s+income/i
    ]
  },
  balanceSheet: {
    headers: [
      /consolidated\s+balance\s+sheets?/i,
      /statements?\s+of\s+financial\s+position/i,
    ],
    keywords: [
      /assets?/i, /liabilities?/i, /equity/i,
      /current/i, /non-current/i,
      /cash/i, /receivables?/i, /inventory/i,
      /payables?/i
    ]
  },
  cashFlow: {
    headers: [
      /consolidated\s+statements?\s+of\s+cash\s+flows?/i,
      /cash\s+flow\s+statements?/i,
    ],
    keywords: [
      /operating\s+activities/i,
      /investing\s+activities/i,
      /financing\s+activities/i,
      /cash\s+flows?/i
    ]
  }
};
// Approach: Hybrid table detection
// 1. Pattern-based detection: Use regex patterns to identify financial content
// 2. Spatial analysis: Analyze text structure to identify tables
// First pass: Pattern-based detection
function detectFinancialContent(text: string): {
  type: string | null;
  confidence: number;
  matches: RegExpMatchArray[];
} {
  for (const [type, patterns] of Object.entries(FINANCIAL_PATTERNS)) {
    const headerMatches = patterns.headers.flatMap(pattern => 
      [...text.matchAll(pattern)]);
    const keywordMatches = patterns.keywords.flatMap(pattern => 
      [...text.matchAll(pattern)]);
    
    if (headerMatches.length > 0) {
      const confidence = (headerMatches.length + keywordMatches.length * 0.5) / 
        (patterns.headers.length + patterns.keywords.length);
      return { type, confidence, matches: [...headerMatches, ...keywordMatches] };
    }
  }
  return { type: null, confidence: 0, matches: [] };
}

// Second pass: Spatial analysis
function analyzeSpatialStructure(chunk: FinancialChunk): TableStructure | null {
  const lines = chunk.text.split('\n');
  const potentialHeaders: string[] = [];
  const rows: TableRow[] = [];
  let currentRowIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect headers based on positioning and formatting
    if (line.match(/^[A-Z\s]{5,}$/)) {
      potentialHeaders.push(line);
      continue;
    }

    // Detect numeric rows
    const numericContent = line.match(/[\d,\.]+%?/g);
    if (numericContent && numericContent.length >= 2) {
      rows.push({
        content: line.split(/\s{2,}/),
        pageNumber: chunk.pageNumber,
        rowIndex: currentRowIndex++
      });
    }
  }

  if (potentialHeaders.length === 0 || rows.length === 0) {
    return null;
  }

  return {
    title: potentialHeaders[0],
    startPage: chunk.pageNumber,
    endPage: chunk.pageNumber,
    headers: potentialHeaders,
    rows,
    continuationMarkers: detectContinuationMarkers(chunk.text)
  };
}

function detectContinuationMarkers(text: string): string[] {
  const markers = [
    'continued from previous page',
    '(continued)',
    'continued from page',
    'continued'
  ];
  return markers.filter(marker => 
    text.toLowerCase().includes(marker.toLowerCase()));
}

async function generateEmbeddings(chunks: FinancialChunk[]): Promise<number[][]> {
  const client = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY")!);
  const model = client.getGenerativeModel({ model: "text-embedding-004" });
  
  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    try {
      // Include metadata in the embedding context
      const embeddingContext = `
        ${chunk.metadata.tableType || ''} 
        ${chunk.text}
        ${chunk.metadata.isTable ? 'TABLE' : 'TEXT'}
        ${chunk.references?.map(ref => ref.context).join(' ') || ''}
      `;
      
      const result = await model.embedContent(embeddingContext);
      embeddings.push(result.embedding.values);
    } catch (error) {
      console.error(`Error generating embedding:`, error);
      throw error;
    }
  }
  return embeddings;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: corsHeaders
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
        status: 401, headers: corsHeaders
      });
    }

    const { chatId, fileName, filePath, textChunks } = await req.json();

    // Process chunks using hybrid approach
    const processedChunks: FinancialChunk[] = [];
    const tableStructures: TableStructure[] = [];

    for (const chunk of textChunks) {
      // First pass: Pattern matching
      const { type, confidence } = detectFinancialContent(chunk.text);
      
      const financialChunk: FinancialChunk = {
        text: chunk.text,
        pageNumber: chunk.page_number,
        metadata: {
          isTable: confidence > 0.7,
          tableType: type,
          isNumeric: /[\d,\.]+%?/g.test(chunk.text),
          containsDates: /\d{4}|\d{1,2}\/\d{1,2}(\/\d{2,4})?/g.test(chunk.text),
        }
      };

      // Second pass: Spatial analysis for high-confidence tables
      if (financialChunk.metadata.isTable) {
        const tableStructure = analyzeSpatialStructure(financialChunk);
        if (tableStructure) {
          tableStructures.push(tableStructure);
          financialChunk.tableId = `${chatId}-${tableStructures.length}`;
        }
      }

      processedChunks.push(financialChunk);
    }

    // Generate embeddings
    const embeddings = await generateEmbeddings(processedChunks);

    // Store results in database
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        chat_id: chatId,
        name: fileName,
        file_path: filePath,
        upload_date: new Date().toISOString(),
        page_count: Math.max(...processedChunks.map(c => c.pageNumber)),
        processing_status: 'processing'
      })
      .select()
      .single();

    if (documentError) throw documentError;

    // Store chunks and their embeddings
    for (let i = 0; i < processedChunks.length; i++) {
      const chunk = processedChunks[i];
      const { error: chunkError } = await supabase
        .from("financial_chunks")
        .insert({
          document_id: document.id,
          chat_id: chatId,
          page_number: chunk.pageNumber,
          content: chunk.text,
          embedding: embeddings[i],
          table_id: chunk.tableId,
        });

      if (chunkError) throw chunkError;
    }

    // Store table structures
    for (const table of tableStructures) {
      const { error: tableError } = await supabase
        .from("table_structures")
        .insert({
          document_id: document.id,
          title: table.title,
          start_page: table.startPage,
          end_page: table.endPage,
          headers: table.headers
        });

      if (tableError) throw tableError;
    }

    // Update document status
    await supabase
      .from("documents")
      .update({ processing_status: 'completed' })
      .eq('id', document.id);

    return new Response(
      JSON.stringify({
        message: 'Processing complete',
        documentId: document.id,
        tablesFound: tableStructures.length
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});