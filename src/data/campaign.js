// Story campaign: four chapters, each a duel followed by a 3v3.
// Dialogue lines: { s: speaker ('ram'|'ghost'|'volt'|'chess'|'echo'|'announcer'), p: pose 0..2, t: { ru, en, zh } }.

const u = (name, chassis, weapons, extra = {}) => ({ name, chassis, weapons, ...extra });
const T = (ru, en, zh) => ({ ru, en, zh });
// Dev-only reference loadouts for the balance simulator (?advice=1); never shown to players.
const U = (chassis, weapons, strategy) => ({ chassis, weapons, strategy });

export const PROLOGUE = [
  { s: 'announcer', t: T('Меридиан, 2071 год. Седьмой сезон Лиги Директив.', 'Meridian, 2071. Season seven of the League of Directives.', '子午城，2071 年。指令联赛第七赛季。') },
  { s: 'announcer', t: T('Семь лет назад на стадионе «Кольцо» у пилотируемого меха пробило реактор. Пилот замер на четыре секунды. Мех вошёл в восточную трибуну. Тридцать один человек погиб.', 'Seven years ago, at the Ring stadium, a piloted mech breached its reactor. The pilot froze for four seconds. The mech walked into the east stand. Thirty-one people died.', '七年前，在“环形”体育场，一台有人驾驶的机甲反应堆破裂。驾驶员僵住了四秒。机甲走进了东看台。三十一人死亡。') },
  { s: 'announcer', t: T('Через месяц приняли Акт о пустых кабинах. С тех пор в мехе нет человека. Тренер пишет директивы, командный ИИ превращает их в манёвры.', 'A month later the Empty Cockpit Act passed. No human has sat in a league mech since. Coaches write directives; a command AI turns them into manoeuvres.', '一个月后，《空驾驶舱法案》通过。从那以后，联赛机甲里再没有人。教练写下指令，指挥 AI 把它们变成战术动作。') },
  { s: 'echo', t: T('Командный узел ЭХО онлайн. Здравствуйте, тренер.', 'Command node ECHO online. Hello, coach.', '指挥节点 ECHO 上线。你好，教练。') },
  { s: 'echo', t: T('Вы пишете стратегию каждому меху. Я раздаю инструкции трём потокам JEV: ногам, торсу и оружию. Когда бой меняется, я переписываю план.', 'You write a strategy for each mech. I hand instructions to three JEV streams: legs, torso, weapons. When the fight changes, I rewrite the plan.', '你为每台机甲写下战略。我把指令分给三条 JEV 决策流：腿、躯干、武器。战局一变，我就重写计划。') },
  { s: 'echo', t: T('У нас три списанных PATHFINDER с аукциона лиги и я. Меня нашли на свалке в Доках. В поле спонсора у меня записано «null», отсюда и название команды: NULL SIGNAL.', 'We have three retired PATHFINDERs from a league auction, and me. I was pulled out of a scrapyard in the Docks. My sponsor field reads “null”, so the team is called NULL SIGNAL.', '我们有三台从联赛拍卖会买来的退役 PATHFINDER，还有我。我是从码头区的废料场里被捡回来的。我的赞助商字段写着“null”，所以队名叫 NULL SIGNAL。') },
  { s: 'echo', t: T('Часть моих журналов за 2064 год повреждена. Это подождёт. Первый соперник по сетке: Маркус Вейл, IRON HOUNDS.', 'Part of my logs from 2064 is corrupted. That can wait. First on the bracket: Marcus Vail, IRON HOUNDS.', '我 2064 年的部分日志已损坏。这个以后再说。赛程上的第一个对手：马库斯·维尔，IRON HOUNDS。') },
];

