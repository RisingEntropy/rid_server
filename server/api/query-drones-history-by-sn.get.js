// server/api/drones/query.get.ts
import { z } from 'zod';
import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, getQuery } from 'h3';

// 查询参数验证 - 支持两种模式
const droneQuerySchema = z.object({
    serial_number: z.string().min(1, { message: "serial_number is required" }),
    limit: z.coerce.number().int().positive().default(10000),
    // 模式1: 使用minutes查询过去xx分钟
    minutes: z.coerce.number().int().positive().optional(),
    // 模式2: 使用start和end查询时间范围
    start: z.iso.datetime().optional(),
    end:  z.iso.datetime().optional()
}).refine(
    // 验证：不能同时使用minutes和start/end
    (data) => {
        const hasMinutes = data.minutes !== undefined;
        const hasTimeRange = data.start !== undefined || data.end !== undefined;
        
        if (hasMinutes && hasTimeRange) {
            return false;
        }
        
        // 如果使用时间范围模式，start和end必须同时提供
        if (hasTimeRange && (!data.start || !data.end)) {
            return false;
        }
        
        return true;
    },
    {
        message: "Either use 'minutes' OR both 'start' and 'end', not both modes together"
    }
).refine(
    // 验证：如果提供了start和end，end必须晚于start
    (data) => {
        if (data.start && data.end) {
            return new Date(data.end) > new Date(data.start);
        }
        return true;
    },
    {
        message: "End time must be after start time"
    }
);

// 辅助函数：生成表名
function generateTableName(droneId) {
    return `T${droneId.replace(/-/g, '_')}`;
}

// 辅助函数：通过RPC查询动态表数据（支持时间范围查询）
async function queryTelemetryViaRPC(client, tableName, serialNumber, limit, startTime = null, endTime = null) {
    // 根据是否有endTime决定调用哪个RPC函数
    if (endTime) {
        // 使用时间范围查询的RPC函数
        const { data, error } = await client.rpc('query_telemetry_data_range', {
            p_table_name: tableName,
            p_serial_number: serialNumber,
            p_limit_count: limit,
            p_start_time: startTime,
            p_end_time: endTime
        });
        return { data, error };
    } else {
        // 使用原有的RPC函数（只有开始时间）
        const { data, error } = await client.rpc('query_telemetry_data', {
            p_table_name: tableName,
            p_serial_number: serialNumber,
            p_limit_count: limit,
            p_start_time: startTime
        });
        return { data, error };
    }
}

// 辅助函数：处理和转换遥测数据
function processTelemetryData(telemetryData) {
    if (!telemetryData || !Array.isArray(telemetryData)) {
        return [];
    }
    
    return telemetryData.map(record => {
        // 创建处理后的记录副本
        const processedRecord = { ...record };
        
        // 处理geometry类型的location字段
        if (processedRecord.location) {
            if (processedRecord.location.coordinates) {
                // GeoJSON格式
                processedRecord.location = processedRecord.location.coordinates;
            } else if (typeof processedRecord.location === 'string') {
                // 字符串格式 "POINT(x y)"
                const match = processedRecord.location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
                if (match) {
                    processedRecord.location = [parseFloat(match[1]), parseFloat(match[2])];
                }
            }
        }
        
        // 处理extra_info字段
        if (processedRecord.extra_info && typeof processedRecord.extra_info === 'string') {
            try {
                processedRecord.extra_info = JSON.parse(processedRecord.extra_info);
            } catch (e) {
                console.warn('Failed to parse extra_info:', e);
                // 解析失败时保持原样
            }
        }
        
        return processedRecord;
    });
}

export default defineEventHandler(async (event) => {
    // 1. 获取并验证查询参数
    const query = getQuery(event);
    const parseResult = droneQuerySchema.safeParse(query);
    
    if (!parseResult.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid query parameters',
            data: parseResult.error.errors,
        });
    }
    
    const { serial_number, limit, minutes, start, end } = parseResult.data;
    
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
        
        // 5. 计算时间范围
        let startTime = null;
        let endTime = null;
        let queryMode = 'all'; // 默认查询所有记录
        
        if (minutes) {
            // 模式1: 查询过去xx分钟
            const now = new Date();
            startTime = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
            endTime = now.toISOString();
            queryMode = `last_${minutes}_minutes`;
            console.log(`Querying last ${minutes} minutes: ${startTime} to ${endTime}`);
        } else if (start && end) {
            // 模式2: 查询指定时间范围
            startTime = start;
            endTime = end;
            queryMode = 'time_range';
            console.log(`Querying time range: ${startTime} to ${endTime}`);
        } else {
            // 模式3: 查询所有记录（没有时间限制）
            console.log('Querying all records without time filter');
        }
        
        // 6. 查询对应的表
        const { data: telemetryData, error: telemetryError } = await queryTelemetryViaRPC(
            client,
            tableName,
            serial_number,
            limit,
            startTime,
            endTime
        );
        
        if (telemetryError) {
            console.error(`Error querying telemetry from table ${tableName}:`, telemetryError);
            
            // 如果是表不存在的错误，返回空数组
            if (telemetryError.message && 
                (telemetryError.message.includes('does not exist') || 
                 telemetryError.message.includes('relation') ||
                 telemetryError.message.includes('undefined_table'))) {
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
                    query_mode: queryMode,
                    time_range: {
                        start: startTime,
                        end: endTime
                    },
                    total_records: 0,
                    message: `No telemetry table found for drone ${serial_number}`
                };
            }
            
            throw createError({
                statusCode: 500,
                statusMessage: 'Error fetching telemetry data',
                data: telemetryError.message || telemetryError,
            });
        }
        
        // 7. 处理返回的数据
        const processedData = processTelemetryData(telemetryData);
        
        // 8. 构建响应数据
        const response = {
            drone_info: {
                id: drone.id,
                serial_number: drone.serial_number,
                model: drone.model,
                last_seen_at: drone.last_seen_at
            },
            telemetry_data: processedData,
            time_range: {
                start: startTime,
                end: endTime
            },
            total_records: processedData.length
        };
        
        
        return response;
        
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