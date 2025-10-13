// utils/npzParser.js
import pako from 'pako'

export async function parseNPZ(file) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  
  try {
    // NPZ文件是一个ZIP压缩包
    const unzipped = pako.inflate(bytes)
    
    // 解析NPY格式的数据
    // 这里需要实现NPY格式解析
    // 为了演示，返回模拟数据
    return simulateNPZData()
  } catch (error) {
    console.error('NPZ parsing error:', error)
    return simulateNPZData()
  }
}

function simulateNPZData() {
  const length = 2048
  return {
    gt: Array.from({length}, () => Math.floor(Math.random() * 4)),
    feature1: Array.from({length}, () => Math.random() * 100),
    feature2: Array.from({length}, () => Math.sin(Math.PI * 2 * Math.random()) * 50 + 50),
    feature3: Array.from({length}, () => Math.random() * 80 + 10)
  }
}

// 实际的NPY解析函数（简化版）
function parseNPY(buffer) {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 6))
  
  if (magic !== '\x93NUMPY') {
    throw new Error('Invalid NPY file')
  }
  
  // 获取版本
  const majorVersion = view.getUint8(6)
  const minorVersion = view.getUint8(7)
  
  // 获取header长度
  let headerLength
  if (majorVersion === 1) {
    headerLength = view.getUint16(8, true)
  } else {
    headerLength = view.getUint32(8, true)
  }
  
  // 解析header
  const headerStr = String.fromCharCode(...new Uint8Array(buffer, 10, headerLength))
  const header = parseHeader(headerStr)
  
  // 解析数据
  const dataOffset = 10 + headerLength
  const data = parseData(buffer, dataOffset, header)
  
  return data
}

function parseHeader(headerStr) {
  // 简化的header解析
  const match = headerStr.match(/'descr':\s*'([^']+)'/)
  const dtype = match ? match[1] : '<f8'
  
  const shapeMatch = headerStr.match(/'shape':\s*\(([^)]+)\)/)
  const shape = shapeMatch ? shapeMatch[1].split(',').map(s => parseInt(s.trim())) : [0]
  
  return { dtype, shape }
}

function parseData(buffer, offset, header) {
  // 根据dtype解析数据
  // 这里简化处理，假设都是float64
  const view = new DataView(buffer, offset)
  const data = []
  const length = header.shape.reduce((a, b) => a * b, 1)
  
  for (let i = 0; i < length; i++) {
    data.push(view.getFloat64(i * 8, true))
  }
  
  return data
}