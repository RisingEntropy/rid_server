<template>
  <div class="drone-history-container">
    <!-- 左侧控制面板 -->
    <div class="control-panel">
      <h3 class="panel-title">
        <el-icon :size="20" style="vertical-align: middle; margin-right: 8px;">
          <Location />
        </el-icon>
        轨迹查询
      </h3>
      
      <!-- 序列号输入 -->
      <div class="form-group">
        <label>
          <el-icon><Search /></el-icon>
          无人机序列号
        </label>
        <el-autocomplete
          v-model="searchSN"
          :fetch-suggestions="handleSNSearch"
          :trigger-on-focus="true"
          :debounce="300"
          placeholder="请输入无人机序列号..."
          clearable
          @select="handleSNSelect"
          style="width: 100%"
        >
          <template #default="{ item }">
            <div class="suggestion-item-content">
              <div class="sn-main">
                <el-icon class="sn-icon"><Promotion /></el-icon>
                <span class="sn-text">{{ item.serialNumber }}</span>
              </div>
              <div class="sn-meta">
                <el-tag size="small" type="info">{{ item.model || '未知型号' }}</el-tag>
                <span v-if="item.last_seen_at" class="last-seen">
                  最后上线: {{ formatLastSeen(item.last_seen_at) }}
                </span>
              </div>
            </div>
          </template>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-autocomplete>
      </div>
      
      <!-- 查询条数 -->
      <div class="form-group">
        <label>
          <el-icon><DataLine /></el-icon>
          最大查询条目
        </label>
        <el-input-number
          v-model="queryLimit"
          :min="1"
          :max="10000"
          :step="100"
          style="width: 100%"
        />
      </div>
      
      <!-- 时间范围选择 -->
      <div class="form-group">
        <label>
          <el-icon><Clock /></el-icon>
          时间范围
        </label>
        <el-radio-group v-model="timeMode" style="width: 100%">
          <el-radio-button label="minutes">最近时间</el-radio-button>
          <el-radio-button label="range">时间范围</el-radio-button>
        </el-radio-group>
        
        <!-- 最近X分钟 -->
        <div v-if="timeMode === 'minutes'" style="margin-top: 12px">
          <el-input v-model.number="recentMinutes" type="number" min="1">
            <template #append>分钟</template>
          </el-input>
        </div>
        
        <!-- 时间范围 -->
        <div v-if="timeMode === 'range'" style="margin-top: 12px">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </div>
      </div>
      
      <!-- 查询按钮 -->
      <el-button
        type="primary"
        @click="queryHistory"
        :loading="loading"
        :disabled="!searchSN"
        style="width: 100%"
        size="large"
      >
        <el-icon style="margin-right: 5px"><Search /></el-icon>
        {{ loading ? '查询中...' : '查询轨迹' }}
      </el-button>
      
      <!-- 测距工具控制 -->
      <div class="form-group distance-tool-group" v-if="map">
        <label>
          <el-icon><Coordinate /></el-icon>
          测距工具
        </label>
        <el-button-group style="width: 100%">
          <el-button 
            :type="isDistanceToolActive ? 'primary' : 'default'"
            @click="toggleDistanceTool"
            style="flex: 1"
          >
            <el-icon><Coordinate /></el-icon>
            {{ isDistanceToolActive ? '关闭测距' : '开启测距' }}
          </el-button>
          <el-button 
            @click="clearDistanceMarkers"
            :disabled="!distanceMarkers.length"
            style="flex: 1"
          >
            <el-icon><Delete /></el-icon>
            清除标记
          </el-button>
        </el-button-group>
        
        <!-- 显示测距结果 -->
        <div v-if="distanceResults.length > 0" class="distance-results">
          <el-card shadow="never" style="margin-top: 12px">
            <template #header>
              <div class="stats-header">
                <el-icon><DataAnalysis /></el-icon>
                <span>测距结果</span>
              </div>
            </template>
            <div v-for="(result, index) in distanceResults" :key="index" class="distance-item">
              <span>路径 {{ index + 1 }}:</span>
              <el-tag type="success">{{ formatDistance(result.distance) }}</el-tag>
              <el-button 
                text 
                type="danger" 
                size="small"
                @click="removeDistancePath(index)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <div v-if="totalDistance > 0" class="distance-item total">
              <span><strong>总距离:</strong></span>
              <el-tag type="warning">{{ formatDistance(totalDistance) }}</el-tag>
            </div>
          </el-card>
        </div>
      </div>
      
      <!-- 数据源选择 -->
      <div v-if="historyData" class="form-group source-filter">
        <label>
          <el-icon><Filter /></el-icon>
          数据源筛选
        </label>
        <el-radio-group v-model="selectedSource" style="width: 100%">
          <el-radio label="all" border style="margin-bottom: 8px; width: 100%">
            <span>全部数据源</span>
            <el-badge :value="historyData.total_records" type="info" style="margin-left: 10px" />
          </el-radio>
          <el-radio label="WIFI" border style="margin-bottom: 8px; width: 100%">
            <span>Wi-Fi</span>
            <span class="color-indicator wifi"></span>
            <el-badge :value="getSourceCount('WIFI')" type="primary" style="margin-left: 10px" />
          </el-radio>
          <el-radio label="4G" border style="margin-bottom: 8px; width: 100%">
            <span>4G</span>
            <span class="color-indicator fourG"></span>
            <el-badge :value="getSourceCount('4G')" type="warning" style="margin-left: 10px" />
          </el-radio>
          <el-radio label="LORA" border style="margin-bottom: 8px; width: 100%">
            <span>LoRa</span>
            <span class="color-indicator lora"></span>
            <el-badge :value="getSourceCount('LORA')" type="success" style="margin-left: 10px" />
          </el-radio>
        </el-radio-group>
      </div>
      
      <!-- 查询结果统计 -->
      <div v-if="historyData" class="stats">
        <el-card shadow="never">
          <template #header>
            <div class="stats-header">
              <el-icon><DataAnalysis /></el-icon>
              <span>统计信息</span>
            </div>
          </template>
          <div class="stat-item">
            <span class="stat-label">总记录数：</span>
            <el-tag type="info">{{ historyData.total_records }}</el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">显示记录：</span>
            <el-tag :type="filteredPoints.length > 0 ? 'success' : 'warning'">
              {{ filteredPoints.length }}
            </el-tag>
          </div>
          
          <div class="stat-item">
            <span class="stat-label">Wi-Fi 丢包率：</span>
            <el-tag :type="filteredPoints.length > 0 ? 'success' : 'warning'">
              {{ get_packet_loss_rate(filteredPoints, "WIFI") }}
            </el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">4G 丢包率：</span>
            <el-tag :type="filteredPoints.length > 0 ? 'success' : 'warning'">
              {{ get_packet_loss_rate(filteredPoints, "4G") }}
            </el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">LoRa 丢包率：</span>
            <el-tag :type="filteredPoints.length > 0 ? 'success' : 'warning'">
              {{ get_packet_loss_rate(filteredPoints, "LORA") }}
            </el-tag>
          </div>
        
          <div class="stat-item">
            <span class="stat-label">有效GPS点：</span>
            <el-tag :type="validGPSPoints > 0 ? 'success' : 'danger'">
              {{ validGPSPoints }}
            </el-tag>
          </div>
          <div v-if="historyData.drone_info" class="stat-item">
            <span class="stat-label">无人机型号：</span>
            <el-tag>{{ historyData.drone_info.model || '未知' }}</el-tag>
          </div>
          <div v-if="historyData.time_range" class="stat-item">
            <span class="stat-label">查询时段：</span>
            <el-tooltip
              :content="`${formatDateTime(historyData.time_range.start)} 至 ${formatDateTime(historyData.time_range.end)}`"
              placement="top"
            >
              <el-tag type="info" style="cursor: pointer">
                {{ getTimeRangeText() }}
              </el-tag>
            </el-tooltip>
          </div>
        </el-card>
      </div>
    </div>
    
    <!-- 地图容器 -->
    <div id="map-container" class="map-container">
      <!-- 测距提示信息 -->
      <div v-if="isDistanceToolActive" class="distance-tip">
        <el-alert
          title="测距模式"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            <div>右键点击地图添加测距点，左键点击完成当前路径测量</div>
            <div>按 ESC 键退出测距模式</div>
          </template>
        </el-alert>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Search, 
  Location, 
  Clock, 
  Filter, 
  DataAnalysis,
  Promotion,
  DataLine,
  Delete,
  Coordinate
} from '@element-plus/icons-vue'

