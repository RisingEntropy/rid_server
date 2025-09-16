// server/api/drones/query.get.ts
import { z } from 'zod';
import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, getQuery } from 'h3';

// 查询参数验证
const droneQuerySchema = z.object({
    sw_lng: z.coerce.number().min(-180).max(180),
    sw_lat: z.coerce.number().min(-90).max(90),
    ne_lng: z.coerce.number().min(-180).max(180),
    ne_lat: z.coerce.number().min(-90).max(90),
    minutes: z.coerce.number().min(1).optional().default(5)
});

export default defineEventHandler(async (event) => {
    // 验证查询参数
    const query = getQuery(event);
    const parseResult = droneQuerySchema.safeParse(query);

    if (!parseResult.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid query parameters',
        });
    }

    const { sw_lng, sw_lat, ne_lng, ne_lat, minutes } = parseResult.data;

    // 验证坐标范围
    if (sw_lng >= ne_lng || sw_lat >= ne_lat) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid coordinate bounds',
        });
    }

    const client = await serverSupabaseClient(event);

    // 根据是否有时间限制选择不同的函数
    const { data: drones, error } = minutes
        ? await client.rpc('query_drones_in_bounds_fast', {
            min_lng: sw_lng,
            min_lat: sw_lat,
            max_lng: ne_lng,
            max_lat: ne_lat,
            minutes_ago: minutes
        })
        : await client.rpc('query_drones_in_bounds_all', {
            min_lng: sw_lng,
            min_lat: sw_lat,
            max_lng: ne_lng,
            max_lat: ne_lat
        });

    if (error) {
        console.error('Spatial query error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to query drones',
        });
    }
    // 处理返回数据
    const processedDrones = (drones || []).map((drone) => {

        return {
            id: drone.id,
            serial_number: drone.serial_number,
            model: drone.model,
            operator_id: drone.operator_id,
            last_location: [drone.longitude, drone.latitude],
            last_seen_at: drone.last_seen_at,
            last_speed: drone.last_speed,
            last_altitude: drone.last_altitude,
            last_report_id: drone.last_report_id,
            last_satellites: drone.last_satellites,

            // 信号质量信息
            signal_info: {
                last_wifi_quality: drone.last_wifi_quality !== 999 ? drone.last_wifi_quality : null,
                last_lora_quality: drone.last_lora_quality !== 999 ? drone.last_lora_quality : null,
                'last_4G_quality': drone.last_4G_quality !== 999 ? drone.last_4G_quality : null,
                last_wifi_extra: drone.last_wifi_extra,
                last_lora_extra: drone.last_lora_extra_info,
                'last_4G_extra': drone.last_4G_extra_info
            },

            // 状态信息
            status: {
                is_online: drone.minutes_since_seen !== undefined ? drone.minutes_since_seen <= 5 : null,
                minutes_since_seen: drone.minutes_since_seen || null,
            },

            created_at: drone.created_at
        };
    });
    return {
        result: 'ok',
        count: processedDrones.length,
        query_params: {
            bounds: {
                southwest: [sw_lng, sw_lat],
                northeast: [ne_lng, ne_lat]
            },
            time_filter: minutes ? {
                minutes: minutes,
                query_time: new Date().toISOString()
            } : null
        },
        drones: processedDrones
    };
});