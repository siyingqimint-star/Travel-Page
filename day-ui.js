/* eslint-env browser */
/* 行程总览改版：日期条 + 每日卡片（天气/穿衣防晒/照片/酒店行程单）+ 酒店详情弹窗 */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  const WEATHER_CITIES = [
    { from: "2026-09-24", to: "2026-09-27", name: "深圳", lat: 22.5431, lng: 114.0579 },
    { from: "2026-09-28", to: "2026-09-28", name: "新加坡", lat: 1.3521, lng: 103.8198 },
    { from: "2026-09-29", to: "2026-10-04", name: "巴厘岛", lat: -8.4095, lng: 115.1889 },
    { from: "2026-10-05", to: "2026-10-08", name: "深圳", lat: 22.5431, lng: 114.0579 }
  ];

  const WMO_CODES = {
    0: ["晴", "☀️"], 1: ["大致晴朗", "🌤️"], 2: ["多云", "⛅"], 3: ["阴", "☁️"],
    45: ["雾", "🌫️"], 48: ["雾凇", "🌫️"],
    51: ["毛毛雨", "🌦️"], 53: ["毛毛雨", "🌦️"], 55: ["大毛毛雨", "🌦️"],
    61: ["小雨", "🌦️"], 63: ["中雨", "🌧️"], 65: ["大雨", "🌧️"],
    66: ["冻雨", "🌧️"], 67: ["冻雨", "🌧️"],
    71: ["小雪", "🌨️"], 73: ["中雪", "❄️"], 75: ["大雪", "❄️"], 77: ["雪粒", "🌨️"],
    80: ["小阵雨", "🌦️"], 81: ["阵雨", "🌧️"], 82: ["强阵雨", "⛈️"],
    85: ["小阵雪", "🌨️"], 86: ["阵雪", "❄️"],
    95: ["雷阵雨", "⛈️"], 96: ["雷阵雨伴冰雹", "⛈️"], 99: ["强雷阵雨伴冰雹", "⛈️"]
  };

  /* 景点照片：按行程文字关键词匹配，展示在对应日期卡片内
     PHOTOS_ENABLED=false 时隐藏照片区（等待用户提供图片后置 true） */
  const PHOTOS_ENABLED = false;
  const PHOTO_MATCHES = [
    { file: "concert", terms: ["邓紫棋", "演唱会"], label: "演唱会现场" },
    { file: "steamboat", terms: ["舟市蒸汽海鲜自助"], label: "蒸汽海鲜自助" },
    { file: "kaya-toast", terms: ["亚坤"], label: "亚坤咖椰吐司" },
    { file: "tree-tunnel", terms: ["富康宁", "树洞"], label: "富康宁树洞" },
    { file: "police-station", terms: ["旧禧街警察局"], label: "旧禧街警察局" },
    { file: "bak-kut-teh", terms: ["松发肉骨茶"], label: "松发肉骨茶" },
    { file: "merlion", terms: ["鱼尾狮"], label: "鱼尾狮公园" },
    { file: "gallery", terms: ["国家美术馆"], label: "国家美术馆" },
    { file: "chili-crab", terms: ["珍宝海鲜"], label: "珍宝海鲜" },
    { file: "jewel", terms: ["星耀樟宜"], label: "星耀樟宜" },
    { file: "bali-waterfall", terms: ["Tukad Cepung", "瀑布"], label: "Tukad Cepung 瀑布" },
    { file: "ubud-market", terms: ["艺术集市"], label: "乌布艺术集市" },
    { file: "uluwatu", terms: ["情人崖"], label: "乌鲁瓦图情人崖" },
    { file: "beach-club", terms: ["White Rock"], label: "White Rock Beach Club" },
    { file: "resort-pool", terms: ["H2O", "无边泳池"], label: "H2O 网红无边泳池" },
    { file: "sunset-bar", terms: ["岩石酒吧"], label: "岩石酒吧日落" }
  ];

  const TYPE_ICONS = {
    flight: "✈️", attraction: "📍", restaurant: "🍽️", drive: "🚗", transfer: "🚐",
    train: "🚇", walk: "🚶", hike: "🥾", "check-in": "🛎️", "check-out": "🧳",
    return: "🏠", rest: "😴", note: "📌"
  };

  let tripData = null;
  const weatherCache = new Map(); // cityName -> {byDate: Map}

  function todayString() {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  }

  function cityFor(dateStr) {
    return WEATHER_CITIES.find((c) => dateStr >= c.from && dateStr <= c.to) || null;
  }

  function weatherCityForTrip(cityName) {
    return WEATHER_CITIES.find((c) => c.name === cityName);
  }

  function dayLabel(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    return { monthDay: `${d.getMonth() + 1}/${d.getDate()}`, weekday: `周${WEEKDAYS[d.getDay()]}`, long: `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}` };
  }

  function photosForDay(day) {
    const texts = (day.schedule || []).map((item) => String(item.text || ""));
    const seen = new Set();
    const result = [];
    for (const photo of PHOTO_MATCHES) {
      if (seen.has(photo.file)) continue;
      const hit = texts.find((text) => photo.terms.some((term) => text.includes(term)));
      if (hit) {
        seen.add(photo.file);
        result.push(photo);
      }
    }
    return result;
  }

  function accommodationsForDay(day) {
    return (tripData.accommodations || []).filter(
      (acc) => acc.checkIn === day.date && acc.id && !acc.id.startsWith("acc-home")
    );
  }

  /* ---------- 天气 ---------- */
  async function loadCityWeather(cityName) {
    if (weatherCache.has(cityName)) return weatherCache.get(cityName);
    const city = weatherCityForTrip(cityName);
    if (!city) return null;
    const params = new URLSearchParams({
      latitude: city.lat, longitude: city.lng,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max",
      timezone: "auto", past_days: "1", forecast_days: "16"
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const data = await fetch(url).then((r) => { if (!r.ok) throw new Error(`weather http ${r.status}`); return r.json(); });
    const byDate = new Map();
    const daily = data.daily || {};
    (daily.time || []).forEach((date, index) => {
      byDate.set(date, {
        code: daily.weather_code?.[index],
        max: daily.temperature_2m_max?.[index],
        min: daily.temperature_2m_min?.[index],
        rain: daily.precipitation_probability_max?.[index],
        uv: daily.uv_index_max?.[index]
      });
    });
    const record = { byDate, fetchedAt: Date.now() };
    weatherCache.set(cityName, record);
    return record;
  }

  function clothingAdvice(weather) {
    if (!weather || weather.max == null) {
      return { clothes: "预报暂未覆盖 · 出发前请再确认当地气温", sun: "热带/亚热带地区建议常备防晒" };
    }
    const max = weather.max, min = weather.min, rain = weather.rain ?? 0, uv = weather.uv ?? 0;
    let clothes;
    if (max >= 30) clothes = "炎热：短袖轻薄透气，防暑补水";
    else if (max >= 26) clothes = "温暖：短袖/薄衬衫即可";
    else if (max >= 20) clothes = "舒适：短袖+薄外套（早晚温差）";
    else if (max >= 14) clothes = "微凉：长袖+外套";
    else clothes = "偏冷：厚外套/毛衣，注意保暖";
    let sun;
    if (uv >= 8) sun = "紫外线很强：SPF50+防晒霜、帽子、墨镜";
    else if (uv >= 6) sun = "紫外线强：注意防晒补涂";
    else if (uv >= 3) sun = "紫外线中等：基础防晒即可";
    else sun = "紫外线较弱：无需特别防晒";
    if (rain >= 60) clothes += "；降雨概率高，务必带伞";
    else if (rain >= 35) clothes += "；可能有阵雨，备折叠伞";
    return { clothes, sun };
  }

  function weatherCardHtml(day, weather) {
    const { clothes, sun } = clothingAdvice(weather);
    if (!weather) {
      return `<div class="day-card__weather is-pending" data-weather-date="${day.date}">
        <span class="day-card__weather-emoji">🌤️</span>
        <div class="day-card__weather-main"><b>天气预报获取中…</b><p>${escapeHtml(clothes)}</p></div>
      </div>`;
    }
    const [desc, emoji] = WMO_CODES[weather.code] || ["—", "🌡️"];
    return `<div class="day-card__weather" data-weather-date="${day.date}">
      <span class="day-card__weather-emoji" aria-hidden="true">${emoji}</span>
      <div class="day-card__weather-main">
        <b>${escapeHtml(desc)} · ${Math.round(weather.min)}° ~ ${Math.round(weather.max)}°C</b>
        <p>☂️ 降水概率 ${weather.rain ?? "—"}% · ☀️ 紫外线 ${weather.uv != null ? (Math.round(weather.uv * 10) / 10) : "—"}</p>
        <p>👕 ${escapeHtml(clothes)}</p>
        <p>🧴 ${escapeHtml(sun)}</p>
      </div>
    </div>`;
  }

  function weatherFallback(day) {
    const city = cityFor(day.date);
    return weatherCardHtml(day, null) + (city ? "" : "");
  }

  /* ---------- 渲染 ---------- */
  let selectedDay = null; // 当前选中展示的 Day 编号（单日模式）

  function defaultSelectedDay() {
    const today = todayString();
    const days = tripData?.days || [];
    const inTrip = days.find((day) => day.date === today);
    if (inTrip) return inTrip.day;
    return days[0]?.day ?? null;
  }

  function selectDay(dayNumber) {
    selectedDay = dayNumber;
    const strip = $("#day-strip");
    strip?.querySelectorAll("[data-day-target]").forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.dayTarget) === dayNumber);
    });
    const wrap = $("#day-cards");
    wrap?.querySelectorAll(".day-card").forEach((card) => {
      card.classList.toggle("is-selected", Number(card.dataset.day) === dayNumber);
    });
    const active = strip?.querySelector(`[data-day-target="${dayNumber}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  function renderDayStrip() {
    const strip = $("#day-strip");
    if (!strip || !tripData) return;
    const today = todayString();
    strip.innerHTML = (tripData.days || []).map((day) => {
      const label = dayLabel(day.date);
      const isToday = day.date === today;
      return `<button type="button" class="day-strip__item${isToday ? " is-today" : ""}" data-day-target="${day.day}" aria-label="查看 ${escapeHtml(label.long)} 行程">
        <span class="day-strip__month">${label.monthDay.split("/")[0]}月</span>
        <b>${label.monthDay.split("/")[1]}</b>
        <span>${label.weekday}</span>
        ${isToday ? '<i class="day-strip__dot" aria-hidden="true"></i>' : ""}
      </button>`;
    }).join("");
    strip.addEventListener("click", (event) => {
      const button = event.target.closest("[data-day-target]");
      if (!button) return;
      selectDay(Number(button.dataset.dayTarget));
    });
  }

  function mapLinksForText(text) {
    const places = tripData?.places || [];
    const lower = String(text).toLocaleLowerCase();
    const matched = places
      .filter((place) => [place.name, place.nameZh].filter(Boolean).some((name) => lower.includes(String(name).toLocaleLowerCase())))
      .slice(0, 2);
    return matched.map((place) => {
      const label = place.nameZh || place.name;
      const query = place.address || `${place.name}${place.cityOrArea ? `, ${place.cityOrArea}` : ""}`;
      return `<button type="button" class="schedule-map-link" data-map-query="${escapeHtml(query)}" data-map-url="" data-map-label="${escapeHtml(label)}" aria-haspopup="dialog" aria-controls="place-map" aria-label="查看 ${escapeHtml(label)} 的地图">📍 ${escapeHtml(label)}</button>`;
    }).join("");
  }

  /* ---------- 单日真实方位路线图 ----------
     用 map.places 的经纬度做等距投影，方位与相对距离真实；
     点之间画箭头连线并编号，长距离段（>3km）用虚线并标注公里数。 */
  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* 把路线按距离断层切成若干「片区」：相邻两点 >5km 时另起一张小图，
     避免长车程把市区密集点压成一团（例如市区 8 个点 + 18km 外的樟宜机场）。 */
  function splitRouteClusters(nodes) {
    const clusters = [];
    let current = [nodes[0]];
    for (let i = 1; i < nodes.length; i += 1) {
      const km = haversineKm(nodes[i - 1].geo, nodes[i].geo);
      if (km > 5) {
        current.jumpKm = km;
        current.jumpTo = nodes[i];
        clusters.push(current);
        current = [nodes[i]];
      } else {
        current.push(nodes[i]);
      }
    }
    clusters.push(current);
    return clusters;
  }

  function renderClusterSvg(cluster, startIndex, totalCount) {
    const W = 620;
    const single = cluster.length === 1;
    const H = single ? 108 : 400;
    const PAD = single ? 40 : 74;

    if (single) {
      const only = cluster[0];
      const no = startIndex + 1;
      const isEnd = no === totalCount;
      return `
        <svg viewBox="0 0 ${W} ${H}" class="day-card__map-svg" role="img" aria-label="${escapeHtml(only.name)}">
          <circle cx="60" cy="54" r="15" fill="${isEnd ? "#b65c3a" : "#6f9e58"}" stroke="#fff" stroke-width="2.8"/>
          <text x="60" y="59.5" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">${no}</text>
          ${isEnd ? '<text x="60" y="30" text-anchor="middle" font-size="10.5" font-weight="700" fill="#b65c3a">END</text>' : ""}
          <text x="86" y="60" font-size="14.5" font-weight="700" fill="#13262f">${no}. ${escapeHtml(only.name)}</text>
        </svg>`;
    }

    const lats = cluster.map((n) => n.geo.lat);
    const lngs = cluster.map((n) => n.geo.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const kx = Math.cos((midLat * Math.PI) / 180);
    const xsRaw = lngs.map((lng) => lng * kx);
    const ysRaw = lats.map((lat) => -lat);
    const spanX = Math.max(...xsRaw) - Math.min(...xsRaw) || 1e-6;
    const spanY = Math.max(...ysRaw) - Math.min(...ysRaw) || 1e-6;
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const offsetX = (W - spanX * scale) / 2 - Math.min(...xsRaw) * scale;
    const offsetY = (H - spanY * scale) / 2 - Math.min(...ysRaw) * scale;

    const coords = cluster.map((node, index) => ({
      ...node,
      px: xsRaw[index] * scale + offsetX,
      py: ysRaw[index] * scale + offsetY
    }));

    // 连线：颜色从浅到深表示行进方向，中点画箭头三角，旁边标距离
    const segments = coords.slice(1).map((point, index) => {
      const prev = coords[index];
      const km = haversineKm(prev.geo, point.geo);
      const mx = (prev.px + point.px) / 2;
      const my = (prev.py + point.py) / 2;
      const ratio = coords.length > 2 ? index / (coords.length - 2) : 0;
      const shade = ["#bcd6a8", "#a6c98d", "#8fbc73", "#79ae5c", "#63a047", "#519138", "#42822c"];
      const color = shade[Math.round(ratio * (shade.length - 1))];
      const angle = (Math.atan2(point.py - prev.py, point.px - prev.px) * 180) / Math.PI;
      return `<line x1="${prev.px.toFixed(1)}" y1="${prev.py.toFixed(1)}" x2="${point.px.toFixed(1)}" y2="${point.py.toFixed(1)}"
        stroke="${color}" stroke-width="3.4" stroke-linecap="round" opacity=".95"/>
        <g transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${angle.toFixed(1)})">
          <path d="M-5 -5 L6 0 L-5 5 z" fill="${color}" stroke="#fbfdf9" stroke-width="1"/>
        </g>
        <text x="${mx.toFixed(1)}" y="${(my - 11).toFixed(1)}" text-anchor="middle" font-size="10" fill="#4c7a38" font-weight="600"
          stroke="#fbfdf9" stroke-width="3" paint-order="stroke fill">${km < 1 ? Math.round(km * 1000) + "m" : km.toFixed(1) + "km"}</text>`;
    }).join("");

    /* 标签防重叠：为每个点在 8 个候选方位里挑一个与已放置标签冲突最小的位置 */
    const LABEL_H = 15;
    const placed = [];
    const CANDIDATES = [
      { dx: 18, dy: 4.5, anchor: "start" },
      { dx: -18, dy: 4.5, anchor: "end" },
      { dx: 18, dy: -12, anchor: "start" },
      { dx: -18, dy: -12, anchor: "end" },
      { dx: 18, dy: 20, anchor: "start" },
      { dx: -18, dy: 20, anchor: "end" },
      { dx: 0, dy: -20, anchor: "middle" },
      { dx: 0, dy: 28, anchor: "middle" }
    ];
    const markers = coords.map((point, index) => {
      const globalNo = startIndex + index + 1;
      const isFirstOverall = globalNo === 1;
      const isLastOverall = globalNo === totalCount;
      const fill = isFirstOverall ? "#287b90" : isLastOverall ? "#b65c3a" : "#6f9e58";
      const label = `${point.name}${point.repeat ? "（往返）" : ""}`;
      const textW = label.replace(/[^\x00-\xff]/g, "aa").length * 6.2;

      let best = null;
      for (const cand of CANDIDATES) {
        const tx = point.px + cand.dx;
        const ty = point.py + cand.dy;
        const left = cand.anchor === "start" ? tx : cand.anchor === "end" ? tx - textW : tx - textW / 2;
        const box = { x1: left, y1: ty - LABEL_H, x2: left + textW, y2: ty + 4 };
        // 超出画布边界的候选直接跳过
        if (box.x1 < 4 || box.x2 > W - 4 || box.y1 < 14 || box.y2 > H - 8) continue;
        let overlap = 0;
        for (const prev of placed) {
          const ox = Math.max(0, Math.min(box.x2, prev.x2) - Math.max(box.x1, prev.x1));
          const oy = Math.max(0, Math.min(box.y2, prev.y2) - Math.max(box.y1, prev.y1));
          overlap += ox * oy;
        }
        // 标签也不要压到其他圆点
        for (const other of coords) {
          if (other === point) continue;
          if (other.px > box.x1 - 10 && other.px < box.x2 + 10 && other.py > box.y1 - 10 && other.py < box.y2 + 10) overlap += 400;
        }
        if (!best || overlap < best.overlap) best = { ...cand, tx, ty, box, overlap };
        if (overlap === 0) break;
      }
      const pick = best || { tx: point.px + 18, ty: point.py + 4.5, anchor: "start", box: { x1: 0, y1: 0, x2: 0, y2: 0 } };
      placed.push(pick.box);

      const r = isFirstOverall || isLastOverall ? 15 : 13;
      const badge = isFirstOverall
        ? `<text x="${point.px.toFixed(1)}" y="${(point.py - r - 7).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#287b90" stroke="#fbfdf9" stroke-width="3" paint-order="stroke fill">START</text>`
        : isLastOverall
          ? `<text x="${point.px.toFixed(1)}" y="${(point.py - r - 7).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#b65c3a" stroke="#fbfdf9" stroke-width="3" paint-order="stroke fill">END</text>`
          : "";
      return `
        ${isFirstOverall ? `<circle cx="${point.px.toFixed(1)}" cy="${point.py.toFixed(1)}" r="${r + 5}" fill="none" stroke="#287b90" stroke-width="1.6" opacity=".45"/>` : ""}
        <circle cx="${point.px.toFixed(1)}" cy="${point.py.toFixed(1)}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="2.8"/>
        <text x="${point.px.toFixed(1)}" y="${(point.py + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">${globalNo}</text>
        ${badge}
        <text x="${pick.tx.toFixed(1)}" y="${pick.ty.toFixed(1)}" text-anchor="${pick.anchor}" font-size="12.5" font-weight="700" fill="#13262f"
          stroke="#fbfdf9" stroke-width="3.5" paint-order="stroke fill">${globalNo}. ${escapeHtml(label)}</text>`;
    }).join("");

    return `
      <svg viewBox="0 0 ${W} ${H}" class="day-card__map-svg" role="img" aria-label="路线图">
        <g>${segments}</g>
        <g>${markers}</g>
        <text x="${W - 12}" y="20" text-anchor="end" font-size="11" fill="#8a9a92">↑ 北</text>
      </svg>`;
  }

  function dayRouteMapSvg(day) {
    const daily = (tripData?.map?.dailyRoutes || []).find((route) => route.day === day.day);
    const ids = daily?.placeIds || [];
    const catalog = tripData?.map?.places || [];
    const pts = ids.map((id) => catalog.find((place) => place.id === id)).filter((place) => place?.geo);
    if (pts.length < 2) return "";

    // 去掉连续重复点（如乌布当天首尾都是同一酒店）
    const nodes = [];
    pts.forEach((place) => {
      const last = nodes[nodes.length - 1];
      if (!last || last.id !== place.id) nodes.push({ ...place });
      else last.repeat = true;
    });
    if (nodes.length < 2) return "";

    const clusters = splitRouteClusters(nodes);
    let cursor = 0;
    const blocks = clusters.map((cluster) => {
      const svg = renderClusterSvg(cluster, cursor, nodes.length);
      cursor += cluster.length;
      const jump = cluster.jumpKm
        ? `<p class="day-card__map-jump">🚗 车程约 ${Math.round(cluster.jumpKm)} km → ${escapeHtml(cluster.jumpTo?.name || "")}</p>`
        : "";
      return svg + jump;
    }).join("");

    return `
      <div class="day-card__map">
        <p class="day-card__map-title">🗺️ 当天路线图 · 按 ①②③ 数字顺序走</p>
        <svg width="0" height="0" style="position:absolute">
          <defs>
            <marker id="dayArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
              <path d="M0 1.5 L9 5 L0 8.5 z" fill="#4c5f52"/>
            </marker>
          </defs>
        </svg>
        ${blocks}
        <p class="day-card__map-note">按数字 1 → 2 → 3 顺序走 · 蓝圈 START 是出发点 · 橙色 END 是终点 · 箭头指示方向、颜色由浅到深</p>
      </div>`;
  }

  function ticketsForDay(day) {
    return (tripData?.ticketPlanning?.items || []).filter((ticket) => ticket.day === day.day);
  }

  function ticketRowForDay(day) {
    const tickets = ticketsForDay(day);
    if (!tickets.length) return "";
    return tickets.map((ticket) => `
      <div class="day-card__ticket">
        <span class="day-card__ticket-status">🎟️ ${escapeHtml(ticket.purchaseStatus === "purchased" ? "已购票" : "门票")}</span>
        <b>${escapeHtml(ticket.name || "门票详情")}</b>
        <button type="button" class="schedule-ticket__open" data-ticket-open="${escapeHtml(ticket.id)}" aria-haspopup="dialog" aria-controls="ticket-dialog">查看</button>
      </div>`).join("");
  }

  // 当天路线顺序条：从 map.dailyRoutes 取该日地点序列，横向展示「①酒店 → ②亚坤 → …」
  function routeStripForDay(day) {
    const daily = (tripData?.map?.dailyRoutes || []).find((route) => route.day === day.day);
    const ids = daily?.placeIds || [];
    if (ids.length < 2) return "";
    const mapPlaces = tripData?.map?.places || [];
    const names = ids
      .map((id) => mapPlaces.find((place) => place.id === id))
      .filter(Boolean)
      .map((place) => place.name);
    if (names.length < 2) return "";
    return `
      <div class="day-card__route" aria-label="当天路线顺序">
        <p class="day-card__route-title">🧭 当天路线（按顺序，不走回头路）</p>
        <ol class="day-card__route-list">
          ${names.map((name, index) => `<li><i>${index + 1}</i><span>${escapeHtml(name)}</span></li>`).join("")}
        </ol>
      </div>`;
  }

  function renderDayCards() {
    const wrap = $("#day-cards");
    if (!wrap || !tripData) return;
    const today = todayString();
    wrap.innerHTML = (tripData.days || []).map((day) => {
      const label = dayLabel(day.date);
      const isToday = day.date === today;
      const city = cityFor(day.date);
      const photos = photosForDay(day);
      const hotels = accommodationsForDay(day);
      const schedule = (day.schedule || []).map((item) => {
        const mapLinks = mapLinksForText(item.text);
        return `
        <li class="day-card__item">
          <span class="day-card__time">${escapeHtml(item.time || "全天")}</span>
          <span class="day-card__icon" aria-hidden="true">${TYPE_ICONS[item.type] || "📌"}</span>
          <div class="day-card__content">
            <p class="day-card__text">${escapeHtml(item.text)}</p>
            ${mapLinks ? `<div class="day-card__maplinks">${mapLinks}</div>` : ""}
          </div>
        </li>`;
      }).join("");
      const photoGrid = (PHOTOS_ENABLED && photos.length) ? `
        <div class="day-card__photos">
          ${photos.map((p) => `<figure class="day-card__photo"><img src="assets/trip/photos/${p.file}.jpg" alt="${escapeHtml(p.label)}" loading="lazy"><figcaption>${escapeHtml(p.label)}</figcaption></figure>`).join("")}
        </div>` : "";
      const hotelCards = hotels.length ? hotels.map((acc, index) => `
        <button type="button" class="hotel-card" data-hotel-index="${(tripData.accommodations || []).indexOf(acc)}">
          <span class="hotel-card__icon" aria-hidden="true">🛏️</span>
          <span class="hotel-card__body">
            <b>${escapeHtml((acc.name || "").split("（")[0])}</b>
            <span>${escapeHtml(acc.cityOrArea || "")} · ${escapeHtml(acc.checkIn)} 入住${index > 0 ? "（同日转场）" : ""}</span>
          </span>
          <span class="hotel-card__arrow" aria-hidden="true">›</span>
        </button>`).join("") : "";
      return `
      <article class="day-card${isToday ? " is-today" : ""}" data-day="${day.day}" id="day-card-${day.day}">
        <header class="day-card__header">
          <div>
            <p class="day-card__kicker">DAY ${String(day.day).padStart(2, "0")}${isToday ? " · 今天" : ""}</p>
            <h3>${escapeHtml(label.long)}</h3>
            <p class="day-card__title">${escapeHtml(day.title || "")}</p>
          </div>
          ${city ? `<span class="day-card__city">${escapeHtml(city.name)}</span>` : ""}
        </header>
        ${weatherFallback(day)}
        ${routeStripForDay(day)}
        ${dayRouteMapSvg(day)}
        <ol class="day-card__schedule">${schedule}</ol>
        ${ticketRowForDay(day)}
        ${photoGrid}
        ${hotelCards ? `<div class="day-card__hotels">${hotelCards}</div>` : ""}
      </article>`;
    }).join("");
  }

  async function fillWeather() {
    const pending = document.querySelectorAll(".day-card__weather.is-pending");
    if (!pending.length || !tripData) return;
    const results = await Promise.allSettled(WEATHER_CITIES.map((c) => loadCityWeather(c.name)));
    for (const day of tripData.days || []) {
      const slot = $(`[data-weather-date="${day.date}"]`);
      if (!slot || !slot.classList.contains("is-pending")) continue;
      const city = cityFor(day.date);
      if (!city) continue;
      const record = weatherCache.get(city.name);
      const weather = record?.byDate?.get(day.date);
      const outer = slot.parentElement;
      if (weather && (weather.max != null)) {
        slot.outerHTML = weatherCardHtml(day, weather);
      } else {
        slot.innerHTML = `<span class="day-card__weather-emoji">🌤️</span>
          <div class="day-card__weather-main"><b>预报暂未覆盖该日期</b><p>${escapeHtml(clothingAdvice(null).clothes)}</p></div>`;
        slot.classList.remove("is-pending");
      }
      void outer;
    }
  }

  /* ---------- 酒店弹窗 ---------- */
  function openHotelDialog(index) {
    const acc = (tripData.accommodations || [])[index];
    if (!acc) return;
    const dialog = $("#hotel-dialog");
    if (!dialog) return;
    const nights = acc.checkIn && acc.checkOut
      ? Math.max(1, Math.round((new Date(acc.checkOut) - new Date(acc.checkIn)) / 86400000))
      : 1;
    const rows = [
      ["房型", acc.roomType],
      ["确认号", acc.confirmNo],
      ["早餐", acc.breakfast],
      ["酒店电话", acc.phone],
      ["入住提醒", acc.reminder],
      ["费用", acc.priceNote],
      ["备注", acc.notice]
    ].filter(([, value]) => value);
    $("#hotel-dialog-body").innerHTML = `
      <p class="hotel-dialog__date">${escapeHtml(acc.checkIn)} – ${escapeHtml(acc.checkOut)} · ${nights}晚</p>
      <h2>${escapeHtml((acc.name || "").split("（")[0])}</h2>
      <p class="hotel-dialog__en">${escapeHtml(acc.nameEn || "")}</p>
      <div class="hotel-dialog__block">
        <p class="hotel-dialog__label">位置</p>
        <p class="hotel-dialog__area">${escapeHtml(acc.cityOrArea || "")}</p>
        <p class="hotel-dialog__address">${escapeHtml(acc.address || "")}</p>
        ${acc.mapQuery ? `<a class="hotel-dialog__nav" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(acc.mapQuery)}">地图导航 <span aria-hidden="true">↗</span></a>` : ""}
      </div>
      <div class="hotel-dialog__block">
        ${rows.map(([label, value]) => `<p class="hotel-dialog__label">${escapeHtml(label)}</p><p class="hotel-dialog__value">${escapeHtml(value)}</p>`).join("")}
      </div>`;
    dialog.showModal();
  }

  function bindHotelCards() {
    const wrap = $("#day-cards");
    if (!wrap) return;
    wrap.addEventListener("click", (event) => {
      const card = event.target.closest(".hotel-card");
      if (!card) return;
      openHotelDialog(Number(card.dataset.hotelIndex));
    });
    const dialog = $("#hotel-dialog");
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest("#hotel-dialog-close")) dialog.close();
    });
  }

  /* ---------- 启动 ---------- */
  async function load() {
    try {
      tripData = await fetch("trip-data.json").then((r) => r.json());
    } catch {
      return;
    }
    if (!tripData?.days?.length) return;
    renderDayStrip();
    renderDayCards();
    bindHotelCards();
    selectDay(defaultSelectedDay());
    $("#timeline")?.setAttribute("hidden", "");
    fillWeather().catch(() => {});
    // 预报范围滚动：每天刷新一次天气
    setInterval(() => { weatherCache.clear(); fillWeather().catch(() => {}); }, 30 * 60 * 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
