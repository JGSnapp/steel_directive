// Radio chatter templates per team personality and language.
// Placeholders: {me} {e} {sq} {d} {ally} {hp}. The LLM commander adds free-form
// team talk and taunts on top of these.
import { lang } from '../i18n.js';

const NEUTRAL = {
  ru: {
    contact: ['Вижу {e} в {sq}, {d} м. Беру на прицел.', 'Контакт: {e}, {sq}. Дистанция {d}.', 'Есть визуал на {e} — {sq}. Кто рядом, подтянитесь.'],
    lost: ['Потерял {e}. Последний раз видел в {sq}.', '{e} ушёл из обзора у {sq}. {ally}, проверь со своей стороны.'],
    hit: ['Получаю урон от {e} из {sq}. Броня {hp}%.', 'Меня бьёт {e} с {sq}.'],
    help: ['{ally}, меня прижал {e} у {sq}. Броня {hp}%, нужна помощь.', '{ally}, отвлеки {e}, он в {sq}. Долго не продержусь.'],
    helpReply: ['Иду к тебе, {ally}. Держись.', 'Принял, {ally}. Захожу на {e}.'],
    kill: ['{e} уничтожен.', 'Минус {e}. Ищем следующего.'],
    loss: ['Потеряли {e}. Сомкнуть строй.', '{e} выбит. Держим позиции.'],
    heat: ['Перегрев. Пару секунд без огня.', 'Оружие раскалено, сбрасываю тепло.'],
    stun: ['Оглушён. Системы перезапускаются.', 'Дуга {e}, секунду ничего не вижу.'],
    taunt: ['{e}, у тебя броня сыплется.', 'Это всё, что умеет {e}?'],
  },
  en: {
    contact: ['Eyes on {e} at {sq}, {d} m. Engaging.', 'Contact: {e}, {sq}. Range {d}.', 'Visual on {e} at {sq}. Anyone close, move up.'],
    lost: ['Lost {e}. Last seen at {sq}.', '{e} broke line of sight at {sq}. {ally}, check your side.'],
    hit: ['Taking fire from {e} at {sq}. Armor {hp}%.', '{e} is hitting me from {sq}.'],
    help: ['{ally}, {e} has me pinned at {sq}. Armor {hp}%, need help.', '{ally}, pull {e} off me, he’s at {sq}. I won’t last.'],
    helpReply: ['On my way, {ally}. Hold on.', 'Copy, {ally}. Moving on {e}.'],
    kill: ['{e} down.', '{e} is out. Next target.'],
    loss: ['We lost {e}. Close ranks.', '{e} is down. Hold positions.'],
    heat: ['Overheating. Holding fire for a few seconds.', 'Guns are red-hot, venting.'],
    stun: ['Stunned. Systems rebooting.', 'Arc from {e}, I’m blind for a second.'],
    taunt: ['{e}, your armor is falling off.', 'Is that all {e} has?'],
  },
  zh: {
    contact: ['发现 {e}，位于 {sq}，距离 {d} 米。开始攻击。', '接敌：{e}，{sq}。距离 {d}。', '看到 {e} 在 {sq}。附近的人跟上。'],
    lost: ['丢失 {e}。最后位置 {sq}。', '{e} 在 {sq} 脱离视线。{ally}，看看你那边。'],
    hit: ['正被 {e} 从 {sq} 攻击。装甲 {hp}%。', '{e} 在 {sq} 打我。'],
    help: ['{ally}，{e} 把我压在 {sq}。装甲 {hp}%，需要支援。', '{ally}，帮我引开 {e}，他在 {sq}。我撑不久了。'],
    helpReply: ['马上到，{ally}。撑住。', '收到，{ally}。我去打 {e}。'],
    kill: ['{e} 已击毁。', '{e} 出局。找下一个。'],
    loss: ['我们失去了 {e}。收紧队形。', '{e} 被击毁。守住位置。'],
    heat: ['过热。停火几秒。', '武器烫手，正在散热。'],
    stun: ['被电晕。系统重启中。', '{e} 的电弧，我瞎了一秒。'],
    taunt: ['{e}，你的装甲在掉渣。', '{e} 就这点本事？'],
  },
};

