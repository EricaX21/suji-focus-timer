// 专注内容分类规则（看视频 / 客户沟通 / 其他）+ 细粒度任务识别（具体到软件/网站）
// 同时支持：悬浮窗里 <script> 引入（挂到 window.Categories）和 Node 里 require。
// 以后想加/改识别规则，改这里即可。
(function (root) {
  // 客户沟通：企业微信 / 微信 / QQ（按进程名精确匹配，避免误伤 QQBrowser 等）
  const CLIENTS = new Set([
    'wxwork.exe',   // 企业微信
    'wechat.exe',   // 微信（旧）
    'weixin.exe',   // 微信（4.0 新版）
    'qq.exe'        // QQ
  ]);
  // 客户沟通类的细粒度任务名
  const CLIENT_LABELS = {
    'wxwork.exe': '企业微信', 'wechat.exe': '微信', 'weixin.exe': '微信', 'qq.exe': 'QQ'
  };

  // 浏览器（看视频/浏览网页的载体）
  const BROWSERS = new Set([
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe',
    'vivaldi.exe', 'qqbrowser.exe', '360se.exe', '360chrome.exe',
    'sogouexplorer.exe', 'maxthon.exe'
  ]);

  // 视频/网课标题关键词（命中则算"看视频"）。标题会转小写后匹配，中文不受影响。
  const VIDEO_KEYWORDS = [
    '哔哩哔哩', 'bilibili', '腾讯课堂', '中国大学mooc', 'mooc', '慕课',
    '学堂在线', '网易公开课', '网易云课堂', 'youtube', '优酷', '爱奇艺',
    '腾讯视频', '网课', '课程', '公开课', '教程', '视频', '直播'
  ];

  // 细粒度软件识别（进程名 → 可读任务名）。覆盖设计/创作/办公/工具，按需扩。
  const APP_MAP = {
    // 设计 / 创作
    'photoshop.exe': 'Photoshop (PS)',
    'illustrator.exe': 'Illustrator (AI)',
    'indesign.exe': 'InDesign (ID)',
    'premiere.exe': 'Premiere (PR)',
    'adobe premiere pro.exe': 'Premiere (PR)',
    'afterfx.exe': 'After Effects (AE)',
    'audition.exe': 'Audition (AU)',
    'lightroom.exe': 'Lightroom (LR)',
    'figma.exe': 'Figma',
    // 三维 / 建模 / 渲染
    'sketchup.exe': 'SketchUp (SU)',
    'enscape.exe': 'Enscape 渲染',
    'lumion.exe': 'Lumion 渲染',
    'vray.exe': 'V-Ray 渲染',
    '3dsmax.exe': '3ds Max',
    'blender.exe': 'Blender',
    'cinema 4d.exe': 'Cinema 4D',
    'rhino.exe': 'Rhino',
    'revit.exe': 'Revit',
    'acad.exe': 'AutoCAD',
    'autocad.exe': 'AutoCAD',
    // 办公 / 写作
    'winword.exe': 'Word',
    'wps.exe': 'WPS 文字',
    'excel.exe': 'Excel',
    'et.exe': 'WPS 表格',
    'powerpnt.exe': 'PPT',
    'wpp.exe': 'WPS 演示',
    'acrobat.exe': 'PDF',
    'acrord32.exe': 'PDF',
    // 编程 / 工具
    'code.exe': 'VS Code',
    'cursor.exe': 'Cursor',
    'devenv.exe': 'Visual Studio',
    'pycharm64.exe': 'PyCharm',
    'idea64.exe': 'IntelliJ IDEA',
    'windowsterminal.exe': '终端',
    'notepad.exe': '记事本',
    'notepad++.exe': 'Notepad++',
    // 协作 / 会议
    'dingtalk.exe': '钉钉',
    'feishu.exe': '飞书',
    'lark.exe': '飞书',
    'slack.exe': 'Slack',
    'zoom.exe': 'Zoom',
    'tencentmeeting.exe': '腾讯会议',
    'wemeetapp.exe': '腾讯会议'
  };

  // 网站识别（浏览器标题关键词 → 站点名 + 是否算"看视频"）。按从具体到一般匹配。
  const SITES = [
    { keys: ['哔哩哔哩', 'bilibili'], label: 'B站', video: true },
    { keys: ['youtube'], label: 'YouTube', video: true },
    { keys: ['腾讯视频'], label: '腾讯视频', video: true },
    { keys: ['爱奇艺'], label: '爱奇艺', video: true },
    { keys: ['优酷'], label: '优酷', video: true },
    { keys: ['抖音', 'douyin'], label: '抖音', video: true },
    { keys: ['小红书', 'xiaohongshu', 'xhs'], label: '小红书', video: false },
    { keys: ['微博', 'weibo'], label: '微博', video: false },
    { keys: ['知乎', 'zhihu'], label: '知乎', video: false },
    { keys: ['淘宝', 'taobao', '天猫', '京东', 'jd.com', '拼多多'], label: '购物', video: false },
    { keys: ['github'], label: 'GitHub', video: false },
    { keys: ['百度', 'baidu', 'google', 'bing'], label: '搜索', video: false }
  ];

  // 取纯进程名（小写，去路径）
  function procName(owner) {
    if (!owner) return '';
    const s = String(owner).toLowerCase().replace(/\\/g, '/');
    return s.slice(s.lastIndexOf('/') + 1);
  }
  // 兜底：进程名去 .exe 作为任务名
  function prettyProc(proc) {
    if (!proc) return '其他';
    return proc.replace(/\.exe$/i, '') || '其他';
  }

  // 细粒度识别：输入 { title, owner } → { bucket: 'video'|'client'|'other', task: '可读任务名' }
  // bucket 仍是粗类（喂浓缩条/原有统计），task 用于"当前任务"展示与按应用累计。
  function detail(win) {
    if (!win) return { bucket: 'other', task: '其他' };
    const proc = procName(win.owner);
    if (CLIENTS.has(proc)) return { bucket: 'client', task: CLIENT_LABELS[proc] || '客户沟通' };
    if (APP_MAP[proc]) return { bucket: 'other', task: APP_MAP[proc] };
    if (BROWSERS.has(proc)) {
      const t = String(win.title || '').toLowerCase();
      for (const s of SITES) {
        if (s.keys.some(k => t.includes(k))) return { bucket: s.video ? 'video' : 'other', task: s.label };
      }
      if (VIDEO_KEYWORDS.some(k => t.includes(k))) return { bucket: 'video', task: '看视频/网课' };
      return { bucket: 'other', task: '网页浏览' };
    }
    return { bucket: 'other', task: prettyProc(proc) };
  }

  // 输入 { title, owner } → 'video' | 'client' | 'other'（复用 detail，避免两套规则漂移）
  function classify(win) {
    return detail(win).bucket;
  }

  const LABELS = { video: '看视频', client: '客户沟通', other: '其他工作/学习' };

  const api = { classify, detail, LABELS, CLIENTS, BROWSERS, VIDEO_KEYWORDS, APP_MAP, SITES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Categories = api;
})(typeof window !== 'undefined' ? window : null);
