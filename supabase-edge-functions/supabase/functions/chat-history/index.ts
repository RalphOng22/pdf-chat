import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }), 
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization token" }), 
        { status: 401, headers: corsHeaders }
      );
    }

    const url = new URL(req.url);
    const chatId = url.searchParams.get('chatId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    if (!chatId) {
      return new Response(
        JSON.stringify({ error: "Missing chat ID" }), 
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify chat belongs to user and get data
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select(`
        *,
        documents (
          id,
          name,
          page_count
        ),
        queries (
          id,
          query_text,
          response_text,
          source_references,
          timestamp
        )
      `)
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (chatError || !chat) {
      return new Response(
        JSON.stringify({ error: "Invalid chat ID or unauthorized access" }), 
        { status: 403, headers: corsHeaders }
      );
    }

    // Add Content-Type header
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/json'
    };

    return new Response(
      JSON.stringify(chat), 
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: corsHeaders }
    );
  }
});