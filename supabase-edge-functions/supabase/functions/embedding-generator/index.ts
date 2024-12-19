import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

interface TextChunk {
  text: string;
  page_number: number;
}

// Process chunks in smaller batches
async function generateEmbeddingsInBatches(chunks: TextChunk[], batchSize: number = 20) {
  try {
    const client = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY")!);
    const model = client.getGenerativeModel({ model: "text-embedding-004" });
    const embeddings: number[][] = [];
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(async (chunk) => {
          try {
            console.log(`Processing chunk ${i + batch.indexOf(chunk) + 1}/${chunks.length} from page ${chunk.page_number}`);
            const result = await model.embedContent(chunk.text);
            return result.embedding.values;
          } catch (error) {
            console.error(`Error processing chunk ${i + batch.indexOf(chunk) + 1}:`, error);
            throw error;
          }
        })
      );
      embeddings.push(...batchEmbeddings);
    }
    return embeddings;
  } catch (error) {
    console.error("Error in generateEmbeddings:", error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { 
        status: 405,
        headers: corsHeaders
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const { chatId, fileName, filePath, textChunks, totalPages } = await req.json();

    // Validation
    if (!fileName || !textChunks || !Array.isArray(textChunks) || !chatId) {
      return new Response(JSON.stringify({ error: "Invalid request payload" }), { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Create document record first
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        chat_id: chatId,
        name: fileName,
        file_path: filePath,
        upload_date: new Date().toISOString(),
        page_count: totalPages || textChunks.length,
        processing_status: 'processing'
      })
      .select()
      .single();

    if (documentError) {
      console.error("Error storing document:", documentError);
      return new Response(JSON.stringify({ error: "Failed to store document" }), {
        status: 500,
        headers: corsHeaders
      });
    }

    // Process chunks in batches
    const BATCH_SIZE = 20;
    const errors = [];
    
    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batch = textChunks.slice(i, i + BATCH_SIZE);
      try {
        const batchEmbeddings = await generateEmbeddingsInBatches(batch, BATCH_SIZE);
        
        // Store chunks with their embeddings
        for (let j = 0; j < batch.length; j++) {
          const { error } = await supabase.from("chunks").insert({
            document_id: document.id,
            chunk_index: i + j,
            text: batch[j].text,
            embedding: batchEmbeddings[j],
            page_number: batch[j].page_number,
          });

          if (error) {
            errors.push({ chunkIndex: i + j, error: error.message });
          }
        }
      } catch (error) {
        errors.push({ batch: i / BATCH_SIZE, error: error.message });
      }
    }

    // Update document status
    await supabase
      .from("documents")
      .update({ processing_status: errors.length === 0 ? 'completed' : 'partial' })
      .eq('id', document.id);

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          message: "Partial success",
          errors,
          documentId: document.id
        }),
        { status: 207, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: 'Processing complete',
        documentId: document.id
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }), 
      { status: 500, headers: corsHeaders }
    );
  }
});