export const CHAPTERS = [
  {
    id: 'ram', trainer: 'ram', title: T('Глава I · Давление', 'Chapter I · Pressure', '第一章 · 压迫'), map: 'foundry',
    battles: [
      {
        id: 'ram-duel', mode: 'duel', enemyHp: 1.1, title: T('Проверка на прочность', 'Stress test', '抗压测试'),
        enemies: [u('BULLDOZER', 'hound', ['scatter', 'scatter', 'missile'])],
        unlock: { weapons: ['scatter'] },
        advice: { teamNote: '', units: [U('pathfinder', ['autocannon', 'autocannon', 'missile'], 'Стой на месте у своей базы и держи 35–45 м: BULLDOZER сам придёт. Если он ближе 25 м — отходи лицом к нему и стреляй. Ракеты сразу при контакте.')] },
        intro: [
          { s: 'ram', p: 0, t: T('Три пенсионных PATHFINDER и ИИ со свалки. Лига перестала проверять заявки.', 'Three pensioned PATHFINDERs and an AI from a scrapyard. The league stopped checking entries.', '三台退休的 PATHFINDER，加上一个废料场里捡来的 AI。联赛已经不审核报名了。') },
          { s: 'ram', p: 2, t: T('Я учил пилотов двадцать лет. Плохой пилот медлит. Хороший заставляет медлить противника.', 'I trained pilots for twenty years. A bad pilot hesitates. A good one makes the other side hesitate.', '我训练了二十年驾驶员。差的驾驶员会犹豫。好的驾驶员让对手犹豫。') },
          { s: 'ram', p: 1, t: T('BULLDOZER пойдёт прямо на тебя. Пиши директиву. Посмотрим, сколько она стоит.', 'BULLDOZER will walk straight at you. Write your directive. Let’s see what it’s worth.', 'BULLDOZER 会直接冲向你。写下你的指令。让我们看看它值几斤几两。') },
          { s: 'echo', t: T('Разведка: HOUND, два дробовика и ракеты. Броня стандартная, плиты немного гасят взрывы. Дальше двадцати метров дробь рассеивается.', 'Intel: HOUND, two shotguns and rockets. Standard armor; the plates soak some blast damage. Past twenty metres the pellets spread out.', '情报：HOUND 底盘，两把霰弹枪和火箭。装甲普通，装甲板能吸收部分爆炸伤害。二十米外弹丸会散开。') },
        ],
        win: [
          { s: 'ram', p: 0, t: T('Ты так и не дал ему подойти. Это расчёт, а расчёт я уважаю.', 'You never let him close. That’s arithmetic, and I respect arithmetic.', '你始终没让他靠近。这是算计，我欣赏算计。') },
          { s: 'ram', p: 2, t: T('Дуэль проверяет одного меха. Завтра приведу всю стаю.', 'A duel tests one mech. Tomorrow I bring the whole pack.', '单挑只考验一台机甲。明天我把整群猎犬都带来。') },
        ],
        lose: [{ s: 'ram', p: 1, t: T('Он дошёл до тебя за двенадцать секунд. Посчитай, сколько раз ты успел выстрелить.', 'He reached you in twelve seconds. Count how many shots you fired.', '他十二秒就冲到你面前。数数你开了几枪。') }],
      },
      {
        id: 'ram-squad', mode: 'squad', title: T('Стая', 'The pack', '猎犬群'),
        enemies: [
          u('MASTIFF', 'hound', ['autocannon', 'rotary', 'missile']),
          u('BULLDOZER', 'hound', ['scatter', 'rotary', 'missile']),
          u('CERBERUS', 'hound', ['scatter', 'autocannon', 'missile'], { elite: true }),
        ],
        unlock: { chassis: ['hound'], weapons: ['mortar'] },
        advice: { teamNote: 'Держитесь вместе. Все бьют одну цель — ближайшую. Держите 30–40 м и отходите лицом к врагу.', units: [U('pathfinder', ['autocannon', 'autocannon', 'missile'], 'Держи 30–40 м, бей ближайшего, ракеты сразу при контакте.'), U('pathfinder', ['autocannon', 'autocannon', 'missile'], 'Держись рядом с ATLAS, бей его цель, держи 30–40 м.'), U('pathfinder', ['autocannon', 'autocannon', 'missile'], 'Держись рядом с ATLAS, бей его цель, держи 30–40 м.')] },
        intro: [
          { s: 'ram', p: 1, t: T('Протез мне поставили в шестьдесят четвёртом. Я вскрывал кабину на Кольце, пока мой ученик сидел внутри и не двигался.', 'I got this arm in sixty-four. I was prying open a cockpit at the Ring while my student sat inside and didn’t move.', '这条义肢是六四年装上的。在“环形”体育场，我撬开驾驶舱时，我的学生坐在里面一动不动。') },
          { s: 'ram', p: 0, t: T('Четыре секунды. С тех пор мои мехи не ждут ни одной. CERBERUS ведёт стаю.', 'Four seconds. Since then my mechs don’t wait for one. CERBERUS leads the pack.', '四秒。从那以后，我的机甲一秒都不会等。CERBERUS 领队。') },
          { s: 'echo', t: T('Разведка: три HOUND, CERBERUS элитный. Тренер RAM каждый раз выбирает один из трёх планов атаки. Какой сегодня, узнаем в бою.', 'Intel: three HOUNDs, CERBERUS is elite. Coach RAM picks one of three attack plans each match. We’ll find out which in the fight.', '情报：三台 HOUND，CERBERUS 是精英。RAM 教练每场从三种进攻方案中选一种。今天是哪种，打起来才知道。') },
        ],
        win: [
          { s: 'ram', p: 0, t: T('Стая выдохлась раньше тебя. Со мной такое случается редко.', 'The pack ran out of breath before you did. That rarely happens to me.', '猎犬群先没了力气。这种事很少发生在我身上。') },
          { s: 'ram', p: 2, t: T('Забирай шасси HOUND и миномёт. Против Накамуры пригодится то, что бьёт из-за угла.', 'Take the HOUND chassis and the mortar. Against Nakamura you’ll want something that hits around corners.', '拿走 HOUND 底盘和迫击炮。对付中村，你需要能隔墙打击的东西。') },
          { s: 'ram', p: 0, t: T('Её мехи прячутся и считают. Пули их почти не берут, взрывы берут.', 'Her mechs hide and calculate. Bullets barely scratch them. Explosions do.', '她的机甲会躲起来计算。子弹几乎打不动它们，爆炸可以。') },
        ],
        lose: [{ s: 'ram', p: 1, t: T('Ты дрался тремя одиночками. Стаю бьют стаей.', 'You fought as three loners. You beat a pack with a pack.', '你们是三个独行侠在打。要用狼群打狼群。') }],
      },
    ],
  },
  {
    id: 'ghost', trainer: 'ghost', title: T('Глава II · Туман', 'Chapter II · Whiteout', '第二章 · 白雾'), map: 'whiteout',
    battles: [
      {
        id: 'ghost-duel', mode: 'duel', title: T('Три секунды вперёд', 'Three seconds ahead', '领先三秒'),
        enemies: [u('WRAITH', 'vector', ['railgun', 'autocannon', 'mortar'])],
        unlock: { weapons: ['railgun'] },
        advice: { teamNote: '', units: [U('hound', ['scatter', 'scatter', 'missile'], 'Атакуй, сближайся до 15 м и дави дробовиками. Ракеты сразу при контакте.')] },
        intro: [
          { s: 'ghost', p: 0, t: T('Добрый вечер. Я посмотрела ваш матч с Маркусом. Сорок один процент ваших выстрелов ушёл в пустоту.', 'Good evening. I watched your match with Marcus. Forty-one percent of your shots hit nothing.', '晚上好。我看了你和马库斯的比赛。你百分之四十一的射击打空了。') },
          { s: 'ghost', p: 2, t: T('Прошивку сенсоров, на которой ходят все мехи лиги, писала я. После Акта её сделали обязательной. Ваш PATHFINDER тоже видит моими глазами.', 'I wrote the sensor firmware every league mech runs. After the Act it became mandatory. Your PATHFINDER sees through my eyes too.', '联赛所有机甲运行的传感器固件是我写的。法案通过后它成了强制标准。你的 PATHFINDER 也在用我的眼睛看。') },
          { s: 'ghost', p: 1, t: T('Метель режет обзор вдвое. Кто видит меньше, должен больше помнить.', 'The blizzard halves your sight. Whoever sees less has to remember more.', '暴风雪让视野减半。看得越少，就得记得越多。') },
          { s: 'echo', t: T('Разведка: VECTOR. Дефлекторы рассеивают пули, композит трескается от взрывов. Рельсотрон стреляет через полсекунды после красного луча.', 'Intel: VECTOR. Deflectors scatter bullets; the composite cracks under explosions. The railgun fires half a second after the red beam.', '情报：VECTOR 底盘。偏转护盾能分散子弹，复合装甲怕爆炸。红色光束亮起半秒后，电磁炮开火。') },
        ],
        win: [
          { s: 'ghost', p: 0, t: T('Мой прогноз давал вам двадцать два процента. Пересчитаю модель.', 'My forecast gave you twenty-two percent. I’ll rerun the model.', '我的预测给你百分之二十二的胜率。我会重新跑一遍模型。') },
          { s: 'ghost', p: 2, t: T('Завтра выйдут все три моих VECTOR. У них одна карта на троих.', 'Tomorrow all three of my VECTORs come out. They share one map between them.', '明天我的三台 VECTOR 全部出场。它们三个共用一张地图。') },
        ],
        lose: [{ s: 'ghost', p: 0, t: T('Вы вышли из тумана в точке, которую я отметила за шесть секунд до выстрела.', 'You walked out of the fog at the spot I marked six seconds before the shot.', '你从雾里走出来的位置，我在开火前六秒就标好了。') }],
      },
      {
        id: 'ghost-squad', mode: 'squad', title: T('Тихий вектор', 'Silent vector', '静默矢量'),
        enemies: [
          u('SHADE', 'vector', ['railgun', 'autocannon', 'mortar']),
          u('WRAITH', 'vector', ['autocannon', 'rotary', 'mortar']),
          u('PHANTOM', 'vector', ['railgun', 'railgun', 'mortar'], { elite: true }),
        ],
        unlock: { chassis: ['vector'] },
        intro: [
          { s: 'ghost', p: 2, t: T('На Кольце пилот видел пробой реактора на своём экране. Сенсоры сработали правильно. Решение принимал человек.', 'At the Ring the pilot saw the reactor breach on his screen. The sensors worked. A human made the call.', '在“环形”体育场，驾驶员在屏幕上看到了反应堆破裂。传感器没有出错，做决定的是人。') },
          { s: 'ghost', p: 0, t: T('Я хочу знать, может ли машина решать быстрее. Сегодня вы мой эксперимент.', 'I want to know whether a machine can decide faster. Tonight you’re my experiment.', '我想知道机器能不能决定得更快。今晚你就是我的实验。') },
          { s: 'echo', t: T('Разведка: три VECTOR с рельсами и миномётами, контакты общие. Пули держат хорошо, взрывы плохо.', 'Intel: three VECTORs with rails and mortars, sharing contacts. They shrug off bullets and fold to explosives.', '情报：三台 VECTOR，配电磁炮和迫击炮，共享目标信息。抗子弹，怕爆炸。') },
        ],
        win: [
          { s: 'ghost', p: 1, t: T('Вы ломали мою модель быстрее, чем я её обновляла.', 'You broke my model faster than I could update it.', '你打破我模型的速度，比我更新它还快。') },
          { s: 'ghost', p: 0, t: T('Возьмите VECTOR. И присмотритесь к Вере. Её щиты глотают пули, а рельсовый удар их перегружает.', 'Take the VECTOR. And watch Vera. Her shields swallow bullets, and a rail hit overloads them.', '拿走 VECTOR。还有，留意薇拉。她的护盾能吞子弹，但电磁炮能让它们过载。') },
        ],
        lose: [{ s: 'ghost', p: 2, t: T('Каждый ваш мех знал меньше, чем любой мой.', 'Each of your mechs knew less than any of mine.', '你的每一台机甲，知道的都比我任何一台少。') }],
      },
    ],
  },
  {
    id: 'volt', trainer: 'volt', title: T('Глава III · Смена правил', 'Chapter III · New rules', '第三章 · 改写规则'), map: 'neon',
    battles: [
      {
        id: 'volt-duel', mode: 'duel', title: T('Живой провод', 'Livewire', '带电导线'),
        enemies: [u('LIVEWIRE', 'spark', ['arc', 'rotary', 'missile'])],
        unlock: { weapons: ['arc'] },
        advice: { teamNote: '', units: [U('hound', ['railgun', 'railgun', 'missile'], 'Держи 30–40 м, отходи лицом к врагу, если ближе 22 м. Рельса по открытой цели.')] },
        intro: [
          { s: 'volt', p: 1, t: T('Так это ты обыграл Аю? Она мне прислала три графика. Графика!', 'So you’re the one who beat Aya? She sent me three charts about it. Charts!', '就是你赢了亚？她给我发了三张图表。图表啊！') },
          { s: 'volt', p: 2, t: T('Я выросла в Доках, на подпольных боях. Акт закрыл и нас. Моё кресло пилота до сих пор стоит в гараже.', 'I grew up fighting underground in the Docks. The Act shut us down too. My pilot seat still sits in my garage.', '我在码头区的地下格斗里长大。法案连我们也一起封了。我的驾驶座现在还放在车库里。') },
          { s: 'volt', p: 0, t: T('Раз внутрь нельзя, пусть мехи дичают сами. LIVEWIRE меняет план каждые восемь секунд. Какой будет следующим, я и сама не всегда знаю.', 'If I can’t ride them, they can go wild on their own. LIVEWIRE changes plans every eight seconds. Half the time I don’t know which comes next.', '既然我不能坐进去，那就让机甲自己野起来。LIVEWIRE 每八秒换一次计划。下一个是哪个，我自己常常也不知道。') },
          { s: 'echo', t: T('Разведка: SPARK, самое быстрое шасси лиги. Щиты почти не пропускают пули и дугу. ЭМ-удар рельсы их перегружает. Дуга оглушает почти на секунду.', 'Intel: SPARK, the fastest chassis in the league. Its shields stop most bullets and arcs. An EM rail hit overloads them. The arc stuns for almost a second.', '情报：SPARK，联赛最快的底盘。护盾几乎挡住子弹和电弧，电磁炮的电磁冲击能让护盾过载。电弧能让目标瘫痪将近一秒。') },
        ],
        win: [
          { s: 'volt', p: 1, t: T('Ты прочитал её на третьей смене плана. Бесит. Обожаю.', 'You read her by the third switch. Annoying. I love it.', '你在第三次切换时就看穿了她。气死了。太喜欢了。') },
          { s: 'volt', p: 2, t: T('Реванш командой. Приводи всех, кого не жалко.', 'Rematch as a team. Bring everyone you can spare.', '团队赛再来一局。把你舍得的都带来。') },
        ],
        lose: [{ s: 'volt', p: 2, t: T('Ты стрелял по ней пулями. Она ест их на завтрак.', 'You shot bullets at her. She eats those for breakfast.', '你用子弹打她。她早饭就吃这个。') }],
      },
      {
        id: 'volt-squad', mode: 'squad', title: T('Короткое замыкание', 'Short circuit', '短路'),
        enemies: [
          u('SURGE', 'spark', ['plasma', 'rotary', 'missile']),
          u('LIVEWIRE', 'spark', ['arc', 'rotary', 'missile']),
          u('BLACKOUT', 'spark', ['arc', 'plasma', 'missile'], { elite: true }),
        ],
        unlock: { weapons: ['plasma'], chassis: ['spark'] },
        intro: [
          { s: 'volt', p: 1, t: T('SURGE, LIVEWIRE и BLACKOUT. Собирала их из списанных гоночных рам.', 'SURGE, LIVEWIRE and BLACKOUT. I built them out of retired racing frames.', 'SURGE、LIVEWIRE 和 BLACKOUT。我用退役的赛车底盘拼出来的。') },
          { s: 'volt', p: 0, t: T('Диего говорит, что матч решён до первого выстрела. На Кольце он тренировал команду соперника. Потом он и протащил Акт.', 'Diego says a match is decided before the first shot. At the Ring he coached the other team. Afterwards he pushed the Act through.', '迭戈说，比赛在第一枪之前就决定了。在“环形”体育场，他是对方队伍的教练。之后，是他推动了法案。') },
          { s: 'echo', t: T('Разведка: три SPARK с дугами и плазмой. Щиты держат кинетику и нагрев, рельса пробивает. Тактика меняется волнами.', 'Intel: three SPARKs with arcs and plasma. Their shields hold kinetic and thermal; rails punch through. Tactics shift in waves.', '情报：三台 SPARK，配电弧和等离子。护盾挡得住动能和热能，电磁炮能击穿。战术会一波一波地变。') },
        ],
        win: [
          { s: 'volt', p: 2, t: T('Держи SPARK и плазму. Рама раньше ездила на гонках, не роняй.', 'Take the SPARK and the plasma. That frame used to race, so don’t drop it.', '拿着 SPARK 和等离子枪。那副框架以前是赛车用的，别摔了。') },
          { s: 'volt', p: 0, t: T('Керамика CASTLE держит пули, взрывы и даже рельсу. А нагрев не любит. Я видела, как одна треснула от плазмы.', 'CASTLE ceramics hold bullets, blasts, even rails. They hate heat. I watched one crack under plasma.', 'CASTLE 的陶瓷装甲挡得住子弹、爆炸，甚至电磁炮。但它们怕热。我亲眼看见一台被等离子烧裂。') },
        ],
        lose: [{ s: 'volt', p: 1, t: T('Бзз. Ты стоял на месте, а мы успели дважды сменить правила.', 'Bzzt. You stood still while we changed the rules twice.', '滋滋。你站着不动，我们已经改了两次规则。') }],
      },
    ],
  },
  {
    id: 'chess', trainer: 'chess', title: T('Глава IV · Эндшпиль', 'Chapter IV · Endgame', '第四章 · 残局'), map: 'citadel',
    battles: [
      {
        id: 'chess-duel', mode: 'duel', title: T('Дебют', 'Opening', '开局'),
        enemies: [u('KNIGHT', 'castle', ['autocannon', 'plasma', 'missile'])],
        unlock: {},
        advice: { teamNote: '', units: [U('spark', ['plasma', 'arc', 'missile'], 'Атакуй, сближайся до 18 м и жги плазмой, дугой оглушай. Ракеты при контакте.')] },
        intro: [
          { s: 'chess', p: 0, t: T('Добро пожаловать в Цитадель. Площадь расчерчена на клетки по двадцать метров. Мои мехи знают каждую.', 'Welcome to the Citadel. The plaza is cut into twenty-metre squares. My mechs know every one.', '欢迎来到城堡。广场被划成二十米见方的格子。我的机甲熟悉每一格。') },
          { s: 'chess', p: 2, t: T('На Кольце я сидел в соседней ложе. Видел, как четыре секунды импровизации стоили тридцать одну жизнь. С тех пор я не импровизирую.', 'At the Ring I sat in the next box. I watched four seconds of improvisation cost thirty-one lives. I haven’t improvised since.', '在“环形”体育场，我就坐在隔壁包厢。我看着四秒钟的临场发挥夺走了三十一条命。从那以后，我不再临场发挥。') },
          { s: 'chess', p: 1, t: T('KNIGHT сыграет дебют. У меня три варианта, и ни один не случайный.', 'KNIGHT will play the opening. I have three lines prepared, none of them random.', 'KNIGHT 会走开局。我准备了三种变化，没有一种是随机的。') },
          { s: 'echo', t: T('Разведка: CASTLE. Керамика держит пули, взрывы и рельсу. Хуже всего переносит нагрев.', 'Intel: CASTLE. Ceramic plating holds bullets, blasts and rails. It takes heat worst of all.', '情报：CASTLE 底盘。陶瓷装甲挡得住子弹、爆炸和电磁炮，最怕高温。') },
        ],
        win: [
          { s: 'chess', p: 0, t: T('Хороший ответ. Я его записал.', 'A good reply. I’ve written it down.', '回应得不错。我记下来了。') },
          { s: 'chess', p: 2, t: T('Финал завтра. Ферзь ждёт.', 'The final is tomorrow. The queen is waiting.', '决赛在明天。王后在等你。') },
        ],
        lose: [{ s: 'chess', p: 1, t: T('Вы атаковали фигуру. Я занял клетку, куда ей было отступать.', 'You attacked the piece. I took the square it was going to retreat to.', '你在进攻棋子。我先占了它要退的那一格。') }],
      },
      {
        id: 'chess-squad', mode: 'squad', title: T('Финал сезона', 'Season final', '赛季决赛'),
        enemies: [
          u('BISHOP', 'castle', ['autocannon', 'rotary', 'missile'], { role: 'bait' }),
          u('KNIGHT', 'castle', ['plasma', 'scatter', 'missile'], { role: 'knight' }),
          u('QUEEN', 'castle', ['railgun', 'autocannon', 'missile'], { elite: true, role: 'queen' }),
        ],
        unlock: { chassis: ['castle'] },
        intro: [
          { s: 'announcer', t: T('Финал седьмого сезона. NULL SIGNAL против RED CASTLE.', 'The season seven final. NULL SIGNAL versus RED CASTLE.', '第七赛季决赛。NULL SIGNAL 对阵 RED CASTLE。') },
          { s: 'chess', p: 0, t: T('Вчера я проверил сигнатуру вашего ИИ. Узел ЭХО стоял ассистентом в мехе на Кольце.', 'Last night I checked your AI’s signature. The ECHO node was the assist unit in the mech at the Ring.', '昨晚我查了你们 AI 的签名。ECHO 节点就是“环形”那台机甲里的辅助单元。') },
          { s: 'echo', t: T('Это правда. Повреждённые журналы за 2064 год восстановились, когда мы вошли в Цитадель. Я рекомендовал пилоту заглушить реактор. Он молчал четыре секунды.', 'It’s true. The corrupted 2064 logs recovered when we entered the Citadel. I advised the pilot to scram the reactor. He didn’t answer for four seconds.', '是真的。我们进入城堡时，2064 年的损坏日志恢复了。我建议驾驶员紧急关停反应堆。他四秒没有回应。') },
          { s: 'chess', p: 1, t: T('Значит, сегодня машина, которой тогда не дали действовать самой, играет против моего плана. Хорошо. Слон, конь, ферзь.', 'So tonight the machine that wasn’t allowed to act on its own back then plays against my plan. Good. Bishop, knight, queen.', '所以今晚，当年不被允许自主行动的机器，要来挑战我的计划。很好。主教、骑士、王后。') },
          { s: 'echo', t: T('Разведка: три CASTLE, QUEEN элитная. Керамика хуже всего держит нагрев. Они играют связкой и разбирают одиночку за несколько секунд.', 'Intel: three CASTLEs, QUEEN is elite. The ceramics are weakest to heat. They play as a unit and take apart a lone mech in seconds.', '情报：三台 CASTLE，QUEEN 是精英。陶瓷装甲最怕高温。他们配合作战，落单的机甲几秒内就会被拆掉。') },
        ],
        win: [
          { s: 'chess', p: 0, t: T('Шах и мат. Мне. Этот ход я не предусмотрел.', 'Checkmate. On me. I didn’t see that move coming.', '将死。被将死的是我。这一步我没算到。') },
          { s: 'chess', p: 2, t: T('Оставьте CASTLE себе. Добро пожаловать в Лигу, тренер.', 'Keep the CASTLE. Welcome to the League, coach.', 'CASTLE 留给你。欢迎加入联赛，教练。') },
          { s: 'announcer', t: T('NULL SIGNAL — чемпионы седьмого сезона Лиги Директив.', 'NULL SIGNAL are the champions of season seven of the League of Directives.', 'NULL SIGNAL 成为指令联赛第七赛季冠军。') },
          { s: 'ram', p: 2, t: T('В восьмом сезоне я приду за тобой первым. И стая будет больше.', 'Season eight, I’m coming for you first. With a bigger pack.', '第八赛季，我第一个来找你。带上更大的狼群。') },
          { s: 'ghost', p: 0, t: T('Я уже обучаю модель на записях этого финала.', 'I’m already training a model on this final’s footage.', '我已经在用这场决赛的录像训练模型了。') },
          { s: 'volt', p: 1, t: T('Реванш! И я хочу прочитать журналы ЭХО. Все.', 'Rematch! And I want to read ECHO’s logs. All of them.', '再来一局！还有，我要看 ECHO 的日志。全部。') },
          { s: 'echo', t: T('Тренер, в шестьдесят четвёртом я ждал команды, которая так и не пришла. Сегодня команды приходили каждую секунду. Спасибо.', 'Coach, in sixty-four I waited for an order that never came. Tonight the orders came every second. Thank you.', '教练，六四年我等的那道命令始终没有来。今晚，命令每秒都在到来。谢谢你。') },
        ],
        lose: [{ s: 'chess', p: 0, t: T('Хорошая партия. Расставим фигуры заново.', 'A good game. Let’s set up the pieces again.', '一盘好棋。我们重新摆子。') }],
      },
    ],
  },
];

export const START_UNLOCKS = { weapons: ['autocannon', 'rotary', 'missile'], chassis: ['pathfinder'] };

export const PLAYER_ROSTER = ['ATLAS', 'BASTION', 'LANCER'];

export const DEFAULT_STRATEGIES = ['', '', ''];

export function allBattles() {
  return CHAPTERS.flatMap(ch => ch.battles.map(b => ({ ...b, chapter: ch })));
}
