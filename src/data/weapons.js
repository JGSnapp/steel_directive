// Weapon catalogue. `mount` decides the slot: arm weapons go to the left/right
// arm hardpoints, support weapons sit on the shoulder.
// kind: projectile | pellets | rail | beam | arc | missile | mortar
export const WEAPONS = {
  autocannon: {
    id: 'autocannon', dtype: 'kinetic', name: 'AC-12 Autocannon', short: 'AC-12', mount: 'arm', kind: 'projectile',
    damage: 7, rate: .22, range: 62, speed: 85, spread: .012, heat: 3.5, ammo: Infinity, tolerance: .08,
    color: 0xffd28a, blurb: {"ru": "Стандарт лиги со дня основания. 7 урона за выстрел, бьёт до 62 м, греется медленно. Против кинетических щитов SPARK и керамики CASTLE теряет почти половину урона.", "en": "League standard since day one. 7 damage a shot out to 62 m, slow to heat. Loses almost half its damage against SPARK shields and CASTLE ceramics.", "zh": "联赛建立之初的标配。每发 7 点伤害，射程 62 米，升温慢。打 SPARK 护盾和 CASTLE 陶瓷装甲时伤害几乎减半。"},
  },
  rotary: {
    id: 'rotary', dtype: 'kinetic', name: 'RX-6 Rotary', short: 'RX-6', mount: 'arm', kind: 'projectile',
    damage: 2.1, rate: .07, range: 42, speed: 95, spread: .055, heat: 2.2, ammo: Infinity, tolerance: .14,
    color: 0xffb35a, blurb: {"ru": "Шесть стволов, пятнадцать выстрелов в секунду, разброс широкий. Перегревается секунд за семь, если не отпускать гашетку.", "en": "Six barrels, fifteen rounds a second, wide spread. Overheats in about seven seconds of continuous fire.", "zh": "六管，每秒十五发，散布很大。持续射击约七秒就会过热。"},
  },
  scatter: {
    id: 'scatter', dtype: 'kinetic', name: 'SG-4 Scatter', short: 'SG-4', mount: 'arm', kind: 'pellets',
    damage: 3.4, pellets: 8, rate: 1.05, range: 24, speed: 80, spread: .11, heat: 9, ammo: Infinity, tolerance: .2,
    color: 0xffe0a0, blurb: {"ru": "Восемь дробин за выстрел. В упор снимает с HOUND больше, чем автопушка за три секунды. На двадцати пяти метрах почти бесполезен.", "en": "Eight pellets a shot. Point-blank it strips more off a HOUND than an autocannon does in three seconds. Nearly useless past twenty-five metres.", "zh": "每发八颗弹丸。贴脸时对 HOUND 的伤害比机炮三秒还多。超过二十五米几乎无用。"},
  },
  railgun: {
    id: 'railgun', dtype: 'rail', name: 'LR-9 Railgun', short: 'LR-9', mount: 'arm', kind: 'rail',
    damage: 34, rate: 3.4, charge: .65, range: 100, spread: 0, heat: 26, ammo: Infinity, tolerance: .035,
    color: 0x7fd4ff, blurb: {"ru": "Заряжается 0,65 секунды и попадает мгновенно на любую дистанцию до 100 м. Во время зарядки цель видит красный луч. ЭМ-удар перегружает щиты SPARK.", "en": "Charges for 0.65 s, then hits instantly at any range up to 100 m. The target sees a red beam while it charges. The EM hit overloads SPARK shields.", "zh": "充能 0.65 秒，然后在 100 米内瞬间命中。充能期间目标能看到红色光束。电磁冲击能让 SPARK 护盾过载。"},
  },
  plasma: {
    id: 'plasma', dtype: 'thermal', name: 'PL-3 Plasma Lance', short: 'PL-3', mount: 'arm', kind: 'beam',
    damage: 2.1, rate: .1, range: 30, spread: 0, heat: 2.4, ammo: Infinity, tolerance: .1,
    color: 0xff4fd8, blurb: {"ru": "Непрерывный луч до 30 м, урон идёт каждую десятую секунды. Керамика CASTLE от нагрева трескается, щиты SPARK его почти гасят.", "en": "A continuous beam out to 30 m, dealing damage every tenth of a second. CASTLE ceramics crack under the heat; SPARK shields mostly absorb it.", "zh": "持续光束，射程 30 米，每十分之一秒造成伤害。CASTLE 陶瓷装甲遇热会开裂，SPARK 护盾能吸收大部分。"},
  },
  arc: {
    id: 'arc', dtype: 'thermal', name: 'VX Arc Caster', short: 'VX-ARC', mount: 'arm', kind: 'arc',
    damage: 15, rate: 1.7, range: 20, spread: 0, heat: 14, stun: .9, chain: 11, ammo: Infinity, tolerance: .3,
    color: 0xc98bff, blurb: {"ru": "Разряд до 20 м оглушает цель на 0,9 секунды и перескакивает на соседа в радиусе 11 м. Оглушённый мех не стреляет и не двигается.", "en": "A discharge out to 20 m stuns the target for 0.9 s and jumps to a neighbour within 11 m. A stunned mech can’t move or shoot.", "zh": "20 米内的放电让目标瘫痪 0.9 秒，并跳到 11 米内的另一台机甲上。瘫痪的机甲无法移动和射击。"},
  },
  missile: {
    id: 'missile', dtype: 'explosive', name: 'VLR-6 Rocket Pod', short: 'VLR-6', mount: 'shoulder', kind: 'missile',
    damage: 15, salvo: 3, radius: 3.5, rate: 3.6, range: 70, speed: 38, spread: 2.2, heat: 10, ammo: 8, tolerance: .12,
    color: 0xff7a3b, blurb: {"ru": "Залп из трёх неуправляемых ракет в упреждённую точку, взрыв радиусом 3,5 м. Если цель сменила курс, залп уходит в пустоту. Восемь залпов на бой.", "en": "A salvo of three unguided rockets at the predicted position, 3.5 m blast radius. If the target changes course, the salvo hits empty ground. Eight salvos per match.", "zh": "三枚无制导火箭齐射到预判位置，爆炸半径 3.5 米。目标一变向，齐射就落空。每场八次齐射。"},
  },
  mortar: {
    id: 'mortar', dtype: 'explosive', name: 'MT-2 Mortar', short: 'MT-2', mount: 'shoulder', kind: 'mortar',
    damage: 24, radius: 6, rate: 3.2, range: 85, minRange: 14, speed: 0, spread: 3.2, heat: 8, ammo: 10, tolerance: Math.PI,
    color: 0xffc36a, blurb: {"ru": "Навесной огонь по последней известной позиции, прямая видимость не нужна. Метка на земле предупреждает обе стороны. Взрывы особенно опасны для композита VECTOR.", "en": "Lobs shells at the last known position, no line of sight required. A ground marker warns both sides. Blasts are especially hard on VECTOR composite.", "zh": "向最后已知位置曲射，不需要视线。地面标记会同时提醒双方。爆炸对 VECTOR 的复合装甲尤其致命。"},
  },
};

export const DAMAGE_TYPES = {
  kinetic: { short: {"ru": "КИН", "en": "KIN", "zh": "动能"}, name: {"ru": "кинетика", "en": "kinetic", "zh": "动能"} },
  explosive: { short: {"ru": "ВЗР", "en": "EXP", "zh": "爆炸"}, name: {"ru": "взрыв", "en": "explosive", "zh": "爆炸"} },
  rail: { short: {"ru": "ЭМ", "en": "EM", "zh": "电磁"}, name: {"ru": "электромагнитный", "en": "electromagnetic", "zh": "电磁"} },
  thermal: { short: {"ru": "ТЕРМ", "en": "THM", "zh": "热能"}, name: {"ru": "нагрев", "en": "thermal", "zh": "热能"} },
};

export const ARM_WEAPONS = Object.values(WEAPONS).filter(w => w.mount === 'arm').map(w => w.id);
export const SUPPORT_WEAPONS = Object.values(WEAPONS).filter(w => w.mount === 'shoulder').map(w => w.id);
