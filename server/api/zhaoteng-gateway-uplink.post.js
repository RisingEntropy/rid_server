import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, readBody } from 'h3';



export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event);
    const body = await readBody(event);
    // read the body json
    console.log(body)

});