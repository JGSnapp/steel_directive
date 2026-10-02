// The four league coaches. `doctrine` goes verbatim into the LLM commander prompt;
// `preset` drives the offline planner when no LLM is configured.
const art = (id) => ({
  icon: `assets/characters/${id}_icon.webp`,
  card: `assets/characters/${id}_card.webp`,
  poses: [1, 2, 3].map(i => `assets/characters/${id}_${i}.webp`),
});

export const TRAINERS = {
  ram: {
    id: 'ram', name: {"ru": "Маркус «RAM» Вейл", "en": "Marcus “RAM” Vail", "zh": "马库斯·“RAM”·维尔"}, short: 'RAM', team: 'IRON HOUNDS', color: '#ff2a1f', palette: 'hounds', chassis: 'hound', map: 'foundry',
    motto: {"ru": "Если противник вынужден реагировать, бой уже твой.", "en": "If the enemy is reacting, the fight is already yours.", "zh": "只要对手在被动应对，这场仗你就赢了。"}, ...art('marcus'),
    bio: {"ru": "Двадцать лет учил военных пилотов. В 2064-м вскрывал кабину на Кольце и потерял левую руку. Его мехи не ждут: каждая секунда паузы для него — та самая секунда на Кольце.", "en": "Trained military pilots for twenty years. In 2064 he tore open a cockpit at the Ring and lost his left arm. His mechs never wait: to him every pause is a second at the Ring.", "zh": "训练军用驾驶员二十年。2064 年在“环形”体育场撬开驾驶舱，失去了左臂。他的机甲从不等待：对他来说，每一次停顿都是“环形”上的那一秒。"},
    doctrine: 'PRESSURE DOCTRINE (coach RAM, IRON HOUNDS). Close distance fast and never give the enemy time to recover. Keep visual contact at all costs. Open with the support weapon, then sustained primary fire. Do not hunt for the perfect position; force the enemy to move. Retreat only below 15% HP. Everyone focuses the closest enemy. Radio style: short military commands.',
    // Hard limits applied to every order this coach's mechs receive (LLM or local).
    locks: { stances: ['assault', 'flank', 'hunt'], range: [8, 14], noRetreat: true, fire: 'free', chargeOnSight: true },
    variants: [
      { name: {"ru": "Лобовой таран", "en": "Frontal ram", "zh": "正面冲撞"}, doctrine: 'This match: FRONTAL RAM. Everyone charges the nearest enemy together along the shortest lane.', preset: { stance: 'assault', move_to: 'enemy', engage_range: 10 } },
      { name: {"ru": "Клещи", "en": "Pincer", "zh": "钳形攻势"}, doctrine: 'This match: PINCER. Split: units go around both sides and hit the enemy from two directions at once; the elite goes straight.', preset: { stance: 'flank', move_to: 'flank_left', engage_range: 14 } },
      { name: {"ru": "Приманка и рывок", "en": "Bait and charge", "zh": "诱饵与冲锋"}, doctrine: 'This match: BAIT AND CHARGE. Hold a choke point until the enemy commits, then everyone charges at once.', preset: { stance: 'hunt', move_to: 'center', engage_range: 12 } },
    ],
    preset: { stance: 'assault', move_to: 'enemy', engage_range: 11, fire_discipline: 'free', use_support: 'on_contact', target: 'nearest' },
  },
  ghost: {
    id: 'ghost', name: {"ru": "Ая «GHOST» Накамура", "en": "Aya “GHOST” Nakamura", "zh": "中村亚·“GHOST”"}, short: 'GHOST', team: 'SILENT VECTOR', color: '#49a6ff', palette: 'vector', chassis: 'vector', map: 'whiteout',
    motto: {"ru": "Побеждает тот, кто знает, где противник будет через три секунды.", "en": "You win by knowing where the enemy will be three seconds from now.", "zh": "谁知道对手三秒后会在哪里，谁就会赢。"}, ...art('aya'),
    bio: {"ru": "Написала прошивку слияния сенсоров, которую после Акта поставили на все мехи лиги. Считает каждый матч экспериментом и хранит записи всех своих поражений.", "en": "Wrote the sensor-fusion firmware that every league mech has run since the Act. Treats each match as an experiment and keeps footage of every loss.", "zh": "编写了传感器融合固件，法案之后联赛所有机甲都在使用。她把每场比赛都当作实验，保存着自己每一场失利的录像。"},
    doctrine: 'INFORMATION DOCTRINE (coach GHOST, SILENT VECTOR). Fight from long range and from cover. Break line of sight after taking damage, then predict the enemy exit vector from memory and re-acquire from a new angle. Use indirect fire (mortar) on the last known position when the enemy is hidden. Flank rather than charge. Share contacts with the team. Radio style: calm, precise, analytical.',
    locks: { stances: ['skirmish', 'flank', 'hunt', 'retreat'], range: [35, 60], fire: 'free' },
    variants: [
      { name: {"ru": "Снайперская сеть", "en": "Sniper net", "zh": "狙击网"}, doctrine: 'This match: SNIPER NET. Spread out to long lanes and hold, share contacts, never close in.', preset: { stance: 'skirmish', move_to: 'cover', engage_range: 50 } },
      { name: {"ru": "Охота по памяти", "en": "Memory hunt", "zh": "记忆追猎"}, doctrine: 'This match: MEMORY HUNT. Move fast between covers toward the last known positions and mortar them blind.', preset: { stance: 'hunt', move_to: 'last_known', engage_range: 40 } },
      { name: {"ru": "Ложное отступление", "en": "False retreat", "zh": "佯装撤退"}, doctrine: 'This match: FALSE RETREAT. Show yourself, fall back through a lane, and catch the pursuer from two sides.', preset: { stance: 'retreat', move_to: 'cover', engage_range: 45 } },
    ],
    preset: { stance: 'skirmish', move_to: 'cover', engage_range: 46, fire_discipline: 'confident', use_support: 'indirect', target: 'weakest' },
  },
  volt: {
    id: 'volt', name: {"ru": "Вера «VOLT» Коваль", "en": "Vera “VOLT” Koval", "zh": "薇拉·“VOLT”·科瓦尔"}, short: 'VOLT', team: 'BLACK SPARK', color: '#ff3ad6', palette: 'spark', chassis: 'spark', map: 'neon',
    motto: {"ru": "Если тебя уже поняли, меняй правила.", "en": "Once they’ve figured you out, change the rules.", "zh": "一旦被看穿，就改写规则。"}, ...art('vera'),
    bio: {"ru": "Пилотировала на подпольных боях в Доках, пока Акт не закрыл и их. Собирает мехов из гоночных рам и учит их вести себя так, как вела бы она сама.", "en": "Fought underground in the Docks until the Act shut those down too. Builds mechs from racing frames and teaches them to fight the way she used to.", "zh": "曾在码头区的地下格斗中驾驶机甲，直到法案连它们也一并取缔。她用赛车框架拼装机甲，教它们像她当年那样战斗。"},
    doctrine: 'CHAOS DOCTRINE (coach VOLT, BLACK SPARK). Change behaviour every 6-10 seconds so the enemy cannot model you: cautious hold, then sudden all-in rush, then a fake retreat into a flank. Rotate the pattern between units so the team never moves in sync. Take risks. When the enemy commits, switch rules. Radio style: playful, loud, slangy.',
    locks: { stances: ['assault', 'flank', 'hunt', 'skirmish', 'retreat'], range: [8, 24], fire: 'free' },
    variants: [
      { name: {"ru": "Волны", "en": "Waves", "zh": "波浪"}, doctrine: 'This match: WAVES. Cycle hold → rush → fake retreat → flank every 8 seconds.', preset: {} },
      { name: {"ru": "Короткое замыкание", "en": "Short circuit", "zh": "短路"}, doctrine: 'This match: SHORT CIRCUIT. Everybody rushes the same target at once from different sides.', preset: { stance: 'assault', move_to: 'enemy', engage_range: 12 } },
      { name: {"ru": "Рой", "en": "Swarm", "zh": "蜂群"}, doctrine: 'This match: SWARM. Keep moving, never stand still, harass from flanks and switch targets often.', preset: { stance: 'flank', move_to: 'flank_right', engage_range: 18 } },
    ],
    preset: { stance: 'phase', move_to: 'enemy', engage_range: 16, fire_discipline: 'free', use_support: 'on_contact', target: 'nearest' },
  },
  chess: {
    id: 'chess', name: {"ru": "Диего «CHESS» Морено", "en": "Diego “CHESS” Moreno", "zh": "迭戈·“CHESS”·莫雷诺"}, short: 'CHESS', team: 'RED CASTLE', color: '#ffc15e', palette: 'castle', chassis: 'castle', map: 'citadel',
    motto: {"ru": "Позиция стреляет без патронов.", "en": "Position is a weapon that needs no ammo.", "zh": "站位是一种不需要弹药的武器。"}, ...art('diego'),
    bio: {"ru": "В финале на Кольце тренировал команду соперника, потом добился принятия Акта о пустых кабинах. Планирует матч заранее, клетка за клеткой, и не оставляет места случаю.", "en": "Coached the opposing team in the Ring final, then pushed the Empty Cockpit Act through. Plans each match square by square and leaves nothing to chance.", "zh": "“环形”决赛中执教对方队伍，之后推动了《空驾驶舱法案》。他逐格规划每场比赛，不给偶然留任何余地。"},
    doctrine: 'POSITIONAL DOCTRINE (coach CHESS, RED CASTLE). Assign roles: BAIT holds the center and draws fire, KNIGHT flanks wide to the side the enemy is facing away from, QUEEN (heavy) holds a long-range lane and finishes whoever engages the bait. Focus fire on one target at a time. Do not attack the robot — attack the space it must retreat into. Never trade in the open without support. Radio style: chess metaphors, confident.',
    locks: { stances: ['assault', 'flank', 'hold', 'skirmish', 'bait'], range: [14, 50], noRetreat: true, fire: 'free' },
    variants: [
      { name: {"ru": "Слон-приманка", "en": "Bishop bait", "zh": "主教诱饵"}, doctrine: 'This match: BISHOP BAIT. Bait holds the centre, knight flanks wide, queen finishes from a lane.', preset: {} },
      { name: {"ru": "Крепость", "en": "Fortress", "zh": "堡垒"}, doctrine: 'This match: FORTRESS. Everyone holds a strong central position in mutual support and lets the enemy come.', preset: { stance: 'hold', move_to: 'center', engage_range: 35 } },
      { name: {"ru": "Гамбит", "en": "Gambit", "zh": "弃子"}, doctrine: 'This match: GAMBIT. Sacrifice tempo: retreat one piece to pull the enemy, then all three strike the over-extended unit.', preset: { stance: 'retreat', move_to: 'cover', engage_range: 30 } },
    ],
    preset: { stance: 'role', move_to: 'center', engage_range: 30, fire_discipline: 'confident', use_support: 'finisher', target: 'focus' },
  },
};

export const PLAYER_TEAM = { id: 'player', team: 'NULL SIGNAL', color: '#3fe0f5', palette: 'signal' };

export const ECHO = { name: {"ru": "ЭХО", "en": "ECHO", "zh": "ECHO"}, title: {"ru": "командный ИИ NULL SIGNAL", "en": "NULL SIGNAL command AI", "zh": "NULL SIGNAL 指挥 AI"}, color: '#3fe0f5' };
export const ANNOUNCER = { name: {"ru": "ДИКТОР ЛИГИ", "en": "LEAGUE ANNOUNCER", "zh": "联赛解说"}, color: '#ffb347' };