// 响应式数据
const searchSN = ref('')
const queryLimit = ref(100000000)
const timeMode = ref('minutes')
const recentMinutes = ref(600000000)
const dateRange = ref([])
const loading = ref(false)
const historyData = ref(null)
const selectedSource = ref('all')
const validGPSPoints = ref(0)

// 测距相关的响应式数据
const isDistanceToolActive = ref(false)
const distanceMarkers = ref([])
const distancePolylines = ref([])
const distanceResults = ref([])
const currentDistancePoints = ref([])
const currentDistancePolyline = ref(null)
const distanceInfoWindows = ref([])

// 地图相关
let map = null
let AMap = null  // 保存AMap类引用
let polylines = []
let markers = []
let circleMarkers = []
let contextMenu = null

// 数据源颜色配置
const SOURCE_COLORS = {
  'WIFI': '#3B82F6',
  'LORA': '#10B981',
  '4G': '#F59E0B'
}

// 计算总距离
const totalDistance = computed(() => {
  return distanceResults.value.reduce((sum, result) => sum + result.distance, 0)
})

// WGS84(谷歌地图) 转 GCJ02(高德地图) 的转换函数
const wgs84ToGcj02 = (lng, lat) => {
  // 判断是否在国内，不在国内不做偏移
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) {
    return [lng, lat]
  }
  
  const a = 6378245.0 // 长半轴
  const ee = 0.00669342162296594323 // 扁率
  
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
  
  return [mgLng, mgLat]
}

