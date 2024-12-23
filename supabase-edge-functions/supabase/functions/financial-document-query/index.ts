import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface definitions 
interface FinancialChunk {
  id: number;
  document_id: number;
  chat_id: string;
  page_number: number;
  content: string;
  embedding: number[];
  table_id?: number;
  created_at: string;
}

interface ChunkReference {
  id: number;
  chunk_id: number;
  reference_type: string;
  reference_page: number;
  reference_identifier: string;
  context: string;
}

interface QueryResult {
  query: string;
  chat_id: string;
  extracted_data: any;
  source_references: ChunkReference[];
  page_numbers: number[];
  error?: string;
}

// Custom error classes for better error handling
class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class ProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessingError';
  }
}

// Helper function to analyze query using Gemini
async function analyzeQuery(
  genAI: GoogleGenerativeAI,
  query: string
): Promise<{ type: string; confidence: number; analysis: any }> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `As a financial analyst, analyze this query about financial statements:
    Query: "${query}"

    Consider these aspects:
    1. Statement Classification:
       - Income Statement (keywords: revenue, earnings, profit, loss, income, expenses)
       - Balance Sheet (keywords: assets, liabilities, equity, position)
       - Cash Flow Statement (keywords: cash flows, operating activities, investing, financing)
       - Comprehensive Income (keywords: comprehensive, OCI, other comprehensive income)
    
    2. Temporal Requirements:
       - Specific periods mentioned
       - Comparative analysis needed
       - Year-to-date vs quarterly
    
    3. Detail Level:
       - Line item specifics
       - Subtotal requirements
       - Calculation needs
    
    Return a JSON object with:
    {
      "type": "income_statement|balance_sheet|cash_flow|comprehensive_income",
      "confidence": <number between 0 and 1>,
      "temporal_focus": {
        "period_type": "quarterly|annual|ytd",
        "specific_dates": [],
        "comparative": boolean
      },
      "data_requirements": {
        "specific_items": [],
        "calculations": [],
        "level_of_detail": "summary|detailed"
      },
      "analysis_type": "raw|ratio|trend"
    }

    Ensure strict JSON format.`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    throw new ProcessingError(`Failed to analyze query: ${error.message}`);
  }
}


// Helper function to extract financial data using Gemini
async function extractFinancialData(
  genAI: GoogleGenerativeAI,
  chunks: FinancialChunk[],
  queryAnalysis: any
): Promise<any> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const combinedContent = chunks.map(c => c.content).join('\n\n');
    
    const prompt = `As a financial data analyst, extract and structure financial information from this text.
    Text content: ${combinedContent}

    Context: This is a ${queryAnalysis.type} analysis.
    Focus on ${queryAnalysis.temporal_focus.period_type} periods.
    
    Instructions:
    1. Data Identification:
       - Identify all numerical values and their context
       - Maintain exact numbers without rounding
       - Preserve parentheses for negative values
       - Note currency symbols and units
    
    2. Structural Organization:
       - Maintain hierarchical relationships
       - Preserve subtotals and totals
       - Keep line item relationships
    
    3. Temporal Organization:
       - Identify all time periods
       - Match data points to correct periods
       - Note any period-specific annotations
    
    4. Metadata Capture:
       - Document any footnote references
       - Capture measurement units
       - Note any restatements or adjustments
    
    Return a JSON object structured as:
    {
      "statement_type": "${queryAnalysis.type}",
      "periods": {
        "type": "quarterly|annual|ytd",
        "dates": [],
        "comparative": boolean
      },
      "metadata": {
        "currency": string,
        "units": string,
        "scale": string,
        "status": "audited|unaudited"
      },
      "data": {
        // Hierarchical financial data structure
        // Preserve exact numerical values
      },
      "notes": {
        "references": [],
        "footnotes": []
      }
    }

    Important:
    - Maintain exact numerical precision
    - Preserve all parentheses notation
    - Keep original formatting of numbers
    - Include all footnote references`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    throw new ProcessingError(`Failed to extract financial data: ${error.message}`);
  }
}

