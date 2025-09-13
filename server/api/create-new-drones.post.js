import { z } from 'zod';
import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, readBody } from 'h3';


const droneInsertSchema = z.object({
    serial_number: z.string().min(1, { message: "serial_number is required and cannot be empty." }),
    model: z.string().optional().nullable(),
    operator_id: z.uuid({ message: "Invalid operator_id format." }).optional().nullable(),
    last_location: z.array(z.number(), { invalid_type_error: "last_location must be an array of numbers." })
        .length(2, { message: "last_location must be an array of [longitude, latitude]." })
        .transform(coords => `POINT(${coords[0]} ${coords[1]})`)
        .optional()
        .nullable(),
    last_seen_at: z.coerce.date().optional().nullable(),
    last_speed: z.number().optional().nullable(),
    last_altitude: z.number().optional().nullable(),
    last_report_id: z.number().int({ message: "last_report_id must be an integer." }).optional().nullable(),
    last_satellites: z.number().int({ message: "last_satellites must be an integer." }).optional().nullable(),
    last_wifi_quality: z.number().int({ message: "last_wifi_quality must be an integer." }).optional().default(999),
    last_lora_quality: z.number().int({ message: "last_lora_quality must be an integer." }).optional().default(999),
    last_4G_quality: z.number().int({ message: "last_4g_quality must be an integer." }).optional().default(999),
    last_lora_extra_info: z.json().optional().nullable(),
    last_wifi_extra_info: z.json().optional().nullable(),
    last_4G_extra_info: z.json().optional().nullable(),
});


export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event);
    const body = await readBody(event);

    const parseResult = droneInsertSchema.safeParse(JSON.parse(body));

    if (!parseResult.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid data provided.',
        });
    }

    const validatedData = parseResult.data;

    // --- 新增功能：检查 serial_number 是否已存在 ---
    const { count, error: checkError } = await client
        .from('drones')
        .select('*', { count: 'exact', head: true }) // 高效地检查记录是否存在
        .eq('serial_number', validatedData.serial_number);

    // 如果检查过程中发生数据库错误，则抛出 500
    if (checkError) {
        console.error('Supabase check for existing serial_number failed:', checkError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Error checking for drone existence.',
        });
    }

    // 如果 count 大于 0，说明序列号已存在
    if (count > 0) {
        // 抛出 409 Conflict 错误，这是表示资源冲突的最合适的 HTTP 状态码
        throw createError({
            statusCode: 409, // 409 Conflict
            statusMessage: `Serial number '${validatedData.serial_number}' already exists`,
        });
    }
    // ------ 检查结束 ------


    const dataToInsert = { ...validatedData };

    if (!dataToInsert.operator_id) {
        dataToInsert.operator_id = await getOperatorIdBySerialNumber(client, dataToInsert.serial_number);
    }

    // 执行插入操作
    const {error: insertError } = await client
        .from('drones')
        .insert(dataToInsert)
        .select()
        .single();

    if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to create drone record.',
        });
    }

    // 设置成功状态码为 201 Created
    event.node.res.statusCode = 201;
    return { result: 'ok'};
});