// 转换轨迹点的坐标
const convertPointCoordinates = (point) => {
  if (!point.location || point.location[0] === 0 || point.location[1] === 0) {
    return point
  }
  
  // 将WGS84坐标转换为GCJ02坐标
  const [lng, lat] = wgs84ToGcj02(point.location[0], point.location[1])
  
  return {
    ...point,
    location: [lng, lat],
    originalLocation: point.location // 保留原始坐标用于调试
  }
}

function parseCsqToRssi(csq_val) {
  const rssiVal = csq_val;
  let rssiInDbm = null;
  if (rssiVal === 99) {
    rssiInDbm = null;
  } else {
    rssiInDbm = -113 + (2 * rssiVal);
  }
  if (csq_val == 31){
    return ">= -51";
  }
  return rssiInDbm;
}

// 格式化Extra Info，用于显示
const formatExtraInfo = (extra_info, isExpanded = false) => {
  const infoStr = JSON.stringify(extra_info)
  const maxLength = 50
  
  if (!isExpanded && infoStr.length > maxLength) {
    return infoStr.substring(0, maxLength) + '...'
  }
  return infoStr
}

const get_packet_loss_rate = (points, source) => {
  let report_ids = new Array();
  for (let point in points) {
    if (points[point].source === source) {
      report_ids.push(points[point].report_id);
    }
  }
  let sorted_ids = report_ids.sort((a, b) => a - b);
  let lost_count = 0;
  let total_count = 0;
  let segment_start = null;
  let segment_end = null;
  for (let i = 1; i < report_ids.length; i++) {
    if (segment_start === null) {
      segment_start = sorted_ids[i - 1];
    }
    if (sorted_ids[i] - sorted_ids[i - 1] < 3000) { // 只计算一次session内的丢包，不同session的report_id可能相差很大
      lost_count += (sorted_ids[i] - sorted_ids[i - 1] - 1);
    }else{
      segment_end = sorted_ids[i - 1];
      total_count += (segment_end - segment_start + 1);
      segment_start = null;
      segment_end = null;
    }
  }
  if (segment_start !== null) {
    segment_end = sorted_ids[sorted_ids.length - 1];
    total_count += (segment_end - segment_start + 1);
  }
  if (total_count === 0) {
    return 'N/A';
  }
  return (lost_count / total_count * 100).toFixed(2) + '%';
}

// 计算过滤后的轨迹点
const filteredPoints = computed(() => {
  if (!historyData.value || !historyData.value.telemetry_data) {
    return []
  }
  
  let points = historyData.value.telemetry_data
  
  // 转换坐标系
  points = points.map(convertPointCoordinates)
  
  // 按时间排序（早到晚）
  points = [...points].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  
  if (selectedSource.value === 'all') {
    return points
  }
  
  return points.filter(item => item.source === selectedSource.value &&
    Math.abs(item.location[0]>5) && Math.abs(item.location[0]>5)
  )
})

// 监听数据源变化，更新轨迹
watch(filteredPoints, (newPoints) => {
  if (map && newPoints.length > 0) {
    drawTrajectory(newPoints)
  } else if (map && newPoints.length === 0) {
    clearMap()
    ElMessage.warning('当前筛选条件下无轨迹数据')
  }
})

// 初始化地图
onMounted(async () => {
  const config = useRuntimeConfig()
  
  try {
    AMap = await AMapLoader.load({
      key: config.public.amapKey || process.env.NUXT_PUBLIC_AMAP_KEY,
      version: '2.0',
      plugins: [
        'AMap.Scale', 
        'AMap.ToolBar', 
        'AMap.Marker', 
        'AMap.Polyline', 
        'AMap.CircleMarker',
        'AMap.InfoWindow',
        'AMap.Icon',
        'AMap.ContextMenu',  // 添加右键菜单插件
        'AMap.Text'          // 添加文本标记插件
      ]
    })
    
    map = new AMap.Map('map-container', {
      zoom: 11,
      center: [114.17, 22.32], // 香港中心
      viewMode: '2D'
    })
    
    // 添加控件
    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({
      position: 'RT'
    }))
    
    // 初始化右键菜单
    initContextMenu()
    
    // 添加键盘事件监听
    document.addEventListener('keydown', handleKeyDown)
    
    ElMessage.success('地图加载成功')
  } catch (error) {
    console.error('地图加载失败:', error)
    ElMessage.error('地图加载失败，请检查网络连接')
  }
  
  // 初始化时间
  const now = new Date()
  const start = new Date(now.getTime() - 60 * 60 * 1000)
  dateRange.value = [
    formatDateTimeForPicker(start),
    formatDateTimeForPicker(now)
  ]
})

