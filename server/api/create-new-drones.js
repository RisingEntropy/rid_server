import { serverSupabaseClient } from '#supabase/server'; // 这个 import 是自动可用的

export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event);
    const body = await readBody(event);
    let content = body
    // check keys in content
    let keys = ['name', 'id_card_number', 'contact'];
    for(let key of keys){
        if(!(key in content)){
            throw createError({
                statusCode: 400,
                statusMessage: `Missing key: ${key}`,
            })
        }
    }
    // check if id_card_number already exists
    const { data, errors} = await client
        .from('operators')
        .select('*')
        .eq('id_card_number', content.id_card_number);
    if(errors){
        console.error('Error querying data:', errors);
        throw createError({
            statusCode: 500,
            statusMessage: 'Database query error',
            data: errors
        })
    }
    if(data.length > 0){
        throw createError({
            statusCode: 400,
            statusMessage: 'ID card number already exists',
        })
    }

    // insert into rid_info table
    const { _, error } = await client
        .from('operators')
        .insert([
            {
                name: content.name,
                id_card_number: content.id_card_number,
                contact: content.contact
            }])
        .select();
    if(error){
        console.error('Error inserting data:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Database insert error',
            data: error
        })
    }
    // 返回插入的数据
    return { result: "ok" };

});