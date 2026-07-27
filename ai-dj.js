// ====================================================================
//  AI DJ 电台 — LongCat 生成导播语 + 播放列表编排
// ====================================================================
const { spawn } = require('child_process');

const HERMES_CLI = '/home/atios/.local/bin/hermes';
const TIMEOUT_MS = 30000;

function callLongCat(prompt, maxTokens = 512) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log('[AI-DJ] 调用 LongCat, prompt长度:', prompt.length);
    try { require('fs').appendFileSync('/tmp/mineradio-debug.log', `[AI-DJ] 调用 LongCat, prompt长度: ${prompt.length}\n`); } catch {}
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
      console.log(`[AI-DJ] LongCat 完成, 退出码 ${code}, 耗时 ${elapsed}ms, 输出 ${stdout.length} 字`);
      try { require('fs').appendFileSync('/tmp/mineradio-debug.log', `[AI-DJ] LongCat 完成, 退出码 ${code}, 耗时 ${elapsed}ms\n`); } catch {}
      if (code !== 0) {
        if (stderr) console.error('[AI-DJ stderr]', stderr.slice(0, 200));
        reject(new Error(`LongCat 调用失败 (exit ${code})`));
        return;
      }
      const result = stdout.trim();
      if (!result) { reject(new Error('LongCat 返回空结果')); return; }
      resolve(result);
    });

    proc.on('error', (err) => {
      console.error('[AI-DJ] 进程错误:', err.message);
      try { require('fs').appendFileSync('/tmp/mineradio-debug.log', `[AI-DJ] 进程错误: ${err.message}\n`); } catch {}
      reject(err);
    });
  });
}

// 为单首歌生成导播语
async function generateSongIntro(song, context = {}) {
  const { name, artist, album = '', duration = 0 } = song;
  const { weather = '', mood = '', userName = '听众' } = context;
  console.log('[AI-DJ] generateSongIntro 开始:', { name, artist });

  const prompt = `你是一个音乐 DJ，用一句话（30字以内）介绍这首歌，要有温度和个性。

歌曲: ${name}
歌手: ${artist}
专辑: ${album || '未知'}
当前天气: ${weather || '未知'}
当前情绪氛围: ${mood || '轻松'}
听众: ${userName}

要求：
- 30字以内
- 不要"接下来请听"之类的套话
- 可以联系天气、情绪、歌手故事
- 一句话，自然口语化
- 只输出介绍文字，不要引号`;

  console.log('[AI-DJ] 准备调用 LongCat');
  try {
    const raw = await callLongCat(prompt, 128);
    console.log('[AI-DJ] LongCat 返回:', raw.slice(0, 50));
    // 清理输出
    let intro = raw.trim().replace(/^["'""]|["'""]$/g, '').trim();
    if (intro.length > 60) intro = intro.slice(0, 57) + '...';
    return { intro, source: 'longcat' };
  } catch (err) {
    console.error('[AI-DJ] 导播语生成失败:', err.message);
    return {
      intro: `接下来是 ${artist} 的《${name}》`,
      source: 'fallback',
    };
  }
}

// 为整个播放列表生成节目单
async function generatePlaylistScript(songs, context = {}) {
  const { weather = '', mood = '轻松', userName = '听众' } = context;

  const songList = songs.slice(0, 8).map((s, i) =>
    `${i + 1}. ${s.name} - ${s.artist}`
  ).join('\n');

  const prompt = `你是一个音乐电台 DJ，为以下播放列表写一段开场白（80字以内）。

播放列表:
${songList}

当前天气: ${weather || '未知'}
情绪氛围: ${mood || '轻松'}
听众: ${userName}

要求：
- 80字以内
- 概括这个列表的"旅程感"
- 有 DJ 的个性和温度
- 不要罗列歌名
- 只输出开场白文字`;

  try {
    const raw = await callLongCat(prompt, 256);
    return { script: raw.trim(), source: 'longcat' };
  } catch (err) {
    console.error('[AI-DJ] 节目单生成失败:', err.message);
    return {
      script: `为你准备了 ${songs.length} 首歌，希望你喜欢`,
      source: 'fallback',
    };
  }
}

// 生成过渡语（歌与歌之间）
async function generateTransition(fromSong, toSong, context = {}) {
  const prompt = `${context.userName || '听众'} 刚听完 ${fromSong.artist} 的《${fromSong.name}》，
接下来是 ${toSong.artist} 的《${toSong.name}》。
用一句话（20字以内）自然过渡，不要套话。只输出文字。`;

  try {
    const raw = await callLongCat(prompt, 96);
    let text = raw.trim().replace(/^["'""]|["'""]$/g, '').trim();
    if (text.length > 40) text = text.slice(0, 37) + '...';
    return { text, source: 'longcat' };
  } catch (err) {
    return { text: `接下来，${toSong.artist} 的《${toSong.name}》`, source: 'fallback' };
  }
}

module.exports = {
  generateSongIntro,
  generatePlaylistScript,
  generateTransition,
  callLongCat,
};
