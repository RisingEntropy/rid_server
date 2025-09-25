<template>
  <div class="drone-map-container">
    <!-- 地图加载失败提示 -->
    <div v-if="mapError" class="map-error">
      <div class="error-content">
        <h3>地图加载失败</h3>
        <p>{{ mapError }}</p>
        <button @click="retryInit">重试</button>
      </div>
    </div>
    
    <!-- 高德地图容器 -->
    <div id="amap-container" class="map-container"></div>
    
    <!-- 左侧可拖动面板 -->
    <div 
      ref="sidePanel"
      class="side-panel"
      :style="{ width: panelWidth + 'px' }"
    >
      <!-- 拖动手柄 -->
      <div 
        class="resize-handle"
        @mousedown="startResize"
      ></div>
      
      <!-- 面板内容 -->
      <div class="panel-content">
        <h2 class="panel-title">区域无人机</h2>
        
        <!-- 统计信息 -->
        <div class="stats-section">
          <div class="stat-item">
            <span class="stat-label">总数量：</span>
            <span class="stat-value">{{ drones.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">在线数量：</span>
            <span class="stat-value">{{ onlineDroneCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">信号异常：</span>
            <span class="stat-value" :class="{ 'error': signalAbnormalCount > 0 }">
              {{ signalAbnormalCount }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">最后更新：</span>
            <span class="stat-value">{{ lastUpdateTime }}</span>
          </div>
        </div>
        
        <!-- 自动刷新控制 -->
        <div class="refresh-control">
          <label class="refresh-toggle">
            <input 
              type="checkbox" 
              v-model="autoRefresh"
              @change="toggleAutoRefresh"
            >
            <span>自动刷新 (2秒)</span>
          </label>
          <button 
            class="manual-refresh-btn"
            @click="loadDronesInBounds"
            :disabled="loading"
          >
            {{ loading ? '刷新中...' : '手动刷新' }}
          </button>
        </div>
        
        <!-- 无人机列表 -->
        <div class="drone-list">
          <h3 class="list-title">无人机列表</h3>
          <div v-if="loading && drones.length === 0" class="loading">
            加载中...
          </div>
          <div v-else-if="drones.length === 0" class="empty">
            当前区域无无人机
          </div>
          <ul v-else class="list">
            <li 
              v-for="drone in drones" 
              :key="drone.id"
              class="list-item"
              :class="{ 
                'online': drone.status?.is_online,
                'signal-warning': hasSignalWarning(drone.id) && drone.status?.is_online
              }"
              @click="centerOnDrone(drone)"
            >
              <div class="drone-item">
                <div class="drone-header">
                  <span class="drone-serial">{{ drone.serial_number }}</span>
                  <span 
                    v-if="hasSignalWarning(drone.id) && drone.status?.is_online" 
                    class="warning-badge"
                    :title="getSignalWarningMessage(drone.id)"
                  >
                    ⚠️
                  </span>
                </div>
                <div class="drone-info">
                  <span class="drone-model">{{ drone.model }}</span>
                  <span class="drone-status" :class="{ 'online': drone.status?.is_online }">
                    {{ drone.status?.is_online ? '在线' : '离线' }}
                  </span>
                </div>
                <!-- 信号丢失计数显示 -->
                <div v-if="getSignalLostInfo(drone.id) && drone.status?.is_online" class="signal-lost-info">
                  <span v-if="getSignalLostInfo(drone.id).wifi >= 2" class="lost-badge wifi">
                    WiFi: {{ getSignalLostInfo(drone.id).wifi }}
                  </span>
                  <span v-if="getSignalLostInfo(drone.id).lora >= 2" class="lost-badge lora">
                    LoRa: {{ getSignalLostInfo(drone.id).lora }}
                  </span>
                  <span v-if="getSignalLostInfo(drone.id).cellular >= 2" class="lost-badge cellular">
                    4G: {{ getSignalLostInfo(drone.id).cellular }}
                  </span>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    
    <!-- 无人机信息弹窗 -->
    <div v-if="selectedDrone" class="drone-popup" @click.self="selectedDrone = null">
      <div class="popup-content">
        <div class="popup-header">
          <h3>无人机详情</h3>
          <button class="close-btn" @click="selectedDrone = null">×</button>
        </div>
        <div class="popup-body">
          <div class="info-row">
            <span class="info-label">序列号：</span>
            <span class="info-value">{{ selectedDrone.serial_number }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">型号：</span>
            <span class="info-value">{{ selectedDrone.model }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">状态：</span>
            <span class="info-value" :class="{ 'online': selectedDrone.status?.is_online }">
              {{ selectedDrone.status?.is_online ? '在线' : '离线' }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">高度：</span>
            <span class="info-value">{{ selectedDrone.last_altitude || 'N/A' }} m</span>
          </div>
          <div class="info-row">
            <span class="info-label">速度：</span>
            <span class="info-value">{{ selectedDrone.last_speed || 'N/A' }} m/s</span>
          </div>
          <div class="info-row">
            <span class="info-label">卫星数：</span>
            <span class="info-value">{{ selectedDrone.last_satellites || 'N/A' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">最后更新：</span>
            <span class="info-value">{{ formatTime(selectedDrone.last_seen_at) }}</span>
          </div>
          
          <!-- 信号质量信息 -->
          <div v-if="selectedDrone.signal_info" class="signal-section">
            <h4>信号质量</h4>
            <div class="info-row">
              <span class="info-label">WiFi：</span>
              <span class="info-value">
                {{ selectedDrone.signal_info.last_wifi_quality !== null 
                   ? `${selectedDrone.signal_info.last_wifi_quality} dBm` 
                   : '无信号' }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">LoRa：</span>
              <span class="info-value">
                {{ selectedDrone.signal_info.last_lora_quality !== null 
                   ? `${selectedDrone.signal_info.last_lora_quality} dBm` 
                   : '无信号' }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">4G：</span>
              <span class="info-value">
                {{ selectedDrone.signal_info['last_4G_quality'] !== null 
                   ? selectedDrone.signal_info['last_4G_quality'] 
                   : '无信号' }}
              </span>
            </div>
            
            <!-- 信号丢失警告 -->
            <div v-if="getSignalLostInfo(selectedDrone.id)" class="signal-warning-section">
              <h5>信号监测状态</h5>
              <div class="warning-details">
                <div v-if="getSignalLostInfo(selectedDrone.id).wifi > 0" class="warning-item">
                  <span class="warning-icon">📶</span>
                  WiFi 连续{{ getSignalLostInfo(selectedDrone.id).wifi }}次无信号
                  <span v-if="getSignalLostInfo(selectedDrone.id).wifi >= 3" class="critical">（已标记丢失）</span>
                </div>
                <div v-if="getSignalLostInfo(selectedDrone.id).lora > 0" class="warning-item">
                  <span class="warning-icon">📡</span>
                  LoRa 连续{{ getSignalLostInfo(selectedDrone.id).lora }}次无信号
                  <span v-if="getSignalLostInfo(selectedDrone.id).lora >= 3" class="critical">（已标记丢失）</span>
                </div>
                <div v-if="getSignalLostInfo(selectedDrone.id).cellular > 0" class="warning-item">
                  <span class="warning-icon">📱</span>
                  4G 连续{{ getSignalLostInfo(selectedDrone.id).cellular }}次无信号
                  <span v-if="getSignalLostInfo(selectedDrone.id).cellular >= 3" class="critical">（已标记丢失）</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, createApp } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import DroneMarker from '~/components/client/DroneMarker.vue'

// 获取运行时配置
const config = useRuntimeConfig()

// 响应式数据
const map = ref(null)
const markers = ref([])
const drones = ref([])
const loading = ref(false)
const selectedDrone = ref(null)
const panelWidth = ref(320)
const sidePanel = ref(null)
const mapError = ref('')
const autoRefresh = ref(true)
const lastUpdateTime = ref('未更新')
const refreshInterval = ref(null)

// 信号丢失计数管理 - 使用更清晰的数据结构
const signalLostCounts = ref(new Map()) // Map<droneId, {wifi: number, lora: number, cellular: number}>
const signalHistory = ref(new Map()) // Map<droneId, Array<{wifi: boolean, lora: boolean, cellular: boolean}>>

// 存储Vue实例的Map
const markerApps = new Map()

// 计算属性
const onlineDroneCount = computed(() => {
  return drones.value.filter(d => d.status?.is_online).length
})

// 信号异常的无人机数量（至少有一个信号源连续3次丢失）
const signalAbnormalCount = computed(() => {
  let count = 0
  signalLostCounts.value.forEach((counts) => {
    if (counts.wifi >= 3 || counts.lora >= 3 || counts.cellular >= 3) {
      count++
    }
  })
  return count
})

// 检查无人机是否有信号警告（连续2次或以上）
const hasSignalWarning = (droneId) => {
  const counts = signalLostCounts.value.get(droneId)
  if (!counts) return false
  return counts.wifi >= 2 || counts.lora >= 2 || counts.cellular >= 2
}

// 获取信号警告消息
const getSignalWarningMessage = (droneId) => {
  const counts = signalLostCounts.value.get(droneId)
  if (!counts) return ''
  
  const warnings = []
  if (counts.wifi >= 3) warnings.push('WiFi信号丢失')
  else if (counts.wifi >= 2) warnings.push('WiFi信号不稳定')
  
  if (counts.lora >= 3) warnings.push('LoRa信号丢失')
  else if (counts.lora >= 2) warnings.push('LoRa信号不稳定')
  
  if (counts.cellular >= 3) warnings.push('4G信号丢失')
  else if (counts.cellular >= 2) warnings.push('4G信号不稳定')
  
  return warnings.join(', ')
}

// 获取信号丢失信息（用于显示）
const getSignalLostInfo = (droneId) => {
  const counts = signalLostCounts.value.get(droneId)
  if (!counts || (counts.wifi === 0 && counts.lora === 0 && counts.cellular === 0)) {
    return null
  }
  return counts
}

// 更新信号历史记录和丢失计数
const updateSignalStatus = (droneId, currentSignalInfo) => {
  // 获取或初始化历史记录
  let history = signalHistory.value.get(droneId) || []
  
  // 记录当前查询的信号状态
  const currentStatus = {
    wifi: currentSignalInfo?.last_wifi_quality !== null && currentSignalInfo?.last_wifi_quality !== undefined,
    lora: currentSignalInfo?.last_lora_quality !== null && currentSignalInfo?.last_lora_quality !== undefined,
    cellular: currentSignalInfo?.['last_4G_quality'] !== null && currentSignalInfo?.['last_4G_quality'] !== undefined,
    timestamp: Date.now()
  }
  
  // 添加到历史记录（保留最近10次）
  history.push(currentStatus)
  if (history.length > 10) {
    history.shift()
  }
  signalHistory.value.set(droneId, history)
  
  // 计算连续丢失次数
  const counts = {
    wifi: 0,
    lora: 0,
    cellular: 0
  }
  
  // 从最新的记录开始，向前计算连续丢失次数
  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i]
    
    // WiFi
    if (!record.wifi) {
      if (i === history.length - 1 || counts.wifi > 0) {
        counts.wifi++
      }
    } else if (counts.wifi > 0 && i < history.length - 1) {
      break // 如果之前有丢失但现在恢复了，停止计数
    }
    
    // LoRa
    if (!record.lora) {
      if (i === history.length - 1 || counts.lora > 0) {
        counts.lora++
      }
    } else if (counts.lora > 0 && i < history.length - 1) {
      counts.lora = 0 // 重置
    }
    
    // 4G
    if (!record.cellular) {
      if (i === history.length - 1 || counts.cellular > 0) {
        counts.cellular++
      }
    } else if (counts.cellular > 0 && i < history.length - 1) {
      counts.cellular = 0 // 重置
    }
  }
  
  // 更精确的连续计数逻辑
  const calculateConsecutiveLoss = (signalType) => {
    let count = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (!history[i][signalType]) {
        count++
      } else {
        break // 遇到有信号就停止
      }
    }
    return count
  }
  
  counts.wifi = calculateConsecutiveLoss('wifi')
  counts.lora = calculateConsecutiveLoss('lora')
  counts.cellular = calculateConsecutiveLoss('cellular')
  
  signalLostCounts.value.set(droneId, counts)
  
  // 调试日志
  console.log(`无人机 ${droneId} 信号状态:`, {
    current: currentStatus,
    consecutiveLoss: counts,
    historyLength: history.length
  })
  
  return counts
}

// 拖动相关
let isResizing = false
let startX = 0
let startWidth = 0

// 设置高德地图安全配置
if (process.client) {
  window._AMapSecurityConfig = {
    securityJsCode: config.public.amapSecurityKey
  }
}

// 坐标转换函数：GCJ02 转 WGS84
const gcj02ToWgs84 = (lng, lat) => {
  const a = 6378245.0
  const ee = 0.00669342162296594323
  
  const transformLat = (lng, lat) => {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0
    return ret
  }
  
  const transformLng = (lng, lat) => {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0
    return ret
  }
  
  const outOfChina = (lng, lat) => {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
  }
  
  if (outOfChina(lng, lat)) {
    return { lng, lat }
  }
  
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)
  
  const mgLat = lat + dLat
  const mgLng = lng + dLng
  
  return {
    lng: lng * 2 - mgLng,
    lat: lat * 2 - mgLat
  }
}

// WGS84 转 GCJ02
const wgs84ToGcj02 = (lng, lat) => {
  const a = 6378245.0
  const ee = 0.00669342162296594323
  
  const transformLat = (lng, lat) => {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0
    return ret
  }
  
  const transformLng = (lng, lat) => {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0
    return ret
  }
  
  const outOfChina = (lng, lat) => {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
  }
  
  if (outOfChina(lng, lat)) {
    return { lng, lat }
  }
  
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)
  
  return {
    lng: lng + dLng,
    lat: lat + dLat
  }
}

// 初始化地图
const initMap = async () => {
  try {
    mapError.value = ''
    
    if (!config.public.amapKey) {
      throw new Error('高德地图密钥未配置')
    }
    
    const AMap = await AMapLoader.load({
      key: config.public.amapKey,
      version: '2.0',
      plugins: ['AMap.Marker', 'AMap.InfoWindow']
    })
    
    map.value = new AMap.Map('amap-container', {
      zoom: 11,
      center: [114.17, 22.32],
      mapStyle: 'amap://styles/normal'
    })
    
    map.value.on('moveend', debounce(handleMapChange, 500))
    map.value.on('zoomend', debounce(handleMapChange, 500))
    
    await loadDronesInBounds()
    
    if (autoRefresh.value) {
      startAutoRefresh()
    }
  } catch (error) {
    console.error('地图初始化失败:', error)
    mapError.value = error.message || '地图加载失败，请检查网络连接'
  }
}

// 处理地图变化事件
const handleMapChange = async () => {
  stopAutoRefresh()
  await loadDronesInBounds()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
}

// 加载范围内的无人机
const loadDronesInBounds = async () => {
  if (!map.value) return
  
  if (loading.value) {
    console.log('正在加载中，跳过本次请求')
    return
  }
  
  loading.value = true
  
  try {
    const bounds = map.value.getBounds()
    const southwest = bounds.getSouthWest()
    const northeast = bounds.getNorthEast()
    
    const swWgs84 = gcj02ToWgs84(southwest.getLng(), southwest.getLat())
    const neWgs84 = gcj02ToWgs84(northeast.getLng(), northeast.getLat())
    
    const data = await $fetch('/api/query-drones', {
      params: {
        sw_lng: swWgs84.lng,
        sw_lat: swWgs84.lat,
        ne_lng: neWgs84.lng,
        ne_lat: neWgs84.lat,
        minutes: 600 // 10小时内有位置更新的无人机
      }
    })
    
    console.log(`查询到 ${data?.drones?.length || 0} 架无人机`)
    
    if (data?.drones) {
      const dronesWithGcj02 = data.drones.map(drone => {
        if (drone.last_location && drone.last_location.length === 2) {
          const gcj02Coords = wgs84ToGcj02(drone.last_location[0], drone.last_location[1])
          
          // 更新信号状态（这是关键：每次查询都更新）
          updateSignalStatus(drone.id, drone.signal_info)
          
          return {
            ...drone,
            last_location_gcj02: [gcj02Coords.lng, gcj02Coords.lat],
            last_location_wgs84: drone.last_location
          }
        }
        return drone
      })
      
      drones.value = dronesWithGcj02
      updateMarkers(dronesWithGcj02)
      updateLastUpdateTime()
      
      if (selectedDrone.value) {
        const updatedDrone = dronesWithGcj02.find(d => d.id === selectedDrone.value.id)
        if (updatedDrone) {
          selectedDrone.value = updatedDrone
        }
      }
    }
  } catch (error) {
    console.error('查询无人机失败:', error)
  } finally {
    loading.value = false
  }
}

// 创建无人机标记
const createDroneMarker = (drone) => {
  const AMap = window.AMap
  
  const markerContent = document.createElement('div')
  markerContent.className = 'custom-drone-marker'
  
  // 获取当前的丢失计数
  const lostCounts = signalLostCounts.value.get(drone.id) || {
    wifi: 0,
    lora: 0,
    cellular: 0
  }
  
  const app = createApp(DroneMarker, {
    signalInfo: drone.signal_info || {
      last_wifi_quality: null,
      last_lora_quality: null,
      'last_4G_quality': null
    },
    lostCounts: lostCounts
  })
  
  app.mount(markerContent)
  
  const marker = new AMap.Marker({
    position: new AMap.LngLat(drone.last_location_gcj02[0], drone.last_location_gcj02[1]),
    content: markerContent,
    offset: new AMap.Pixel(-40, -40),
    extData: { 
      droneId: drone.id,
      droneData: drone
    }
  })
  
  markerApps.set(drone.id, app)
  
  marker.on('click', () => {
    selectedDrone.value = drone
  })
  
  return marker
}

// 更新地图标记
const updateMarkers = (droneList) => {
  if (!map.value) return
  
  const existingMarkers = new Map()
  markers.value.forEach(marker => {
    const droneId = marker.getExtData()?.droneId
    if (droneId) {
      existingMarkers.set(droneId, marker)
    }
  })
  
  const newMarkers = []
  const currentDroneIds = new Set()
  
  droneList.forEach(drone => {
    if (!drone.last_location_gcj02) return
    
    currentDroneIds.add(drone.id)
    const existingMarker = existingMarkers.get(drone.id)
    
    if (existingMarker) {
      // 更新位置
      const AMap = window.AMap
      existingMarker.setPosition(new AMap.LngLat(drone.last_location_gcj02[0], drone.last_location_gcj02[1]))
      console.log(`更新无人机 ${drone.id} 位置到 [${drone.last_location_gcj02[0]}, ${drone.last_location_gcj02[1]}]`)
      // 检查是否需要更新标记（信号状态改变）
      const oldData = existingMarker.getExtData()?.droneData
      const counts = signalLostCounts.value.get(drone.id) || { wifi: 0, lora: 0, cellular: 0 }
      
      // 判断是否需要重新创建marker
      const signalChanged = JSON.stringify(oldData?.signal_info) !== JSON.stringify(drone.signal_info)
      const countsChanged = counts.wifi > 0 || counts.lora > 0 || counts.cellular > 0
      
      if (signalChanged || countsChanged) {
        // 清理旧的Vue实例
        const oldApp = markerApps.get(drone.id)
        if (oldApp) {
          oldApp.unmount()
          markerApps.delete(drone.id)
        }
        
        // 移除旧marker
        map.value.remove(existingMarker)
        
        // 创建新marker
        const newMarker = createDroneMarker(drone)
        newMarkers.push(newMarker)
        map.value.add(newMarker)
      } else {
        // 只更新数据
        existingMarker.setExtData({ 
          droneId: drone.id,
          droneData: drone 
        })
        newMarkers.push(existingMarker)
      }
      
      existingMarkers.delete(drone.id)
    } else {
      // 创建新marker
      const marker = createDroneMarker(drone)
      newMarkers.push(marker)
      map.value.add(marker)
    }
  })
  
  // 清理不再存在的markers
  existingMarkers.forEach(marker => {
    const droneId = marker.getExtData()?.droneId
    if (droneId) {
      const app = markerApps.get(droneId)
      if (app) {
        app.unmount()
        markerApps.delete(droneId)
      }
      // 清理历史记录
      signalLostCounts.value.delete(droneId)
      signalHistory.value.delete(droneId)
    }
    map.value.remove(marker)
  })
  
  markers.value = newMarkers
}

// 更新最后更新时间
const updateLastUpdateTime = () => {
  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const seconds = now.getSeconds().toString().padStart(2, '0')
  lastUpdateTime.value = `${hours}:${minutes}:${seconds}`
}

// 启动自动刷新
const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshInterval.value = setInterval(() => {
    console.log('自动刷新数据...')
    loadDronesInBounds()
  }, 2000) // 2秒刷新一次
  console.log('自动刷新已启动')
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
    console.log('自动刷新已停止')
  }
}

// 切换自动刷新
const toggleAutoRefresh = () => {
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

// 定位到指定无人机
const centerOnDrone = (drone) => {
  if (!map.value || !drone.last_location_gcj02) return
  
  map.value.setCenter(drone.last_location_gcj02)
  map.value.setZoom(15)
  selectedDrone.value = drone
}

// 开始调整面板宽度
const startResize = (e) => {
  isResizing = true
  startX = e.clientX
  startWidth = panelWidth.value
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.userSelect = 'none'
}

// 处理面板宽度调整
const handleResize = (e) => {
  if (!isResizing) return
  
  const diff = e.clientX - startX
  const newWidth = startWidth + diff
  panelWidth.value = Math.min(Math.max(newWidth, 250), 600)
}

// 停止调整面板宽度
const stopResize = () => {
  isResizing = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

// 防抖函数
const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// 重试初始化
const retryInit = () => {
  mapError.value = ''
  initMap()
}

// 生命周期
onMounted(() => {
  initMap()
})

onUnmounted(() => {
  stopAutoRefresh()
  
  // 清理所有marker的Vue实例
  markerApps.forEach(app => {
    app.unmount()
  })
  markerApps.clear()
  
  // 清理信号历史和计数
  signalLostCounts.value.clear()
  signalHistory.value.clear()
  
  if (map.value) {
    map.value.destroy()
  }
})
</script>

<style scoped>
/* 样式保持不变，这里是完整的样式 */
.drone-map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
}

/* 错误提示 */
.map-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.error-content h3 {
  color: #ef4444;
  margin-bottom: 10px;
}

.error-content p {
  color: #666;
  margin-bottom: 20px;
}

.error-content button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.error-content button:hover {
  background: #2563eb;
}

/* 左侧面板 */
.side-panel {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
  z-index: 100;
  display: flex;
}

.resize-handle {
  position: absolute;
  right: -3px;
  top: 0;
  width: 6px;
  height: 100%;
  background: transparent;
  cursor: ew-resize;
  z-index: 101;
}

.resize-handle:hover {
  background: rgba(59, 130, 246, 0.3);
}

.panel-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.panel-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #333;
}

/* 统计信息 */
.stats-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.stat-item:last-child {
  margin-bottom: 0;
}

.stat-label {
  color: #666;
  font-size: 14px;
}

.stat-value {
  font-weight: 600;
  color: #333;
  font-size: 16px;
}

.stat-value.error {
  color: #ef4444;
}

/* 刷新控制 */
.refresh-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
}

.refresh-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.refresh-toggle input[type="checkbox"] {
  margin-right: 8px;
  cursor: pointer;
}

.refresh-toggle span {
  font-size: 14px;
  color: #333;
}

.manual-refresh-btn {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.manual-refresh-btn:hover:not(:disabled) {
  background: #2563eb;
}

.manual-refresh-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

/* 无人机列表 */
.drone-list {
  flex: 1;
}

.list-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 15px;
  color: #333;
}

.loading,
.empty {
  text-align: center;
  color: #999;
  padding: 20px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.list-item:hover {
  background: #f8f9fa;
  border-color: #3b82f6;
  transform: translateX(3px);
}

.list-item.online {
  border-left: 3px solid #10b981;
}

.list-item.signal-warning {
  background: #fffbeb;
  border-color: #fbbf24;
}

.drone-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drone-serial {
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.warning-badge {
  font-size: 16px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.drone-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drone-model {
  font-size: 12px;
  color: #666;
}

.drone-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fee2e2;
  color: #dc2626;
}

.drone-status.online {
  background: #d1fae5;
  color: #065f46;
}

/* 信号丢失信息 */
.signal-lost-info {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.lost-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  color: white;
}

.lost-badge.wifi {
  background: #3b82f6;
}

.lost-badge.lora {
  background: #8b5cf6;
}

.lost-badge.cellular {
  background: #f59e0b;
}

/* 无人机详情弹窗 */
.drone-popup {
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

.popup-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.popup-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #333;
}

.popup-body {
  padding: 20px;
  overflow-y: auto;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}

.info-label {
  color: #666;
  font-size: 14px;
}

.info-value {
  color: #333;
  font-weight: 500;
  font-size: 14px;
}

.info-value.online {
  color: #10b981;
}

.signal-section {
  margin-top: 20px;
}

.signal-section h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #333;
}

.signal-warning-section {
  margin-top: 15px;
  padding: 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%);
  border-radius: 8px;
  border: 1px solid #fbbf24;
}

.signal-warning-section h5 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #92400e;
  font-weight: 600;
}

.warning-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.warning-item {
  font-size: 13px;
  color: #78350f;
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.warning-icon {
  font-size: 16px;
}

.critical {
  color: #dc2626;
  font-weight: 600;
  margin-left: 4px;
}

/* 自定义marker容器样式 */
:global(.custom-drone-marker) {
  position: relative;
  pointer-events: auto;
  cursor: pointer;
}

:global(.custom-drone-marker:hover .drone-marker) {
  transform: scale(1.1);
  transition: transform 0.2s ease;
}
</style>