import { createError, defineEventHandler, readBody } from 'h3';
import {deserializeReducedRIDInfo} from "~~/server/utils/hex_data_parser.js";



export default defineEventHandler(async (event) => {
    const payload = await readBody(event);
    try{
        let rid_info = deserializeReducedRIDInfo(Buffer.from(payload.phyPayload, 'base64'));
        console.log("Received reduced RID info:", rid_info);
        let rssi = payload.rxInfo.rssi;
        let snr = payload.rxInfo.snr;
        rid_info.signal_quality = rssi;
        
        let response = await $fetch('/api/update-telemetry-history', {
            method: 'POST',
            headers:{
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                serial_number: "WANDS",
                // use current server time
                timestamp: new Date().toISOString(),
                location: [rid_info.longitude, rid_info.latitude],
                altitude: rid_info.altitude,
                speed: -1,
                report_id: rid_info.report_id,
                signal_quality: rid_info.signal_quality,
                satellites: -1,
                source: 'LORA',
                extra_info: {
                    "SF": payload.txInfo.modulation.lora.spreadingFactor,
                    "BW": payload.txInfo.modulation.lora.bandwidth,
                    "CR": payload.txInfo.modulation.lora.codeRate,
                    "TimeReceived": new Date().toISOString(),
                    "gwTime": payload.rxInfo.gwTime,
                    "gatewayId": payload.rxInfo.gatewayId,
                    "SNR": snr
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