// ====================================================================
//  LongCat AI 客户端 — 共享模块
//  所有 AI 模块共用：进程调用 + JSON 解析 + 缓存 + 限流
// ====================================================================
const { spawn } = require('child_process');

const HERMES_CLI = process.env.HERMES_CLI || '/home/atios/.local/bin/hermes';
const TIMEOUT_MS = 45000;

// ========== 缓存 ==========
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
  // 清理过期缓存
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.time > CACHE_TTL) cache.delete(k);
    }
  }
}

// ========== 并发控制 ==========
const inflight = new Map();

function getInflight(key) {
  return inflight.get(key);
}

function setInflight(key, promise) {
  inflight.set(key, promise);
  promise.finally(() => {
    // 延迟清理，让后续相同请求能拿到缓存
    setTimeout(() => inflight.delete(key), 100);
  });
}

// ========== 调用 LongCat ==========
function callLongCat(prompt, maxTokens = 512, label = 'AI') {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const proc = spawn(HERMES_CLI, ['-z', prompt], {
      timeout: TIMEOUT_MS,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      if (code !== 0) {
        if (stderr) console.error(`[${label}] stderr:`, stderr.slice(0, 200));
        reject(new Error(`LongCat 调用失败 (exit ${code}, ${elapsed}ms)`));
        return;
      }
      const result = stdout.trim();
      if (!result) { reject(new Error('LongCat 返回空结果')); return; }
      resolve(result);
    });

    proc.on('error', (err) => {
      console.error(`[${label}] 进程错误:`, err.message);
      reject(err);
    });
  });
}

// ========== 带缓存和并发控制的调用 ==========
async function callLongCatCached(cacheKey, prompt, maxTokens, label) {
  // 检查缓存
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 检查是否有正在进行的相同请求
  const existing = getInflight(cacheKey);
  if (existing) return existing;

    // 发起新请求
  const promise = callLongCat(prompt, maxTokens, label)
    .then(result => {
      setCache(cacheKey, result);
      return result;
    })
    .catch(err => {
      // 失败时不缓存，直接抛出
      throw err;
    });

  setInflight(cacheKey, promise);
  return promise;
}

// ========== JSON 解析 ==========
function parseJSON(text) {
  if (!text) return null;
  // 尝试直接解析
  try { return JSON.parse(text); } catch {}
  // 尝试从 markdown code block 中提取
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch {}
  }
  // 尝试找到第一个 { 到最后一个 }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return null;
}

// ========== 输入清理 ==========
function sanitizeInput(str, maxLen = 200) {
  if (!str) return '';
  // 移除控制字符，限制长度
  return String(str)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, maxLen)
    .trim();
}

module.exports = {
  callLongCat,
  callLongCatCached,
  parseJSON,
  sanitizeInput,
  getCached,
  setCache,
  CACHE_TTL,
};
