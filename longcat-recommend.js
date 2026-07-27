// ====================================================================
//  LongCat 智能推荐引擎
//  根据天气 + 用户状态 + 听歌历史生成个性化推荐
// ====================================================================
const { spawn } = require('child_process');
const path = require('path');

const HERMES_CLI = '/home/atios/.local/bin/hermes';
const TIMEOUT_MS = 30000;

// 调用 LongCat (通过 hermes CLI)
function callLongCat(prompt, maxTokens = 512) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const proc = spawn(HERMES_CLI, ['-z', prompt], {
      timeout: TIMEOUT_MS,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      if (code !== 0) {
        console.error(`[LongCat] 退出码 ${code}, 耗时 ${elapsed}ms`);
        if (stderr) console.error('[LongCat stderr]', stderr.slice(0, 200));
        reject(new Error(`LongCat 调用失败 (exit ${code})`));
        return;
      }
      const result = stdout.trim();
      if (!result) {
        reject(new Error('LongCat 返回空结果'));
        return;
      }
      console.log(`[LongCat] 完成, 耗时 ${elapsed}ms, 输出 ${result.length} 字`);
      resolve(result);
    });

    proc.on('error', (err) => {
      console.error('[LongCat] 进程错误:', err.message);
      reject(err);
    });
  });
}

// 从 LongCat 输出中解析 JSON
function parseJSON(text) {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {}

  // 尝试从 markdown code block 中提取
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch {}
  }

  // 尝试找到第一个 { 到最后一个 }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  return null;
}

// 生成智能推荐
async function generateSmartRecommend(weather, userState = {}) {
  const {
    temperature = 25,
    humidity = 50,
    weatherLabel = '晴',
    weatherCode = 0,
    cloudCover = 0,
    windSpeed = 0,
    isDay = true,
    time = '12:00',
    mood: weatherMood = {},
  } = weather;

  const {
    recentSongs = [],
    listenCount = 0,
    favoriteGenres = [],
    userName = '听众',
  } = userState;

  const recentSongText = recentSongs.length > 0
    ? recentSongs.slice(0, 10).map((s, i) => `${i + 1}. ${s.name} - ${s.artist}`).join('\n')
    : '暂无听歌记录';

  const prompt = `你是一个音乐推荐引擎。根据以下信息生成个性化推荐：

## 当前环境
- 天气: ${weatherLabel}
- 温度: ${temperature}°C
- 湿度: ${humidity}%
- 云量: ${cloudCover}%
- 风速: ${windSpeed} km/h
- 时间: ${time}
- 昼夜: ${isDay ? '白天' : '夜晚'}

## 用户画像
- 用户名: ${userName}
- 累计听歌: ${listenCount} 首
- 偏好风格: ${favoriteGenres.length > 0 ? favoriteGenres.join('、') : '未知'}

## 最近听歌
${recentSongText}

## 任务
1. 分析当前环境对情绪的影响（闷热？清爽？寒冷？）
2. 结合用户听歌历史和偏好
3. 生成 3-5 个搜索关键词（中文或英文）
4. 写一段 50-100 字的推荐理由，要有温度和个性

## 输出格式 (JSON only, no markdown)
{
  "mood_analysis": "一句话分析当前环境情绪",
  "energy": 0.0-1.0,
  "warmth": 0.0-1.0,
  "focus": 0.0-1.0,
  "melancholy": 0.0-1.0,
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "recommendation": "推荐理由文字，50-100字"
}

只输出 JSON，不要其他内容。`;

  try {
    const raw = await callLongCat(prompt, 512);
    const parsed = parseJSON(raw);

    if (!parsed) {
      console.warn('[Recommend] JSON 解析失败，使用 fallback');
      return generateFallbackRecommend(weather);
    }

    return {
      source: 'longcat',
      mood_analysis: parsed.mood_analysis || '环境分析中...',
      energy: parsed.energy ?? 0.5,
      warmth: parsed.warmth ?? 0.5,
      focus: parsed.focus ?? 0.5,
      melancholy: parsed.melancholy ?? 0.3,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : ['流行', '热门'],
      recommendation: parsed.recommendation || '为你推荐这些歌曲',
      raw_output: raw.length < 500 ? raw : undefined,
    };
  } catch (err) {
    console.error('[Recommend] LongCat 调用失败:', err.message);
    return generateFallbackRecommend(weather);
  }
}

// Fallback 推荐（当 LongCat 不可用时）
function generateFallbackRecommend(weather) {
  const { temperature = 25, humidity = 50, isDay = true } = weather;

  let mood = 'neutral';
  let keywords = ['流行', '热门'];
  let recommendation = '为你推荐当下热门音乐';

  if (temperature > 30 && humidity > 70) {
    mood = 'humid-hot';
    keywords = ['夏日 chill', '空调房 R&B', '清凉 pop'];
    recommendation = '闷热天气，来点清凉的音乐降降温';
  } else if (temperature < 10) {
    mood = 'cold';
    keywords = ['温暖 acoustic', '热咖啡 jazz', '冬日 pop'];
    recommendation = '寒冷天气，温暖的音乐陪你度过';
  } else if (!isDay) {
    mood = 'night';
    keywords = ['夜晚 R&B', 'late night jazz', 'lofi sleep'];
    recommendation = '夜深了，让音乐伴你放松';
  } else if (temperature > 20 && temperature < 28 && humidity < 60) {
    mood = 'pleasant';
    keywords = ['轻松 pop', '阳光 indie', '愉悦 folk'];
    recommendation = '舒适的好天气，配上好心情的音乐';
  }

  return {
    source: 'fallback',
    mood_analysis: `当前温度 ${temperature}°C，湿度 ${humidity}%`,
    energy: mood === 'pleasant' ? 0.7 : 0.4,
    warmth: mood === 'cold' ? 0.8 : 0.5,
    focus: mood === 'night' ? 0.6 : 0.5,
    melancholy: mood === 'night' ? 0.5 : 0.2,
    keywords,
    recommendation,
  };
}

module.exports = {
  generateSmartRecommend,
  generateFallbackRecommend,
  callLongCat,
};
