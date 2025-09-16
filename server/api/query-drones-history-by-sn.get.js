// server/api/drones/query.get.ts
import { z } from 'zod';
import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, getQuery } from 'h3';

// 查询参数验证
const droneQuerySchema = z.object({
    serial_number: z.string().min(1, { message: "serial_number is required" }),
    limit: z.coerce.number().int().positive().default(10000), // 限制为正整数，默认 10000
    minutes: z.coerce.number().int().positive().optional()    // 可选的正整数
});

// 辅助函数：生成表名
function generateTableName(droneId) {
    // 将ID中的-替换为下划线
    return `T${droneId.replace(/-/g, '_')}`;
}

// 辅助函数：通过RPC查询动态表数据
async function queryTelemetryViaRPC(client, tableName, serialNumber, limit, startTime = null) {
    const { data, error } = await client.rpc('query_telemetry_data', {
        p_table_name: tableName,
        p_serial_number: serialNumber,
        p_limit_count: limit,
        p_start_time: startTime
    });
    
    return { data, error };
}

export default defineEventHandler(async (event) => {
    // 1. 获取并验证查询参数
    const query = getQuery(event);
    const parseResult = droneQuerySchema.safeParse(query);
    
    if (!parseResult.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid query parameters',
            data: parseResult.error.errors, // 提供更详细的错误信息
        });
    }
    
    const { serial_number, limit, minutes } = parseResult.data;
    
    try {
        // 2. 获取 Supabase 服务端 client
        const client = await serverSupabaseClient(event);
        
        // 3. 先通过 serial_number 获取无人机信息
        const { data: drone, error: droneError } = await client
            .from('drones')
            .select('id, serial_number, model, last_seen_at')
            .eq('serial_number', serial_number)
            .single();
        
        if (droneError) {
            if (droneError.code === 'PGRST116') {
                throw createError({
                    statusCode: 404,
                    statusMessage: `Drone with serial number ${serial_number} not found`,
                });
            }
            console.error('Error fetching drone:', droneError);
            throw createError({
                statusCode: 500,
                statusMessage: 'Error fetching drone information',
                data: droneError.message,
            });
        }
        
        if (!drone) {
            throw createError({
                statusCode: 404,
                statusMessage: `Drone with serial number ${serial_number} not found`,
            });
        }
        
        // 4. 根据无人机ID生成表名
        const tableName = generateTableName(drone.id);
        console.log(`Querying table ${tableName} for drone ${drone.id}`);
        
        // 5. 计算时间范围（如果需要）
        let startTime = null;
        if (minutes) {
            const start = new Date();
            start.setMinutes(start.getMinutes() - minutes);
            startTime = start.toISOString();
        }
        
        // 6. 查询对应的表（使用RPC函数避免schema缓存问题）
        const { data: telemetryData, error: telemetryError } = await queryTelemetryViaRPC(
            client,
            tableName,
            serial_number,
            limit,
            startTime
        );
        
        if (telemetryError) {
            console.error(`Error querying telemetry from table ${tableName}:`, telemetryError);
            
            // 如果是表不存在的错误，返回空数组
            if (telemetryError.message && telemetryError.message.includes('does not exist')) {
                console.warn(`Table ${tableName} does not exist for drone ${drone.id}`);
                return {
                    drone_info: {
                        id: drone.id,
                        serial_number: drone.serial_number,
                        model: drone.model,
                        last_seen_at: drone.last_seen_at
                    },
                    telemetry_data: [],
                    table_name: tableName,
                    message: `No telemetry table found for drone ${serial_number}`
                };
            }
            
            throw createError({
                statusCode: 500,
                statusMessage: 'Error fetching telemetry data',
                data: telemetryError.message || telemetryError,
            });
        }
        
        // 7. 处理返回的数据（转换location格式）
        if (telemetryData && Array.isArray(telemetryData)) {
            for (let record of telemetryData) {
                // 处理geometry类型的location字段
                if (record.location && record.location.coordinates) {
                    record.location = record.location.coordinates;
                } else if (record.location && typeof record.location === 'string') {
                    // 如果location是字符串格式 "POINT(x y)"，解析它
                    const match = record.location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
                    if (match) {
                        record.location = [parseFloat(match[1]), parseFloat(match[2])];
                    }
                }
            }
        }
        
        // 8. 返回数据，包含无人机信息和遥测数据
        return {
            drone_info: {
                id: drone.id,
                serial_number: drone.serial_number,
                model: drone.model,
                last_seen_at: drone.last_seen_at
            },
            telemetry_data: telemetryData || [],
            table_name: tableName,
            total_records: telemetryData ? telemetryData.length : 0
        };
        
    } catch (err) {
        // 捕获其他可能发生的错误
        console.error('API Handler Error:', err);
        
        // 如果错误不是 h3 创建的，则创建一个新的
        if (!err.statusCode) {
            throw createError({
                statusCode: 500,
                statusMessage: 'An unexpected error occurred',
                data: err.message
            });
        }
        
        // 否则重新抛出已存在的 h3 错误
        throw err;
    }
});