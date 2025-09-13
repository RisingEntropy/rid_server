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
    satellites: z.number().int({ message: "satellites must be an integer." }).optional().default(-1),
    source: z.number().int({ message: "source must be an integer." }).default(0),
});

export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event);
    const body = await readBody(event);

    // 验证输入数据
    const parseResult = telemetryInsertSchema.safeParse(body);
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
        .select('id, serial_number')
        .eq('serial_number', validatedData.serial_number)
        .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 表示没有找到记录
        console.error('Error checking drone existence:', checkError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Error checking drone existence.',
        });
    }

    let droneId;

    // 2. 如果无人机不存在，创建新的无人机
    if (!existingDrone) {
        // 准备创建无人机的数据
        const droneData = {
            serial_number: validatedData.serial_number,
            model: validatedData.model || null,
            operator_id: await getOperatorIdBySerialNumber(client, validatedData.serial_number), // 默认操作员ID
            last_location: validatedData.location,
            last_seen_at: validatedData.timestamp,
            last_speed: validatedData.speed,
            last_altitude: validatedData.altitude,
            last_report_id: validatedData.report_id,
            last_satellites: validatedData.satellites,
            last_source: validatedData.source,
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

        droneId = newDrone.id;
        console.log(`Created new drone with ID: ${droneId} for serial number: ${validatedData.serial_number}`);
    } else {
        // 3. 如果无人机存在，更新其last_xxx参数
        droneId = existingDrone.id;

        const updateData = {
            last_location: validatedData.location,
            last_seen_at: validatedData.timestamp,
            last_speed: validatedData.speed,
            last_altitude: validatedData.altitude,
            last_report_id: validatedData.report_id,
            last_satellites: validatedData.satellites,
            last_source: validatedData.source,
        };

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

        console.log(`Updated drone with ID: ${droneId}`);
    }

    // 4. 插入遥测数据到历史记录表
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

    };

    const { data: telemetryRecord, error: telemetryError } = await client
        .from('telemetry_history')
        .insert(telemetryData)
        .select('id')
        .single();

    if (telemetryError) {
        console.error('Error inserting telemetry data:', telemetryError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to insert telemetry record.',
        });
    }

    // 5. 返回成功响应
    event.node.res.statusCode = 201;
    return {
        result: 'ok',
        telemetry_id: telemetryRecord.id,
        drone_id: droneId,
        is_new_drone: !existingDrone,
        message: existingDrone
            ? `Telemetry data recorded and drone ${droneId} updated.`
            : `New drone ${droneId} created and telemetry data recorded.`
    };
});