<template>
  <div id="app">
    <div class="container">
      <!-- 主内容区域 -->
      <div class="main-content">
        <!-- 监控卡片 -->
        <div class="card">
          <div class="card-header">
            <span class="icon">□</span> Monitor
            <!-- 添加波形控制选项 -->
            <div class="chart-controls">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="subtractBias"
                  @change="onBiasSettingChange"
                >
                <span>Subtract Bias</span>
              </label>
            </div>
          </div>
          
          <!-- 波形图表 -->
          <div class="chart-container">
            <canvas ref="waveformChart"></canvas>
            <div class="chart-label">
              Waveform {{ subtractBias ? '(Bias Subtracted)' : '(Original)' }}
            </div>
          </div>
          
          <!-- 置信度图表 -->
          <div class="chart-container">
            <canvas ref="confidenceChart"></canvas>
            <div class="chart-label">Confidence</div>
          </div>
        </div>

        <!-- 参数卡片 -->
        <div class="card">
          <div class="card-header">
            <span class="icon">□</span> Parameters
          </div>
          <div class="parameters-grid">
            <div class="parameter-item" v-for="param in parameters" :key="param.key">
              <div class="parameter-label">{{ param.label }}</div>
              <div class="parameter-value" :class="{ 'text-red': param.key === 'activityLevel' && radarData[param.key] < 0 }">
                {{ formatValue(param.key, radarData[param.key]) }}
              </div>
              <div v-if="param.unit" class="parameter-unit">{{ param.unit }}</div>
            </div>
          </div>
        </div>

        <!-- 控制台输出 -->
        <div class="card">
          <div class="card-header">
            <span class="icon">□</span> Console Output
          </div>
          <div class="console-output" ref="consoleOutput">
            <div v-for="(log, index) in consoleLogs" :key="index" class="console-line">
              [{{ log.time }}] {{ log.message }}
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="sidebar">
        <!-- 连接面板 -->
        <div class="connection-panel">
          <div class="connection-header">
            <span class="icon">🔌</span> Connection
          </div>
          
          <!-- 浏览器兼容性警告 -->
          <div v-if="!isSerialSupported" class="warning-box">
            <p>⚠️ Web Serial API 不支持</p>
            <p class="warning-text">
              {{ warningMessage }}
            </p>
          </div>
          
          <div class="form-group">
            <label>COM Port</label>
            <div class="port-selector">
              <select v-model="selectedPort" class="form-control" :disabled="!isSerialSupported">
                <option value="">Select Port</option>
                <option v-for="(port, index) in availablePorts" :key="index" :value="index">
                  {{ port.name || `COM${index + 1}` }}
                </option>
              </select>
              <!-- 添加串口按钮 -->
              <button 
                class="btn btn-add-port" 
                @click="requestPort"
                :disabled="!isSerialSupported || isConnected"
                title="Add new serial port"
              >
                ➕
              </button>
            </div>
          </div>
          
          <div class="form-group">
            <label>Baudrate</label>
            <select v-model="baudRate" class="form-control" :disabled="!isSerialSupported">
              <option value="9600">9600</option>
              <option value="115200">115200</option>
              <option value="921600">921600</option>
            </select>
          </div>
          
          <div class="connection-control">
            <button 
              class="btn btn-refresh" 
              @click="refreshPorts"
              :disabled="!isSerialSupported || isConnected"
              title="Refresh port list"
            >
              ↻
            </button>
            <div 
              class="toggle-switch" 
              :class="{ active: isConnected, disabled: !isSerialSupported || selectedPort === '' }"
              @click="toggleConnection"
            >
              <div class="toggle-slider"></div>
            </div>
            <span class="status-text">{{ isConnected ? 'ON' : 'OFF' }}</span>
          </div>

          <!-- 连接信息 -->
          <div v-if="currentPortInfo" class="port-info">
            <div class="info-item">
              <span class="info-label">Port:</span>
              <span class="info-value">{{ currentPortInfo.name }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Status:</span>
              <span class="info-value" :class="{ 'text-green': isConnected }">
                {{ isConnected ? 'Connected' : 'Disconnected' }}
              </span>
            </div>
          </div>
        </div>

        <!-- 设置面板 -->
        <div class="settings-panel">
          <div class="settings-header">
            <span class="icon">⚙️</span> Settings
          </div>
          
          <div class="settings-group">
            <h4>Out-of-bed Angels</h4>
            <div class="form-group">
              <label>Min Angle</label>
              <input 
                type="number" 
                v-model.number="settings.minAngle" 
                class="form-control"
                :disabled="!isConnected"
              >
            </div>
            <div class="form-group">
              <label>Max Angle</label>
              <input 
                type="number" 
                v-model.number="settings.maxAngle" 
                class="form-control"
                :disabled="!isConnected"
              >
            </div>
            <button 
              class="btn btn-set" 
              @click="applySettings"
              :disabled="!isConnected"
            >
              Set
            </button>
          </div>

          <!-- 新增：波形显示设置 -->
          <div class="settings-group" style="margin-top: 20px;">
            <h4>Waveform Display</h4>
            <div class="settings-item">
              <label class="switch-label">
                <span>Current Bias:</span>
                <span class="bias-value">{{ radarData.waveformBias.toFixed(3) }}</span>
              </label>
            </div>
            <div class="settings-item">
              <label class="switch-label">
                <span>Subtract Bias:</span>
                <label class="switch">
                  <input type="checkbox" v-model="subtractBias">
                  <span class="slider"></span>
                </label>
              </label>
            </div>
          </div>
        </div>

        <!-- 状态显示 -->
        <div class="status-display">
          <span class="status-label">{{ deviceStatus }}</span>
          <span class="status-value">{{ temperature }}°C</span>
        </div>

        <!-- 录制按钮 -->
        <button 
          class="btn btn-record" 
          :class="{ recording: isRecording }"
          @click="toggleRecording"
          :disabled="!isConnected"
        >
          {{ isRecording ? 'Stop Record' : 'Start Record' }}
        </button>
      </div>
    </div>

    <!-- Logo -->
    <div class="logo">
      <span class="logo-arrow">◀</span>vayyar
    </div>

    <!-- 初始化提示模态框 -->
    <div v-if="showInitModal" class="modal-overlay" @click.self="showInitModal = false">
      <div class="modal-content">
        <h2>🔌 串口连接设置</h2>
        <p>要使用串口功能，请确保：</p>
        <ul>
          <li>✅ 使用 Chrome 或 Edge 浏览器</li>
          <li>✅ 网站使用 HTTPS 或 localhost</li>
          <li>✅ 已连接串口设备</li>
        </ul>
        <p class="modal-note">点击"选择串口"按钮授权访问串口设备</p>
        <button class="btn btn-primary modal-btn" @click="initSerialPort">
          选择串口
        </button>
        <button class="btn btn-secondary modal-btn" @click="showInitModal = false">
          稍后再说
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import Chart from 'chart.js/auto'

export default {
  name: 'RadarMonitor',
  setup() {
    // 状态管理
    const isConnected = ref(false)
    const isRecording = ref(false)
    const selectedPort = ref('')
    const baudRate = ref('115200')
    const availablePorts = ref([])
    const deviceStatus = ref('IDLE')
    const temperature = ref('NaN')
    const consoleLogs = ref([])
    const recordedData = ref([])
    const showInitModal = ref(false)
    const isSerialSupported = ref(false)
    const warningMessage = ref('')
    const currentPortInfo = ref(null)
    
    // 新增：控制是否减去bias
    const subtractBias = ref(false)
    
    // 保存的串口映射
    const portMap = new Map()
    
    // 串口相关
    let port = null
    let reader = null
    let readableStreamClosed = null
    let writer = null
    
    // 图表相关
    const waveformChart = ref(null)
    const confidenceChart = ref(null)
    const consoleOutput = ref(null)
    let waveformChartInstance = null
    let confidenceChartInstance = null
    
    // 数据缓冲 - 分别存储原始数据和处理后的数据
    const waveformDataRaw = reactive(Array(200).fill(0))  // 原始数据
    const waveformDataProcessed = reactive(Array(200).fill(0))  // 处理后的数据（可能减去bias）
    const confidenceData = reactive(Array(200).fill(0))
    let dataIndex = 0
    
    // 雷达数据
    const radarData = reactive({
      targetId: '01',
      waveformConfidence: 0,
      waveformDataPoint: 0,
      waveformBias: 0,
      x: 0,
      y: 0,
      z: 0,
      range: 0,
      activityLevel: 0,
      outOfBedLevel: 0,
      rpm: 0,
      rpmConfidence: 0,
      voxelIndex: 0,
      voxelIntensity: 0,
      minAngle: 0,
      maxAngle: 0,
      inhaleExhale: 0
    })
    
    // 参数配置
    const parameters = [
      { key: 'waveformConfidence', label: 'Waveform Confidence' },
      { key: 'waveformDataPoint', label: 'Waveform Data Point' },
      { key: 'waveformBias', label: 'Waveform Bias' },
      { key: 'x', label: 'Position X' },
      { key: 'y', label: 'Position Y' },
      { key: 'z', label: 'Position Z' },
      { key: 'range', label: 'Position Range' },
      { key: 'voxelIndex', label: 'Voxel Index' },
      { key: 'voxelIntensity', label: 'Voxel Intensity' },
      { key: 'rpm', label: 'RPM', unit: 'per Minute' },
      { key: 'rpmConfidence', label: 'RPM Confidence' },
      { key: 'activityLevel', label: 'Level Activity' },
      { key: 'angleRange', label: 'Angle Range' },
      { key: 'outOfBedLevel', label: 'Level Out of Bed' }
    ]
    
    // 设置
    const settings = reactive({
      minAngle: 0,
      maxAngle: 0
    })
    
    // 检查浏览器支持
    const checkSerialSupport = () => {
      if (!('serial' in navigator)) {
        isSerialSupported.value = false
        
        // 检查是否是HTTPS
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          warningMessage.value = '请使用 HTTPS 访问本页面，或使用 localhost 进行本地测试'
        } else {
          warningMessage.value = '请使用 Chrome 89+ 或 Edge 89+ 浏览器'
        }
        
        addLog('ERROR: Web Serial API not supported')
        return false
      }
      
      isSerialSupported.value = true
      return true
    }
    
    // 格式化显示值
    const formatValue = (key, value) => {
      if (key === 'angleRange') {
        return `${radarData.minAngle}/${radarData.maxAngle}`
      }
      if (key === 'voxelIndex') {
        return value.toString()
      }
      if (key === 'inhaleExhale') {
        return value === 1 ? 'Inhale' : 'Exhale'
      }
      if (typeof value === 'number') {
        return value.toFixed(3)
      }
      return value
    }
    
    // 添加控制台日志
    const addLog = (message) => {
      const time = new Date().toLocaleTimeString()
      consoleLogs.value.push({ time, message })
      
      // 限制日志数量
      if (consoleLogs.value.length > 100) {
        consoleLogs.value = consoleLogs.value.slice(-100)
      }
      
      // 自动滚动到底部
      nextTick(() => {
        if (consoleOutput.value) {
          consoleOutput.value.scrollTop = consoleOutput.value.scrollHeight
        }
      })
    }
    
    // 当bias设置改变时的处理
    const onBiasSettingChange = () => {
      addLog(`Bias subtraction ${subtractBias.value ? 'enabled' : 'disabled'}`)
      
      // 重新处理所有已存储的数据
      if (subtractBias.value) {
        for (let i = 0; i < waveformDataRaw.length; i++) {
          waveformDataProcessed[i] = waveformDataRaw[i] - radarData.waveformBias
        }
      } else {
        for (let i = 0; i < waveformDataRaw.length; i++) {
          waveformDataProcessed[i] = waveformDataRaw[i]
        }
      }
      
      // 更新图表
      if (waveformChartInstance) {
        waveformChartInstance.data.datasets[0].data = [...waveformDataProcessed]
        waveformChartInstance.update('none')
      }
    }
    
    // 初始化图表
    const initCharts = () => {
      const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: 'rgba(255, 255, 255, 0.7)' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: 'rgba(255, 255, 255, 0.7)' }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
      
      // 波形图表
      if (waveformChart.value) {
        waveformChartInstance = new Chart(waveformChart.value, {
          type: 'line',
          data: {
            labels: Array.from({ length: 200 }, (_, i) => i),
            datasets: [{
              data: [...waveformDataProcessed],
              borderColor: '#00bcd4',
              borderWidth: 2,
              tension: 0.4,
              fill: false,
              pointRadius: 0
            }]
          },
          options: chartOptions
        })
      }
      
      // 置信度图表
      if (confidenceChart.value) {
        confidenceChartInstance = new Chart(confidenceChart.value, {
          type: 'line',
          data: {
            labels: Array.from({ length: 200 }, (_, i) => i),
            datasets: [{
              data: [...confidenceData],
              borderColor: '#ffc107',
              borderWidth: 2,
              tension: 0.4,
              fill: false,
              pointRadius: 0
            }]
          },
          options: chartOptions
        })
      }
    }
    
    // 解析雷达数据
    const parseRadarData = (line) => {
      if (!line.includes('RADAR: Respiration,')) return null
      
      const dataMatch = line.match(/Respiration,(\d+),(.+)/)
      if (!dataMatch) return null
      
      const targetId = dataMatch[1]
      const values = dataMatch[2].split(',').map(v => v.trim())
      
      if (values.length < 17) return null
      
      return {
        targetId,
        waveformConfidence: parseFloat(values[0]) || 0,
        waveformDataPoint: parseFloat(values[1]) || 0,
        waveformBias: parseFloat(values[2]) || 0,
        x: parseFloat(values[3]) || 0,
        y: parseFloat(values[4]) || 0,
        z: parseFloat(values[5]) || 0,
        range: parseFloat(values[6]) || 0,
        activityLevel: parseFloat(values[7]) || 0,
        outOfBedLevel: parseFloat(values[8]) || 0,
        rpm: parseFloat(values[9]) || 0,
        rpmConfidence: parseFloat(values[10]) || 0,
        voxelIndex: parseInt(values[11]) || 0,
        voxelIntensity: parseFloat(values[12]) || 0,
        minAngle: parseFloat(values[13]) || 0,
        maxAngle: parseFloat(values[14]) || 0,
        inhaleExhale: parseInt(values[15]) || 0
      }
    }
    
    // 更新图表数据
    const updateCharts = () => {
      // 存储原始数据
      waveformDataRaw[dataIndex] = radarData.waveformDataPoint
      
      // 根据设置决定是否减去bias
      if (subtractBias.value) {
        waveformDataProcessed[dataIndex] = radarData.waveformDataPoint - radarData.waveformBias
      } else {
        waveformDataProcessed[dataIndex] = radarData.waveformDataPoint
      }
      
      confidenceData[dataIndex] = radarData.waveformConfidence
      dataIndex = (dataIndex + 1) % 200
      
      if (waveformChartInstance) {
        waveformChartInstance.data.datasets[0].data = [...waveformDataProcessed]
        waveformChartInstance.update('none')
      }
      
      if (confidenceChartInstance) {
        confidenceChartInstance.data.datasets[0].data = [...confidenceData]
        confidenceChartInstance.update('none')
      }
    }
    
    // 读取串口数据
    const readSerialData = async () => {
      if (!port) return
      
      const decoder = new TextDecoderStream()
      readableStreamClosed = port.readable.pipeTo(decoder.writable)
      reader = decoder.readable.getReader()
      
      let buffer = ''
      
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          
          buffer += value
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            // 显示原始数据
            if (line.includes('RADAR:') || line.includes('MONITOR:')) {
              addLog(line.trim())
            }
            
            // 解析雷达数据
            const data = parseRadarData(line)
            if (data) {
              Object.assign(radarData, data)
              updateCharts()
              
              // 录制数据时，记录原始数据和处理设置
              if (isRecording.value) {
                recordedData.value.push({
                  timestamp: Date.now(),
                  biasSubtracted: subtractBias.value,
                  ...data
                })
              }
            }
            
            // 解析监控状态
            if (line.includes('MONITOR: State,')) {
              const match = line.match(/State,(\w+),/)
              if (match) {
                deviceStatus.value = match[1]
              }
            }
            
            if (line.includes('MONITOR: Status,')) {
              const match = line.match(/Status,([^,]+),/)
              if (match) {
                temperature.value = parseFloat(match[1]).toFixed(2)
              }
            }
          }
        }
      } catch (error) {
        addLog(`Read error: ${error.message}`)
      } finally {
        reader.releaseLock()
      }
    }
    
    // 请求用户选择串口（必须由用户手势触发）
    const requestPort = async () => {
      try {
        if (!checkSerialSupport()) {
          return
        }
        
        // 请求用户选择串口
        const newPort = await navigator.serial.requestPort()
        
        // 获取串口信息
        const info = await newPort.getInfo()
        const portName = `USB Serial (${info.usbVendorId || 'Unknown'}:${info.usbProductId || 'Unknown'})`
        
        // 保存到映射
        const portIndex = portMap.size
        portMap.set(portIndex, {
          port: newPort,
          name: portName,
          info: info
        })
        
        // 更新可用串口列表
        await refreshPorts()
        
        // 自动选择新添加的串口
        selectedPort.value = portIndex
        
        addLog(`Added new port: ${portName}`)
      } catch (error) {
        if (error.name !== 'NotFoundError') {
          addLog(`Error requesting port: ${error.message}`)
        }
      }
    }
    
    // 初始化串口（首次使用）
    const initSerialPort = async () => {
      showInitModal.value = false
      await requestPort()
    }
    
    // 刷新串口列表
    const refreshPorts = async () => {
      try {
        if (!checkSerialSupport()) {
          return
        }
        
        // 获取已授权的串口
        const ports = await navigator.serial.getPorts()
        
        // 清空并重建映射
        availablePorts.value = []
        
        // 如果有已保存的端口映射，使用它们
        if (portMap.size > 0) {
          portMap.forEach((value, key) => {
            availablePorts.value.push({
              index: key,
              name: value.name,
              port: value.port,
              info: value.info
            })
          })
        } else {
          // 否则使用系统返回的端口
          ports.forEach(async (port, index) => {
            try {
              const info = await port.getInfo()
              const portName = `USB Serial (${info.usbVendorId || 'Unknown'}:${info.usbProductId || 'Unknown'})`
              
              portMap.set(index, {
                port: port,
                name: portName,
                info: info
              })
              
              availablePorts.value.push({
                index: index,
                name: portName,
                port: port,
                info: info
              })
            } catch (e) {
              // 如果无法获取信息，使用默认名称
              const portName = `COM${index + 1}`
              portMap.set(index, {
                port: port,
                name: portName,
                info: {}
              })
              
              availablePorts.value.push({
                index: index,
                name: portName,
                port: port,
                info: {}
              })
            }
          })
        }
        
        if (availablePorts.value.length === 0) {
          addLog('No authorized ports found. Click "➕" to add a port.')
        } else {
          addLog(`Found ${availablePorts.value.length} authorized port(s)`)
        }
      } catch (error) {
        addLog(`Error refreshing ports: ${error.message}`)
      }
    }
    
    // 连接/断开串口
    const toggleConnection = async () => {
      if (!isSerialSupported.value) {
        alert(warningMessage.value)
        return
      }
      
      if (isConnected.value) {
        // 断开连接
        try {
          if (reader) {
            await reader.cancel()
            await readableStreamClosed.catch(() => {})
            reader = null
            readableStreamClosed = null
          }
          
          if (writer) {
            await writer.close()
            writer = null
          }
          
          if (port) {
            await port.close()
            port = null
          }
          
          isConnected.value = false
          deviceStatus.value = 'IDLE'
          currentPortInfo.value = null
          addLog('Disconnected')
        } catch (error) {
          addLog(`Disconnect error: ${error.message}`)
        }
      } else {
        // 连接串口
        try {
          if (selectedPort.value === '') {
            alert('Please select a port or click "➕" to add one')
            return
          }
          
          const portData = portMap.get(parseInt(selectedPort.value))
          if (!portData) {
            addLog('Port not found')
            return
          }
          
          port = portData.port
          
          await port.open({ baudRate: parseInt(baudRate.value) })
          
          isConnected.value = true
          deviceStatus.value = 'ACTIVE'
          currentPortInfo.value = {
            name: portData.name,
            baudRate: baudRate.value
          }
          addLog(`Connected to ${portData.name} at ${baudRate.value} baud`)
          
          // 开始读取数据
          readSerialData()
        } catch (error) {
          addLog(`Connection error: ${error.message}`)
          isConnected.value = false
          
          // 如果是因为端口已经打开，提供更友好的错误信息
          if (error.name === 'InvalidStateError') {
            alert('This port is already open in another tab or application')
          }
        }
      }
    }
    
    // 切换录制
    const toggleRecording = () => {
      if (!isConnected.value) {
        alert('Please connect to a serial port first')
        return
      }
      
      if (isRecording.value) {
        isRecording.value = false
        
        // 保存数据，包含bias设置信息
        if (recordedData.value.length > 0) {
          const recordInfo = {
            recordTime: new Date().toISOString(),
            biasSubtractionEnabled: subtractBias.value,
            totalRecords: recordedData.value.length,
            data: recordedData.value
          }
          
          const blob = new Blob(
            [JSON.stringify(recordInfo, null, 2)], 
            { type: 'application/json' }
          )
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `radar_data_${Date.now()}.json`
          a.click()
          URL.revokeObjectURL(url)
          addLog(`Saved ${recordedData.value.length} records (Bias ${subtractBias.value ? 'subtracted' : 'original'})`)
        }
        recordedData.value = []
      } else {
        isRecording.value = true
        recordedData.value = []
        addLog(`Recording started (Bias ${subtractBias.value ? 'subtraction enabled' : 'subtraction disabled'})`)
      }
    }
    
    // 应用设置
    const applySettings = () => {
      if (!isConnected.value) {
        alert('Please connect to a serial port first')
        return
      }
      addLog(`Set angles: ${settings.minAngle}° - ${settings.maxAngle}°`)
      // TODO: 发送命令到雷达
    }
    
    // 生命周期
    onMounted(async () => {
      initCharts()
      
      // 检查串口支持
      if (checkSerialSupport()) {
        addLog('System initialized')
        
        // 尝试获取已授权的串口
        await refreshPorts()
        
        // 如果没有已授权的串口，显示初始化提示
        if (availablePorts.value.length === 0) {
          setTimeout(() => {
            showInitModal.value = true
          }, 1000)
        }
      } else {
        addLog(`Browser not supported: ${warningMessage.value}`)
      }
    })
    
    onUnmounted(() => {
      // 清理资源
      if (isConnected.value) {
        toggleConnection()
      }
      if (waveformChartInstance) {
        waveformChartInstance.destroy()
      }
      if (confidenceChartInstance) {
        confidenceChartInstance.destroy()
      }
    })
    
    return {
      // refs
      waveformChart,
      confidenceChart,
      consoleOutput,
      
      // data
      isConnected,
      isRecording,
      selectedPort,
      baudRate,
      availablePorts,
      deviceStatus,
      temperature,
      consoleLogs,
      radarData,
      parameters,
      settings,
      showInitModal,
      isSerialSupported,
      warningMessage,
      currentPortInfo,
      subtractBias,
      
      // methods
      formatValue,
      refreshPorts,
      toggleConnection,
      toggleRecording,
      applySettings,
      requestPort,
      initSerialPort,
      checkSerialSupport,
      onBiasSettingChange
    }
  }
}
</script>