// 组件卸载时清理
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  if (contextMenu) {
    contextMenu.close()
  }
})

// 初始化右键菜单
const initContextMenu = () => {
  if (!AMap || !map) return
  
  contextMenu = new AMap.ContextMenu()
  
  // 添加测距菜单项
  contextMenu.addItem("开始测距", () => {
    isDistanceToolActive.value = true
    ElMessage.info('测距模式已开启，右键点击添加测距点')
  }, 0)
  
  contextMenu.addItem("清除测距", () => {
    clearDistanceMarkers()
  }, 1)
  
  // 默认绑定到地图
  map.on('rightclick', (e) => {
    if (isDistanceToolActive.value) {
      // 测距模式下，右键添加测距点
      addDistancePoint(e.lnglat)
    } else {
      // 非测距模式下，显示右键菜单
      contextMenu.open(map, e.lnglat)
    }
  })
  
  // 左键点击事件
  map.on('click', (e) => {
    if (isDistanceToolActive.value && currentDistancePoints.value.length > 0) {
      // 完成当前路径的测量
      finishCurrentDistance()
    }
  })
}

// 切换测距工具
const toggleDistanceTool = () => {
  isDistanceToolActive.value = !isDistanceToolActive.value
  
  if (isDistanceToolActive.value) {
    ElMessage.info('测距模式已开启，右键点击添加测距点')
    // 设置鼠标样式
    map.setDefaultCursor('crosshair')
  } else {
    ElMessage.info('测距模式已关闭')
    // 恢复鼠标样式
    map.setDefaultCursor('default')
    // 如果有未完成的测距，完成它
    if (currentDistancePoints.value.length > 0) {
      finishCurrentDistance()
    }
  }
}

