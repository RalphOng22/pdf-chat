import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const { chatId, firstMessage } = await req.json();
    
    if (!chatId || !firstMessage) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }), 
        { status: 400, headers: corsHeaders }
      );
    }

    const genAI = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY")!);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `Based on this first message or question from a chat conversation, generate a short, concise, and contextual title (maximum 6 words). First message: "${firstMessage}"`;

    const result = await model.generateContent(prompt);
    const title = result.response.text().trim();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update chat title
    const { error } = await supabase
      .from('chats')
      .update({ title })
      .eq('id', chatId);

    if (error) {
      throw new Error('Failed to update chat title');
    }

    return new Response(
      JSON.stringify({ title }), 
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: corsHeaders }
    );
  }
});