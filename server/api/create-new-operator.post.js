// server/api/operators.post.ts
import { z } from 'zod';
import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, readBody } from 'h3';

// 定义操作员数据验证 schema
const operatorInsertSchema = z.object({
    name: z.string().min(1, { message: "Name is required and cannot be empty" }).max(100),
    id_card_number: z.string()
        .min(1, { message: "ID card number is required" }), // 不一定是身份证，可以是其他的
    id_card_type: z.string().min(1, { message: "ID card type is required" }),
    contact: z.json().default({})
});

export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event);
    const body = await readBody(event);

    // 使用 Zod 验证数据
    const parseResult = operatorInsertSchema.safeParse(JSON.parse(body));

    if (!parseResult.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid data provided',
        });
    }

    const validatedData = parseResult.data;

    // 检查身份证号是否已存在
    const { data: existingOperator, error: checkError } = await client
        .from('operators')
        .select('id, name, id_card_number, id_card_type')
        .eq("id_card_type", validatedData.id_card_type)
        .eq('id_card_number', validatedData.id_card_number)
        .maybeSingle(); // 使用 maybeSingle 代替 select('*')，更高效

    if (checkError) {
        console.error('Error checking existing operator:', checkError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to check existing operator',
        });
    }

    if (existingOperator) {
        throw createError({
            statusCode: 409, // 使用 409 Conflict 更符合语义
            statusMessage: `ID card number '${validatedData.id_card_number}' with type '${validatedData.id_card_type}' already exists for operator: ${existingOperator.name}`,
        });
    }

    // 插入新的操作员记录
    const { data: newOperator, error: insertError } = await client
        .from('operators')
        .insert({
            name: validatedData.name,
            id_card_number: validatedData.id_card_number,
            id_card_type: validatedData.id_card_type,
            contact: validatedData.contact // JSONB 类型会自动序列化
        })
        .select('id, name, id_card_number, created_at')
        .single();

    if (insertError) {
        console.error('Error inserting operator:', insertError);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to create operator record',
        });
    }

    // 设置成功状态码
    event.node.res.statusCode = 201;

    // 返回创建的操作员信息
    return {
        result: 'ok'
    };
});