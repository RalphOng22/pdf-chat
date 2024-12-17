import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define the chunk interface
interface TextChunk {
  text: string;
  page_number: number;
}

async function generateEmbeddings(chunks: TextChunk[]): Promise<number[][]> {
  try {
    const client = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY")!);
    const model = client.getGenerativeModel({ model: "text-embedding-004" });

    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      try {
        console.log(`Generating embedding for chunk from page ${chunk.page_number}`);
        const result = await model.embedContent(chunk.text);
        embeddings.push(result.embedding.values);
      } catch (chunkError) {
        console.error(`Error generating embedding for chunk on page ${chunk.page_number}`, chunkError);
        embeddings.push([]);
      }
    }

    return embeddings;
  } catch (error) {
    console.error("Error in generateEmbeddings:", error);
    throw new Error("Failed to generate embeddings");
  }
}

serve(async (req) => {
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const { chatId, fileName, filePath, textChunks, totalPages } = await req.json();

    if (!fileName || !textChunks || !Array.isArray(textChunks) || !chatId) {
      return new Response(JSON.stringify({ error: "Invalid request payload" }), { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Validate chunk format
    const isValidChunk = (chunk: any): chunk is TextChunk => {
      return typeof chunk.text === 'string' && 
             typeof chunk.page_number === 'number';
    };

    if (!textChunks.every(isValidChunk)) {
      return new Response(JSON.stringify({ 
        error: "Invalid chunk format: Each chunk must have 'text' and 'page_number'" 
      }), { 
        status: 400,
        headers: corsHeaders 
      });
    }

    const { data: chatData, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (chatError || !chatData) {
      return new Response(JSON.stringify({ error: "Invalid chat ID or unauthorized access" }), {
        status: 403,
        headers: corsHeaders
      });
    }

    const embeddings = await generateEmbeddings(textChunks);

    if (embeddings.length !== textChunks.length) {
      return new Response(JSON.stringify({ error: "Mismatch in embeddings count" }), { 
        status: 500,
        headers: corsHeaders
      });
    }

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        chat_id: chatId,
        name: fileName,
        file_path: filePath,
        upload_date: new Date().toISOString(),
        page_count: totalPages || textChunks.length
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

    const errors: { chunkIndex: number; error: string }[] = [];
    for (let i = 0; i < textChunks.length; i++) {
      const { error } = await supabase.from("chunks").insert({
        document_id: document.id,
        chunk_index: i,
        text: textChunks[i].text,
        embedding: embeddings[i],
        page_number: textChunks[i].page_number,
      });

      if (error) {
        console.error(`Error storing chunk at index ${i}:`, error);
        errors.push({ chunkIndex: i, error: error.message });
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          message: "Partial success",
          errors,
          documentId: document.id
        }),
        { 
          status: 207,
          headers: corsHeaders
        }
      );
    }

    return new Response(JSON.stringify({ 
      message: 'Embedding generation and storage complete',
      documentId: document.id
    }), {
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: corsHeaders
    });
  }
});