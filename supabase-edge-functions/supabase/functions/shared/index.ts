import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from './cors.ts'

serve(async (req) => {
  return new Response(
    JSON.stringify({ message: "This is a shared module" }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})