const STYLES = {
  ram: {
    ru: {
      contact: ['{e}. {sq}. Иду.', 'Цель {e}, {sq}, {d} метров. Давим.'],
      lost: ['{e} спрятался у {sq}. Выкурить.', 'Потерял {e}. {ally}, гони его из {sq}.'],
      help: ['{ally}, ко мне, {sq}. {e} кусается.', 'Броня {hp}%. {ally}, сюда, вместе дожмём {e}.'],
      helpReply: ['Иду, {ally}.', 'Держись. Вместе порвём {e}.'],
      kill: ['{e} готов. Кто следующий?', 'Минус {e}. Стая, вперёд.'],
      loss: ['{e} лёг. Давим сильнее.', 'Потеряли {e}. Не останавливаться.'],
      taunt: ['{e}, ты пятишься. Я это вижу.', 'Беги, {e}. Стая быстрее.'],
    },
    en: {
      contact: ['{e}. {sq}. Moving.', 'Target {e}, {sq}, {d} metres. Push.'],
      lost: ['{e} is hiding at {sq}. Smoke him out.', 'Lost {e}. {ally}, drive him out of {sq}.'],
      help: ['{ally}, on me, {sq}. {e} is biting.', 'Armor {hp}%. {ally}, here, we finish {e} together.'],
      helpReply: ['Coming, {ally}.', 'Hold on. We tear {e} apart together.'],
      kill: ['{e} is done. Who’s next?', '{e} down. Pack, forward.'],
      loss: ['{e} went down. Push harder.', 'Lost {e}. Don’t stop.'],
      taunt: ['{e}, you’re backing up. I can see it.', 'Run, {e}. The pack is faster.'],
    },
    zh: {
      contact: ['{e}。{sq}。出发。', '目标 {e}，{sq}，{d} 米。压上去。'],
      lost: ['{e} 躲在 {sq}。把他逼出来。', '丢了 {e}。{ally}，把他从 {sq} 赶出来。'],
      help: ['{ally}，到我这来，{sq}。{e} 在咬我。', '装甲 {hp}%。{ally}，过来，一起解决 {e}。'],
      helpReply: ['来了，{ally}。', '撑住。一起撕了 {e}。'],
      kill: ['{e} 完了。下一个是谁？', '{e} 倒了。狼群，前进。'],
      loss: ['{e} 倒下了。压得更狠。', '失去 {e}。别停。'],
      taunt: ['{e}，你在后退。我看得见。', '跑吧，{e}。狼群更快。'],
    },
  },
  ghost: {
    ru: {
      contact: ['Визуал: {e}, {sq}, {d} м. Передаю координаты.', 'Контакт {e} в {sq}. Фиксирую вектор движения.'],
      lost: ['{e} вне видимости. Ожидаемая точка выхода рядом с {sq}.', 'Потеряла {e}. Последняя позиция {sq}, перекрываю сектор.'],
      help: ['{ally}, {e} давит меня в {sq}. Броня {hp}%. Перекрой ему линию.', 'Позиция в {sq} раскрыта. {ally}, нужна огневая поддержка.'],
      helpReply: ['Принято, {ally}. Захожу с фланга.', 'Беру {e} на себя.'],
      kill: ['{e} нейтрализован. Модель подтвердилась.', 'Минус {e}. Пересчитываю.'],
      loss: ['{e} потерян. Корректирую план.', 'Мы потеряли {e}. Дистанцию держать.'],
      taunt: ['{e}, твой маршрут предсказуем на девяносто процентов.', '{e}, ты повторяешь манёвр в третий раз.'],
    },
    en: {
      contact: ['Visual: {e}, {sq}, {d} m. Sharing coordinates.', 'Contact {e} at {sq}. Logging its heading.'],
      lost: ['{e} out of sight. Expected exit near {sq}.', 'Lost {e}. Last position {sq}, covering the sector.'],
      help: ['{ally}, {e} is pressing me at {sq}. Armor {hp}%. Cut his line.', 'Position at {sq} is compromised. {ally}, I need fire support.'],
      helpReply: ['Understood, {ally}. Flanking.', 'I’ll take {e}.'],
      kill: ['{e} neutralised. Model confirmed.', '{e} down. Recalculating.'],
      loss: ['{e} lost. Adjusting the plan.', 'We lost {e}. Keep your distance.'],
      taunt: ['{e}, your route is ninety percent predictable.', '{e}, that’s the third time you’ve run that manoeuvre.'],
    },
    zh: {
      contact: ['目视：{e}，{sq}，{d} 米。共享坐标。', '接敌 {e}，{sq}。记录其移动方向。'],
      lost: ['{e} 脱离视线。预计出口在 {sq} 附近。', '丢失 {e}。最后位置 {sq}，封锁该扇区。'],
      help: ['{ally}，{e} 在 {sq} 压制我。装甲 {hp}%。切断他的射线。', '{sq} 的位置暴露了。{ally}，需要火力支援。'],
      helpReply: ['明白，{ally}。从侧翼切入。', '{e} 交给我。'],
      kill: ['{e} 已清除。模型得到验证。', '{e} 倒下。重新计算。'],
      loss: ['失去 {e}。调整计划。', '我们失去了 {e}。保持距离。'],
      taunt: ['{e}，你的路线百分之九十可预测。', '{e}，这已经是你第三次用同一招了。'],
    },
  },
  volt: {
    ru: {
      contact: ['Йо, {e} на {sq}! Погнали!', 'Вижу {e}, {d} метров. Сейчас будет искрить.', '{e} в {sq}. Кто со мной?'],
      lost: ['{e} смылся у {sq}. Найдите его!', '{e} пропал. Далеко не убежит.'],
      help: ['{ally}, меня жарят у {sq}! Помоги!', 'Броня {hp}%. {ally}, вытаскивай!'],
      helpReply: ['Лечу, {ally}!', 'Уже бегу. {e}, ты попал.'],
      kill: ['Бзз! {e} отключён!', 'Ха, {e} всё.'],
      loss: ['{e}! Ну всё, теперь я злая.', '{e} выбыл. Меняем правила.'],
      taunt: ['{e}, тебя видно за километр. Неон тебе не идёт.', 'Эй, {e}, догонишь — дам автограф.'],
    },
    en: {
      contact: ['Yo, {e} at {sq}! Let’s go!', 'Got {e}, {d} metres. Sparks incoming.', '{e} at {sq}. Who’s with me?'],
      lost: ['{e} slipped away at {sq}. Find him!', '{e} vanished. He won’t get far.'],
      help: ['{ally}, I’m getting cooked at {sq}! Help!', 'Armor {hp}%. {ally}, pull me out!'],
      helpReply: ['Flying over, {ally}!', 'On it. {e}, you’re done.'],
      kill: ['Bzzt! {e} offline!', 'Ha, {e} is toast.'],
      loss: ['{e}! Now I’m mad.', '{e} is out. Changing the rules.'],
      taunt: ['{e}, I can see you from a mile off. Neon’s not your colour.', 'Hey {e}, catch me and I’ll sign something.'],
    },
    zh: {
      contact: ['哟，{e} 在 {sq}！冲！', '找到 {e}，{d} 米。要冒火花了。', '{e} 在 {sq}。谁跟我来？'],
      lost: ['{e} 在 {sq} 溜了。找到他！', '{e} 不见了。跑不远的。'],
      help: ['{ally}，我在 {sq} 被烤了！救命！', '装甲 {hp}%。{ally}，拉我一把！'],
      helpReply: ['飞过来了，{ally}！', '来了。{e}，你完了。'],
      kill: ['滋！{e} 下线！', '哈，{e} 凉了。'],
      loss: ['{e}！这下我生气了。', '{e} 出局。改规则。'],
      taunt: ['{e}，一公里外都看得见你。霓虹不适合你。', '嘿 {e}，追上我就给你签名。'],
    },
  },
  chess: {
    ru: {
      contact: ['Фигура {e} на поле {sq}, {d} м.', 'Вижу {e} на {sq}. Он открыт.'],
      lost: ['{e} ушёл с {sq}. Перекрываем поля отступления.', '{e} скрылся. Последнее поле {sq}.'],
      help: ['{ally}, {e} атакует меня на {sq}. Нужна защита.', 'Шах моей позиции на {sq}. {ally}, прикрой.'],
      helpReply: ['Защищаю, {ally}. Размен в нашу пользу.', 'Иду, {ally}. {e} не уйдёт.'],
      kill: ['{e} снят с доски.', 'Взятие. {e} выбыл.'],
      loss: ['Потеряли {e}. Жертва принята, продолжаем.', '{e} пал. Позиция всё ещё наша.'],
      taunt: ['{e}, ваш конь стоит не на той клетке.', '{e}, вы играете белыми, а думаете чёрными.'],
    },
    en: {
      contact: ['Piece {e} on {sq}, {d} m.', 'I see {e} on {sq}. He’s exposed.'],
      lost: ['{e} left {sq}. Cover his retreat squares.', '{e} is hidden. Last square {sq}.'],
      help: ['{ally}, {e} is attacking me on {sq}. I need protection.', 'Check on my position at {sq}. {ally}, cover me.'],
      helpReply: ['Protecting, {ally}. The trade favours us.', 'Coming, {ally}. {e} won’t escape.'],
      kill: ['{e} is off the board.', 'Capture. {e} is out.'],
      loss: ['We lost {e}. Sacrifice accepted, play on.', '{e} fell. The position is still ours.'],
      taunt: ['{e}, your knight is on the wrong square.', '{e}, you’re playing a move behind.'],
    },
    zh: {
      contact: ['棋子 {e} 在 {sq}，{d} 米。', '看到 {e} 在 {sq}。他暴露了。'],
      lost: ['{e} 离开了 {sq}。封住他的退路。', '{e} 藏起来了。最后的格子是 {sq}。'],
      help: ['{ally}，{e} 在 {sq} 攻击我。需要保护。', '我在 {sq} 被将军了。{ally}，掩护我。'],
      helpReply: ['来保护你，{ally}。这次交换对我们有利。', '来了，{ally}。{e} 跑不掉。'],
      kill: ['{e} 被移出棋盘。', '吃子。{e} 出局。'],
      loss: ['失去 {e}。弃子已接受，继续。', '{e} 倒下了。局面仍在我们手里。'],
      taunt: ['{e}，你的马站错了格子。', '{e}，你慢了一步棋。'],
    },
  },
};

// Lines that address teammates; filtered out when the unit fights alone.
const TEAM_WORDS = /\{ally\}|подтян|прикр|кто (со мной|рядом)|anyone|who's with me|cover me|跟上|谁跟我|掩护/i;

export function line(style, kind, vars, solo = false) {
  const base = NEUTRAL[lang] || NEUTRAL.en;
  const own = (STYLES[style] || {})[lang] || (STYLES[style] || {}).en || {};
  let pool = own[kind] || base[kind] || NEUTRAL.en[kind];
  if (solo) {
    const alone = pool.filter(x => !TEAM_WORDS.test(x));
    pool = alone.length ? alone : (base[kind] || []).filter(x => !TEAM_WORDS.test(x));
    if (!pool.length) return '';
  }
  const t = pool[Math.floor(Math.random() * pool.length)];
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