<style scoped>
/* 新增样式 */
.chart-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: normal;
  color: #666;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  margin-right: 8px;
  cursor: pointer;
  width: 18px;
  height: 18px;
}

.checkbox-label span {
  user-select: none;
}

.chart-label {
  position: absolute;
  top: 10px;
  right: 15px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  background: rgba(0, 0, 0, 0.3);
    padding: 4px 8px;
  border-radius: 4px;
}

.settings-item {
  margin-bottom: 15px;
}

.switch-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #ddd;
  font-size: 14px;
}

.bias-value {
  color: #ffc107;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  background: rgba(255, 193, 7, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 美化的开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #555;
  transition: .4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #00bcd4;
}

input:checked + .slider:before {
  transform: translateX(26px);
}

/* 保留所有原有样式 */
.warning-box {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  color: #856404;
}

.warning-box p {
  margin: 5px 0;
}

.warning-text {
  font-size: 12px;
  margin-top: 10px;
}

.port-selector {
  display: flex;
  gap: 10px;
}

.port-selector .form-control {
  flex: 1;
}

.btn-add-port {
  padding: 10px 15px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.3s;
}

.btn-add-port:hover:not(:disabled) {
  background: #218838;
  transform: scale(1.05);
}

.btn-add-port:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.port-info {
  margin-top: 15px;
  padding: 10px;
  background: #e8f4fd;
  border-radius: 8px;
  font-size: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin: 5px 0;
}

