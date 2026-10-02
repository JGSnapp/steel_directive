// Localization: Russian, English, Simplified Chinese.
// Static UI uses data-i18n="key" attributes; content objects use { ru, en, zh }.

export const LANGS = { ru: 'Русский', en: 'English', zh: '中文' };

function detect() {
  try {
    const saved = localStorage.getItem('sd.lang');
    if (saved && LANGS[saved]) return saved;
  } catch { /* storage blocked */ }
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('ru') ? 'ru' : nav.startsWith('zh') ? 'zh' : 'en';
}

export let lang = detect();

export function setLang(code) {
  lang = LANGS[code] ? code : 'en';
  try { localStorage.setItem('sd.lang', lang); } catch { /* ignore */ }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  applyStatic();
}

// Pick the current language from a { ru, en, zh } object (or return a plain string).
export const L = (v) => (v && typeof v === 'object' ? v[lang] ?? v.en ?? v.ru : v ?? '');

const UI = {
  'title.eyebrow': { ru: 'ЛИГА ДИРЕКТИВ · СЕЗОН 7', en: 'LEAGUE OF DIRECTIVES · SEASON 7', zh: '指令联赛 · 第七赛季' },
  'title.tagline': {
    ru: 'Кабины пусты. Мехи слушают только слова тренера.<br>Вы пишете стратегию, LLM-командир строит план, потоки JEV ведут бой.',
    en: 'The cockpits are empty. The mechs only listen to their coach.<br>You write the strategy, an LLM commander plans, JEV streams fight.',
    zh: '驾驶舱空无一人。机甲只听教练的话。<br>你写下战略，LLM 指挥官制定计划，JEV 决策流执行战斗。',
  },
  'menu.campaign': { ru: 'КАМПАНИЯ', en: 'CAMPAIGN', zh: '战役' },
  'menu.skirmish': { ru: 'БЫСТРЫЙ БОЙ', en: 'SKIRMISH', zh: '快速对战' },
  'menu.prologue': { ru: 'ПРОЛОГ', en: 'PROLOGUE', zh: '序章' },
  'cs.skip': { ru: 'КЛИК / ПРОБЕЛ — ПРОПУСТИТЬ', en: 'CLICK / SPACE — SKIP', zh: '点击 / 空格 — 跳过' },
  'cs.place': { ru: 'КОЛЬЦО · 2064', en: 'THE RING · 2064', zh: '环形 · 2064' },
  'menu.howto': { ru: 'КАК ЭТО РАБОТАЕТ', en: 'HOW IT WORKS', zh: '运作原理' },
  'menu.back': { ru: '← НАЗАД', en: '← BACK', zh: '← 返回' },
  'menu.menu': { ru: '← МЕНЮ', en: '← MENU', zh: '← 菜单' },
  'menu.music': { ru: '♪ МУЗЫКА', en: '♪ MUSIC', zh: '♪ 音乐' },
  'menu.musicOff': { ru: '♪ ВЫКЛ', en: '♪ OFF', zh: '♪ 关闭' },
  'coaches.title': { ru: 'ТРЕНЕРЫ СЕЗОНА', en: 'SEASON COACHES', zh: '本赛季教练' },
  'howto.title': { ru: 'Как думают мехи', en: 'How the mechs think', zh: '机甲如何思考' },
  'howto.1t': { ru: '01 · ТРЕНЕР', en: '01 · COACH', zh: '01 · 教练' },
  'howto.1': { ru: 'Вы пишете стратегию каждому роботу обычными словами. Соперники играют по доктринам своих тренеров.', en: 'You write each mech a strategy in plain words. Rivals follow their coach’s doctrine.', zh: '你用日常语言为每台机甲写下战略。对手遵循各自教练的战术思想。' },
  'howto.2t': { ru: '02 · КОМАНДИР (LLM)', en: '02 · COMMANDER (LLM)', zh: '02 · 指挥官 (LLM)' },
  'howto.2': { ru: 'Раз в 8–16 секунд и после каждого события LLM пересобирает план: стойку, цель, точку движения, дистанцию и отдельную инструкцию каждому потоку. Он же пишет переговоры команды.', en: 'Every 8–16 seconds and after every event the LLM rebuilds the plan: stance, target, destination, range, and a separate instruction for each stream. It also writes the team’s radio talk.', zh: '每 8–16 秒以及每次事件后，LLM 重建计划：姿态、目标、移动点、交战距离，并为每条决策流写下指令。它还负责队内无线电对话。' },
  'howto.3t': { ru: '03 · ПОТОКИ JEV', en: '03 · JEV STREAMS', zh: '03 · JEV 决策流' },
  'howto.3': { ru: 'Три независимых потока на меха (ноги, торс, оружие) раз в секунду выбирают действие из фиксированного словаря.', en: 'Three independent streams per mech (legs, torso, weapons) pick an action from a fixed vocabulary about once a second.', zh: '每台机甲有三条独立决策流（腿、躯干、武器），约每秒从固定词表中选择一个动作。' },
  'howto.4t': { ru: '04 · СЕРВОПРИВОД', en: '04 · SERVO', zh: '04 · 伺服层' },
  'howto.4': { ru: '60 раз в секунду: маршрут по A*, повороты, упреждение, линия огня, нагрев.', en: '60 times a second: A* routes, turning, aim lead, line-of-fire checks, heat.', zh: '每秒 60 次：A* 寻路、转向、射击提前量、火线检查、热量。' },
  'howto.note': { ru: 'Мех видит только камерой торса: угол обзора, дальность и прямая видимость. Остальное он помнит или слышит в эфире от союзников. Без ключей API работает локальный ИИ с тем же словарём действий.', en: 'A mech sees only through its torso camera: field of view, range and line of sight. Everything else is memory or what allies report on the radio. Without API keys a local AI uses the same action vocabulary.', zh: '机甲只能通过躯干摄像头观察：视角、距离与视线。其余信息来自记忆或队友的无线电报告。没有 API 密钥时，本地 AI 使用同一套动作词表。' },
  'howto.keys': { ru: 'Во время боя', en: 'During battle', zh: '战斗中' },
  'howto.keysText': { ru: '<kbd>1</kbd>–<kbd>6</kbd> выбрать меха · <kbd>C</kbd> камера · <kbd>T</kbd> тактический вид · <kbd>Enter</kbd> директива · <kbd>Space</kbd> пауза · <kbd>M</kbd> музыка', en: '<kbd>1</kbd>–<kbd>6</kbd> select mech · <kbd>C</kbd> camera · <kbd>T</kbd> tactical view · <kbd>Enter</kbd> directive · <kbd>Space</kbd> pause · <kbd>M</kbd> music', zh: '<kbd>1</kbd>–<kbd>6</kbd> 选择机甲 · <kbd>C</kbd> 镜头 · <kbd>T</kbd> 战术视角 · <kbd>Enter</kbd> 指令 · <kbd>Space</kbd> 暂停 · <kbd>M</kbd> 音乐' },
  'campaign.title': { ru: 'Сезон 7 · Отборочная сетка', en: 'Season 7 · Qualifier bracket', zh: '第七赛季 · 资格赛' },
  'campaign.reset': { ru: 'СБРОСИТЬ ПРОГРЕСС', en: 'RESET PROGRESS', zh: '重置进度' },
  'campaign.resetConfirm': { ru: 'Сбросить прогресс кампании?', en: 'Reset campaign progress?', zh: '确定重置战役进度？' },
  'campaign.won': { ru: '✓ ПОБЕДА', en: '✓ WON', zh: '✓ 胜利' },
  'campaign.arsenal': { ru: 'АРСЕНАЛ', en: 'ARSENAL', zh: '武器库' },
  'campaign.chassis': { ru: 'ШАССИ', en: 'CHASSIS', zh: '底盘' },
  'skirmish.title': { ru: 'Быстрый бой', en: 'Skirmish', zh: '快速对战' },
  'skirmish.note': { ru: 'Всё оружие и шасси открыты. Выберите соперника, формат и арену.', en: 'All weapons and chassis are unlocked. Pick a rival, format and arena.', zh: '所有武器与底盘已解锁。选择对手、模式与竞技场。' },
  'skirmish.go': { ru: 'К БРИФИНГУ →', en: 'TO BRIEFING →', zh: '进入简报 →' },
  'vn.hint': { ru: 'ЛКМ / ПРОБЕЛ — ДАЛЕЕ', en: 'CLICK / SPACE — NEXT', zh: '点击 / 空格 — 继续' },
  'vn.skip': { ru: 'ПРОПУСТИТЬ ▸▸', en: 'SKIP ▸▸', zh: '跳过 ▸▸' },
  'brief.team': { ru: 'NULL SIGNAL · ваши директивы', en: 'NULL SIGNAL · your directives', zh: 'NULL SIGNAL · 你的指令' },
  'brief.doctrine': { ru: 'ДОКТРИНА СОПЕРНИКА', en: 'RIVAL DOCTRINE', zh: '对手战术思想' },
  'brief.teamNote': { ru: 'ОБЩАЯ ДИРЕКТИВА КОМАНДЫ', en: 'TEAM DIRECTIVE', zh: '全队指令' },
  'brief.teamNotePh': { ru: 'Например: держитесь вместе и бейте одну цель', en: 'For example: stay together and focus one target', zh: '例如：保持队形，集中火力打一个目标' },
  'brief.start': { ru: 'В БОЙ', en: 'DEPLOY', zh: '出击' },
  'brief.chassis': { ru: 'ШАССИ', en: 'CHASSIS', zh: '底盘' },
  'brief.armL': { ru: 'ЛЕВАЯ РУКА', en: 'LEFT ARM', zh: '左臂' },
  'brief.armR': { ru: 'ПРАВАЯ РУКА', en: 'RIGHT ARM', zh: '右臂' },
  'brief.shoulder': { ru: 'ПЛЕЧО', en: 'SHOULDER', zh: '肩部' },
  'brief.strategy': { ru: 'СТРАТЕГИЯ ДЛЯ {n} (свободный текст → LLM-командир)', en: 'STRATEGY FOR {n} (free text → LLM commander)', zh: '{n} 的战略（自由文本 → LLM 指挥官）' },
  'brief.strategyPh': { ru: 'Опишите тактику для {n}: дистанция, цели, когда отходить, кого прикрывать…', en: 'Describe {n}’s tactics: range, targets, when to fall back, whom to cover…', zh: '描述 {n} 的战术：距离、目标、何时撤退、掩护谁……' },
  'brief.armor': { ru: 'БРОНЯ', en: 'ARMOR', zh: '装甲' },
  'brief.preview': { ru: 'ПРЕДПРОСМОТР', en: 'PREVIEW', zh: '预览' },
  'brief.localOnly': { ru: 'только локальный ИИ', en: 'local AI only', zh: '仅本地 AI' },
  'brief.commander': { ru: 'КОМАНДИР', en: 'COMMANDER', zh: '指挥官' },
  'brief.streams': { ru: 'ПОТОКИ', en: 'STREAMS', zh: '决策流' },
  'stat.hp': { ru: 'HP', en: 'HP', zh: '耐久' },
  'stat.speed': { ru: 'СКОР', en: 'SPD', zh: '速度' },
  'stat.sensor': { ru: 'СЕНСОР', en: 'SENSOR', zh: '传感器' },
  'stat.fov': { ru: 'ОБЗОР', en: 'FOV', zh: '视角' },
  'stat.dmg': { ru: 'УРОН', en: 'DMG', zh: '伤害' },
  'stat.range': { ru: 'ДАЛЬН', en: 'RANGE', zh: '射程' },
  'stat.rate': { ru: 'ТЕМП', en: 'RATE', zh: '射速' },
  'stat.heat': { ru: 'НАГРЕВ', en: 'HEAT', zh: '热量' },
  'stat.ammo': { ru: 'БОЕЗАПАС', en: 'AMMO', zh: '弹药' },
  'hud.radio': { ru: 'РАДИОЭФИР', en: 'RADIO', zh: '无线电' },
  'hud.all': { ru: 'ВСЕ', en: 'ALL', zh: '全部' },
  'hud.ours': { ru: 'НАШИ', en: 'OURS', zh: '我方' },
  'hud.enemy': { ru: 'ВРАГ', en: 'ENEMY', zh: '敌方' },
  'hud.tech': { ru: 'СВОДКИ', en: 'REPORTS', zh: '战报' },
  'hud.streams': { ru: 'ПОТОКИ JEV', en: 'JEV STREAMS', zh: 'JEV 决策流' },
  'hud.director': { ru: 'РЕЖИССЁР', en: 'DIRECTOR', zh: '导播' },
  'hud.follow': { ru: 'СЛЕЖЕНИЕ', en: 'FOLLOW', zh: '跟随' },
  'hud.tactical': { ru: 'ТАКТИКА', en: 'TACTICAL', zh: '战术' },
  'hud.toAll': { ru: 'ВСЕМ', en: 'ALL', zh: '全体' },
  'hud.directivePh': { ru: 'Живая директива: «отступи за контейнеры», «все на QUEEN»…', en: 'Live directive: “fall back behind the containers”, “everyone on QUEEN”…', zh: '实时指令：“退到集装箱后面”、“全员集火 QUEEN”……' },
  'hud.send': { ru: 'ОТПРАВИТЬ ↵', en: 'SEND ↵', zh: '发送 ↵' },
  'hud.exit': { ru: '✕ ВЫЙТИ', en: '✕ EXIT', zh: '✕ 退出' },
  'hud.plan': { ru: 'ПЛАН КОМАНДИРА', en: 'COMMANDER PLAN', zh: '指挥官计划' },
  'hud.legs': { ru: 'НОГИ', en: 'LEGS', zh: '腿部' },
  'hud.torso': { ru: 'ТОРС', en: 'TORSO', zh: '躯干' },
  'hud.weapon': { ru: 'ОРУЖИЕ', en: 'WEAPON', zh: '武器' },
  'hud.target': { ru: 'цель', en: 'target', zh: '目标' },
  'hud.charge': { ru: 'ЗАРЯД', en: 'CHARGE', zh: '充能' },
  'hud.coach': { ru: 'ТРЕНЕР (ВЫ)', en: 'COACH (YOU)', zh: '教练（你）' },
  'hud.you': { ru: 'ВЫ', en: 'YOU', zh: '你' },
  'hud.radioTag': { ru: 'РАДИО', en: 'RADIO', zh: '无线电' },
  'hud.allChan': { ru: 'ВСЕМ', en: 'OPEN', zh: '公开' },
  'hud.planned': { ru: 'Связь установлена. Строю план по вашим директивам.', en: 'Link established. Building a plan from your directives.', zh: '链路已建立。正在根据你的指令制定计划。' },
  'hud.llmDown': { ru: 'LLM-командир недоступен ({e}). Перехожу на локальный планировщик.', en: 'LLM commander unavailable ({e}). Switching to the local planner.', zh: 'LLM 指挥官不可用（{e}）。切换到本地规划器。' },
  'hud.pause': { ru: 'ПАУЗА', en: 'PAUSED', zh: '暂停' },
  'hud.duel': { ru: 'ДУЭЛЬ', en: 'DUEL', zh: '单挑' },
  'hud.squad': { ru: 'КОМАНДНЫЙ БОЙ', en: 'SQUAD BATTLE', zh: '团队战' },
  'hud.fight': { ru: 'В БОЙ', en: 'FIGHT', zh: '开战' },
  'hud.win': { ru: 'ПОБЕДА', en: 'VICTORY', zh: '胜利' },
  'hud.lose': { ru: 'ПОРАЖЕНИЕ', en: 'DEFEAT', zh: '失败' },
  'res.retry': { ru: '↻ ПЕРЕИГРАТЬ', en: '↻ RETRY', zh: '↻ 重试' },
  'res.next': { ru: 'ДАЛЕЕ →', en: 'NEXT →', zh: '继续 →' },
  'res.dealt': { ru: 'УРОН НАНЕСЁН', en: 'DAMAGE DEALT', zh: '造成伤害' },
  'res.taken': { ru: 'УРОН ПОЛУЧЕН', en: 'DAMAGE TAKEN', zh: '承受伤害' },
  'res.kills': { ru: 'УНИЧТОЖЕНО', en: 'KILLS', zh: '击毁' },
  'res.plans': { ru: 'ПЛАНОВ КОМАНДИРА', en: 'COMMANDER PLANS', zh: '指挥官计划' },
  'res.jev': { ru: 'РЕШЕНИЙ JEV', en: 'JEV DECISIONS', zh: 'JEV 决策' },
  'res.rivalPlan': { ru: 'ПЛАН СОПЕРНИКА', en: 'RIVAL PLAN', zh: '对手计划' },
  'res.unlocked': { ru: 'ОТКРЫТО', en: 'UNLOCKED', zh: '已解锁' },
  'res.spend': { ru: 'РАСХОД ЗА БОЙ', en: 'SPEND THIS BATTLE', zh: '本场消耗' },
  'res.balance': { ru: 'ОСТАТОК НА БАЛАНСЕ', en: 'BALANCE LEFT', zh: '余额' },
  'res.plansUnit': { ru: 'планов', en: 'plans', zh: '次计划' },
  'res.decUnit': { ru: 'решений', en: 'decisions', zh: '次决策' },
  'res.in': { ru: 'вход', en: 'in', zh: '输入' },
  'res.out': { ru: 'выход', en: 'out', zh: '输出' },
  'res.noJevPrice': { ru: '(без JEV: укажите JEV_PRICE_IN/OUT)', en: '(JEV excluded: set JEV_PRICE_IN/OUT)', zh: '（不含 JEV：请设置 JEV_PRICE_IN/OUT）' },
  'quick': { ru: 'БЫСТРЫЙ БОЙ', en: 'SKIRMISH', zh: '快速对战' },
  'load.chassis': { ru: 'ЗАГРУЗКА ШАССИ…', en: 'LOADING CHASSIS…', zh: '正在加载底盘……' },
  'load.click': { ru: 'НАЖМИТЕ, ЧТОБЫ НАЧАТЬ', en: 'CLICK TO START', zh: '点击开始' },
  'load.done': { ru: 'ГОТОВО', en: 'READY', zh: '就绪' },
};

export function t(key, vars = {}) {
  const v = UI[key];
  const s = v ? L(v) : key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}
