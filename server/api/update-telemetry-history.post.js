import { z } from 'zod';
import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, readBody } from 'h3';

// 遥测数据验证schema
const telemetryInsertSchema = z.object({
    serial_number: z.string().min(1, { message: "serial_number is required and cannot be empty." }),
    timestamp: z.coerce.date().default(() => new Date()),
    location: z.array(z.number(), { invalid_type_error: "location must be an array of numbers." })
        .length(2, { message: "location must be an array of [longitude, latitude]." })
        .transform(coords => `POINT(${coords[0]} ${coords[1]})`),
    altitude: z.number().default(0),
    speed: z.number().default(0),
    report_id: z.number().int({ message: "report_id must be an integer." }).default(-1),
    signal_quality: z.number().default(0),
    satellites: z.number().int({ message: "satellites must be an integer." }).optional().default(0),
    source: z.string().min(1, { message: "source is required and cannot be empty." }),
    extra_info: z.any().optional().nullable(),
});

// 辅助函数：生成表名
function generateTableName(droneId) {
    // 将ID中的-替换为下划线
    return `T${droneId.replace(/-/g, '_')}`;
}

// 辅助函数：使用RPC函数插入遥测数据
async function insertTelemetryViaRPC(client, tableName, telemetryData) {
    const { data, error } = await client.rpc('insert_telemetry_data', {
        p_table_name: tableName,
        p_telemetry_data: telemetryData
    });
    
    return { data, error };
}

// 辅助函数：创建无人机历史记录表
async function createDroneTelemetryTable(client, tableName, droneId) {
    try {
        // 调用存储过程创建表
        const { error } = await client.rpc('create_telemetry_table', { 
            p_table_name: tableName,
            p_drone_id: droneId 
        });
        
        if (error) {
            console.error(`Error creating table ${tableName}:`, error);
            return false;
        }
        
        console.log(`Successfully created table ${tableName}`);
        return true;
    } catch (error) {
        console.error(`Failed to create table ${tableName}:`, error);
        return false;
    }
}

// 辅助函数：检查表是否存在（通过RPC）
async function checkTableExistsViaRPC(client, tableName) {
    try {
        const { data, error } = await client.rpc('check_table_exists', {
            p_table_name: tableName
        });
        
        if (error) {
            console.error(`Error checking table existence:`, error);
            return false;
        }
        
        return data === true;
    } catch (error) {
        console.error(`Failed to check table existence:`, error);
        return false;
    }
}