// 添加测距点
const addDistancePoint = (lnglat) => {
  if (!AMap || !map) return
  
  const position = [lnglat.lng, lnglat.lat]
  
  // 创建标记点
  const marker = new AMap.Marker({
    position: position,
    icon: new AMap.Icon({
      size: new AMap.Size(25, 25),
      image: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF6B6B">
          <circle cx="12" cy="12" r="8" fill="#FF6B6B" stroke="white" stroke-width="2"/>
          <text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">
            ${currentDistancePoints.value.length + 1}
          </text>
        </svg>
      `),
      imageSize: new AMap.Size(25, 25),
      anchor: 'center'
    }),
    offset: new AMap.Pixel(0, 0),
    zIndex: 100
  })
  
  map.add(marker)
  distanceMarkers.value.push(marker)
  currentDistancePoints.value.push(position)
  
  // 如果有2个或更多点，绘制连线并显示距离
  if (currentDistancePoints.value.length >= 2) {
    updateDistanceLine()
  }
  
  // 显示提示
  if (currentDistancePoints.value.length === 1) {
    ElMessage.success('已添加第一个测距点，继续右键添加下一个点')
  }
}

// 更新测距线
const updateDistanceLine = () => {
  if (!AMap || !map) return
  
  // 移除旧的线
  if (currentDistancePolyline.value) {
    map.remove(currentDistancePolyline.value)
  }
  
  // 创建新的线
  currentDistancePolyline.value = new AMap.Polyline({
    path: currentDistancePoints.value,
    strokeColor: '#FF6B6B',
    strokeWeight: 3,
    strokeOpacity: 0.8,
    strokeStyle: 'dashed',
    zIndex: 90
  })
  
  map.add(currentDistancePolyline.value)
  
  // 计算并显示当前距离
  const distance = calculatePathDistance(currentDistancePoints.value)
  
  // 在最后一个点显示距离
  const lastPoint = currentDistancePoints.value[currentDistancePoints.value.length - 1]
  const distanceText = new AMap.Text({
    text: formatDistance(distance),
    position: lastPoint,
    offset: new AMap.Pixel(10, -10),
    style: {
      'background-color': 'white',
      'border': '1px solid #FF6B6B',
      'padding': '4px 8px',
      'border-radius': '4px',
      'font-size': '12px',
      'color': '#FF6B6B',
      'font-weight': 'bold'
    },
    zIndex: 101
  })
  
  map.add(distanceText)
  distanceInfoWindows.value.push(distanceText)
}

// 完成当前测距
const finishCurrentDistance = () => {
  if (currentDistancePoints.value.length < 2) {
    ElMessage.warning('至少需要两个点才能完成测距')
    return
  }
  
  const distance = calculatePathDistance(currentDistancePoints.value)
  
  // 保存结果
  distanceResults.value.push({
    points: [...currentDistancePoints.value],
    distance: distance,
    polyline: currentDistancePolyline.value,
    markers: distanceMarkers.value.slice(-currentDistancePoints.value.length)
  })
  
  // 重置当前测距
  currentDistancePoints.value = []
  currentDistancePolyline.value = null
  
  ElMessage.success(`路径测量完成，距离: ${formatDistance(distance)}`)
}

// 计算路径距离
const calculatePathDistance = (points) => {
  if (!AMap || points.length < 2) return 0
  
  let totalDistance = 0
  for (let i = 0; i < points.length - 1; i++) {
    const lnglat1 = new AMap.LngLat(points[i][0], points[i][1])
    const lnglat2 = new AMap.LngLat(points[i + 1][0], points[i + 1][1])
    totalDistance += lnglat1.distance(lnglat2)
  }
  
  return totalDistance
}

// 格式化距离显示
const formatDistance = (distance) => {
  if (distance < 1000) {
    return `${distance.toFixed(2)} 米`
  } else {
    return `${(distance / 1000).toFixed(2)} 公里`
  }
}

// 清除所有测距标记
const clearDistanceMarkers = () => {
  if (!map) return
  
  // 清除所有标记
  distanceMarkers.value.forEach(marker => {
    map.remove(marker)
  })
  distanceMarkers.value = []
  
  // 清除所有线
  distanceResults.value.forEach(result => {
    if (result.polyline) {
      map.remove(result.polyline)
    }
  })
  
  // 清除当前正在绘制的线
  if (currentDistancePolyline.value) {
    map.remove(currentDistancePolyline.value)
    currentDistancePolyline.value = null
  }
  
  // 清除距离文本
  distanceInfoWindows.value.forEach(text => {
    map.remove(text)
  })
  distanceInfoWindows.value = []
  
  // 重置数据
  distanceResults.value = []
  currentDistancePoints.value = []
  
  ElMessage.success('已清除所有测距标记')
}

// 移除指定的测距路径
const removeDistancePath = (index) => {
  if (!map) return
  
  const result = distanceResults.value[index]
  
  // 移除标记
  result.markers.forEach(marker => {
    map.remove(marker)
    const idx = distanceMarkers.value.indexOf(marker)
    if (idx > -1) {
      distanceMarkers.value.splice(idx, 1)
    }
  })
  
  // 移除线
  if (result.polyline) {
    map.remove(result.polyline)
  }
  
  // 移除结果
  distanceResults.value.splice(index, 1)
  
  ElMessage.success('已移除测距路径')
}

// 处理键盘事件
const handleKeyDown = (e) => {
  if (e.key === 'Escape' && isDistanceToolActive.value) {
    toggleDistanceTool()
  }
}

// 处理序列号搜索
const handleSNSearch = async (queryString, cb) => {
  if (queryString.length < 2) {
    cb([])
    return
  }
  
  try {
    const { data } = await $fetch(`/api/query-drone-sns`, {
      params: { sn: queryString }
    })
    
    // 处理返回的数据，添加额外信息
    const results = (data || []).map(item => ({
      ...item,
      value: item.serialNumber, // el-autocomplete需要value字段
      model: item.model || '未知型号',
      last_seen_at: item.last_seen_at
    }))
    
    cb(results)
  } catch (error) {
    console.error('查询序列号失败:', error)
    ElMessage.error('查询序列号失败')
    cb([])
  }
}

// 选择序列号
const handleSNSelect = (item) => {
  searchSN.value = item.serialNumber
  ElMessage.success(`已选择无人机: ${item.serialNumber}`)
}

// 查询历史轨迹
const queryHistory = async () => {
  if (!searchSN.value) {
    ElMessage.warning('请输入无人机序列号')
    return
  }
  
  loading.value = true
  
  try {
    const params = {
      serial_number: searchSN.value,
      limit: queryLimit.value
    }
    
    if (timeMode.value === 'minutes') {
      if (!recentMinutes.value) {
        ElMessage.warning('请输入查询时间范围')
        loading.value = false
        return
      }
      params.minutes = recentMinutes.value
    } else {
      if (!dateRange.value || dateRange.value.length !== 2) {
        ElMessage.warning('请选择时间范围')
        loading.value = false
        return
      }
      params.start = new Date(dateRange.value[0]).toISOString()
      params.end = new Date(dateRange.value[1]).toISOString()
    }
    
    ElMessage.info('正在查询轨迹数据...')
    
    let data = await $fetch('/api/query-drones-history-by-sn', {
      method: 'GET', params
    })
    
    // remove invalid points in data.telemetry_data
    const valid_data = data;
    for (let i = valid_data.telemetry_data.length - 1; i >= 0; i--) {
      const point = valid_data.telemetry_data[i];
      if (!point.location || Math.abs(point.location[0]) < 5 || Math.abs( point.location[1]) < 5) {
        valid_data.telemetry_data.splice(i, 1);
      }
    }
    data = valid_data;
    historyData.value = valid_data
    selectedSource.value = 'all'
    
    if (data.telemetry_data && data.telemetry_data.length > 0) {
      // 转换坐标后计算有效GPS点数
      const convertedPoints = data.telemetry_data.map(convertPointCoordinates)
      const validPoints = convertedPoints.filter(p => 
        p.location && Math.abs(p.location[0])>5 && Math.abs(p.location[1])>5
      )
      
      validGPSPoints.value = validPoints.length
      
      ElMessage.success(`查询成功，共 ${data.total_records} 条记录，${validPoints.length} 个有效GPS点`)
      
      if (validPoints.length === 0) {
        ElMessage.warning('所有GPS坐标都是无效的(0,0)，无法绘制轨迹')
        clearMap()
        return
      }
      
      // 绘制轨迹（filteredPoints会自动触发转换）
      drawTrajectory(convertedPoints)
      
      // 如果数据量很大，提示用户
      if (data.total_records > 1000) {
        ElMessageBox.confirm(
          `共查询到 ${data.total_records} 条记录，数据量较大可能影响显示性能，是否继续？`,
          '提示',
          {
            confirmButtonText: '继续',
            cancelButtonText: '取消',
            type: 'warning'
          }
        ).catch(() => {
          historyData.value = null
          clearMap()
        })
      }
    } else {
      ElMessage.warning('未查询到轨迹数据')
      clearMap()
    }
  } catch (error) {
    console.error('查询失败:', error)
    ElMessage.error(`查询失败: ${error.data?.message || error.message}`)
  } finally {
    loading.value = false
  }
}

// 绘制轨迹
const drawTrajectory = (points) => {
  if (!map || !AMap) {
    console.error('地图未初始化')
    return
  }
  
  clearMap()
  
  // 过滤有效坐标点
  const validPoints = points.filter(p => 
    p.location && 
    Math.abs(p.location[0]) > 5&& 
    Math.abs(p.location[1]) > 5
  )
  
  if (validPoints.length === 0) {
    ElMessage.warning('没有有效的GPS坐标数据')
    return
  }
  
  console.log(`开始绘制轨迹，共 ${validPoints.length} 个有效点`)
  
  // 如果选择了"全部"，需要按数据源分组绘制
  if (selectedSource.value === 'all') {
    // 按数据源分组
    const groupedPoints = {}
    validPoints.forEach(point => {
      if (!groupedPoints[point.source]) {
        groupedPoints[point.source] = []
      }
      groupedPoints[point.source].push(point)
    })
    
    // 为每个数据源绘制轨迹
    Object.entries(groupedPoints).forEach(([source, sourcePoints]) => {
      console.log(`绘制 ${source} 轨迹，共 ${sourcePoints.length} 个点`)
      drawSourceTrajectory(sourcePoints, source)
    })
  } else {
    // 绘制单一数据源的轨迹
    drawSourceTrajectory(validPoints, selectedSource.value)
  }
  
  // 添加起点和终点标记
  addStartEndMarkers(validPoints)
  
  // 自适应显示
  setTimeout(() => {
    map.setFitView()
  }, 100)
}

// 绘制特定数据源的轨迹
const drawSourceTrajectory = (points, source) => {
  if (!AMap) return
  
  const color = SOURCE_COLORS[source] || '#6B7280'
  
  // 先绘制连线（放在底层）
  if (points.length > 1) {
    const path = points.map(p => [p.location[0], p.location[1]])
    const polyline = new AMap.Polyline({
      path: path,
      strokeColor: color,
      strokeWeight: 3,
      strokeOpacity: 0.7,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 5,
      showDir: true  // 显示方向
    })
    polylines.push(polyline)
    map.add(polyline)
  }
  
  // 再绘制每个点（放在上层）
  points.forEach((point, index) => {
    const circle = new AMap.CircleMarker({
      center: [point.location[0], point.location[1]],
      radius: 6,
      strokeColor: color,
      strokeWeight: 2,
      strokeOpacity: 0.8,
      fillColor: color,
      fillOpacity: 0.6,
      zIndex: 10,
      bubble: true,
      cursor: 'pointer',
      extData: {
        source: point.source,
        timestamp: point.timestamp,
        altitude: point.altitude,
        speed: point.speed,
        satellites: point.satellites,
        signal_quality: point.signal_quality,
        index: index,
        extra_info: point.extra_info || '无',
        originalLocation: point.originalLocation // 显示原始坐标用于调试
      }
    })
    
    // 添加点击事件
    circle.on('click', (e) => {
      const data = e.target.getExtData()
      console.log('轨迹点数据:', data)
      
      // 生成唯一ID用于展开/收起功能
      const infoId = `info_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const extraInfoStr = JSON.stringify(data.extra_info)
      const needToggle = extraInfoStr.length > 50
      
      // 将数据存储在全局对象中，以便展开/收起时访问
      if (!window.infoWindowData) {
        window.infoWindowData = {}
      }
      window.infoWindowData[infoId] = {
        extra_info: data.extra_info,
        extra_info_str: extraInfoStr
      }
      
      const info = `
        <div style="padding: 10px; width: 300px; max-width: 400px;">
          <h4 style="margin: 0 0 10px 0; color: #333;">轨迹点 #${data.index + 1}</h4>
          <div style="line-height: 1.8;">
            <div><b>数据源:</b> <span style="color: ${color}">${data.source}</span></div>
            <div><b>时间:</b> ${new Date(data.timestamp).toLocaleString('zh-CN')}</div>
            <div><b>高度:</b> ${data.altitude} m</div>
            <div><b>速度:</b> ${(data.speed / 3.6).toPrecision(3)} m/s</div>
            <div><b>卫星数:</b> ${data.satellites}</div>
            <div style="margin-top: 5px;">
              <b>Extra Info:</b> 
              ${needToggle ? `
                <span class="toggle-trigger" onclick="window.toggleExtraInfo('${infoId}')" style="cursor: pointer; color: #409eff; margin-left: 5px;">
                  <span id="${infoId}_arrow" style="display: inline-block; transition: transform 0.3s;">▶</span>
                  <span id="${infoId}_text" style="text-decoration: underline;">展开</span>
                </span>
              ` : ''}
            </div>
            <div id="${infoId}" style="word-break: break-all; padding: 5px; background: #f5f5f5; border-radius: 4px; margin-top: 5px; ${needToggle ? 'max-height: 50px; overflow: hidden;' : ''}">
              ${needToggle ? formatExtraInfo(data.extra_info, false) : extraInfoStr}
            </div>
            <div><b>信号质量:</b> ${String(data.source).toUpperCase() === "4G"? parseCsqToRssi(data.signal_quality): data.signal_quality} dBm</div>
            ${data.originalLocation ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
              <div><b>原始坐标(WGS84):</b></div>
              <div>经度: ${data.originalLocation[0].toFixed(6)}</div>
              <div>纬度: ${data.originalLocation[1].toFixed(6)}</div>
            </div>` : ''}
          </div>
        </div>
      `
      
      // 添加或更新全局函数用于展开/收起
      window.toggleExtraInfo = function(id) {
        const element = document.getElementById(id)
        const arrow = document.getElementById(id + '_arrow')
        const text = document.getElementById(id + '_text')
        const data = window.infoWindowData[id]
        
        if (!element || !arrow || !text || !data) {
          console.error('无法找到元素或数据:', id)
          return
        }
        
        if (element.style.maxHeight === '50px' || element.style.maxHeight === '') {
          // 展开
          element.style.maxHeight = 'none'
          element.style.overflow = 'visible'
          element.textContent = data.extra_info_str
          arrow.style.transform = 'rotate(90deg)'
          text.textContent = '收起'
        } else {
          // 收起
          element.style.maxHeight = '50px'
          element.style.overflow = 'hidden'
          element.textContent = formatExtraInfo(data.extra_info, false)
          arrow.style.transform = 'rotate(0deg)'
          text.textContent = '展开'
        }
      }
      
      const infoWindow = new AMap.InfoWindow({
        content: info,
        offset: new AMap.Pixel(0, -20)
      })
      
      // 监听信息窗口关闭事件，清理存储的数据
      infoWindow.on('close', () => {
        if (window.infoWindowData && window.infoWindowData[infoId]) {
          delete window.infoWindowData[infoId]
        }
      })
      
      infoWindow.open(map, e.target.getCenter())
    })
    
    circleMarkers.push(circle)
  })
  
  // 批量添加圆点
  if (circleMarkers.length > 0) {
    map.add(circleMarkers)
  }
}

// 添加起点和终点标记（使用自定义HTML标记）
const addStartEndMarkers = (validPoints) => {
  return;// 暂时禁用起终点标记
  if (!AMap || validPoints.length === 0) return
  
  // 起点标记 - 使用自定义内容
  const startPoint = validPoints[0]
  const startContent = `
    <div class="custom-marker start-marker">
      <div class="marker-content">
        <span>起</span>
      </div>
      <div class="marker-tail"></div>
    </div>
  `
  
  const startMarker = new AMap.Marker({
    position: [startPoint.location[0], startPoint.location[1]],
    content: startContent,
    offset: new AMap.Pixel(-20, -40),
    zIndex: 20
  })
  markers.push(startMarker)
  
  // 终点标记
  if (validPoints.length > 1) {
    const endPoint = validPoints[validPoints.length - 1]
    const endContent = `
      <div class="custom-marker end-marker">
        <div class="marker-content">
          <span>终</span>
        </div>
        <div class="marker-tail"></div>
      </div>
    `
    
    const endMarker = new AMap.Marker({
      position: [endPoint.location[0], endPoint.location[1]],
      content: endContent,
      offset: new AMap.Pixel(-20, -40),
      zIndex: 20
    })
    markers.push(endMarker)
  }
  
  map.add(markers)
}

// 清除地图
const clearMap = () => {
  if (!map) return
  
  if (polylines.length > 0) {
    map.remove(polylines)
    polylines = []
  }
  
  if (circleMarkers.length > 0) {
    map.remove(circleMarkers)
    circleMarkers = []
  }
  
  if (markers.length > 0) {
    map.remove(markers)
    markers = []
  }
}

// 获取数据源计数
const getSourceCount = (source) => {
  if (!historyData.value || !historyData.value.telemetry_data) return 0
  return historyData.value.telemetry_data.filter(item => item.source === source).length
}

// 获取时间范围文本
const getTimeRangeText = () => {
  if (!historyData.value || !historyData.value.time_range) return ''
  
  const start = new Date(historyData.value.time_range.start)
  const end = new Date(historyData.value.time_range.end)
  const diff = end - start
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
}

// 格式化最后上线时间
const formatLastSeen = (timestamp) => {
  if (!timestamp) return '未知'
  
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  
  return date.toLocaleDateString('zh-CN')
}

// 格式化日期时间
const formatDateTime = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 格式化日期时间为picker格式
const formatDateTimeForPicker = (date) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
</script>

<!-- 样式部分 -->
<style>
/* 自定义起终点标记样式 - 放在全局样式中 */
.custom-marker {
  position: relative;
  width: 40px;
  height: 40px;
}

.marker-content {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  color: white;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 2;
}

.start-marker .marker-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: 3px solid white;
}

.end-marker .marker-content {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border: 3px solid white;
}

.marker-tail {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid white;
  z-index: 1;
}

.start-marker .marker-tail::before {
  content: '';
  position: absolute;
  bottom: 3px;
  left: -6px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #764ba2;
}

.end-marker .marker-tail::before {
  content: '';
  position: absolute;
  bottom: 3px;
  left: -6px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #f5576c;
}

/* 信息窗口内的展开/收起触发器样式 */
.toggle-trigger:hover {
  opacity: 0.8;
}
</style>

<style scoped>
.drone-history-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  position: relative;
  background: #f5f7fa;
}

/* 控制面板样式 */
.control-panel {
  width: 380px;
  background: white;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
  padding: 24px;
  overflow-y: auto;
  z-index: 10;
}

.panel-title {
  margin: 0 0 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

/* 测距工具组 */
.distance-tool-group {
  padding-top: 24px;
  border-top: 1px solid #ebeef5;
}

/* 测距相关样式 */
.distance-tip {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  max-width: 400px;
}

.distance-results {
  margin-top: 12px;
}

.distance-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.distance-item.total {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e4e7ed;
  background: transparent;
}

.distance-item span {
  font-size: 14px;
  color: #606266;
}

/* 自动补全样式 */
.suggestion-item-content {
  padding: 8px 0;
}

.sn-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.sn-icon {
  color: #409eff;
}

.sn-text {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.sn-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 24px;
}

.last-seen {
  font-size: 12px;
  color: #909399;
}

/* 数据源选择 */
.source-filter {
  padding-top: 24px;
  border-top: 1px solid #ebeef5;
}

/* 颜色指示器 */
.color-indicator {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-left: 8px;
  vertical-align: middle;
}

.color-indicator.wifi {
  background-color: #3B82F6;
}

.color-indicator.lora {
  background-color: #10B981;
}

.color-indicator.fourG {
  background-color: #F59E0B;
}

/* 统计信息 */
.stats {
  margin-top: 24px;
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #303133;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stat-item:last-child {
  margin-bottom: 0;
}

.stat-label {
  font-size: 14px;
  color: #606266;
}

/* 地图容器 */
.map-container {
  flex: 1;
  height: 100%;
  position: relative;
}

/* 测距模式下的鼠标样式 */
.map-container.measuring {
  cursor: crosshair !important;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-autocomplete) {
  width: 100%;
}

:deep(.el-radio.is-bordered) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

:deep(.el-badge__content) {
  transform: translateY(-50%) translateX(50%) scale(0.9);
}

:deep(.el-card) {
  border: none;
  background: #f8f9fa;
}

:deep(.el-card__header) {
  padding: 12px 16px;
  background: white;
}

:deep(.el-card__body) {
  padding: 16px;
}
</style>