async function validateFinancialData(
  genAI: GoogleGenerativeAI,
  extractedData: any,
  statementType: string
): Promise<{ isValid: boolean; warnings: string[]; corrections: any }> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `As a financial auditor, validate this ${statementType} data:
    Data: ${JSON.stringify(extractedData, null, 2)}

    Perform these validation checks:
    1. Mathematical Accuracy:
       - Subtotals equal sum of components
       - Cross-foot and down-foot verification
       - Matching totals across sections
    
    2. Logical Consistency:
       - Asset = Liabilities + Equity (for balance sheets)
       - Net Income calculation consistency
       - Cash flow reconciliation
    
    3. Data Completeness:
       - Required line items present
       - Essential subtotals included
       - Proper hierarchical structure
    
    4. Format Validation:
       - Consistent numerical presentation
       - Proper handling of negative values
       - Correct period alignment
    
    Return a JSON object with:
    {
      "isValid": boolean,
      "warnings": [
        // Array of specific warning messages
      ],
      "validations": {
        "mathematical": boolean,
        "logical": boolean,
        "completeness": boolean,
        "formatting": boolean
      },
      "corrections": {
        // Suggested corrections if any
      }
    }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    throw new ProcessingError(`Failed to validate financial data: ${error.message}`);
  }
}
// Main processing function
async function processFinancialQuery(
  genAI: GoogleGenerativeAI,
  query: string,
  chunks: FinancialChunk[]
): Promise<any> {
  // 1. Analyze query intent with enhanced prompt
  const queryAnalysis = await analyzeQuery(genAI, query);
  
  // 2. Extract data with context-aware prompt
  const extractedData = await extractFinancialData(genAI, chunks, queryAnalysis);
  
  // 3. Validate data with specific statement type checks
  const validation = await validateFinancialData(
    genAI,
    extractedData,
    queryAnalysis.type
  );

  return {
    query_analysis: queryAnalysis,
    extracted_data: extractedData,
    validation_results: validation,
    metadata: {
      confidence_score: queryAnalysis.confidence,
      processing_timestamp: new Date().toISOString()
    }
  };
}


// Helper function to fetch related references
async function fetchReferences(
  supabase: any,
  chunkIds: number[]
): Promise<ChunkReference[]> {
  try {
    const { data, error } = await supabase
      .from('chunk_references')
      .select('*')
      .in('chunk_id', chunkIds);

    if (error) throw error;
    return data;
  } catch (error) {
    throw new DatabaseError(`Failed to fetch references: ${error.message}`);
  }
}

// Main serve function
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  let supabase;
  let genAI;

  try {
    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleApiKey = Deno.env.get("GOOGLE_API_KEY");

    if (!supabaseUrl || !supabaseKey || !googleApiKey) {
      throw new Error("Missing environment variables");
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    genAI = new GoogleGenerativeAI(googleApiKey);

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new AuthenticationError("Missing authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new AuthenticationError("Invalid authorization token");
    }

    // Parse request body
    const { query, chatId, documentIds } = await req.json();

    if (!query || !chatId) {
      throw new Error("Missing required parameters");
    }

    // Analyze query intent
    const queryAnalysis = await analyzeQuery(genAI, query);

    // Search for relevant chunks
    const { data: chunks, error: searchError } = await supabase
      .from('financial_chunks')
      .select(`
        id,
        document_id,
        chat_id,
        page_number,
        content,
        table_id,
        embedding
      `)
      .eq('chat_id', chatId)
      .order('page_number', { ascending: true });

    if (searchError) {
      throw new DatabaseError(`Failed to fetch chunks: ${searchError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'NO_DATA',
          message: 'No relevant financial data found'
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Extract results
    const results = await processFinancialQuery(genAI, query, chunks);


    // Fetch references
    const references = await fetchReferences(
      supabase,
      chunks.map(c => c.id)
    );

    // Store query and response
    const { error: queryError } = await supabase
      .from('queries')
      .insert({
        chat_id: chatId,
        query_text: query,
        response_text: JSON.stringify(results.extracted_data),
        source_references: results.query_analysis.data_requirements,
        timestamp: new Date().toISOString()
      });


    if (queryError) {
      throw new DatabaseError(`Failed to store query: ${queryError.message}`);
    }

    // Prepare response
    const response: QueryResult = {
      query,
      chat_id: chatId,
      extracted_data: extractedData,
      source_references: references,
      page_numbers: [...new Set(chunks.map(c => c.page_number))]
    };

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Error:", error);

    let statusCode = 500;
    if (error instanceof AuthenticationError) {
      statusCode = 401;
    } else if (error instanceof DatabaseError) {
      statusCode = 503;
    }

    return new Response(
      JSON.stringify({
        status: 'ERROR',
        message: error.message,
        type: error.name,
        timestamp: new Date().toISOString()
      }),
      { 
        status: statusCode, 
        headers: corsHeaders 
      }
    );
  }
});