export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event);
    const body = await readBody(event);

    // 验证输入数据
    let parseResult = null;
    try{
        parseResult = telemetryInsertSchema.safeParse(body);
    }catch(e){
        throw createError({
            statusCode: 400,
            statusMessage: `Error while parsing telemetry history: ${e}`
        })
    }

    if (!parseResult.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid telemetry data provided.',
            data: parseResult,
        });
    }

    const validatedData = parseResult.data;

    // 1. 检查无人机是否存在
    const { data: existingDrone, error: checkError } = await client
        .from('drones')
        .select('*')
        .eq('serial_number', validatedData.serial_number)
        .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 表示没有找到记录
        console.error('Error checking drone existence:', checkError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Error checking drone existence.',
        });
    }

    let droneId, drone;
    let tableName;
    let isNewDrone = false;

    // 2. 如果无人机不存在，创建新的无人机
    if (!existingDrone) {
        // 准备创建无人机的数据
        const droneData = {
            serial_number: validatedData.serial_number,
            model: validatedData.model || null,
            operator_id: await getOperatorIdBySerialNumber(client, validatedData.serial_number),
        };

        // 插入新无人机
        const { data: newDrone, error: insertDroneError } = await client
            .from('drones')
            .insert(droneData)
            .select('id')
            .single();

        if (insertDroneError) {
            console.error('Error creating drone:', insertDroneError);
            throw createError({
                statusCode: 500,
                statusMessage: 'Failed to create drone record.',
            });
        }

        drone = newDrone;
        droneId = drone.id;
        isNewDrone = true;
        console.log(`Created new drone with ID: ${droneId} for serial number: ${validatedData.serial_number}`);

        // 为新无人机创建专属的历史记录表
        tableName = generateTableName(droneId);
        
        // 创建表
        const tableCreated = await createDroneTelemetryTable(client, tableName, droneId);
        
        if (!tableCreated) {
            console.error(`Failed to create table ${tableName} for new drone ${droneId}`);
            // 可以选择删除刚创建的无人机记录
            await client.from('drones').delete().eq('id', droneId);
            throw createError({
                statusCode: 500,
                statusMessage: 'Failed to create telemetry table for new drone.',
            });
        }
        
        console.log(`Created telemetry table ${tableName} for drone ${droneId}`);
    } else {
        drone = existingDrone;
        droneId = drone.id;
        tableName = generateTableName(droneId);
        
        // 检查表是否存在，如果不存在则创建
        const tableExists = await checkTableExistsViaRPC(client, tableName);
        if (!tableExists) {
            console.log(`Table ${tableName} does not exist for existing drone ${droneId}, creating...`);
            const tableCreated = await createDroneTelemetryTable(client, tableName, droneId);
            
            if (!tableCreated) {
                throw createError({
                    statusCode: 500,
                    statusMessage: `Failed to create telemetry table ${tableName} for existing drone.`,
                });
            }
        }
    }

    // 3. 更新无人机的last_xxx参数
    const updateData = {
        last_location: validatedData.location,
        last_seen_at: validatedData.timestamp,
        last_speed: validatedData.speed,
        last_altitude: validatedData.altitude,
        last_report_id: validatedData.report_id,
        last_satellites: validatedData.satellites,
    };
    // 如果drone.last_report和当前数据不一致，说明是通过不同手段报上来的数据，更新即可，否则，清空last_wifi/lora/4g 字段
    if(drone.last_report_id === undefined || drone.last_report_id === null || drone.last_report_id < validatedData.report_id){
        updateData.last_lora_quality = null;
        updateData.last_wifi_quality = null;
        updateData.last_4G_quality = null;
        updateData.last_lora_extra_info = null;
        updateData.last_wifi_extra_info = null;
        updateData.last_4G_extra_info = null;
    }else{
        updateData.last_lora_quality = drone.last_lora_quality;
        updateData.last_wifi_quality = drone.last_wifi_quality;
        updateData.last_4G_quality = drone.last_4G_quality;
        updateData.last_lora_extra_info = drone.last_lora_extra_info;
        updateData.last_wifi_extra_info = drone.last_wifi_extra_info;
        updateData.last_4G_extra_info = drone.last_4G_extra_info;
    }

    // 根据数据源更新对应的信号质量
    if (validatedData.source.toUpperCase() === "LORA"){
        updateData.last_lora_quality = validatedData.signal_quality;
        updateData.last_lora_extra_info = validatedData.extra_info;
    }else if (validatedData.source.toUpperCase() === "WIFI"){
        updateData.last_wifi_quality = validatedData.signal_quality;
        updateData.last_wifi_extra_info = validatedData.extra_info;
    }else if (validatedData.source.toUpperCase() === "4G"){
        updateData.last_4G_quality = validatedData.signal_quality;
        updateData.last_4G_extra_info = validatedData.extra_info;
    }else {
        throw createError({
            statusCode: 400,
            statusMessage: 'Unsupported source type: ' + validatedData.source,
        })
    }

    const { error: updateError } = await client
        .from('drones')
        .update(updateData)
        .eq('id', droneId);

    if (updateError) {
        console.error('Error updating drone:', updateError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to update drone record.',
        });
    }

    // 4. 插入遥测数据到该无人机的专属历史记录表（通过RPC函数）
    const telemetryData = {
        drone_id: droneId,
        timestamp: validatedData.timestamp,
        location: validatedData.location,
        altitude: validatedData.altitude,
        speed: validatedData.speed,
        report_id: validatedData.report_id,
        signal_quality: validatedData.signal_quality,
        satellites: validatedData.satellites,
        source: validatedData.source,
        serial_number: validatedData.serial_number,
        extra_info: validatedData.extra_info,
    };

    // 使用RPC函数插入数据，避免schema缓存问题
    const { data: telemetryRecord, error: telemetryError } = await insertTelemetryViaRPC(
        client, 
        tableName, 
        telemetryData
    );

    if (telemetryError) {
        console.error(`Error inserting telemetry data to table ${tableName}:`, telemetryError);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to insert telemetry record to table ${tableName}. Error: ${telemetryError.message || telemetryError}`,
        });
    }

    // 5. 返回成功响应
    event.node.res.statusCode = 201;
    return {
        result: 'ok',
        telemetry_id: telemetryRecord,
        drone_id: droneId,
        table_name: tableName,
        is_new_drone: isNewDrone,
        message: isNewDrone
            ? `New drone ${droneId} created with table ${tableName} and telemetry data recorded.`
            : `Telemetry data recorded to table ${tableName} and drone ${droneId} updated.`
    };
});