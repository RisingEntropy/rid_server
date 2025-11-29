<template>
  <div class="lora-visualization">
    <!-- 左侧控制面板 -->
    <div class="control-panel">
      <div class="panel-header">
        <h2>LoRa 低空通信速率可视化</h2>
        <div class="connection-status" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          {{ isConnected ? '已连接' : '未连接' }}
        </div>
      </div>
      
      <!-- CSV 文件上传 -->
      <div class="upload-section">
        <label class="upload-label">
          <Icon name="mdi:upload" class="icon" />
          上传飞行数据 (CSV)
        </label>
        <div class="upload-area" @drop="handleDrop" @dragover.prevent @dragenter.prevent>
          <input 
            ref="fileInput"
            type="file" 
            accept=".csv" 
            @change="handleFileUpload"
            style="display: none;"
          >
          <button class="upload-btn" @click="$refs.fileInput.click()">
            选择文件
          </button>
          <span v-if="uploadedFileName" class="file-name">
            已上传: {{ uploadedFileName }}
          </span>
          <span v-else class="upload-hint">
            或拖拽文件到此处
          </span>
        </div>
      </div>
      
      <!-- Gateway 选择（单选） -->
      <div class="gateway-section" v-if="availableGateways.length > 0">
        <h3>Gateway 选择</h3>
        <div class="gateway-radios">
          <label v-for="gateway in availableGateways" :key="gateway" class="radio-label">
            <input 
              type="radio" 
              :value="gateway"
              v-model="selectedGateway"
              @change="updateVisualization"
            >
            <span>{{ gateway }}</span>
            <span class="gateway-location" v-if="GATEWAY_LOCATIONS[gateway]">
              ({{ GATEWAY_LOCATIONS[gateway].name }})
            </span>
          </label>
        </div>
      </div>
      
      <!-- 测距工具 -->
      <div class="measure-section">
        <h3>测距工具</h3>
        <div class="measure-controls">
          <button 
            class="measure-btn" 
            :class="{ active: isMeasureMode }"
            @click="toggleMeasureMode"
          >
            <span class="measure-icon">📏</span>
            {{ isMeasureMode ? '关闭测距' : '开启测距' }}
          </button>
          <button 
            v-if="measurePoints.length > 0"
            class="clear-measure-btn"
            @click="clearMeasurement"
          >
            清除测量
          </button>
        </div>
        <div v-if="isMeasureMode" class="measure-hint">
          {{ measureHint }}
        </div>
        <div v-if="measureDistance !== null" class="measure-result">
          <div class="distance-display">
            <span class="distance-label">测量距离:</span>
            <span class="distance-value">{{ formatDistance(measureDistance) }}</span>
          </div>
          <div class="measure-points-info">
            <div v-if="measurePoints[0]">
              点1: {{ measurePoints[0].lat.toFixed(6) }}, {{ measurePoints[0].lng.toFixed(6) }}
            </div>
            <div v-if="measurePoints[1]">
              点2: {{ measurePoints[1].lat.toFixed(6) }}, {{ measurePoints[1].lng.toFixed(6) }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- 时间范围显示 -->
      <div class="time-range" v-if="flightData.length > 0">
        <h3>数据时间范围</h3>
        <div class="time-info">
          <div>开始: {{ formatTime(timeRange.start) }}</div>
          <div>结束: {{ formatTime(timeRange.end) }}</div>
          <div>时长: {{ duration }}</div>
        </div>
      </div>
      
      <!-- 统计信息 -->
      <div class="stats-section" v-if="matchedData.length > 0">
        <h3>数据统计</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">飞行数据点</span>
            <span class="stat-value">{{ flightData.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">LoRa数据点</span>
            <span class="stat-value">{{ loraData.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">匹配率</span>
            <span class="stat-value">{{ matchRate }}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">平均速率</span>
            <span class="stat-value">{{ averageDataRate.toFixed(2) }} bps</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">最大速率</span>
            <span class="stat-value">{{ maxDataRate.toFixed(2) }} bps</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">平均RSSI</span>
            <span class="stat-value">{{ avgRSSI.toFixed(1) }} dBm</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">平均噪声</span>
            <span class="stat-value">{{ avgNoiseFloor.toFixed(1) }} dBm</span>
          </div>
        </div>
      </div>
      
      <!-- 图表容器 -->
      <div class="charts-container">
        <div class="chart-wrapper" @mousemove="handleChartMouseMove" @mouseleave="handleChartMouseLeave">
          <h3>高度变化</h3>
          <canvas ref="altitudeChart"></canvas>
        </div>
        <div class="chart-wrapper" @mousemove="handleChartMouseMove" @mouseleave="handleChartMouseLeave">
          <h3>数据速率变化</h3>
          <canvas ref="dataRateChart"></canvas>
        </div>
        <div class="chart-wrapper" @mousemove="handleChartMouseMove" @mouseleave="handleChartMouseLeave">
          <h3>RSSI 变化</h3>
          <canvas ref="rssiChart"></canvas>
        </div>
        <div class="chart-wrapper" @mousemove="handleChartMouseMove" @mouseleave="handleChartMouseLeave">
          <h3>SNR 变化</h3>
          <canvas ref="snrChart"></canvas>
        </div>
        <div class="chart-wrapper" @mousemove="handleChartMouseMove" @mouseleave="handleChartMouseLeave">
          <h3>基底噪声变化 (RSSI - SNR)</h3>
          <canvas ref="noiseFloorChart"></canvas>
        </div>
      </div>
      
      <!-- 操作按钮 -->
      <div class="action-buttons">
        <button @click="exportData" class="btn-secondary" v-if="matchedData.length > 0">
          导出数据
        </button>
        <button @click="refreshData" class="btn-primary" v-if="flightData.length > 0">
          刷新数据
        </button>
      </div>
    </div>
    
    <!-- 全屏地图容器 -->
    <div class="map-container">
      <div id="google-map" ref="mapContainer"></div>
      
      <!-- 测距模式提示 -->
      <div v-if="isMeasureMode" class="measure-mode-indicator">
        <span class="measure-icon-large">📏</span>
        测距模式已开启
      </div>
      
      <!-- 图例 -->
      <div class="map-legend">
        <h4>图例</h4>
        <div class="legend-item">
          <span class="legend-color" style="background: #4CAF50;"></span>
          <span>高速率 (>10 kbps)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #FFC107;"></span>
          <span>中速率 (5k-10k bps)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #FF9800;"></span>
          <span>低速率 (1k-5k bps)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #F44336;"></span>
          <span>极低速率 (<1k bps)</span>
        </div>
      </div>
    </div>
    
    <!-- 加载提示 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>{{ loadingMessage }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted, nextTick, watch } from 'vue';
import Chart from 'chart.js/auto';
import Papa from 'papaparse';

// Google Maps API配置
const GOOGLE_MAPS_API_KEY = 'AIzaSyCudLGqF6tvqJB2UOZdbrqq0wXjKbp2iBA';

// 香港两个网关位置
const GATEWAY_LOCATIONS = {
  'gateway_1': { 
    lat: 30.258674, 
    lng: 119.971393, 
    name: '新湖果岭' 
  },
  'gateway_2': { 
    lat: 30.308888, 
    lng: 119.931111, 
    name: '永建' 
  }
};

// 响应式数据
const mapContainer = ref(null);
const altitudeChart = ref(null);
const dataRateChart = ref(null);
const rssiChart = ref(null);
const snrChart = ref(null);
const noiseFloorChart = ref(null);
const fileInput = ref(null);

const availableGateways = ref([]);
const selectedGateway = ref('');
const flightData = ref([]);
const loraData = ref([]);
const matchedData = ref([]);
const isLoading = ref(false);
const loadingMessage = ref('');
const isConnected = ref(false);
const uploadedFileName = ref('');
const hoveredIndex = ref(null);
const chartClickIndex = ref(null);

// 测距相关状态
const isMeasureMode = ref(false);
const measurePoints = ref([]);
const measureDistance = ref(null);

// 地图相关变量
let map = null;
let altitudeChartInstance = null;
let dataRateChartInstance = null;
let rssiChartInstance = null;
let snrChartInstance = null;
let noiseFloorChartInstance = null;
let gatewayMarkers = [];
let googleMaps = null;
let infoWindow = null;
let canvasOverlay = null;
let highlightedPointIndex = null;

// 测距相关变量
let measureMarkers = [];
let measureLine = null;
let measureInfoWindow = null;
let mapClickListener = null;

// 计算测距提示
const measureHint = computed(() => {
  if (measurePoints.value.length === 0) {
    return '点击地图选择第一个点';
  } else if (measurePoints.value.length === 1) {
    return '点击地图选择第二个点';
  } else {
    return '测量完成，点击"清除测量"可重新测量';
  }
});

// 格式化距离显示
const formatDistance = (meters) => {
  if (meters === null) return '';
  if (meters < 1000) {
    return `${meters.toFixed(2)} 米`;
  } else {
    return `${(meters / 1000).toFixed(3)} 公里`;
  }
};

// 计算两点之间的距离（Haversine公式）
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 切换测距模式
const toggleMeasureMode = () => {
  isMeasureMode.value = !isMeasureMode.value;
  
  if (isMeasureMode.value) {
    // 开启测距模式
    enableMeasureMode();
  } else {
    // 关闭测距模式
    disableMeasureMode();
  }
};

// 开启测距模式
const enableMeasureMode = () => {
  if (!map || !googleMaps) return;
  
  // 更改鼠标样式
  map.setOptions({ draggableCursor: 'crosshair' });
  
  // 添加地图点击监听器
  mapClickListener = map.addListener('click', handleMapClickForMeasure);
};

// 关闭测距模式
const disableMeasureMode = () => {
  if (!map) return;
  
  // 恢复鼠标样式
  map.setOptions({ draggableCursor: null });
  
  // 移除地图点击监听器
  if (mapClickListener) {
    googleMaps.event.removeListener(mapClickListener);
    mapClickListener = null;
  }
};

// 处理测距模式下的地图点击
const handleMapClickForMeasure = (event) => {
  if (!isMeasureMode.value) return;
  
  const clickedLatLng = {
    lat: event.latLng.lat(),
    lng: event.latLng.lng()
  };
  
  if (measurePoints.value.length < 2) {
    // 添加测量点
    measurePoints.value.push(clickedLatLng);
    addMeasureMarker(clickedLatLng, measurePoints.value.length);
    
    if (measurePoints.value.length === 2) {
      // 计算距离
      const p1 = measurePoints.value[0];
      const p2 = measurePoints.value[1];
      measureDistance.value = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      
      // 绘制连接线
      drawMeasureLine();
      
      // 显示距离信息窗口
      showMeasureInfoWindow();
    }
  }
};

// 添加测量点标记
const addMeasureMarker = (position, pointNumber) => {
  if (!googleMaps || !map) return;
  
  const marker = new googleMaps.Marker({
    position: position,
    map: map,
    icon: {
      path: googleMaps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: pointNumber === 1 ? '#E91E63' : '#9C27B0',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3
    },
    label: {
      text: pointNumber.toString(),
      color: '#ffffff',
      fontSize: '12px',
      fontWeight: 'bold'
    },
    zIndex: 3000,
    title: `测量点 ${pointNumber}`
  });
  
  measureMarkers.push(marker);
};

// 绘制测量线
const drawMeasureLine = () => {
  if (!googleMaps || !map || measurePoints.value.length < 2) return;
  
  // 移除旧线
  if (measureLine) {
    measureLine.setMap(null);
  }
  
  measureLine = new googleMaps.Polyline({
    path: measurePoints.value,
    geodesic: true,
    strokeColor: '#E91E63',
    strokeOpacity: 0.8,
    strokeWeight: 3,
    map: map,
    zIndex: 2500
  });
};

// 显示测量信息窗口
const showMeasureInfoWindow = () => {
  if (!googleMaps || !map || measurePoints.value.length < 2) return;
  
  // 计算中点位置
  const midLat = (measurePoints.value[0].lat + measurePoints.value[1].lat) / 2;
  const midLng = (measurePoints.value[0].lng + measurePoints.value[1].lng) / 2;
  
  const content = `
    <div style="padding: 10px; min-width: 150px;">
      <h4 style="margin: 0 0 8px 0; color: #E91E63;">📏 测量结果</h4>
      <div style="font-size: 18px; font-weight: bold; color: #333;">
        ${formatDistance(measureDistance.value)}
      </div>
      <div style="font-size: 12px; color: #666; margin-top: 8px;">
        点击"清除测量"可重新测量
      </div>
    </div>
  `;
  
  if (!measureInfoWindow) {
    measureInfoWindow = new googleMaps.InfoWindow();
  }
  
  measureInfoWindow.setContent(content);
  measureInfoWindow.setPosition({ lat: midLat, lng: midLng });
  measureInfoWindow.open(map);
};

// 清除测量
const clearMeasurement = () => {
  // 清除标记
  measureMarkers.forEach(marker => marker.setMap(null));
  measureMarkers = [];
  
  // 清除线
  if (measureLine) {
    measureLine.setMap(null);
    measureLine = null;
  }
  
  // 关闭信息窗口
  if (measureInfoWindow) {
    measureInfoWindow.close();
  }
  
  // 重置状态
  measurePoints.value = [];
  measureDistance.value = null;
};

// 修复的 CanvasOverlay 类
function createCanvasOverlay(googleMapsAPI) {
  class CanvasOverlay extends googleMapsAPI.OverlayView {
    constructor(map) {
      super();
      this.map = map;
      this.data = [];
      this.highlightedIndex = null;
      this.setMap(map);
    }

    onAdd() {
      this.div = document.createElement('div');
      this.div.style.borderStyle = 'none';
      this.div.style.borderWidth = '0px';
      this.div.style.position = 'absolute';
      this.div.style.pointerEvents = 'none';
      
      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'auto';
      this.canvas.style.cursor = 'default';
      this.div.appendChild(this.canvas);
      
      this.ctx = this.canvas.getContext('2d');
      
      const panes = this.getPanes();
      panes.overlayMouseTarget.appendChild(this.div);
      
      this.bindEvents();
    }

    bindEvents() {
      this.canvas.addEventListener('click', (e) => this.handleClick(e));
      this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      this.canvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
    }

    draw() {
      if (!this.data || this.data.length === 0) return;
      
      const overlayProjection = this.getProjection();
      if (!overlayProjection) return;
      
      const bounds = this.map.getBounds();
      if (!bounds) return;
      
      const sw = overlayProjection.fromLatLngToDivPixel(bounds.getSouthWest());
      const ne = overlayProjection.fromLatLngToDivPixel(bounds.getNorthEast());
      
      if (!sw || !ne) return;
      
      this.div.style.left = sw.x + 'px';
      this.div.style.top = ne.y + 'px';
      this.div.style.width = (ne.x - sw.x) + 'px';
      this.div.style.height = (sw.y - ne.y) + 'px';
      
      this.canvas.width = ne.x - sw.x;
      this.canvas.height = sw.y - ne.y;
      
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // 绘制航线
      if (this.data.length > 1) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)';
        this.ctx.lineWidth = 2;
        
        for (let i = 0; i < this.data.length; i++) {
          const point = this.data[i];
          const latLng = new googleMapsAPI.LatLng(
            point.flightPoint.latitude,
            point.flightPoint.longitude
          );
          const pixel = overlayProjection.fromLatLngToDivPixel(latLng);
          if (!pixel) continue;
          
          const x = pixel.x - sw.x;
          const y = pixel.y - ne.y;
          
          if (i === 0) {
            this.ctx.moveTo(x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
        this.ctx.stroke();
      }
      
      // 绘制数据点
      for (let i = 0; i < this.data.length; i++) {
        const point = this.data[i];
        const latLng = new googleMapsAPI.LatLng(
          point.flightPoint.latitude,
          point.flightPoint.longitude
        );
        const pixel = overlayProjection.fromLatLngToDivPixel(latLng);
        if (!pixel) continue;
        
        const x = pixel.x - sw.x;
        const y = pixel.y - ne.y;
        
        const color = point.dataRate > 10000 ? '#4CAF50' :
                     point.dataRate > 5000 ? '#FFC107' :
                     point.dataRate > 1000 ? '#FF9800' :
                     '#F44336';
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.highlightedIndex === i ? 10 : 6, 0, 2 * Math.PI);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        
        if (this.highlightedIndex === i) {
          this.ctx.beginPath();
          this.ctx.arc(x, y, 15, 0, 2 * Math.PI);
          this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
        }
      }
    }

    handleClick(e) {
      // 如果处于测距模式，不处理数据点点击
      if (isMeasureMode.value) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const overlayProjection = this.getProjection();
      if (!overlayProjection) return;
      
      const bounds = this.map.getBounds();
      const sw = overlayProjection.fromLatLngToDivPixel(bounds.getSouthWest());
      const ne = overlayProjection.fromLatLngToDivPixel(bounds.getNorthEast());
      
      if (!sw || !ne) return;
      
      for (let i = 0; i < this.data.length; i++) {
        const point = this.data[i];
        const latLng = new googleMapsAPI.LatLng(
          point.flightPoint.latitude,
          point.flightPoint.longitude
        );
        const pixel = overlayProjection.fromLatLngToDivPixel(latLng);
        if (!pixel) continue;
        
        const px = pixel.x - sw.x;
        const py = pixel.y - ne.y;
        
        const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
        if (distance <= 10) {
          this.showInfoWindow(point, i, latLng);
          e.stopPropagation();
          break;
        }
      }
    }

    handleMouseMove(e) {
      // 如果处于测距模式，不改变鼠标样式
      if (isMeasureMode.value) {
        this.canvas.style.cursor = 'crosshair';
        return;
      }
      
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const overlayProjection = this.getProjection();
      if (!overlayProjection) return;
      
      const bounds = this.map.getBounds();
      const sw = overlayProjection.fromLatLngToDivPixel(bounds.getSouthWest());
      const ne = overlayProjection.fromLatLngToDivPixel(bounds.getNorthEast());
      
      if (!sw || !ne) return;
      
      let foundPoint = false;
      
      for (let i = 0; i < this.data.length; i++) {
        const point = this.data[i];
        const latLng = new googleMapsAPI.LatLng(
          point.flightPoint.latitude,
          point.flightPoint.longitude
        );
        const pixel = overlayProjection.fromLatLngToDivPixel(latLng);
        if (!pixel) continue;
        
        const px = pixel.x - sw.x;
        const py = pixel.y - ne.y;
        
        const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
        if (distance <= 10) {
          this.canvas.style.cursor = 'pointer';
          foundPoint = true;
          break;
        }
      }
      
      if (!foundPoint) {
        this.canvas.style.cursor = 'default';
      }
    }

    handleMouseLeave(e) {
      if (!isMeasureMode.value) {
        this.canvas.style.cursor = 'default';
      }
    }

    showInfoWindow(data, index, position) {
      const noiseFloor = data.avgRssi !== null && data.avgSnr !== null 
        ? (data.avgRssi - data.avgSnr).toFixed(1) 
        : 'N/A';
      
      const content = `
        <div style="padding: 10px; min-width: 250px;">
          <h4 style="margin: 0 0 10px 0;">数据点 #${index + 1}</h4>
          <div style="font-size: 13px; line-height: 1.6;">
            <div><strong>时间:</strong> ${new Date(data.flightPoint.parsedTime).toLocaleString()}</div>
            <div><strong>位置:</strong> ${data.flightPoint.latitude.toFixed(6)}, ${data.flightPoint.longitude.toFixed(6)}</div>
            <div><strong>高度:</strong> ${(data.flightPoint['altitude(feet)'] * 0.3048).toFixed(1)} m</div>
            <div><strong>速度:</strong> ${(data.flightPoint['speed(mph)'] * 0.44704).toFixed(1)} m/s</div>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #e0e0e0;">
            <div><strong>数据速率:</strong> ${data.dataRate.toFixed(2)} bps</div>
            <div><strong>数据包数:</strong> ${data.packetCount}</div>
            ${data.avgRssi !== null ? `<div><strong>平均RSSI:</strong> ${data.avgRssi.toFixed(1)} dBm</div>` : ''}
            ${data.avgSnr !== null ? `<div><strong>平均SNR:</strong> ${data.avgSnr.toFixed(1)} dB</div>` : ''}
            <div><strong>基底噪声:</strong> ${noiseFloor} dBm</div>
          </div>
        </div>
      `;
      
      if (infoWindow) {
        infoWindow.setContent(content);
        infoWindow.setPosition(position);
        infoWindow.open(this.map);
      }
    }

    setData(data) {
      this.data = data;
      this.draw();
    }

    setHighlightedIndex(index) {
      this.highlightedIndex = index;
      this.draw();
    }

    onRemove() {
      if (this.canvas) {
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
      }
      if (this.div && this.div.parentNode) {
        this.div.parentNode.removeChild(this.div);
      }
    }
  }
  
  return CanvasOverlay;
}

// 创建跨图表同步的插件
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw: (chart) => {
    if (hoveredIndex.value !== null) {
      const ctx = chart.ctx;
      const x = chart.scales.x;
      const y = chart.scales.y;
      
      const dataIndex = hoveredIndex.value;
      if (dataIndex >= 0 && dataIndex < chart.data.labels.length) {
        const xPixel = x.getPixelForValue(dataIndex);
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xPixel, y.top);
        ctx.lineTo(xPixel, y.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.stroke();
        ctx.restore();
      }
    }
  }
};

// 单位转换函数
const feetToMeters = (feet) => feet * 0.3048;
const mphToMs = (mph) => mph * 0.44704;

// 解析CSV时间戳
const parseCSVTimestamp = (row) => {
  if (row['datetime(utc)']) {
    const dateStr = row['datetime(utc)'];
    const date = new Date(dateStr);
    
    if (!isNaN(date.getTime())) {
      const firstColumnKey = Object.keys(row)[0];
      const firstColumnValue = row[firstColumnKey] % 1000;
      
      if (!isNaN(firstColumnValue) && Number(firstColumnValue) < 1000 && firstColumnKey !== 'datetime(utc)') {
        date.setMilliseconds(Number(firstColumnValue));
      }
      else if (firstColumnKey !== 'datetime(utc)' && typeof firstColumnValue === 'string' && firstColumnValue.includes('.')) {
        const msMatch = firstColumnValue.match(/\.(\d{1,3})/);
        if (msMatch) {
          date.setMilliseconds(parseInt(msMatch[1]));
        }
      }
      return new Date(date.getTime() + 8 * 60 * 60 * 1000);
    }
  }
  
  const firstColumnKey = Object.keys(row)[0];
  const firstColumnValue = row[firstColumnKey] % 1000;
  
  if (!firstColumnValue) return null;
  
  if (!isNaN(firstColumnValue) && Number(firstColumnValue) > 1000000000) {
    return new Date(Number(firstColumnValue));
  }
  
  if (typeof firstColumnValue === 'string') {
    const parsedDate = new Date(firstColumnValue);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }
  
  if (row.date && row.time) {
    const dateTimeStr = `${row.date} ${row.time}`;
    const parsedDate = new Date(dateTimeStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }
  
  return null;
};

// 计算属性
const timeRange = computed(() => {
  if (flightData.value.length === 0) return { start: null, end: null };
  
  const validData = flightData.value.filter(d => d.parsedTime);
  if (validData.length === 0) return { start: null, end: null };
  
  return {
    start: validData[0].parsedTime,
    end: validData[validData.length - 1].parsedTime
  };
});

const duration = computed(() => {
  if (!timeRange.value.start || !timeRange.value.end) return '0分钟';
  const start = new Date(timeRange.value.start);
  const end = new Date(timeRange.value.end);
  const diff = end - start;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const milliseconds = diff % 1000;
  return `${minutes}分${seconds}.${milliseconds.toString().padStart(3, '0')}秒`;
});

const matchRate = computed(() => {
  if (flightData.value.length === 0) return 0;
  const matchedPoints = matchedData.value.filter(d => d.loraData ? d.loraData.length > 0 : false).length;
  return ((matchedPoints / flightData.value.length) * 100).toFixed(1);
});

const averageDataRate = computed(() => {
  if (matchedData.value.length === 0) return 0;
  const sum = matchedData.value.reduce((acc, d) => acc + (d.dataRate || 0), 0);
  return sum / matchedData.value.length;
});

const maxDataRate = computed(() => {
  if (matchedData.value.length === 0) return 0;
  return Math.max(...matchedData.value.map(d => d.dataRate || 0));
});

const avgRSSI = computed(() => {
  const validData = matchedData.value.filter(d => d.avgRssi !== null);
  if (validData.length === 0) return 0;
  return validData.reduce((sum, d) => sum + d.avgRssi, 0) / validData.length;
});

const avgNoiseFloor = computed(() => {
  const validData = matchedData.value.filter(d => d.avgRssi !== null && d.avgSnr !== null);
  if (validData.length === 0) return 0;
  const sum = validData.reduce((acc, d) => acc + (d.avgRssi - d.avgSnr), 0);
  return sum / validData.length;
});

// 初始化Google地图
const initMap = async () => {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initGoogleMap&v=weekly`;
  script.async = true;
  script.defer = true;
  
  window.initGoogleMap = async () => {
    googleMaps = google.maps;
    
    map = new googleMaps.Map(mapContainer.value, {
      center: { lat: 22.3193, lng: 114.1694 },
      zoom: 11,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      scaleControl: true
    });
    
    infoWindow = new googleMaps.InfoWindow();
    
    addGatewayMarkers();
    
    const CanvasOverlayClass = createCanvasOverlay(googleMaps);
    canvasOverlay = new CanvasOverlayClass(map);
    
    map.addListener('bounds_changed', () => {
      if (canvasOverlay) {
        requestAnimationFrame(() => {
          canvasOverlay.draw();
        });
      }
    });
    
    map.addListener('zoom_changed', () => {
      if (canvasOverlay) {
        requestAnimationFrame(() => {
          canvasOverlay.draw();
        });
      }
    });
  };
  
  document.head.appendChild(script);
};

// 添加网关标记到地图
const addGatewayMarkers = () => {
  if (!googleMaps || !map) return;
  
  gatewayMarkers.forEach(marker => marker.setMap(null));
  gatewayMarkers = [];
  
  Object.entries(GATEWAY_LOCATIONS).forEach(([id, location]) => {
    const isSelected = selectedGateway.value === id;
    const marker = new googleMaps.Marker({
      position: location,
      map: map,
      title: `${id} - ${location.name}`,
      icon: {
        path: googleMaps.SymbolPath.CIRCLE,
        scale: isSelected ? 12 : 10,
        fillColor: isSelected ? '#2196F3' : '#FF5252',
        fillOpacity: isSelected ? 1 : 0.7,
        strokeColor: '#ffffff',
        strokeWeight: 2
      },
      zIndex: 2000
    });
    
    gatewayMarkers.push(marker);
  });
};

// 初始化图表
const initCharts = () => {
  // 高度图表
  const altitudeCtx = altitudeChart.value.getContext('2d');
  altitudeChartInstance = new Chart(altitudeCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '高度 (m)',
        data: [],
        borderColor: '#9C27B0',
        backgroundColor: 'rgba(156, 39, 176, 0.1)',
        tension: 0.1,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            label: function(context) {
              return `高度: ${context.parsed.y.toFixed(1)} m`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            callback: function(value) {
              return value + ' m';
            }
          }
        },
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          handleChartClick(elements[0].index);
        }
      },
      onHover: (event, elements) => {
        if (elements.length > 0) {
          hoveredIndex.value = elements[0].index;
        }
      }
    },
    plugins: [crosshairPlugin]
  });
  
  // 数据速率图表
  const dataRateCtx = dataRateChart.value.getContext('2d');
  dataRateChartInstance = new Chart(dataRateCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '数据速率 (bps)',
        data: [],
        borderColor: '#2196F3',
        backgroundColor: 'transparent',
        tension: 0,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          handleChartClick(elements[0].index);
        }
      },
      onHover: (event, elements) => {
        if (elements.length > 0) {
          hoveredIndex.value = elements[0].index;
        }
      }
    },
    plugins: [crosshairPlugin]
  });
  
  // RSSI 图表
  const rssiCtx = rssiChart.value.getContext('2d');
  rssiChartInstance = new Chart(rssiCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'RSSI (dBm)',
        data: [],
        borderColor: '#FF6384',
        backgroundColor: 'transparent',
        tension: 0,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        y: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          handleChartClick(elements[0].index);
        }
      },
      onHover: (event, elements) => {
        if (elements.length > 0) {
          hoveredIndex.value = elements[0].index;
        }
      }
    },
    plugins: [crosshairPlugin]
  });
  
  // SNR 图表
  const snrCtx = snrChart.value.getContext('2d');
  snrChartInstance = new Chart(snrCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'SNR (dB)',
        data: [],
        borderColor: '#4CAF50',
        backgroundColor: 'transparent',
        tension: 0,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        y: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          handleChartClick(elements[0].index);
        }
      },
      onHover: (event, elements) => {
        if (elements.length > 0) {
          hoveredIndex.value = elements[0].index;
        }
      }
    },
    plugins: [crosshairPlugin]
  });
  
  // 基底噪声图表
  const noiseFloorCtx = noiseFloorChart.value.getContext('2d');
  noiseFloorChartInstance = new Chart(noiseFloorCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '基底噪声 (dBm)',
        data: [],
        borderColor: '#FF9800',
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
        tension: 0,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            label: function(context) {
              return `基底噪声: ${context.parsed.y.toFixed(1)} dBm`;
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            callback: function(value) {
              return value + ' dBm';
            }
          }
        },
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          handleChartClick(elements[0].index);
        }
      },
      onHover: (event, elements) => {
        if (elements.length > 0) {
          hoveredIndex.value = elements[0].index;
        }
      }
    },
    plugins: [crosshairPlugin]
  });
};

// 处理图表鼠标移动
const handleChartMouseMove = (event) => {
  const rect = event.currentTarget.querySelector('canvas').getBoundingClientRect();
  const x = event.clientX - rect.left;
  
  if (dataRateChartInstance && dataRateChartInstance.scales.x) {
    const canvasWidth = rect.width;
    const xScale = dataRateChartInstance.scales.x;
    const dataLength = dataRateChartInstance.data.labels.length;
    
    if (dataLength > 0) {
      const index = Math.round((x / canvasWidth) * (dataLength - 1));
      if (index >= 0 && index < dataLength) {
        hoveredIndex.value = index;
        [altitudeChartInstance, dataRateChartInstance, rssiChartInstance, snrChartInstance, noiseFloorChartInstance].forEach(chart => {
          if (chart) chart.update('none');
        });
      }
    }
  }
};

// 处理图表鼠标离开
const handleChartMouseLeave = () => {
  hoveredIndex.value = null;
  [altitudeChartInstance, dataRateChartInstance, rssiChartInstance, snrChartInstance, noiseFloorChartInstance].forEach(chart => {
    if (chart) chart.update('none');
  });
};

// 处理图表点击
const handleChartClick = (index) => {
  if (index >= 0 && index < matchedData.value.length) {
    const data = matchedData.value[index];
    showMapPoint(data, index);
  }
};

// 在地图上显示指定点
const showMapPoint = (data, index) => {
  if (!map || !googleMaps || !canvasOverlay) return;
  
  const position = new googleMaps.LatLng(
    data.flightPoint.latitude,
    data.flightPoint.longitude
  );
  
  canvasOverlay.setHighlightedIndex(index);
  
  const noiseFloor = data.avgRssi !== null && data.avgSnr !== null 
    ? (data.avgRssi - data.avgSnr).toFixed(1) 
    : 'N/A';
  
  const content = `
    <div style="padding: 10px; min-width: 250px;">
      <h4 style="margin: 0 0 10px 0;">数据点 #${index + 1}</h4>
      <div style="font-size: 13px; line-height: 1.6;">
        <div><strong>时间:</strong> ${new Date(data.flightPoint.parsedTime).toLocaleString()}</div>
        <div><strong>位置:</strong> ${data.flightPoint.latitude.toFixed(6)}, ${data.flightPoint.longitude.toFixed(6)}</div>
        <div><strong>高度:</strong> ${(data.flightPoint['altitude(feet)'] * 0.3048).toFixed(1)} m</div>
        <div><strong>速度:</strong> ${(data.flightPoint['speed(mph)'] * 0.44704).toFixed(1)} m/s</div>
        <hr style="margin: 8px 0; border: none; border-top: 1px solid #e0e0e0;">
        <div><strong>数据速率:</strong> ${data.dataRate.toFixed(2)} bps</div>
        <div><strong>数据包数:</strong> ${data.packetCount}</div>
        ${data.avgRssi !== null ? `<div><strong>平均RSSI:</strong> ${data.avgRssi.toFixed(1)} dBm</div>` : ''}
        ${data.avgSnr !== null ? `<div><strong>平均SNR:</strong> ${data.avgSnr.toFixed(1)} dB</div>` : ''}
        <div><strong>基底噪声:</strong> ${noiseFloor} dBm</div>
      </div>
    </div>
  `;
  
  infoWindow.setContent(content);
  infoWindow.setPosition(position);
  infoWindow.open(map);
  
  map.panTo(position);
};

// 更新地图可视化
const updateMapVisualization = () => {
  if (!map || !googleMaps) return;
  
  addGatewayMarkers();
  
  if (canvasOverlay) {
    canvasOverlay.setData(matchedData.value);
  }
  
  if (matchedData.value.length > 0) {
    const bounds = new googleMaps.LatLngBounds();
    matchedData.value.forEach(data => {
      bounds.extend(new googleMaps.LatLng(
        data.flightPoint.latitude,
        data.flightPoint.longitude
      ));
    });
    Object.values(GATEWAY_LOCATIONS).forEach(location => {
      bounds.extend(location);
    });
    
    setTimeout(() => {
      map.fitBounds(bounds);
      setTimeout(() => {
        if (canvasOverlay) {
          canvasOverlay.draw();
        }
      }, 500);
    }, 100);
  }
};

// 获取可用的网关
const fetchGateways = async () => {
  try {
    const response = await $fetch('/api/gateways', {});
    
    if (response.success) {
      console.log('Available gateways:', response.gateways);
      availableGateways.value = response.gateways;
      if (response.gateways.length > 0) {
        selectedGateway.value = response.gateways[0];
      }
      isConnected.value = true;
    }
  } catch (error) {
    console.error('Failed to fetch gateways:', error);
    isConnected.value = false;
  }
};

// 处理文件上传
const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  uploadedFileName.value = file.name;
  isLoading.value = true;
  loadingMessage.value = '解析CSV文件...';
  
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    complete: async (results) => {
      const processedData = results.data
        .map(row => {
          const parsedTime = parseCSVTimestamp(row);
          return {
            ...row,
            parsedTime: parsedTime
          };
        })
        .filter(row => 
          row.parsedTime && 
          !isNaN(new Date(row.parsedTime).getTime()) &&
          row.latitude && 
          row.longitude
        );
      
      flightData.value = processedData;
      
      if (flightData.value.length > 0) {
        loadingMessage.value = '获取LoRa数据...';
        await fetchLoraData();
        loadingMessage.value = '匹配数据...';
        matchAndVisualizeData();
      } else {
        alert('CSV文件中没有有效的飞行数据');
      }
      
      isLoading.value = false;
    },
    error: (error) => {
      console.error('CSV parsing error:', error);
      alert('CSV文件解析失败');
      isLoading.value = false;
    }
  });
};

// 处理文件拖拽
const handleDrop = (event) => {
  event.preventDefault();
  const files = event.dataTransfer.files;
  if (files.length > 0) {
    fileInput.value.files = files;
    handleFileUpload({ target: { files } });
  }
};

// 获取LoRa数据
const fetchLoraData = async () => {
  if (flightData.value.length === 0) return;
  
  const startTime = new Date(flightData.value[0].parsedTime - 1000).toISOString();
  const endTime = new Date(flightData.value[flightData.value.length - 1].parsedTime).toISOString();
  
  try {
    const params = {
      startTime,
      endTime: new Date(new Date(endTime).getTime() + 1000).toISOString(),
      limit: 10000000
    };
    
    const response = await $fetch('/api/lora-data', { params });
    
    if (response.success) {
      if (selectedGateway.value) {
        loraData.value = response.data.filter(d => d.gateway_id === selectedGateway.value);
      } else {
        loraData.value = response.data;
      }
    }
  } catch (error) {
    console.error('Failed to fetch LoRa data:', error);
    alert('获取LoRa数据失败');
  }
};

const matchAndVisualizeData = () => {
  matchedData.value = [];
  
  const sortedLoraData = [...loraData.value].sort((a, b) => 
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  
  const loraTimestamps = sortedLoraData.map(point => new Date(point.time).getTime());
  
  flightData.value.forEach(flightPoint => {
    const flightTime = new Date(flightPoint.parsedTime).getTime();
    
    const startIdx = binarySearchLeft(loraTimestamps, flightTime - 1000);
    const endIdx = binarySearchRight(loraTimestamps, flightTime + 1000);
    
    const matchingLoraData = [];
    for (let i = startIdx; i < endIdx; i++) {
      if (Math.abs(loraTimestamps[i] - flightTime) <= 1000) {
        matchingLoraData.push({
          data: sortedLoraData[i],
          timeDiff: Math.abs(loraTimestamps[i] - flightTime)
        });
      }
    }
    
    let closestLora = null;
    if (matchingLoraData.length > 0) {
      matchingLoraData.sort((a, b) => a.timeDiff - b.timeDiff);
      closestLora = matchingLoraData[0].data;
    }
    
    const oneSecondStartIdx = binarySearchLeft(loraTimestamps, flightTime - 1000);
    const oneSecondEndIdx = binarySearchRight(loraTimestamps, flightTime);
    
    let totalBits = 0;
    let dataInWindowCount = 0;
    for (let i = oneSecondStartIdx; i < oneSecondEndIdx; i++) {
      if (loraTimestamps[i] >= flightTime - 1000 && loraTimestamps[i] <= flightTime) {
        totalBits += (sortedLoraData[i].payload_length || 0) * 8;
        dataInWindowCount++;
      }
    }
    
    const avgRssi = closestLora ? closestLora.rssi : null;
    const avgSnr = closestLora ? closestLora.snr : null;
    
    matchedData.value.push({
      flightPoint,
      loraData: closestLora,
      dataRate: totalBits,
      avgRssi,
      avgSnr,
      packetCount: dataInWindowCount
    });
  });
  
  updateMapVisualization();
  updateCharts();
};

// 二分查找辅助函数
const binarySearchLeft = (arr, target) => {
  let left = 0;
  let right = arr.length;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  return left;
};

const binarySearchRight = (arr, target) => {
  let left = 0;
  let right = arr.length;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] <= target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  return left;
};

// 更新图表
const updateCharts = () => {
  const labels = matchedData.value.map(d => {
    const time = new Date(d.flightPoint.parsedTime);
    return time.toLocaleTimeString('zh-CN', { 
      hour12: false, 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  });
  
  const altitudes = matchedData.value.map(d => feetToMeters(d.flightPoint['altitude(feet)'] || 0));
  const dataRates = matchedData.value.map(d => d.dataRate);
  const rssiValues = matchedData.value.map(d => d.avgRssi || 0);
  const snrValues = matchedData.value.map(d => d.avgSnr || 0);
  
  const noiseFloorValues = matchedData.value.map(d => {
    if (d.avgRssi !== null && d.avgSnr !== null) {
      return d.avgRssi - d.avgSnr;
    }
    return null;
  });
  
  altitudeChartInstance.data.labels = labels;
  altitudeChartInstance.data.datasets[0].data = altitudes;
  altitudeChartInstance.update();
  
  dataRateChartInstance.data.labels = labels;
  dataRateChartInstance.data.datasets[0].data = dataRates;
  dataRateChartInstance.update();
  
  rssiChartInstance.data.labels = labels;
  rssiChartInstance.data.datasets[0].data = rssiValues;
  rssiChartInstance.update();
  
  snrChartInstance.data.labels = labels;
  snrChartInstance.data.datasets[0].data = snrValues;
  snrChartInstance.update();
  
  noiseFloorChartInstance.data.labels = labels;
  noiseFloorChartInstance.data.datasets[0].data = noiseFloorValues;
  noiseFloorChartInstance.update();
};

// 更新可视化
const updateVisualization = () => {
  if (flightData.value.length > 0) {
    isLoading.value = true;
    loadingMessage.value = '更新数据...';
    
    fetchLoraData().then(() => {
      matchAndVisualizeData();
      isLoading.value = false;
    });
  }
};

// 刷新数据
const refreshData = () => {
  updateVisualization();
};

// 导出数据
const exportData = () => {
  const csvData = matchedData.value.map((d, index) => ({
    index: index + 1,
    time: new Date(d.flightPoint.parsedTime).toISOString(),
    latitude: d.flightPoint.latitude,
    longitude: d.flightPoint.longitude,
    altitude_m: feetToMeters(d.flightPoint['altitude(feet)'] || 0).toFixed(1),
    speed_ms: mphToMs(d.flightPoint['speed(mph)'] || 0).toFixed(1),
    data_rate_bps: d.dataRate.toFixed(2),
    packet_count: d.packetCount,
    avg_rssi: d.avgRssi?.toFixed(1) || '',
    avg_snr: d.avgSnr?.toFixed(1) || '',
    noise_floor: d.avgRssi !== null && d.avgSnr !== null ? (d.avgRssi - d.avgSnr).toFixed(1) : '',
    gateway_id: selectedGateway.value || ''
  }));
  
  const csv = Papa.unparse(csvData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `lora_analysis_${new Date().toISOString()}.csv`);
  link.click();
};

// 格式化时间
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  return new Date(timeStr).toLocaleString('zh-CN');
};

// 组件挂载
onMounted(async () => {
  await initMap();
  initCharts();
  await fetchGateways();
  isConnected.value = true;
});

// 清理
onUnmounted(() => {
  if (infoWindow) {
    infoWindow.close();
  }
  if (canvasOverlay) {
    canvasOverlay.onRemove();
  }
  // 清理测距相关
  if (mapClickListener && googleMaps) {
    googleMaps.event.removeListener(mapClickListener);
  }
  clearMeasurement();
});
</script>

<style scoped>
.lora-visualization {
  display: flex;
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #f8f9fa;
}

.control-panel {
  width: 400px;
  height: 100vh;
  background: white;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
  padding: 24px;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  color: #2c3e50;
  font-weight: 600;
  letter-spacing: -0.5px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #f5f5f5;
  border-radius: 12px;
  font-size: 12px;
  color: #757575;
}

.connection-status.connected {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #bdbdbd;
}

.connected .status-dot {
  background: #4caf50;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.upload-section {
  margin-bottom: 20px;
}

.upload-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #424242;
  margin-bottom: 10px;
}

.upload-area {
  border: 1.5px dashed #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  transition: all 0.3s ease;
  background: #fafafa;
}

.upload-area:hover {
  border-color: #2196F3;
  background: #f3f9ff;
}

.upload-btn {
  padding: 8px 20px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.upload-btn:hover {
  background: #1976D2;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.file-name {
  display: block;
  margin-top: 10px;
  color: #4caf50;
  font-size: 13px;
  font-weight: 500;
}

.upload-hint {
  display: block;
  margin-top: 10px;
  color: #9e9e9e;
  font-size: 13px;
}

.gateway-section {
  margin-bottom: 20px;
}

.gateway-section h3 {
  color: #424242;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 10px;
}

.gateway-radios {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #424242;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.radio-label:hover {
  background: #f5f5f5;
}

.radio-label:has(input[type="radio"]:checked) {
  background: #e3f2fd;
  border-color: #2196F3;
  color: #1976D2;
}

.radio-label input[type="radio"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #2196F3;
}

.gateway-location {
  color: #9e9e9e;
  font-size: 12px;
  margin-left: auto;
}

.radio-label:has(input[type="radio"]:checked) .gateway-location {
  color: #64b5f6;
}

/* 测距工具样式 */
.measure-section {
  margin-bottom: 20px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
}

.measure-section h3 {
  margin: 0 0 12px 0;
  color: #424242;
  font-size: 14px;
  font-weight: 500;
}

.measure-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.measure-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: white;
  color: #E91E63;
  border: 1.5px solid #E91E63;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.measure-btn:hover {
  background: #fce4ec;
}

.measure-btn.active {
  background: #E91E63;
  color: white;
}

.measure-btn.active:hover {
  background: #C2185B;
}

.measure-icon {
  font-size: 16px;
}

.clear-measure-btn {
  padding: 10px 16px;
  background: white;
  color: #757575;
  border: 1.5px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.clear-measure-btn:hover {
  background: #f5f5f5;
  border-color: #bdbdbd;
}

.measure-hint {
  font-size: 12px;
  color: #757575;
  padding: 8px;
  background: #fff3e0;
  border-radius: 4px;
  text-align: center;
}

.measure-result {
  margin-top: 12px;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.distance-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.distance-label {
  font-size: 13px;
  color: #757575;
}

.distance-value {
  font-size: 18px;
  font-weight: 600;
  color: #E91E63;
}

.measure-points-info {
  font-size: 11px;
  color: #9e9e9e;
  line-height: 1.5;
}

/* 地图上的测距模式指示器 */
.measure-mode-indicator {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #E91E63;
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 10px rgba(233, 30, 99, 0.3);
  z-index: 100;
  animation: fadeIn 0.3s ease;
}

.measure-icon-large {
  font-size: 18px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.time-range {
  margin-bottom: 20px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e8e8e8;
}

.time-range h3 {
  margin: 0 0 10px 0;
  color: #424242;
  font-size: 14px;
  font-weight: 500;
}

.time-info {
  font-size: 12px;
  color: #616161;
  line-height: 1.6;
}

.time-info div {
  margin-bottom: 2px;
}

.stats-section {
  margin-bottom: 20px;
}

.stats-section h3 {
  color: #424242;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.stat-item {
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 3px solid #2196F3;
  transition: all 0.2s;
}

.stat-item:hover {
  background: #f0f5ff;
  transform: translateX(2px);
}

.stat-label {
  display: block;
  font-size: 11px;
  color: #9e9e9e;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.charts-container {
  margin-bottom: 20px;
  position: relative;
}

.chart-wrapper {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e8e8e8;
  position: relative;
  cursor: crosshair;
}

.chart-wrapper h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #424242;
  font-weight: 500;
}

.chart-wrapper canvas {
  max-height: 80px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
  padding-top: 20px;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #2196F3;
  color: white;
}

.btn-primary:hover {
  background: #1976D2;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.btn-secondary {
  background: white;
  color: #2196F3;
  border: 1.5px solid #2196F3;
}

.btn-secondary:hover {
  background: #2196F3;
  color: white;
}

.map-container {
  flex: 1;
  position: relative;
  background: #f0f0f0;
}

#google-map {
  width: 100%;
  height: 100%;
}

.map-legend {
  position: absolute;
  top: 20px;
  right: 20px;
  background: white;
  padding: 14px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 5;
  min-width: 180px;
}

.map-legend h4 {
  margin: 0 0 10px 0;
  font-size: 13px;
  color: #424242;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #616161;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(5px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #2196F3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-overlay p {
  color: #424242;
  margin-top: 16px;
  font-size: 14px;
  font-weight: 500;
}

@media (max-width: 768px) {
  .lora-visualization {
    flex-direction: column;
  }
  
  .control-panel {
    width: 100%;
    height: auto;
    max-height: 50vh;
    border-right: none;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .map-container {
    height: 50vh;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .map-legend {
    top: 10px;
    right: 10px;
    padding: 10px;
    min-width: 150px;
  }
  
  .legend-item {
    font-size: 11px;
  }
  
  .measure-mode-indicator {
    top: 10px;
    padding: 8px 16px;
    font-size: 12px;
  }
}

.control-panel::-webkit-scrollbar {
  width: 6px;
}

.control-panel::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb {
  background: #bdbdbd;
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb:hover {
  background: #9e9e9e;
}
</style>