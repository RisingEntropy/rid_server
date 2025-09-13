import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, readBody } from 'h3';
import deserializeRIDInfo from "~~/server/utils/hex_data_parser.js";



export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event);
    const zhaoteng_payload = await readBody(event);
    try{
        let rid_info = deserializeRIDInfo(Buffer.from(zhaoteng_payload.data, 'base64'));
        let rssi = zhaoteng_payload.rxInfo[0].rssi;
        rid_info.signal_quality = rssi;
        rid_info.timestamp = new Date(Number(rid_info.timestamp)).toISOString();
        let response = await $fetch('/api/update-telemetry-history', {
            method: 'POST',
            headers:{
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rid_info)
        });
        return response;
    }catch(err){
        throw createError({
            statusCode: 400,
            statusMessage: `Error forwarding telemetry data: ${err}`
        })
    }
});