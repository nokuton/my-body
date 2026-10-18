/* 種目・メニュー・症状のデータ。
 * 種目を足すときは EXERCISES に1件追加し、MENUS の items に id を書く。
 * 動作見本(animation)は builtin / image / video のどれでも差し替えられる。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MBP = Object.assign(root.MBP || {}, { Data: api });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const list = [
    {
      id: 'neck_tilt', name: '首の横たおし', kind: 'stretch', measure: 'time',
      difficulty: 1, impact: 'low', posture: 'seated', modes: ['work', 'home'],
      durationSec: 15, sets: 2, restSec: 5, setLabels: ['右側', '左側'],
      description: [
        '背すじを伸ばして座り、肩の力を抜きます。',
        '頭をゆっくり横にたおし、首の横が軽く伸びるところで止めます。',
        '呼吸を止めずに、そのまま保ちます。',
      ],
      cautions: [
        '首を回したり、反動をつけたりしないでください。',
        'しびれや痛みが出たらすぐにやめてください。',
      ],
      animation: { kind: 'builtin', ref: 'neck' },
      alternatives: ['shoulder_roll'],
    },
    {
      id: 'shoulder_roll', name: '肩回し', kind: 'mobility', measure: 'reps',
      difficulty: 1, impact: 'low', posture: 'seated', modes: ['work', 'home'],
      reps: 10, secPerRep: 2, sets: 1, restSec: 0,
      description: [
        'イスに座って背すじを伸ばし、腕は体の横に力を抜いて下ろします。',
        '両肩を耳に近づけるように上げます。',
        '肩甲骨をよせるように後ろへ引き、ストンと下ろします。',
        '音声のカウントに合わせて、1回2秒くらいのゆっくりした速さで回します。',
      ],
      cautions: [
        '首に力を入れすぎず、あごは軽く引いておきます。',
        '肩に引っかかる感じや痛みがあれば、小さく回すか中止してください。',
      ],
      // 見本: 本素材(動画など)ができたら media に書く。それまでは人体モデルの仮の見本
      media: null,
      animation: { kind: 'pose', ref: 'shoulder_roll', fallback: 'shoulder' },
      alternatives: ['chest_open', 'neck_tilt'],
    },
    {
      id: 'chest_open', name: '胸ひらき', kind: 'stretch', measure: 'time',
      difficulty: 1, impact: 'low', posture: 'seated', modes: ['work', 'home'],
      durationSec: 20, sets: 1, restSec: 0,
      description: [
        '両手を体の後ろで軽く組みます(組めなければイスの背をつかみます)。',
        '肩甲骨をよせて、胸を前に開きます。',
        'ゆっくり呼吸しながら保ちます。',
      ],
      cautions: ['腰を反らしすぎないでください。', '肩や腕に痛みが出たらやめてください。'],
      animation: { kind: 'builtin', ref: 'chest' },
      alternatives: ['shoulder_roll'],
    },
    {
      id: 'seated_leg_raise', name: '座ったまま脚のばし', kind: 'strength', measure: 'reps',
      difficulty: 1, impact: 'low', posture: 'seated', modes: ['work', 'home'],
      reps: 10, secPerRep: 3, sets: 2, restSec: 10, setLabels: ['右脚', '左脚'],
      description: [
        'イスに浅めに座り、背すじを伸ばします。',
        'ひざを伸ばして脚を前に上げ、1秒止めます。',
        'ゆっくり下ろします。音声に合わせてくり返します。',
      ],
      cautions: [
        'キャスター付きのイスは動きやすいので避けてください。',
        'ひざに痛みがあるときは行わないでください。',
      ],
      animation: { kind: 'builtin', ref: 'seatedLegRaise' },
      alternatives: ['ankle_circle'],
    },
    {
      id: 'calf_raise', name: 'かかと上げ', kind: 'strength', measure: 'reps',
      difficulty: 1, impact: 'low', posture: 'standing', modes: ['work', 'home'],
      reps: 15, secPerRep: 2, sets: 1, restSec: 20,
      description: [
        '机やイスの背に手をそえて立ちます。',
        'かかとをゆっくり上げて、つま先立ちになります。',
        'ゆっくり下ろします。はずみはつけません。',
      ],
      cautions: ['ふらつく場合は必ず支えを持ってください。', 'ふくらはぎがつりそうなら中止してください。'],
      animation: { kind: 'builtin', ref: 'calf' },
      alternatives: ['ankle_circle'],
    },
    {
      id: 'side_bend', name: '体側のばし', kind: 'stretch', measure: 'time',
      difficulty: 1, impact: 'low', posture: 'seated', modes: ['work', 'home'],
      durationSec: 15, sets: 2, restSec: 5, setLabels: ['右側', '左側'],
      description: [
        '片手を上に伸ばします。',
        '反対側へゆっくり体をたおし、わき腹を伸ばします。',
        '呼吸を止めずに保ちます。',
      ],
      cautions: ['体をねじらず、真横にたおしてください。', '腰に痛みが出たらやめてください。'],
      animation: { kind: 'builtin', ref: 'sideBend' },
      alternatives: ['chest_open'],
    },
    {
      id: 'ankle_circle', name: '足首回し', kind: 'mobility', measure: 'reps',
      difficulty: 1, impact: 'low', posture: 'seated', modes: ['work', 'home'],
      reps: 10, secPerRep: 2, sets: 2, restSec: 5, setLabels: ['右足', '左足'],
      description: [
        '座ったまま片足を少し浮かせます。',
        '足首を大きくゆっくり回します。',
      ],
      cautions: ['足首にケガがあるときは行わないでください。'],
      animation: { kind: 'builtin', ref: 'ankle' },
      alternatives: ['seated_march'],
    },
    {
      id: 'seated_march', name: '座って足ぶみ', kind: 'cardio', measure: 'time',
      difficulty: 1, impact: 'low', posture: 'seated', modes: ['work', 'home'],
      durationSec: 40, sets: 1, restSec: 0,
      description: [
        'イスに座ったまま、ももを交互に上げます。',
        '腕も軽くふりましょう。会話ができるくらいの速さで。',
      ],
      cautions: ['息が上がりすぎたらペースを落とすか、やめてください。'],
      animation: { kind: 'builtin', ref: 'seatedMarch' },
      alternatives: ['ankle_circle'],
    },
    {
      id: 'march', name: 'その場足ぶみ', kind: 'cardio', measure: 'time',
      difficulty: 1, impact: 'low', posture: 'standing', modes: ['home'],
      durationSec: 60, sets: 1, restSec: 0,
      description: [
        'その場で足ぶみをします。ジャンプはしません。',
        '腕を前後にふり、体を温めます。',
      ],
      cautions: ['周りに物がないか確認してください。', '息苦しさを感じたらすぐやめてください。'],
      animation: { kind: 'builtin', ref: 'march' },
      alternatives: ['seated_march'],
    },
    {
      id: 'arm_circle', name: '腕回し', kind: 'mobility', measure: 'reps',
      difficulty: 1, impact: 'low', posture: 'standing', modes: ['home'],
      reps: 10, secPerRep: 3, sets: 1, restSec: 0,
      description: [
        '両腕を横に広げます。',
        '肩から大きく、ゆっくり円をえがくように回します。',
      ],
      cautions: ['肩に痛みがある場合は、小さく回すか行わないでください。'],
      animation: { kind: 'builtin', ref: 'armCircle' },
      alternatives: ['shoulder_roll'],
    },
    {
      id: 'chair_squat', name: 'イススクワット', kind: 'strength', measure: 'reps',
      difficulty: 2, impact: 'low', posture: 'standing', modes: ['home'],
      reps: 10, secPerRep: 4, sets: 2, restSec: 30,
      description: [
        'キャスターのない、しっかりしたイスを壁につけて置き、その前に立ちます。',
        '足は肩幅くらい、つま先は少し外向き。腕は前に伸ばしてバランスをとります。',
        'お尻を後ろへ引きながら、2秒くらいかけてイスに座るようにゆっくり下ります。',
        'お尻がイスに軽くふれたら、息をはきながら立ち上がります。反動はつけません。',
      ],
      cautions: [
        'ひざは、つま先と同じ向きに曲げます(内側に入れない)。',
        '座面の低いイスはひざに負担がかかります。座面が高めのイスを使ってください。',
        'つらいときは、いったんイスにしっかり座ってから立ち上がっても大丈夫です。',
        'ひざや腰に痛みが出たらやめてください。',
        'キャスター付きや不安定なイスは使わないでください。',
      ],
      media: null,
      animation: { kind: 'pose', ref: 'chair_squat', fallback: 'squat' },
      alternatives: ['seated_leg_raise'],
    },
    {
      id: 'wall_pushup', name: '壁うで立て', kind: 'strength', measure: 'reps',
      difficulty: 1, impact: 'low', posture: 'standing', modes: ['home'],
      reps: 10, secPerRep: 3, sets: 2, restSec: 30,
      description: [
        '壁から、腕を伸ばした長さくらいはなれて立ちます。足は腰幅です。',
        '胸の高さで、肩幅より少し広めに両手を壁につきます。指先は上に向けます。',
        '頭からかかとまでを一直線に保ったまま、ひじを曲げて胸を壁に近づけます。',
        '近づけるのは楽にできるところまで。壁を押して、ゆっくり元に戻ります。',
      ],
      cautions: [
        '戻ったときも、ひじは伸ばしきらずに軽くゆるめておきます。',
        '手首がつらいときは、壁に近づいて立つと負担が軽くなります。',
        '腰を反らせたり、お尻を突き出したりしないでください。',
        'すべりにくい床で、運動靴か素足で行ってください(靴下はすべりやすい)。',
        '手首や肩に痛みが出たらやめてください。',
      ],
      media: null,
      animation: { kind: 'pose', ref: 'wall_pushup', fallback: 'wallPush' },
      alternatives: ['chest_open'],
    },
    {
      id: 'glute_bridge', name: 'ヒップリフト', kind: 'strength', measure: 'reps',
      difficulty: 2, impact: 'low', posture: 'floor', modes: ['home'],
      reps: 10, secPerRep: 4, sets: 2, restSec: 30,
      description: [
        'あお向けになり、ひざを立てます。',
        'お尻をゆっくり持ち上げ、肩からひざまでを一直線にします。',
        'ゆっくり下ろします。',
      ],
      cautions: ['腰を反らしすぎないでください。', '腰に痛みが出たらやめてください。'],
      animation: { kind: 'builtin', ref: 'bridge' },
      alternatives: ['seated_leg_raise'],
    },
  ];

  const EXERCISES = Object.freeze(Object.fromEntries(list.map((e) => [e.id, e])));

  const MENUS = Object.freeze({
    work: {
      id: 'work_basic', mode: 'work', name: '仕事中リフレッシュ',
      note: '座ったまま・汗をかかない動きだけ。席でそのままできます。',
      items: [
        { exerciseId: 'neck_tilt' },
        { exerciseId: 'shoulder_roll' },
        { exerciseId: 'chest_open' },
        { exerciseId: 'seated_leg_raise' },
        { exerciseId: 'calf_raise' },
        { exerciseId: 'side_bend' },
      ],
    },
    home: {
      id: 'home_basic', mode: 'home', name: '自宅かんたんトレーニング',
      note: 'ジャンプなしの軽い筋トレ。イスと壁、床に寝られる場所を用意してください。',
      items: [
        { exerciseId: 'march' },
        { exerciseId: 'arm_circle' },
        { exerciseId: 'chair_squat' },
        { exerciseId: 'wall_pushup' },
        { exerciseId: 'glute_bridge' },
        { exerciseId: 'calf_raise', overrides: { sets: 2 } },
        { exerciseId: 'side_bend' },
        { exerciseId: 'chest_open' },
      ],
    },
  });

  const MODES = Object.freeze({
    work: { label: '仕事中モード', short: '仕事中' },
    home: { label: '自宅トレーニングモード', short: '自宅' },
  });

  // 開始前の体調チェック。1つでも当てはまれば開始しない。
  const PRECHECK = Object.freeze([
    '胸の痛み・しめつけ感がある',
    '安静にしていても息苦しい',
    'めまい・ふらつきがある',
    '発熱がある、または強いだるさがある',
    '運動する部位にケガや強い痛みがある',
  ]);

  // 運動中の症状。danger は救急も含めた案内を出す。
  const SYMPTOMS = Object.freeze([
    { id: 'chest_pain', label: '胸の痛み・しめつけ', danger: true },
    { id: 'breathless', label: '強い息切れ・息苦しさ', danger: true },
    { id: 'dizzy', label: 'めまい・ふらつき・気が遠くなる', danger: true },
    { id: 'nausea', label: '吐き気・冷や汗', danger: true },
    { id: 'palpitation', label: '動悸・脈がみだれる', danger: true },
    { id: 'joint_pain', label: '関節や筋肉の痛み', danger: false },
    { id: 'other', label: 'その他の違和感', danger: false },
  ]);

  // メニューに載せてよい種目か。高衝撃の種目は初期メニューから外す。
  function isAllowed(ex) {
    return !!ex && ex.impact !== 'high';
  }

  function menuFor(mode) {
    const menu = MENUS[mode];
    return Object.assign({}, menu, {
      items: menu.items.filter((it) => isAllowed(EXERCISES[it.exerciseId])),
    });
  }

  function alternativesFor(id) {
    const ex = EXERCISES[id];
    if (!ex) return [];
    return (ex.alternatives || []).map((a) => EXERCISES[a]).filter(isAllowed);
  }

  return { EXERCISES, MENUS, MODES, PRECHECK, SYMPTOMS, isAllowed, menuFor, alternativesFor };
});