.info-label {
  color: #666;
  font-weight: 500;
}

.info-value {
  color: #333;
  font-weight: 600;
}

.text-green {
  color: #28a745;
}

.toggle-switch.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 15px;
  padding: 30px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-content h2 {
  margin-bottom: 20px;
  color: #333;
}

.modal-content ul {
  margin: 20px 0;
  padding-left: 20px;
}

.modal-content li {
  margin: 10px 0;
  color: #666;
}

.modal-note {
  background: #f0f8ff;
  padding: 10px;
  border-radius: 8px;
  margin: 20px 0;
  color: #0066cc;
  font-size: 14px;
}

.modal-btn {
  margin: 10px 10px 0 0;
  padding: 12px 30px;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5a67d8;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  padding: 20px;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 20px;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card {
  background: white;
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.card-header .icon {
  margin-right: 10px;
  color: #667eea;
}

.chart-container {
  position: relative;
  height: 200px;
  background: linear-gradient(180deg, #1a3a52 0%, #2d5a7b 100%);
  border-radius: 10px;
  padding: 15px;
  margin-bottom: 15px;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.connection-panel {
  background: #f8f9fa;
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.connection-header,
.settings-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.connection-header .icon,
.settings-header .icon {
  margin-right: 10px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  color: #666;
  font-size: 14px;
}

.form-control {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  font-size: 14px;
}

.form-control:disabled {
  background: #e9ecef;
  cursor: not-allowed;
}

.connection-control {
  display: flex;
  align-items: center;
  gap: 15px;
}

.toggle-switch {
  position: relative;
  width: 60px;
  height: 30px;
  background: #ccc;
  border-radius: 15px;
  cursor: pointer;
  transition: background 0.3s;
}

.toggle-switch.active {
  background: #4caf50;
}

.toggle-slider {
  position: absolute;
  width: 26px;
  height: 26px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.3s;
}

.toggle-switch.active .toggle-slider {
  transform: translateX(30px);
}

.status-text {
  font-weight: 600;
  color: #666;
}

.settings-panel {
  background: #3a3a3a;
  color: white;
  border-radius: 15px;
  padding: 20px;
}

.settings-group {
  margin-bottom: 20px;
}

.settings-group h4 {
  margin-bottom: 15px;
  font-size: 14px;
  font-weight: 500;
  color: #ddd;
}

.settings-panel .form-control {
  background: #4a4a4a;
  border-color: #555;
  color: white;
}

.settings-panel .form-control:disabled {
  background: #2a2a2a;
  color: #666;
}

.btn {
  padding: 12px 30px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-refresh {
  padding: 10px 15px;
  background: #667eea;
  color: white;
  font-size: 20px;
}

.btn-refresh:hover:not(:disabled) {
  background: #5a67d8;
  transform: rotate(180deg);
}

.btn-set {
  width: 100%;
  margin-top: 10px;
  background: #667eea;
  color: white;
}

.btn-set:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-record {
  width: 100%;
  background: #48bb78;
  color: white;
}

.btn-record:hover:not(:disabled) {
  background: #38a169;
}

.btn-record.recording {
  background: #e53e3e;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(229, 62, 62, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(229, 62, 62, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(229, 62, 62, 0);
  }
}

.btn-record.recording:hover {
  background: #c53030;
}

.status-display {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 2px solid #e2e8f0;
}

.status-label {
  font-size: 20px;
  font-weight: 600;
  color: #666;
}

.status-value {
  font-size: 20px;
  font-weight: 600;
  color: #48bb78;
}

.parameters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
}

.parameter-item {
  background: linear-gradient(135deg, #2d5a7b 0%, #1a3a52 100%);
  border-radius: 10px;
  padding: 15px;
  text-align: center;
  color: white;
  transition: transform 0.2s;
}

.parameter-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.parameter-label {
  font-size: 12px;
  color: #a0c4e4;
  margin-bottom: 8px;
}

.parameter-value {
  font-size: 24px;
  font-weight: 600;
  color: white;
}

.parameter-value.text-red {
  color: #ff6b6b;
}

.parameter-unit {
  font-size: 12px;
  color: #a0c4e4;
  margin-top: 5px;
}

.console-output {
  background: #1a1a1a;
  color: #0f0;
  font-family: 'Courier New', monospace;
  padding: 10px;
  border-radius: 5px;
  height: 150px;
  overflow-y: auto;
  font-size: 12px;
}

.console-line {
  margin-bottom: 2px;
  white-space: pre-wrap;
  word-break: break-all;
}

.logo {
  position: fixed;
  bottom: 20px;
  right: 20px;
  font-size: 30px;
  font-weight: bold;
  color: #667eea;
  display: flex;
  align-items: center;
}

.logo-arrow {
  color: #00bcd4;
  margin-right: 5px;
}

@media (max-width: 1024px) {
  .container {
    grid-template-columns: 1fr;
  }
  
  .sidebar {
    order: -1;
  }
  
  .chart-controls {
    margin-left: 0;
    margin-top: 10px;
    width: 100%;
  }
  
  .card-header {
    flex-wrap: wrap;
  }
}
</style>