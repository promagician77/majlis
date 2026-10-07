export const STR = {
  en: {
    title: 'Majlis 32', tagline: 'Server-authoritative 4-player card table',
    tab_play: 'Play', tab_truth: 'Server truth', tab_ledger: 'Coin ledger', tab_stress: 'Stress test', tab_plan: 'Build plan',
    you: 'You', names: ['You', 'Fahad', 'Noura', 'Salman'], bot: 'Bot',
    find: 'Find a table', stake: 'Entry coins', matching: 'Matchmaking…', joined: 'joined',
    lobby_note: 'Three bots fill the other seats. Every rule runs on the server thread, not in this page.',
    round: 'Round', pot: 'Pool', sealed: 'Deck sealed', verified: 'Deck verified', mismatch: 'Commit mismatch',
    ping: 'ms', online: 'Online', offline: 'Offline', drop: 'Drop connection', reconnect: 'Reconnect', reconnecting: 'Reconnecting…',
    spectate: 'Watch as spectator', sit: 'Take my seat back', spectating: 'Spectating · 2.5 s delayed feed',
    phase_challenge: 'Challenge round', phase_respond: 'Respond to the challenge', phase_play: 'Play', phase_collect: 'Play', phase_reveal: 'Reveal', phase_settled: 'Settlement',
    pass: 'Pass', challenge: 'Challenge ×2', accept: 'Accept', withdraw: 'Withdraw',
    your_turn_play: 'Your turn: tap a lit card', wait_for: 'Waiting for', your_turn_challenge: 'Challenge doubles the pool. Others must match or withdraw.',
    your_turn_respond: 'match the raise or withdraw', challenged_by: 'Challenge from',
    s_pass: 'Pass', s_challenge: 'Challenge!', s_accept: 'Accepted', s_withdraw: 'Withdrew', s_timeout: 'Time out: auto move',
    trick: 'Trick', pts: 'pts', folded: 'Withdrew', autoplay: 'Bot covering', offline_s: 'Offline',
    result: 'Round result', winner: 'Winner', winners: 'Winners', all_withdrew: 'Everyone else withdrew', next_round: 'Next round', next_in: 'Next round in',
    points: 'Points', coins: 'Coins', payout: 'Payout', verify_line: 'SHA-256(salt | deck) checked in your browser',
    chat: 'Quick chat',
    phrases: ['Peace be upon you', 'Welcome!', 'Nice play', 'Hurry up please', 'Better luck next time', 'Congrats!', 'Good game', 'One more round?'],
    rej: {
      card_not_in_hand: 'Server refused: that card is not in your hand', not_your_turn: 'Server refused: not your turn', must_follow_suit: 'Server refused: you must follow suit',
      wrong_phase: 'Server refused: wrong phase', replayed_or_stale: 'Server refused: replayed message', hidden_information: 'Server refused: hidden information',
      server_only: 'Server refused: only the server settles', closed_loop_no_external_account: 'Ledger refused: coins can never leave the game',
      rate_limited: 'Slow down: chat rate limit', phrase_not_allowed: 'Server refused: phrase not allowed', malformed: 'Server refused: malformed', unknown_intent: 'Server refused: unknown action',
      insufficient_funds: 'Not enough coins',
    },
    resynced: 'Reconnected: full state restored from server', dropped_note: 'Connection dropped. The server keeps your seat for 8 s, then a bot covers it.',
    gap: 'Missed packets: resyncing',
  },
  ar: {
    title: 'مجلس ٣٢', tagline: 'طاولة ورق لأربعة لاعبين والخادم هو الحكم',
    tab_play: 'العب', tab_truth: 'حقيقة الخادم', tab_ledger: 'دفتر العملات', tab_stress: 'اختبار الضغط', tab_plan: 'خطة البناء',
    you: 'أنت', names: ['أنت', 'فهد', 'نورة', 'سلمان'], bot: 'آلي',
    find: 'ابحث عن طاولة', stake: 'رسوم الدخول', matching: 'جارٍ البحث عن لاعبين…', joined: 'انضم',
    lobby_note: 'ثلاثة لاعبين آليين يكملون الطاولة. كل القوانين تعمل في خيط الخادم، لا في هذه الصفحة.',
    round: 'الجولة', pot: 'الحصيلة', sealed: 'الورق مختوم', verified: 'تم التحقق من الورق', mismatch: 'الختم غير مطابق',
    ping: 'م.ث', online: 'متصل', offline: 'غير متصل', drop: 'اقطع الاتصال', reconnect: 'أعد الاتصال', reconnecting: 'جارٍ إعادة الاتصال…',
    spectate: 'شاهد كمتفرج', sit: 'عد إلى مقعدك', spectating: 'وضع المشاهدة · بث متأخر ٢٫٥ ث',
    phase_challenge: 'جولة التحدي', phase_respond: 'الرد على التحدي', phase_play: 'اللعب', phase_collect: 'اللعب', phase_reveal: 'كشف الورق', phase_settled: 'التسوية',
    pass: 'تمرير', challenge: 'تحدٍّ ×٢', accept: 'قبول', withdraw: 'انسحاب',
    your_turn_play: 'دورك: اختر ورقة مضيئة', wait_for: 'بانتظار', your_turn_challenge: 'التحدي يضاعف الحصيلة، والبقية يقبلون أو ينسحبون.',
    your_turn_respond: 'اقبل الزيادة أو انسحب', challenged_by: 'تحدٍّ من',
    s_pass: 'تمرير', s_challenge: 'تحدٍّ!', s_accept: 'قبل', s_withdraw: 'انسحب', s_timeout: 'انتهى الوقت: حركة تلقائية',
    trick: 'أكلة', pts: 'نقطة', folded: 'منسحب', autoplay: 'لاعب آلي يغطي', offline_s: 'غير متصل',
    result: 'نتيجة الجولة', winner: 'الفائز', winners: 'الفائزون', all_withdrew: 'انسحب الجميع', next_round: 'الجولة التالية', next_in: 'الجولة التالية بعد',
    points: 'النقاط', coins: 'العملات', payout: 'المكسب', verify_line: 'تم فحص SHA-256(salt | deck) داخل متصفحك',
    chat: 'دردشة سريعة',
    phrases: ['السلام عليكم', 'يا هلا', 'لعب حلو', 'بسرعة الله يرضى عليك', 'حظ أوفر', 'مبروك', 'لعبة حلوة', 'جولة ثانية؟'],
    rej: {
      card_not_in_hand: 'رفض الخادم: الورقة ليست في يدك', not_your_turn: 'رفض الخادم: ليس دورك', must_follow_suit: 'رفض الخادم: يجب اتباع النوع',
      wrong_phase: 'رفض الخادم: مرحلة خاطئة', replayed_or_stale: 'رفض الخادم: رسالة مكررة', hidden_information: 'رفض الخادم: معلومات مخفية',
      server_only: 'رفض الخادم: التسوية للخادم فقط', closed_loop_no_external_account: 'رفض الدفتر: العملات لا تخرج من اللعبة أبداً',
      rate_limited: 'تمهّل: حد الرسائل', phrase_not_allowed: 'رفض الخادم: عبارة غير مسموحة', malformed: 'رفض الخادم: رسالة تالفة', unknown_intent: 'رفض الخادم: إجراء غير معروف',
      insufficient_funds: 'رصيد غير كافٍ',
    },
    resynced: 'عاد الاتصال: تمت استعادة الحالة كاملة من الخادم', dropped_note: 'انقطع الاتصال. يحفظ الخادم مقعدك ٨ ثوانٍ ثم يغطيه لاعب آلي.',
    gap: 'رسائل مفقودة: جارٍ المزامنة',
  },
};

export const i18n = {
  lang: 'en',
  t(k) { return STR[this.lang][k] ?? STR.en[k] ?? k; },
  num(n) { return this.lang === 'ar' ? Number(n).toLocaleString('ar-SA') : Number(n).toLocaleString('en-US'); },
  set(lang) {
    this.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = this.t(el.dataset.i18n); });
    try { localStorage.setItem('majlis-lang', lang); } catch {}
  },
};
