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
        <h2 class="panel-title">轨迹回放</h2>
        
        <!-- 统计信息 -->
        <div class="stats-section">
          <div class="stat-item">
            <span class="stat-label">Mini 4 数据点：</span>
            <span class="stat-value">{{ dronesData.WANDS_31ADD.trajectoryPoints.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Air 3 数据点：</span>
            <span class="stat-value">{{ dronesData.Wanyi_2.trajectoryPoints.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">播放进度：</span>
            <span class="stat-value">{{ Math.round(progress) }}%</span>
          </div>
        </div>
        
        <!-- 播放控制 -->
        <div class="refresh-control">
          <button 
            class="manual-refresh-btn"
            @click="togglePlayback"
            :disabled="loading || getTotalPoints() === 0"
          >
            {{ isPlaying ? '⏸️ 暂停' : '▶️ 播放' }}
          </button>
          <button 
            class="manual-refresh-btn"
            @click="resetAnimation"
            :disabled="loading || getTotalPoints() === 0"
          >
            🔄 重置
          </button>
        </div>
        
        <!-- 进度条 -->
        <div class="progress-section">
          <div class="progress-bar">
            <div 
              class="progress-fill"
              :style="{ width: progress + '%' }"
            ></div>
          </div>
          <div class="progress-info">
            <span>{{ currentPointIndex }} / {{ maxPointIndex }}</span>
          </div>
        </div>
        
        <!-- 无人机状态列表 -->
        <div class="drone-list">
          <h3 class="list-title">无人机状态</h3>
          <ul class="list">
            <!-- WANDS 的Mini 4 -->
            <li class="list-item" :class="{ online: droneStatus.WANDS_31ADD.active }">
              <div class="drone-item">
                <div class="drone-header">
                  <span class="drone-serial">✈️ WANDS' Mini 4</span>
                </div>
                <div class="drone-info">
                  <span class="drone-model">序列号: WANDS_31ADD</span>
                  <span class="drone-status" :class="{ online: droneStatus.WANDS_31ADD.active }">
                    {{ droneStatus.WANDS_31ADD.active ? '在线' : '离线' }}
                  </span>
                </div>
                <div class="drone-details" v-if="droneStatus.WANDS_31ADD.active">
                  <div class="detail-row">
                    <span>Altitude:</span>
                    <span>{{ droneStatus.WANDS_31ADD.altitude }} m</span>
                  </div>
                  <div class="detail-row">
                    <span>Speed:</span>
                    <span>{{ droneStatus.WANDS_31ADD.speed }} m/s</span>
                  </div>
                  <div class="detail-row">
                    <span>RSSI:</span>
                    <span>{{ droneStatus.WANDS_31ADD.rssi }} dBm</span>
                  </div>
                  <div class="detail-row">
                    <span>Lat:</span>
                    <span>{{ droneStatus.WANDS_31ADD.lng }}</span>
                  </div>
                  <div class="detail-row">
                    <span>Lont:</span>
                    <span>{{ droneStatus.WANDS_31ADD.lat }}</span>
                  </div>
                </div>
              </div>
            </li>
            
            <!-- WANDS 的Air 3 -->
            <li class="list-item" :class="{ online: droneStatus.Wanyi_2.active }">
              <div class="drone-item">
                <div class="drone-header">
                  <span class="drone-serial">✈️ WANDS's Air 3</span>
                </div>
                <div class="drone-info">
                  <span class="drone-model">序列号: Wanyi_2</span>
                  <span class="drone-status" :class="{ online: droneStatus.Wanyi_2.active }">
                    {{ droneStatus.Wanyi_2.active ? '在线' : '离线' }}
                  </span>
                </div>
                <div class="drone-details" v-if="droneStatus.Wanyi_2.active">
                  <div class="detail-row">
                    <span>Altitude:</span>
                    <span>{{ droneStatus.Wanyi_2.altitude }} m</span>
                  </div>
                  <div class="detail-row">
                    <span>Speed:</span>
                    <span>{{ droneStatus.Wanyi_2.speed }} m/s</span>
                  </div>
                  <div class="detail-row">
                    <span>RSSI:</span>
                    <span>{{ droneStatus.Wanyi_2.rssi }} dBm</span>
                  </div>
                  <div class="detail-row">
                    <span>Lat:</span>
                    <span>{{ droneStatus.Wanyi_2.lng }}</span>
                  </div>
                  <div class="detail-row">
                    <span>Lont:</span>
                    <span>{{ droneStatus.Wanyi_2.lat }}</span>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    
    <!-- 加载提示覆盖层 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-content">
        <div class="spinner"></div>
        <p>正在加载轨迹数据...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'

// 获取运行时配置
const config = useRuntimeConfig()

// 响应式数据
const map = ref(null)
const loading = ref(false)
const mapError = ref('')
const animationTimer = ref(null)
const panelWidth = ref(320)
const sidePanel = ref(null)
const isPlaying = ref(false)
const currentPointIndex = ref(0)

// 无人机数据 - 使用新的显示名称
const dronesData = ref({
  WANDS_31ADD: {
    trajectoryPoints: [],
    marker: null,
    customInfoWindow: null,
    displayName: 'WANDS 的Mini 4',
    model: 'Mini 4',
    image: '/mini4.png'
  },
  Wanyi_2: {
    trajectoryPoints: [],
    marker: null,
    customInfoWindow: null,
    displayName: 'WANDS 的Air 3',
    model: 'Air 3',
    image: '/air3.png'
  }
})

// 无人机状态
const droneStatus = ref({
  WANDS_31ADD: {
    active: false,
    altitude: 0,
    speed: 0,
    rssi: 0,
    lat: 0,
    lng: 0
  },
  Wanyi_2: {
    active: false,
    altitude: 0,
    speed: 0,
    rssi: 0,
    lat: 0,
    lng: 0
  }
})

// 动画设置
const ANIMATION_DURATION = 30000 * 20 // 20 min
const FRAME_RATE = 60 // 每秒60帧
const FRAME_INTERVAL = 1000 / FRAME_RATE

// 拖动相关
let isResizing = false
let startX = 0
let startWidth = 0

// 计算属性
const maxPointIndex = computed(() => {
  return Math.max(
    dronesData.value.WANDS_31ADD.trajectoryPoints.length,
    dronesData.value.Wanyi_2.trajectoryPoints.length
  )
})

const progress = computed(() => {
  if (maxPointIndex.value === 0) return 0
  return (currentPointIndex.value / Math.max(1, maxPointIndex.value - 1)) * 100
})

// 设置高德地图安全配置
if (process.client) {
  window._AMapSecurityConfig = {
    securityJsCode: config.public.amapSecurityKey
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

// 验证坐标是否有效
const isValidCoordinate = (lng, lat) => {
  return Math.abs(lng) >= 5 && Math.abs(lat) >= 5
}

// 获取总数据点数
const getTotalPoints = () => {
  return dronesData.value.WANDS_31ADD.trajectoryPoints.length + 
         dronesData.value.Wanyi_2.trajectoryPoints.length
}

// 创建自定义信息窗口类
class CustomInfoWindow {
  constructor(options) {
    this.map = options.map
    this.position = options.position
    this.content = options.content
    this.offset = options.offset || { x: 40, y: 0 } // 默认偏移到右边
    this.droneId = options.droneId
    this.AMap = window.AMap
    this.div = null
  }
  
  setMap(map) {
    if (map) {
      this.map = map
      this.div = document.createElement('div')
      this.div.className = 'custom-info-window'
      this.div.innerHTML = this.content
      this.div.style.position = 'absolute'
      this.div.style.zIndex = '200'
      this.div.style.pointerEvents = 'auto'
      
      // 添加关闭按钮
      const closeBtn = document.createElement('span')
      closeBtn.className = 'info-close'
      closeBtn.innerHTML = '×'
      closeBtn.style.position = 'absolute'
      closeBtn.style.right = '5px'
      closeBtn.style.top = '5px'
      closeBtn.style.cursor = 'pointer'
      closeBtn.style.fontSize = '24px'
      closeBtn.style.color = '#999'
      closeBtn.onclick = () => this.close()
      this.div.appendChild(closeBtn)
      
      this.map.getContainer().appendChild(this.div)
      this.draw()
      
      // 监听地图移动和缩放
      this.map.on('mapmove', () => this.draw())
      this.map.on('zoomchange', () => this.draw())
    }
  }
  
  draw() {
    if (!this.div) return
    const pixel = this.map.lngLatToContainer(this.position)
    if (pixel) {
      // 固定在右边，垂直居中对齐
      this.div.style.left = (pixel.x + this.offset.x) + 'px'
      this.div.style.top = (pixel.y + this.offset.y) + 'px'
    }
  }
  
  setContent(content) {
    this.content = content
    if (this.div) {
      // 保存关闭按钮
      const closeBtn = this.div.querySelector('.info-close')
      this.div.innerHTML = content
      if (closeBtn) {
        this.div.appendChild(closeBtn)
      }
    }
  }
  
  setPosition(position) {
    this.position = position
    this.draw()
  }
  
  open() {
    if (this.div) {
      this.div.style.display = 'block'
    } else {
      this.setMap(this.map)
    }
  }
  
  close() {
    if (this.div) {
      this.div.style.display = 'none'
    }
  }
  
  destroy() {
    if (this.div && this.div.parentNode) {
      this.div.parentNode.removeChild(this.div)
      this.div = null
    }
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
      plugins: ['AMap.Marker']
    })
    
    map.value = new AMap.Map('amap-container', {
      zoom: 15,
      center: [114.264, 22.336],
      mapStyle: 'amap://styles/normal'
    })
    
    // 加载两个无人机的轨迹数据
    await loadAllDronesData()
    
  } catch (error) {
    console.error('地图初始化失败:', error)
    mapError.value = error.message || '地图加载失败，请检查网络连接'
  }
}

// 加载所有无人机数据
const loadAllDronesData = async () => {
  loading.value = true
  
  try {
    // 停止当前动画
    stopAnimation()
    
    // 加载两个无人机的数据
    await Promise.all([
      loadDroneData('WANDS_31ADD'),
      loadDroneData('Wanyi_2')
    ])
    
    // 初始化所有无人机标记
    initAllDroneMarkers()
    
    // 调整地图视野
    fitMapToAllTrajectories()
    
  } catch (error) {
    console.error('加载轨迹数据失败:', error)
  } finally {
    loading.value = false
  }
}

// 加载单个无人机数据
const loadDroneData = async (serialNumber) => {
  try {
    const data = await $fetch('/api/query-drones-history-by-sn', {
      params: {
        serial_number: serialNumber,
        limit: 6000000,
        minutes: 60000000
      }
    })
    
    if (data?.telemetry_data && data.telemetry_data.length > 0) {
      // 只使用4G数据源的轨迹点，并过滤无效坐标
      const fourGData = data.telemetry_data
        .filter(item => {
          return item.source === '4G' && 
                 item.location && 
                 item.location.length === 2 &&
                 isValidCoordinate(item.location[0], item.location[1])
        })
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      
      // 转换坐标并提取轨迹点
      dronesData.value[serialNumber].trajectoryPoints = fourGData.map(item => {
        const gcj02 = wgs84ToGcj02(item.location[0], item.location[1])
        return {
          position: [gcj02.lng, gcj02.lat],
          altitude: item.altitude || 0,
          speed: item.speed || 0,
          satellites: item.satellites || 0,
          rssi: item.signal_quality || 0,
          source: item.source,
          timestamp: item.timestamp
        }
      })
      
      console.log(`${serialNumber}: 加载了 ${dronesData.value[serialNumber].trajectoryPoints.length} 个有效轨迹点`)
    }
    
  } catch (error) {
    console.error(`加载 ${serialNumber} 数据失败:`, error)
  }
}

// 创建无人机信息窗口内容 - 使用新的显示名称
const createInfoWindowContent = (droneId, point) => {
  const droneInfo = dronesData.value[droneId]
  return `
    <div class="drone-info-window">
      <div class="info-header">
        <img src="${droneInfo.image}" alt="${droneInfo.model}" class="drone-image">
        <div class="info-title">
          <h4>${droneInfo.displayName}</h4>
          <span class="model-text">${droneInfo.model}</span>
        </div>
      </div>
      <div class="info-content">
        <div class="info-item">
          <span class="info-label">RSSI:</span>
          <span class="info-value">${point.rssi} dBm</span>
        </div>
        <div class="info-item">
          <span class="info-label">Lat:</span>
          <span class="info-value">${point.position[0].toFixed(6)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Lont:</span>
          <span class="info-value">${point.position[1].toFixed(6)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Altitude:</span>
          <span class="info-value">${point.altitude.toFixed(1)} m</span>
        </div>
        <div class="info-item">
          <span class="info-label">Speed:</span>
          <span class="info-value">${point.speed.toFixed(2)} m/s</span>
        </div>
      </div>
    </div>
  `
}

// 初始化所有无人机标记
const initAllDroneMarkers = () => {
  if (!map.value) return
  
  const AMap = window.AMap
  
  // 初始化每个无人机的标记
  let index = 0
  Object.keys(dronesData.value).forEach(droneId => {
    const droneData = dronesData.value[droneId]
    
    if (droneData.trajectoryPoints.length === 0) return
    
    // 移除旧的标记和信息窗口
    if (droneData.marker) {
      map.value.remove(droneData.marker)
      droneData.marker = null
    }
    
    if (droneData.customInfoWindow) {
      droneData.customInfoWindow.destroy()
      droneData.customInfoWindow = null
    }
    
    // 创建无人机标记
    const firstPoint = droneData.trajectoryPoints[0]
    
    // 创建标记图标
    const icon = new AMap.Icon({
      image: '/drone_logo.svg',
      size: new AMap.Size(40, 40),
      imageSize: new AMap.Size(40, 40)
    })
    
    droneData.marker = new AMap.Marker({
      position: new AMap.LngLat(firstPoint.position[0], firstPoint.position[1]),
      icon: icon,
      offset: new AMap.Pixel(-20, -20),
      zIndex: 100
    })
    
    map.value.add(droneData.marker)
    
    // 创建自定义信息窗口，两个都在右边，上下错开
    droneData.customInfoWindow = new CustomInfoWindow({
      map: map.value,
      position: new AMap.LngLat(firstPoint.position[0], firstPoint.position[1]),
      content: createInfoWindowContent(droneId, firstPoint),
      offset: { 
        x: 45,  // 固定在右边45像素
        y: index === 0 ? -80 : 80  // 第一个在上方，第二个在下方，避免重叠
      },
      droneId: droneId
    })
    
    droneData.customInfoWindow.open()
    
    // 更新状态
    updateDroneStatus(droneId, firstPoint)
    
    index++
  })
}

// 更新无人机状态
const updateDroneStatus = (droneId, point) => {
  if (!point) return
  
  droneStatus.value[droneId] = {
    active: true,
    altitude: point.altitude.toFixed(1),
    speed: point.speed.toFixed(2),
    rssi: point.rssi,
    lat: point.position[1].toFixed(6),
    lng: point.position[0].toFixed(6)
  }
}

// 调整地图视野以适应所有轨迹
const fitMapToAllTrajectories = () => {
  if (!map.value) return
  
  const AMap = window.AMap
  const bounds = new AMap.Bounds()
  
  Object.values(dronesData.value).forEach(droneData => {
    droneData.trajectoryPoints.forEach(point => {
      bounds.extend(new AMap.LngLat(point.position[0], point.position[1]))
    })
  })
  
  if (!bounds.isEmpty()) {
    map.value.setBounds(bounds, false, [100, 100, 100, 400])
  }
}

// 播放/暂停动画
const togglePlayback = () => {
  if (isPlaying.value) {
    pauseAnimation()
  } else {
    playAnimation()
  }
}

// 播放动画
const playAnimation = () => {
  if (getTotalPoints() === 0) return
  
  isPlaying.value = true
  
  // 如果已经播放完成，重置
  if (currentPointIndex.value >= maxPointIndex.value - 1) {
    currentPointIndex.value = 0
  }
  
  const totalFrames = (ANIMATION_DURATION / FRAME_INTERVAL)
  const pointsPerFrame = maxPointIndex.value / totalFrames
  
  let frameCount = currentPointIndex.value / pointsPerFrame
  
  animationTimer.value = setInterval(() => {
    frameCount++
    const newIndex = Math.floor(frameCount * pointsPerFrame)
    
    if (newIndex >= maxPointIndex.value - 1) {
      currentPointIndex.value = maxPointIndex.value - 1
      updateAllMarkersPosition(currentPointIndex.value)
      stopAnimation()
    } else {
      currentPointIndex.value = newIndex
      updateAllMarkersPosition(currentPointIndex.value)
    }
  }, FRAME_INTERVAL)
}

// 更新所有标记位置
const updateAllMarkersPosition = (index) => {
  const AMap = window.AMap
  
  // 更新每个无人机
  Object.keys(dronesData.value).forEach(droneId => {
    const droneData = dronesData.value[droneId]
    const pointIndex = Math.min(index, droneData.trajectoryPoints.length - 1)
    
    if (pointIndex >= 0 && droneData.trajectoryPoints[pointIndex] && droneData.marker) {
      const point = droneData.trajectoryPoints[pointIndex]
      const newPosition = new AMap.LngLat(point.position[0], point.position[1])
      
      // 更新标记位置
      droneData.marker.setPosition(newPosition)
      
      // 更新自定义信息窗口
      if (droneData.customInfoWindow) {
        droneData.customInfoWindow.setContent(createInfoWindowContent(droneId, point))
        droneData.customInfoWindow.setPosition(newPosition)
      }
      
      // 更新状态
      updateDroneStatus(droneId, point)
    }
  })
}

// 暂停动画
const pauseAnimation = () => {
  isPlaying.value = false
  if (animationTimer.value) {
    clearInterval(animationTimer.value)
    animationTimer.value = null
  }
}

// 停止动画
const stopAnimation = () => {
  pauseAnimation()
  currentPointIndex.value = 0
}

// 重置动画
const resetAnimation = () => {
  stopAnimation()
  
  // 重置所有无人机到初始位置
  const AMap = window.AMap
  Object.keys(dronesData.value).forEach(droneId => {
    const droneData = dronesData.value[droneId]
    
    if (droneData.trajectoryPoints.length > 0 && droneData.marker) {
      const firstPoint = droneData.trajectoryPoints[0]
      const position = new AMap.LngLat(firstPoint.position[0], firstPoint.position[1])
      
      // 重置标记位置
      droneData.marker.setPosition(position)
      
      // 重置自定义信息窗口
      if (droneData.customInfoWindow) {
        droneData.customInfoWindow.setContent(createInfoWindowContent(droneId, firstPoint))
        droneData.customInfoWindow.setPosition(position)
        droneData.customInfoWindow.open()
      }
      
      // 更新状态
      updateDroneStatus(droneId, firstPoint)
    }
  })
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
  stopAnimation()
  
  // 清理所有自定义信息窗口
  Object.values(dronesData.value).forEach(droneData => {
    if (droneData.customInfoWindow) {
      droneData.customInfoWindow.destroy()
    }
  })
  
  if (map.value) {
    map.value.destroy()
  }
})
</script>

<style scoped>
/* 基础样式 */
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

/* 刷新控制 */
.refresh-control {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
}

.manual-refresh-btn {
  flex: 1;
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

/* 进度条 */
.progress-section {
  margin-bottom: 20px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 8px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
  transition: width 0.1s linear;
}

.progress-info {
  text-align: center;
  font-size: 12px;
  color: #666;
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
  transition: all 0.2s;
}

.list-item.online {
  border-left: 3px solid #10b981;
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

.drone-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
  color: #666;
}

.detail-row span:last-child {
  color: #333;
  font-weight: 500;
  font-family: monospace;
}

/* 加载提示 */
.loading-overlay {
  position: absolute;
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

.loading-content {
  background: white;
  padding: 30px;
  border-radius: 12px;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 15px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-content p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

/* 自定义信息窗口样式 - 字体加大版本 */
:global(.custom-info-window) {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  padding: 16px;
  min-width: 260px;
  transform: translateY(-50%);
}

:global(.custom-info-window .drone-info-window) {
  position: relative;
}

:global(.custom-info-window .info-header) {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}

:global(.custom-info-window .drone-image) {
  width: 60px;
  height: 60px;
  object-fit: contain;
  border-radius: 4px;
  background: #f8f9fa;
  padding: 4px;
}

:global(.custom-info-window .info-title h4) {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

:global(.custom-info-window .model-text) {
  font-size: 14px;
  color: #666;
}

:global(.custom-info-window .info-content) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:global(.custom-info-window .info-item) {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

:global(.custom-info-window .info-label) {
  color: #666;
  min-width: 60px;
  font-size: 14px;
}

:global(.custom-info-window .info-value) {
  color: #333;
  font-weight: 600;
  font-family: monospace;
  font-size: 15px;
}

/* 关闭按钮样式 */
:global(.custom-info-window .info-close) {
  font-size: 24px !important;
  line-height: 1;
  color: #999;
  transition: color 0.2s;
}

:global(.custom-info-window .info-close:hover) {
  color: #333;
}
</style>