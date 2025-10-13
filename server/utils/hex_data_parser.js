function deserializeRIDInfo(buffer) {
    const STRUCT_SIZE = 56;
    if (!Buffer.isBuffer(buffer) || buffer.length < STRUCT_SIZE) {
        console.error(`数据包大小错误. 期望 ${STRUCT_SIZE} 字节, 实际收到 ${buffer.length} 字节.`);
        return null;
    }
    const info = {};
    let offset = 0;
    info.product_id = buffer.toString('ascii', offset, offset + 20).replace(/\0/g, '');
    offset += 20;
    info.latitude = buffer.readFloatBE(offset);
    offset += 4;
    info.longitude = buffer.readFloatBE(offset);
    offset += 4;
    info.altitude = buffer.readFloatBE(offset);
    offset += 4;
    info.speed = buffer.readFloatBE(offset);
    offset += 4;
    info.report_id = buffer.readInt32BE(offset);
    offset += 4;
    info.satellites = buffer.readInt32BE(offset);
    offset += 4;
    info.signal_quality = buffer.readInt32BE(offset);
    offset += 4;
    info.timestamp = buffer.readBigInt64BE(offset);
    return info;
}
function deserializeReducedRIDInfo(buffer) {
    const STRUCT_SIZE = 16;
    if (!Buffer.isBuffer(buffer) || buffer.length < STRUCT_SIZE) {
        console.error(`数据包大小错误. 期望 ${STRUCT_SIZE} 字节, 实际收到 ${buffer.length} 字节.`);
        return null;
    }
    const info = {};
    let offset = 0;
    info.latitude = buffer.readFloatBE(offset);
    offset += 4;
    info.longitude = buffer.readFloatBE(offset);
    offset += 4;
    info.altitude = buffer.readFloatBE(offset);
    offset += 4;
    info.report_id = buffer.readInt32BE(offset);
    offset += 4;
    return info;
}
export {deserializeRIDInfo, deserializeReducedRIDInfo};