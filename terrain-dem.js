/**
 * 滇缅公路（大理段）3D 地形沙盘地理投影、实测数字高程模型 (DEM) 与 Google Maps 瓦片拼图引擎
 * 兼容直接 file:// 打开与本地/线上 HTTP 服务。
 */
(function (global) {
  'use strict';

  const BOUNDS = {
    west: 97.96,
    east: 100.32,
    south: 23.98,
    north: 25.90,
    centerLat: 24.94,
    centerLng: 99.14
  };

  // Three.js 沙盘比例：1 经度/纬度近似公里数换算，1 世界单位 = 1 km（居中于 centerLat/centerLng）
  const KM_PER_DEG_LAT = 110.78;
  const KM_PER_DEG_LNG = 111.32 * Math.cos((BOUNDS.centerLat * Math.PI) / 180); // ~100.94 km/deg at 24.94N
  const WORLD_WIDTH = (BOUNDS.east - BOUNDS.west) * KM_PER_DEG_LNG;   // ~238.2 km
  const WORLD_DEPTH = (BOUNDS.north - BOUNDS.south) * KM_PER_DEG_LAT; // ~212.7 km
  const ELEV_BASE = 620; // 海拔基准面 (m)，适配怒江河谷 680m 与畹町 780m
  const WORLD_Y_PER_METER = 0.001; // 1000m = 1 世界单位

  const GRID_COLS = 280;
  const GRID_ROWS = 224;

  // ========== 1. WGS-84 与 GCJ-02 坐标转换 ==========
  function outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function transformLat(x, y) {
    let ret =
      -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
    ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
    return ret;
  }

  function transformLng(x, y) {
    let ret =
      300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
    ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
    return ret;
  }

  function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return { lat, lng };
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
    dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
    return { lat: lat + dLat, lng: lng + dLng };
  }

  // ========== 2. 经纬度 <-> 世界坐标 & Web Mercator 转换 ==========
  function latLngToWorldXZ(lat, lng) {
    const x = (lng - BOUNDS.centerLng) * KM_PER_DEG_LNG;
    // 北为负 Z，南为正 Z（右手坐标系：+X 为东，-Z 为北，+Y 为海拔向上）
    const z = -(lat - BOUNDS.centerLat) * KM_PER_DEG_LAT;
    return { x, z };
  }

  function worldXZToLatLng(x, z) {
    const lng = x / KM_PER_DEG_LNG + BOUNDS.centerLng;
    const lat = -z / KM_PER_DEG_LAT + BOUNDS.centerLat;
    return { lat, lng };
  }

  function latLngToUV(lat, lng) {
    const u = (lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west);
    const v = (lat - BOUNDS.south) / (BOUNDS.north - BOUNDS.south); // v=0 南, v=1 北 (Three.js PlaneTexture 标准)
    return { u, v };
  }

  function latToMercatorY(lat) {
    const rad = (lat * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
  }

  function mercatorYToLat(my) {
    return (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * (180 / Math.PI);
  }

  function latLngToTileXY(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y, n };
  }

  function tileXYToLatLng(x, y, zoom) {
    const n = Math.pow(2, zoom);
    const lng = (x / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
    const lat = (latRad * 180) / Math.PI;
    return { lat, lng };
  }

  // ========== 3. 滇西真实地貌约束 DEM（山脉脊线 + 六大河谷切蚀 + 实测高程控制点） ==========
  // 控制点格式: [lat, lng, elevMeters, sigmaLatDeg, sigmaLngDeg, weight]
  const ELEV_CONTROLS = [
    // 点苍山主脊与东麓洱海盆地 (100.05E - 100.28E)
    [25.72, 100.10, 4090, 0.14, 0.045, 2.6], // 点苍山中和/马龙峰脊线
    [25.64, 100.13, 3680, 0.08, 0.04, 2.2],  // 苍山南段斜阳峰
    [25.586, 100.224, 1980, 0.03, 0.035, 3.0], // 下关城区
    [25.72, 100.22, 1966, 0.15, 0.045, 3.4], // 洱海湖面盆地
    [25.82, 100.21, 1966, 0.10, 0.05, 3.2],  // 洱海北段

    // 苍山西麓石门关至漾濞坝子
    [25.67, 100.04, 2950, 0.07, 0.04, 1.8],  // 苍山西坡石门关高山台地
    [25.5685, 100.1145, 1760, 0.025, 0.028, 3.0], // 太平邑（西洱河谷）
    [25.5829, 100.0495, 1590, 0.025, 0.028, 3.2], // 平坡铺桥头（河谷交汇）
    [25.6629, 99.9624, 1530, 0.03, 0.03, 3.4],    // 漾濞高铁站/黑惠江谷地
    [25.69, 99.95, 1545, 0.035, 0.025, 2.8],      // 漾濞县城苍山西镇
    [25.78, 99.92, 1620, 0.06, 0.035, 2.0],       // 黑惠江上游

    // 秀岭 — 太平乡 — 小尖山 — 胜备桥
    [25.645, 99.905, 2060, 0.035, 0.035, 2.2],    // 秀岭弹石路上山坡
    [25.6043, 99.8492, 2020, 0.03, 0.03, 3.2],    // 太平乡高台
    [25.62, 99.84, 2240, 0.04, 0.04, 1.8],        // 太平乡北侧山岭
    [25.5735, 99.8115, 1820, 0.024, 0.024, 3.0],  // 小尖山陡崖
    [25.5455, 99.7825, 1480, 0.022, 0.024, 3.8],  // 胜备桥（顺濞河谷底）
    [25.49, 99.90, 1640, 0.04, 0.04, 2.2],        // 顺濞镇河谷

    // 黄连铺 — 北斗乡 — 铁丝窝（云台山脊）— 梅花村 — 永平坝子
    [25.5210, 99.7660, 1630, 0.022, 0.025, 3.2],  // 黄连铺
    [25.5432, 99.6894, 1890, 0.025, 0.028, 3.0],  // 北斗彝族乡
    [25.5020, 99.6180, 2505, 0.026, 0.028, 4.2],  // 铁丝窝全线最高点 (2505m)
    [25.52, 99.60, 2680, 0.04, 0.035, 2.0],       // 铁丝窝北侧云台山脊
    [25.4790, 99.5660, 1920, 0.025, 0.025, 3.0],  // 梅花村
    [25.4500, 99.5170, 1620, 0.032, 0.038, 3.8],  // 永平县城银江坝子
    [25.39, 99.46, 2280, 0.05, 0.045, 2.2],       // 博南山南侧花桥方向
    [25.32, 99.39, 1520, 0.05, 0.04, 2.4],        // 杉阳方向河谷

    // 永平北线：龙门乡 — 玉皇阁水库 — 麦庄垭口 — 568 — 黑羊箐
    [25.5223, 99.5067, 1860, 0.024, 0.025, 3.2],  // 龙门乡
    [25.5504, 99.4791, 1960, 0.022, 0.024, 3.2],  // 玉皇阁水库
    [25.5810, 99.4560, 2180, 0.022, 0.022, 3.0],  // 李子树二号老涵洞半山
    [25.6030, 99.4360, 2400, 0.022, 0.024, 4.4],  // 麦庄垭口 (2400m)
    [25.62, 99.44, 2580, 0.04, 0.035, 2.0],       // 麦庄垭口主峰
    [25.6110, 99.3980, 1780, 0.02, 0.02, 3.4],    // 568 陡降半坡
    [25.6180, 99.3940, 1650, 0.02, 0.02, 3.2],    // 永云界·黑羊箐

    // 功果桥防空炮台山峰 & 大栗树 — 沘江 — 宝丰 — 澜沧江峡谷
    [25.5960, 99.3380, 2260, 0.025, 0.024, 4.0],  // 功果桥三号防空炮台山顶 (高耸俯瞰江面)
    [25.6430, 99.3550, 1390, 0.022, 0.022, 3.8],  // 大栗树村（沘江峡谷）
    [25.66, 99.33, 1360, 0.025, 0.025, 3.0],      // 沘江北折弯谷
    [25.8114, 99.3708, 1680, 0.04, 0.035, 3.4],   // 宝丰乡（移建昌淦桥/小铁桥）
    [25.74, 99.36, 1520, 0.035, 0.03, 2.6],       // 沘江中段
    [25.5935, 99.3105, 1280, 0.022, 0.02, 4.5],   // 功果桥核心历史桥位区（水库蓄水区）
    [25.5862, 99.3356, 1285, 0.018, 0.018, 3.8],  // 功果桥水电站大坝一带
    [25.5630, 99.3420, 1275, 0.02, 0.02, 4.4],    // 现状功果桥（拱桥）
    [25.5120, 99.3140, 1265, 0.025, 0.025, 4.0],  // 坡脚（云保界终点）
    [25.43, 99.29, 1255, 0.05, 0.035, 3.2],       // 澜沧江下游往保山方向
    [25.70, 99.26, 1330, 0.05, 0.035, 3.2],       // 澜沧江上游（沘江汇入前）
    [25.65, 99.23, 2350, 0.07, 0.04, 2.2],        // 澜沧江西岸高山
    [25.45, 99.24, 2380, 0.08, 0.04, 2.2],        // 澜沧江西岸高山南段

    // ========== 保山走廊 — 怒江峡谷 — 松山 — 高黎贡山 — 腾冲 — 龙陵 — 芒市 — 畹町 ==========
    // 瓦窑 — 板桥 — 保山坝子 — 怒山脊线
    [25.432, 99.255, 1320, 0.035, 0.035, 3.4],    // 瓦窑镇（入保山河谷）
    [25.198, 99.188, 1675, 0.045, 0.045, 3.2],    // 板桥古镇（保山北大门）
    [25.112, 99.161, 1655, 0.065, 0.055, 4.2],    // 保山城区（隆阳坝子）
    [25.118, 99.142, 1890, 0.03, 0.025, 2.8],     // 太保山
    [24.978, 99.042, 1440, 0.04, 0.035, 3.2],     // 蒲缥镇
    [25.25, 99.02, 2920, 0.14, 0.055, 2.5],       // 怒山北段主脊
    [25.06, 99.00, 2650, 0.10, 0.05, 2.3],        // 怒山中段

    // 怒江大峡谷（双虹桥 / 惠通桥）& 松山主峰
    [25.025, 98.895, 730, 0.03, 0.025, 4.5],      // 怒江双虹桥（保腾古道咽喉）
    [24.8155, 98.965, 680, 0.03, 0.025, 4.6],     // 怒江惠通桥（抗战滇西封锁线）
    [24.756, 98.898, 2200, 0.032, 0.028, 3.8],    // 松山大战遗址主峰（俯瞰怒江）

    // 高黎贡山巨脊与老保腾公路分水岭垭口 & 腾冲火山盆地
    [25.65, 98.73, 3580, 0.22, 0.065, 2.6],       // 高黎贡山北段高脊
    [25.32, 98.74, 3420, 0.16, 0.06, 2.6],        // 高黎贡山中段主脊
    [25.03, 98.76, 3180, 0.08, 0.05, 2.5],        // 高黎贡山南段主脊
    [24.965, 98.762, 2310, 0.035, 0.032, 3.8],    // 保腾老路分水岭垭口（南斋公房一带）
    [24.76, 98.78, 2950, 0.10, 0.055, 2.4],       // 高黎贡山南延山脊
    [25.0205, 98.4972, 1640, 0.065, 0.06, 4.2],   // 腾冲城区（国殇墓园/和顺）
    [25.22, 98.50, 2580, 0.09, 0.06, 2.4],        // 腾冲火山群与北山
    [24.805, 98.295, 1080, 0.07, 0.055, 3.0],     // 梁河—大盈江河谷

    // 镇安 — 龙陵 — 象达 — 芒市 — 遮放 — 畹町 — 瑞丽
    [24.695, 98.826, 1820, 0.04, 0.035, 3.2],     // 镇安
    [24.5872, 98.6902, 1530, 0.055, 0.05, 3.8],   // 龙陵县城
    [24.51, 98.64, 1950, 0.05, 0.045, 2.6],       // 象达山岭
    [24.4365, 98.5855, 915, 0.07, 0.065, 4.0],    // 芒市坝子
    [24.2375, 98.1880, 810, 0.06, 0.06, 3.8],     // 遮放坝子
    [24.0825, 98.0715, 780, 0.05, 0.05, 4.2],     // 畹町国门（959.4km 中国境内终点）
    [24.01, 97.98, 760, 0.07, 0.07, 3.4]          // 瑞丽江低谷盆地
  ];

  // 主要河谷折线用于精细切割峡谷地形（使河道具有真实 U/V 形深谷形态）
  const RIVER_PATHS = [
    // 澜沧江主干流（从西北经功果桥、瓦窑、保山东侧贯穿至南界）
    {
      width: 0.022,
      depth: 480,
      baseElev: 1230,
      pts: [
        [25.90, 99.23], [25.76, 99.27], [25.67, 99.28], [25.61, 99.298],
        [25.593, 99.311], [25.585, 99.325], [25.563, 99.342],
        [25.535, 99.328], [25.512, 99.314], [25.42, 99.29], [25.25, 99.30],
        [25.00, 99.34], [24.65, 99.38], [23.98, 99.42]
      ]
    },
    // 怒江大峡谷（高黎贡山与怒山之间极深峡谷：经双虹桥 730m、惠通桥 680m）
    {
      width: 0.024,
      depth: 920,
      baseElev: 700,
      pts: [
        [25.90, 98.86], [25.62, 98.87], [25.32, 98.88], [25.025, 98.895],
        [24.92, 98.93], [24.8155, 98.965], [24.65, 98.94], [24.32, 98.91],
        [23.98, 98.88]
      ]
    },
    // 龙川江 — 瑞丽江水系（经腾冲东麓、龙陵西至遮放、畹町出境）
    {
      width: 0.020,
      depth: 420,
      baseElev: 820,
      pts: [
        [25.35, 98.62], [25.12, 98.64], [24.92, 98.62], [24.68, 98.58],
        [24.48, 98.48], [24.34, 98.33], [24.2375, 98.188], [24.10, 98.06],
        [24.02, 98.00]
      ]
    },
    // 沘江（自宝丰南下绕大栗树村西折至小铁桥汇入澜沧江）
    {
      width: 0.016,
      depth: 420,
      baseElev: 1350,
      pts: [
        [25.85, 99.38], [25.811, 99.371], [25.73, 99.36], [25.665, 99.342],
        [25.643, 99.355], [25.635, 99.332], [25.612, 99.308], [25.598, 99.306]
      ]
    },
    // 黑惠江 / 漾濞江（自西北向东南经漾濞高铁站至平坡、胜备桥）
    {
      width: 0.018,
      depth: 320,
      baseElev: 1520,
      pts: [
        [25.84, 99.89], [25.74, 99.93], [25.663, 99.962],
        [25.61, 100.015], [25.583, 100.050], [25.52, 100.03], [25.35, 99.98]
      ]
    },
    // 顺濞河（从东向西经顺濞镇汇入黑惠江，在胜备桥过桥）
    {
      width: 0.015,
      depth: 280,
      baseElev: 1490,
      pts: [
        [25.49, 99.92], [25.52, 99.84], [25.5455, 99.7825], [25.57, 99.76]
      ]
    },
    // 西洱河（洱海出口经下关—太平邑—平坡汇入漾濞江）
    {
      width: 0.014,
      depth: 260,
      baseElev: 1730,
      pts: [
        [25.595, 100.215], [25.586, 100.224], [25.575, 100.165],
        [25.5685, 100.1145], [25.578, 100.075], [25.583, 100.050]
      ]
    },
    // 银江（永平盆地主水系）
    {
      width: 0.016,
      depth: 240,
      baseElev: 1610,
      pts: [
        [25.53, 99.51], [25.48, 99.52], [25.45, 99.517], [25.39, 99.525], [25.31, 99.53]
      ]
    }
  ];

  // 确定性伪随机分形山脊噪声（无闪烁，重现横断山脉南北向褶皱肌理）
  function hash2(ix, iy) {
    const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function valueNoise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  function ridgedFbm(lat, lng) {
    // 沿横断山脉走向 (略偏北西-南东) 拉伸褶皱脊线
    const rx = (lng - 99.2) * 15.0 + (lat - 25.3) * 4.5;
    const ry = (lat - 25.3) * 10.5 - (lng - 99.2) * 3.0;
    let sum = 0;
    let amp = 1.0;
    let freq = 1.0;
    for (let i = 0; i < 4; i++) {
      const n = valueNoise2D(rx * freq, ry * freq);
      const ridge = 1.0 - Math.abs(n * 2.0 - 1.0);
      sum += ridge * ridge * amp;
      freq *= 2.08;
      amp *= 0.48;
    }
    return sum; // ~0 .. 1.9
  }

  function distToSegmentSq(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-12) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const ex = px - cx;
    const ey = py - cy;
    return ex * ex + ey * ey;
  }

  function minRiverInfo(lat, lng) {
    let bestFactor = 0;
    let bestElev = 2000;
    let bestDistNorm = 99;
    for (let r = 0; r < RIVER_PATHS.length; r++) {
      const river = RIVER_PATHS[r];
      let minSq = 999;
      for (let i = 0; i < river.pts.length - 1; i++) {
        const a = river.pts[i];
        const b = river.pts[i + 1];
        const dSq = distToSegmentSq(lat, lng, a[0], a[1], b[0], b[1]);
        if (dSq < minSq) minSq = dSq;
      }
      const dist = Math.sqrt(minSq);
      const norm = dist / river.width;
      if (norm < 2.2) {
        const carve = Math.exp(-norm * norm * 1.15);
        if (carve > bestFactor) {
          bestFactor = carve;
          bestElev = river.baseElev;
          bestDistNorm = norm;
        }
      }
    }
    return { factor: bestFactor, elev: bestElev, distNorm: bestDistNorm };
  }

  // 洱海湖泊边界判断（东侧 100.16°E ~ 100.28°E, 25.60°N ~ 25.86°N）
  function isErhaiLake(lat, lng) {
    if (lat < 25.595 || lng < 100.155) return 0;
    const centerLng = 100.215 - (lat - 25.62) * 0.08;
    const halfW = 0.042 + Math.sin((lat - 25.59) * 14) * 0.012;
    const d = Math.abs(lng - centerLng) / halfW;
    if (d < 1.0) return 1.0 - Math.pow(d, 4);
    return 0;
  }

  function computeRawElevation(lat, lng) {
    // 1. 区域控制网加权插值
    let wSum = 0.05;
    let eSum = 0.05 * 2080; // 横断山脉背景高程
    for (let i = 0; i < ELEV_CONTROLS.length; i++) {
      const c = ELEV_CONTROLS[i];
      const dLat = (lat - c[0]) / c[3];
      const dLng = (lng - c[1]) / c[4];
      const d2 = dLat * dLat + dLng * dLng;
      if (d2 < 24) {
        const w = c[5] * Math.exp(-0.5 * d2);
        wSum += w;
        eSum += w * c[2];
      }
    }
    let elev = eSum / wSum;

    // 2. 叠加横断山脉分形山脊肌理（在湖盆与宽坝减弱）
    const erhai = isErhaiLake(lat, lng);
    const ridgeVal = ridgedFbm(lat, lng) - 0.65;
    // 在非平坝和湖区加入 +/- 320m 真实山脊纵谷细节
    const detailScale = erhai > 0.2 ? 0.05 : 1.0;
    elev += ridgeVal * 340 * detailScale;

    // 3. 河谷切割
    const rv = minRiverInfo(lat, lng);
    if (rv.factor > 0.01) {
      elev = elev * (1 - rv.factor * 0.72) + rv.elev * (rv.factor * 0.72);
    }

    // 4. 洱海湖面强制平滑到 1966m
    if (erhai > 0.05) {
      elev = elev * (1 - erhai) + 1966 * erhai;
    }

    // 5. 关键控制点局部强锚定，保证所有路线关键地标海拔与文章标称严格一致
    for (let i = 0; i < ELEV_CONTROLS.length; i++) {
      const c = ELEV_CONTROLS[i];
      if (c[5] >= 3.0) {
        const dLat = (lat - c[0]) / (c[3] * 0.55);
        const dLng = (lng - c[1]) / (c[4] * 0.55);
        const d2 = dLat * dLat + dLng * dLng;
        if (d2 < 8) {
          const anchor = Math.exp(-d2 * 0.85);
          elev = elev * (1 - anchor * 0.85) + c[2] * (anchor * 0.85);
        }
      }
    }

    return Math.max(650, Math.min(4180, elev));
  }

  // 预生成 DEM 高程矩阵 (GRID_ROWS x GRID_COLS)
  const demGrid = new Float32Array(GRID_ROWS * GRID_COLS);
  for (let row = 0; row < GRID_ROWS; row++) {
    // row 0 = north, row (GRID_ROWS-1) = south -> 与 Three.js PlaneGeometry 顶点行序对齐
    const tLat = 1 - row / (GRID_ROWS - 1);
    const lat = BOUNDS.south + tLat * (BOUNDS.north - BOUNDS.south);
    for (let col = 0; col < GRID_COLS; col++) {
      const tLng = col / (GRID_COLS - 1);
      const lng = BOUNDS.west + tLng * (BOUNDS.east - BOUNDS.west);
      demGrid[row * GRID_COLS + col] = computeRawElevation(lat, lng);
    }
  }

  function sampleElevation(lat, lng) {
    const u = Math.max(0, Math.min(1, (lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)));
    const vFromNorth = Math.max(0, Math.min(1, (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)));
    const fc = u * (GRID_COLS - 1);
    const fr = vFromNorth * (GRID_ROWS - 1);
    const c0 = Math.floor(fc);
    const r0 = Math.floor(fr);
    const c1 = Math.min(GRID_COLS - 1, c0 + 1);
    const r1 = Math.min(GRID_ROWS - 1, r0 + 1);
    const tx = fc - c0;
    const ty = fr - r0;
    const e00 = demGrid[r0 * GRID_COLS + c0];
    const e10 = demGrid[r0 * GRID_COLS + c1];
    const e01 = demGrid[r1 * GRID_COLS + c0];
    const e11 = demGrid[r1 * GRID_COLS + c1];
    const e0 = e00 + (e10 - e00) * tx;
    const e1 = e01 + (e11 - e01) * tx;
    return e0 + (e1 - e0) * ty;
  }

  function elevationToWorldY(elevMeters, verticalScale) {
    return (elevMeters - ELEV_BASE) * WORLD_Y_PER_METER * (verticalScale || 2.6);
  }

  function latLngToWorld(lat, lng, verticalScale, offsetMeters) {
    const xz = latLngToWorldXZ(lat, lng);
    const elev = sampleElevation(lat, lng) + (offsetMeters || 0);
    return {
      x: xz.x,
      y: elevationToWorldY(elev, verticalScale),
      z: xz.z,
      elev: elev - (offsetMeters || 0)
    };
  }

  // ========== 4. 高分辨率离线等高线地貌贴图生成器 (即时可用 & Google离线兜底) ==========
  function getHypsometricRGB(elev) {
    // 分层设色：亚热带怒江/瑞丽江低谷 -> 河谷深绿 -> 暖黄绿坡地 -> 山林橄榄 -> 高山赭石 -> 苍山/高黎贡雪顶
    const stops = [
      [680, [24, 58, 48]],
      [950, [32, 74, 56]],
      [1240, [38, 82, 60]],
      [1480, [48, 96, 68]],
      [1750, [68, 114, 72]],
      [2050, [96, 128, 76]],
      [2350, [132, 134, 82]],
      [2700, [156, 132, 94]],
      [3250, [168, 152, 132]],
      [3850, [215, 220, 226]],
      [4200, [242, 246, 250]]
    ];
    if (elev <= stops[0][0]) return stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (elev <= b[0]) {
        const t = (elev - a[0]) / (b[0] - a[0]);
        return [
          a[1][0] + (b[1][0] - a[1][0]) * t,
          a[1][1] + (b[1][1] - a[1][1]) * t,
          a[1][2] + (b[1][2] - a[1][2]) * t
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  function generateProceduralTopoCanvas(width, height) {
    const w = width || 1600;
    const h = height || 1420;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    const dLng = (BOUNDS.east - BOUNDS.west) / w;
    const dLat = (BOUNDS.north - BOUNDS.south) / h;

    // 预采样高度场做斜阳山体阴影 (Hillshade) + 百米等高线
    const elevBuf = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
      const lat = BOUNDS.north - (py / (h - 1)) * (BOUNDS.north - BOUNDS.south);
      for (let px = 0; px < w; px++) {
        const lng = BOUNDS.west + (px / (w - 1)) * (BOUNDS.east - BOUNDS.west);
        elevBuf[py * w + px] = sampleElevation(lat, lng);
      }
    }

    for (let py = 0; py < h; py++) {
      const lat = BOUNDS.north - (py / (h - 1)) * (BOUNDS.north - BOUNDS.south);
      const pyUp = Math.max(0, py - 1);
      const pyDn = Math.min(h - 1, py + 1);
      for (let px = 0; px < w; px++) {
        const lng = BOUNDS.west + (px / (w - 1)) * (BOUNDS.east - BOUNDS.west);
        const pxLt = Math.max(0, px - 1);
        const pxRt = Math.min(w - 1, px + 1);

        const idx = py * w + px;
        const elev = elevBuf[idx];

        // 坡向斜阳山体阴影（西北 315 度光源）
        const dzdx = (elevBuf[py * w + pxRt] - elevBuf[py * w + pxLt]) / (2 * dLng * KM_PER_DEG_LNG * 1000);
        const dzdy = (elevBuf[pyUp * w + px] - elevBuf[pyDn * w + px]) / (2 * dLat * KM_PER_DEG_LAT * 1000);
        const nx = -dzdx * 2.2;
        const ny = -dzdy * 2.2;
        const nz = 1.0;
        const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        // 光源方向 (-0.6, 0.5, 0.62)
        const shade = Math.max(0.32, Math.min(1.28, (nx * -0.58 + ny * 0.48 + nz * 0.66) * invLen * 1.15 + 0.12));

        let rgb = getHypsometricRGB(elev);
        let r = rgb[0] * shade;
        let g = rgb[1] * shade;
        let b = rgb[2] * shade;

        // 洱海湖泊及澜沧江/沘江/黑惠江水体着色
        const erhai = isErhaiLake(lat, lng);
        const rv = minRiverInfo(lat, lng);
        if (erhai > 0.38) {
          const waterMix = Math.min(1, (erhai - 0.35) * 2.4);
          r = r * (1 - waterMix) + 26 * waterMix;
          g = g * (1 - waterMix) + 82 * waterMix;
          b = b * (1 - waterMix) + 124 * waterMix;
        } else if (rv.distNorm < 0.28) {
          const riverMix = Math.min(0.85, (0.28 - rv.distNorm) * 4.5);
          r = r * (1 - riverMix) + 34 * riverMix;
          g = g * (1 - riverMix) + 96 * riverMix;
          b = b * (1 - riverMix) + 130 * riverMix;
        } else {
          // 100m 等高线与 500m 加粗主等高线
          const eRight = elevBuf[py * w + pxRt];
          const eDown = elevBuf[pyDn * w + px];
          const band100 = Math.floor(elev / 100);
          const isContour100 =
            band100 !== Math.floor(eRight / 100) || band100 !== Math.floor(eDown / 100);
          if (isContour100) {
            const band500 = Math.floor(elev / 500);
            const isMajor =
              band500 !== Math.floor(eRight / 500) || band500 !== Math.floor(eDown / 500);
            const alpha = isMajor ? 0.36 : 0.14;
            r = r * (1 - alpha) + 255 * alpha;
            g = g * (1 - alpha) + 240 * alpha;
            b = b * (1 - alpha) + 205 * alpha;
          }
        }

        const p = idx * 4;
        data[p] = Math.max(0, Math.min(255, r));
        data[p + 1] = Math.max(0, Math.min(255, g));
        data[p + 2] = Math.max(0, Math.min(255, b));
        data[p + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // 叠加经纬格网与主要水系注记（让离线沙盘也具备完整读图感）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let lng = 98.0; lng <= 100.3; lng += 0.25) {
      const px = ((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * w;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    for (let lat = 24.0; lat <= 25.85; lat += 0.25) {
      const py = ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * h;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    return canvas;
  }

  // ========== 5. Google Maps XYZ 瓦片精准重投影拼图加载器 ==========
  /**
   * 计算精准的瓦片覆盖窗口与单像素墨卡托重投影参数：
   * 返回 { zoom, xMin, xMax, yMin, yMax, count } 以便离线与在线测试校验
   */
  function computeTileCoverage(zoom) {
    const nw = latLngToTileXY(BOUNDS.north, BOUNDS.west, zoom);
    const se = latLngToTileXY(BOUNDS.south, BOUNDS.east, zoom);
    return {
      zoom,
      xMin: nw.x,
      xMax: se.x,
      yMin: nw.y,
      yMax: se.y,
      cols: se.x - nw.x + 1,
      rows: se.y - nw.y + 1,
      count: (se.x - nw.x + 1) * (se.y - nw.y + 1)
    };
  }

  function buildTileUrl(provider, x, y, z) {
    const sub = Math.abs(x + y) % 4;
    if (provider === 'google-sat') {
      return `https://mt${sub}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
    }
    if (provider === 'google-hybrid') {
      return `https://mt${sub}.google.com/vt/lyrs=y&hl=zh-CN&x=${x}&y=${y}&z=${z}`;
    }
    if (provider === 'google-terrain') {
      return `https://mt${sub}.google.com/vt/lyrs=p&hl=zh-CN&x=${x}&y=${y}&z=${z}`;
    }
    if (provider === 'arcgis-sat') {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    }
    return '';
  }

  function loadImageCORS(url, timeoutMs) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs || 5000);

      img.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(img);
        }
      };
      img.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      };
      img.src = url;
    });
  }

  /**
   * 异步请求真实 Google Maps 瓦片并将其精准投影裁剪至 DEM 的 [west..east, south..north] 矩形画布。
   * 若 Google 瓦片被墙/无网/CORS拦截，自动回退 ArcGIS WGS-84 卫星瓦片，若仍失败则返回 ok:false 让调用方安全维持离线沙盘纹理。
   */
  async function loadGoogleMapDrapeCanvas(mode, options) {
    const opts = options || {};
    const zoom = opts.zoom || 10; // Zoom 10: ~8x7 = 56张瓦片覆盖下关→保山→腾冲→畹町全滇西廊道
    const cov = computeTileCoverage(zoom);
    const tileSize = 256;

    const providerOrder =
      mode === 'google-sat'
        ? ['google-sat', 'arcgis-sat']
        : mode === 'google-hybrid'
        ? ['google-hybrid', 'google-sat', 'arcgis-sat']
        : mode === 'google-terrain'
        ? ['google-terrain', 'arcgis-sat']
        : [];

    if (!providerOrder.length) {
      return { ok: false, provider: 'procedural', loaded: 0, total: 0 };
    }

    for (let p = 0; p < providerOrder.length; p++) {
      const provider = providerOrder[p];
      // 先探测中心一张瓦片是否支持 CORS 绘制，避免无网或 CORS 拦截下浪费请求
      const probeX = Math.floor((cov.xMin + cov.xMax) / 2);
      const probeY = Math.floor((cov.yMin + cov.yMax) / 2);
      const probeImg = await loadImageCORS(buildTileUrl(provider, probeX, probeY, zoom), 3800);
      if (!probeImg) continue;

      // 测试 canvas 读取是否被污染 (Tainted Canvas Check)
      const testC = document.createElement('canvas');
      testC.width = 4;
      testC.height = 4;
      const testCtx = testC.getContext('2d');
      try {
        testCtx.drawImage(probeImg, 0, 0, 4, 4);
        testCtx.getImageData(0, 0, 1, 1);
      } catch (e) {
        // 当前环境图像服务器未返还 CORS 允许头，安全跳过此图源避免 WebGL 崩溃
        continue;
      }

      // 并发下载全区瓦片并拼接到墨卡托画布
      const mercCanvas = document.createElement('canvas');
      mercCanvas.width = cov.cols * tileSize;
      mercCanvas.height = cov.rows * tileSize;
      const mCtx = mercCanvas.getContext('2d');

      const tasks = [];
      let loadedCount = 0;
      for (let ty = cov.yMin; ty <= cov.yMax; ty++) {
        for (let tx = cov.xMin; tx <= cov.xMax; tx++) {
          tasks.push(
            (async () => {
              const img =
                tx === probeX && ty === probeY
                  ? probeImg
                  : await loadImageCORS(buildTileUrl(provider, tx, ty, zoom), 5500);
              if (img) {
                mCtx.drawImage(img, (tx - cov.xMin) * tileSize, (ty - cov.yMin) * tileSize, tileSize, tileSize);
                loadedCount++;
              }
            })()
          );
        }
      }
      await Promise.all(tasks);

      if (loadedCount < cov.count * 0.5) continue;

      // 将 Web Mercator 拼图按每条纬度行精确重投影裁剪至 DEM 的等距经纬度矩形 [north..south, west..east]
      const outW = 1792;
      const outH = 1600;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const oCtx = outCanvas.getContext('2d');

      const nTiles = Math.pow(2, zoom);
      const worldPx = nTiles * tileSize;
      const originPxX = cov.xMin * tileSize;
      const originPxY = cov.yMin * tileSize;

      const xWestPx = ((BOUNDS.west + 180) / 360) * worldPx - originPxX;
      const xEastPx = ((BOUNDS.east + 180) / 360) * worldPx - originPxX;
      const srcW = xEastPx - xWestPx;

      // 逐行采样保证纬度 100% 对齐 WebGL PlaneGeometry UV
      for (let py = 0; py < outH; py++) {
        const lat = BOUNDS.north - (py / (outH - 1)) * (BOUNDS.north - BOUNDS.south);
        const my = latToMercatorY(lat);
        const tileNormY = (1 - my / Math.PI) / 2;
        const srcY = Math.max(0, Math.min(mercCanvas.height - 1.01, tileNormY * worldPx - originPxY));
        oCtx.drawImage(mercCanvas, xWestPx, srcY, srcW, 1, 0, py, outW, 1);
      }

      return {
        ok: true,
        provider,
        canvas: outCanvas,
        loaded: loadedCount,
        total: cov.count
      };
    }

    return { ok: false, provider: 'procedural', loaded: 0, total: cov.count };
  }

  global.BURMA_DEM = {
    BOUNDS,
    KM_PER_DEG_LAT,
    KM_PER_DEG_LNG,
    WORLD_WIDTH,
    WORLD_DEPTH,
    ELEV_BASE,
    WORLD_Y_PER_METER,
    GRID_COLS,
    GRID_ROWS,
    demGrid,
    wgs84ToGcj02,
    latLngToWorldXZ,
    worldXZToLatLng,
    latLngToUV,
    latToMercatorY,
    mercatorYToLat,
    latLngToTileXY,
    tileXYToLatLng,
    computeTileCoverage,
    sampleElevation,
    elevationToWorldY,
    latLngToWorld,
    generateProceduralTopoCanvas,
    loadGoogleMapDrapeCanvas
  };
})(window);
