export async function getOperatorIdBySerialNumber(client, serial_number){
    // search in drones table first
    const { data: droneData, error: droneError } = await client
        .from('drones')
        .select('operator_id')
        .eq('serial_number', serial_number)
        .single();
    // if error, log and return null
    if (droneError && droneError.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error('Supabase query error in getOperatorIdBySerialNumber:', droneError);
        return null;
    }
    // if found, return operator_id
    if (droneData && droneData.operator_id) {
        return droneData.operator_id;
    }
    // if not found in drones table, return null
    return "8518727e-3278-40b9-a266-67b5b8dad1be";// default operator_id, for debugging only
}