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
        rid_info.timestamp = new Date(Number(rid_info.timestamp) * 1000).toISOString();
        let response = await $fetch('/api/update-telemetry-history', {
            method: 'POST',
            headers:{
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                serial_number: rid_info.product_id,
                timestamp: rid_info.timestamp,
                location: [rid_info.longitude, rid_info.latitude],
                altitude: rid_info.altitude,
                speed: rid_info.speed,
                report_id: rid_info.report_id,
                signal_quality: rid_info.signal_quality,
                satellites: rid_info.satellites,
                source: 'LORA',
                extra_info: {
                    "SF": zhaoteng_payload.txInfo.modulation.lora.spreadingFactor,
                    "BW": zhaoteng_payload.txInfo.modulation.lora.bandwidth,
                    "CR": zhaoteng_payload.txInfo.modulation.lora.codingRate,
                }
            })
        });

        return response;
    }catch(err){
        throw createError({
            statusCode: 400,
            statusMessage: `Error forwarding telemetry data: ${err}`
        })
    }
});