import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SourceReference {
  documentId: number;
  documentName: string;
  pageNumber: number;
  text: string;
  similarity: number;
  startOffset?: number;
  endOffset?: number;
}

interface PaginationParams {
  pageSize: number;
  pageNumber: number;
}

interface QueryResponse {
  response: string;
  sourceReferences: SourceReference[];
  pagination: {
    totalCount: number;
    pageSize: number;
    pageNumber: number;
    totalPages: number;
  };
  timestamp?: string;
}

interface RequestBody {
  chatId: string;
  query: string;
  selectedDocuments?: number[];
  pagination?: PaginationParams;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          error: "Missing authorization header",
          sourceReferences: [],
          pagination: { totalCount: 0, pageSize: 0, pageNumber: 0, totalPages: 0 }
        }), 
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid authorization token",
          sourceReferences: [],
          pagination: { totalCount: 0, pageSize: 0, pageNumber: 0, totalPages: 0 }
        }), 
        { status: 401, headers: corsHeaders }
      );
    }

    // Parse request (only once)
    const { 
      chatId, 
      query, 
      selectedDocuments = [],
      pagination = { pageSize: 5, pageNumber: 1 }
    }: RequestBody = await req.json();

    if (!chatId || !query) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required parameters",
          sourceReferences: [],
          pagination: { totalCount: 0, pageSize: 0, pageNumber: 0, totalPages: 0 }
        }), 
        { status: 400, headers: corsHeaders }
      );
    }
    console.log('Attempting to insert query:', query);
    // Check for duplicate queries within the last 5 seconds
    const { data: existingQueries, error: queryCheckError } = await supabase
      .from('queries')
      .select('id')
      .eq('chat_id', chatId)
      .eq('query_text', query)
      .gte('timestamp', new Date(Date.now() - 5000).toISOString());

    if (queryCheckError) {
      throw new Error('Failed to check for duplicate queries');
    }

    if (existingQueries?.length > 0) {
      console.log('Duplicate query detected, skipping insertion');
      return new Response(
        JSON.stringify({ response: 'Duplicate query ignored' }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Verify chat ownership
    const { data: chatData, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (chatError || !chatData) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid chat ID or unauthorized access",
          sourceReferences: [],
          pagination: { totalCount: 0, pageSize: 0, pageNumber: 0, totalPages: 0 }
        }), 
        { status: 403, headers: corsHeaders }
      );
    }

    // Generate query embedding
    const genAI = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY")!);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    
    const queryEmbedding = await model.embedContent(query);
    const queryEmbeddingValues = queryEmbedding.embedding.values;

    // Build document filter
    let documentsFilter = '';
    if (selectedDocuments && selectedDocuments.length > 0) {
      // Make sure document IDs are properly sanitized
      const documentIds = selectedDocuments
        .filter(id => typeof id === 'number' || !isNaN(parseInt(id)))
        .join(',');
      documentsFilter = `AND c.document_id IN (${documentIds})`;
    }

    // When calling the function
    const { data: similarChunks, error: searchError } = await supabase.rpc(
      'match_chunks_with_metadata',
      {
        query_embedding: queryEmbeddingValues,
        match_threshold: 0.7,
        match_count: 5,
        document_filter: documentsFilter,
        p_size: pagination.pageSize,
        p_number: pagination.pageNumber
      }
    );


    console.log('Query params:', {
      query_embedding: queryEmbeddingValues.length,
      match_threshold: 0.7,
      match_count: 5,
      document_filter: documentsFilter,
      p_size: pagination.pageSize,
      p_number: pagination.pageNumber
    });

    if (searchError) {
      throw new Error('Failed to perform similarity search');
    }

    // Handle case when no similar chunks are found
    if (!similarChunks || similarChunks.length === 0) {
      const emptyResponse: QueryResponse = {
        response: "No relevant content found in the documents.",
        sourceReferences: [],
        pagination: {
          totalCount: 0,
          pageSize: pagination.pageSize,
          pageNumber: pagination.pageNumber,
          totalPages: 0
        }
      };

      return new Response(
        JSON.stringify(emptyResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract total count and prepare source references
    const totalCount = similarChunks[0]?.total_count || 0;
    const sourceReferences: SourceReference[] = similarChunks.map(chunk => ({
      documentId: chunk.document_id,
      documentName: chunk.document_name,
      pageNumber: chunk.page_number,
      text: chunk.text,
      similarity: chunk.similarity,
      startOffset: chunk.start_offset,
      endOffset: chunk.end_offset
    }));

    // Prepare context for Gemini
    const context = similarChunks.map(chunk => chunk.text).join('\n\n');

    // Generate response using Gemini
    const chatModel = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Based on the following context, provide a detailed answer to the user's question. If the answer cannot be found in the context, explicitly state that. Include specific references to the source material where appropriate.
    
Context:
${context}

Question: ${query}

Instructions:
1. Answer based only on the provided context
2. Be specific and detailed in your response
3. If multiple sources support your answer, synthesize the information
4. If the answer is not in the context, say so clearly`;

    const result = await chatModel.generateContent(prompt);
    const response = result.response.text();
    const timestamp = new Date().toISOString();

    // Store query and response
    const { error: queryError } = await supabase
      .from('queries')
      .insert({
        chat_id: chatId,
        query_text: query,
        response_text: response,
        source_references: sourceReferences,
        timestamp: timestamp
      });

    if (queryError) {
      throw new Error('Failed to store query');
    }

    // Prepare and return the response
    const queryResponse: QueryResponse = {
      response,
      sourceReferences,
      pagination: {
        totalCount,
        pageSize: pagination.pageSize,
        pageNumber: pagination.pageNumber,
        totalPages: Math.ceil(totalCount / pagination.pageSize)
      },
      timestamp: timestamp
    };

    return new Response(
      JSON.stringify(queryResponse),
      { 
        status: 200, 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message,
        sourceReferences: [],
        pagination: {
          totalCount: 0,
          pageSize: 0,
          pageNumber: 0,
          totalPages: 0
        }
      }), 
      { status: 500, headers: corsHeaders }
    );
  }
});