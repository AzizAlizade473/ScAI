/* Scam Guardian — deterministic rules engine (Azerbaijani · Russian · English).
 * Runs in the browser (instant highlighting) and on the server (fusion with Gemini).
 * Every hit is evidence: a quote, its position, a tactic and a weight. No verdict is hard-coded. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScamRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Tactic catalogue. level: what one hit means on its own. */
  const TACTICS = {
    otp_request:     { level: 'danger',  risk: 0.92, label: { az: 'SMS kodu / PIN istəyi', ru: 'Запрос кода / PIN', en: 'OTP / PIN request' } },
    remote_access:   { level: 'danger',  risk: 0.9,  label: { az: 'Uzaqdan idarə proqramı', ru: 'Программа удалённого доступа', en: 'Remote-access app' } },
    safe_account:    { level: 'danger',  risk: 0.88, label: { az: '«Təhlükəsiz hesab»a köçürmə', ru: 'Перевод на «безопасный счёт»', en: '“Safe account” transfer' } },
    card_request:    { level: 'caution', risk: 0.62, label: { az: 'Kart məlumatı istəyi', ru: 'Запрос данных карты', en: 'Card details request' } },
    money_transfer:  { level: 'caution', risk: 0.58, label: { az: 'Pul köçürmə tələbi', ru: 'Требование перевода денег', en: 'Money transfer request' } },
    prize_fee:       { level: 'caution', risk: 0.55, label: { az: 'Uduş / ödəniş tələbi', ru: 'Выигрыш / комиссия', en: 'Prize or upfront fee' } },
    investment:      { level: 'caution', risk: 0.55, label: { az: 'Zəmanətli gəlir vədi', ru: 'Обещание гарантированного дохода', en: 'Guaranteed-profit promise' } },
    suspicious_link: { level: 'caution', risk: 0.6,  label: { az: 'Şübhəli link', ru: 'Подозрительная ссылка', en: 'Suspicious link' } },
    impersonation:   { level: 'weak',    risk: 0.3,  label: { az: 'Rəsmi qurum adından danışır', ru: 'Выдаёт себя за организацию', en: 'Claims to be an institution' } },
    urgency:         { level: 'weak',    risk: 0.3,  label: { az: 'Tələsdirmə', ru: 'Давление и спешка', en: 'Urgency / pressure' } },
    secrecy:         { level: 'weak',    risk: 0.35, label: { az: 'Gizli saxlamağı tələb edir', ru: 'Требует секретности', en: 'Asks for secrecy' } },
    safety_advice:   { level: 'info',    risk: 0,    label: { az: 'Təhlükəsizlik xəbərdarlığı', ru: 'Предупреждение о безопасности', en: 'Safety advice' } },
  };

  const P = (src) => new RegExp(src, 'giu');
  /* Patterns. \p{L} keeps Azerbaijani/Cyrillic letters inside words. */
  const PATTERNS = [
    ['otp_request', P(String.raw`sms[\s-]*(?:kod\p{L}*|код\p{L}*|code\p{L}*)|(?:təsdiq|birdəfəlik|doğrulama)\s*kod\p{L}*|код\p{L}*\s+(?:из\s+sms|подтвержд\p{L}*|из\s+сообщени\p{L}*)|verification\s+code|one[-\s]?time\s+(?:pass)?code|\botp\b|\bcvv2?\b|\bcvc\b|(?<!\p{L})p[iİı]n(?:[-\s]?(?:kod\p{L}*|code))?(?!\p{L})|пин[-\s]?код\p{L}*|kartın\s+arxas\p{L}*\s+(?:3|üç)\s+rəqəm\p{L}*|три\s+цифры\s+на\s+обороте|3\s+digits\s+on\s+the\s+back`)],
    ['remote_access', P(String.raw`any\s?desk|team\s?viewer|rust\s?desk|quick\s?support|uzaqdan\s+(?:idarə|giriş)\p{L}*|удал[её]нн\p{L}+\s+доступ\p{L}*|remote(?:ly)?\s+(?:access|control)|install\s+(?:the\s+|an?\s+)?\p{L}+\s+app`)],
    ['safe_account', P(String.raw`təhlükəsiz\s+hesab\p{L}*|ehtiyat\s+hesab\p{L}*|безопасн\p{L}+\s+сч[её]т\p{L}*|резервн\p{L}+\s+сч[её]т\p{L}*|safe\s+account|secure\s+account`)],
    ['card_request', P(String.raw`kart\p{L}*\s+(?:nömrə\p{L}*|məlumat\p{L}*|rekvizit\p{L}*)|(?:16|on\s?altı)\s+rəqəm\p{L}*|son\s+istifadə\s+tarix\p{L}*|номер\p{L}*\s+(?:вашей\s+)?карт\p{L}*|данн\p{L}+\s+(?:вашей\s+)?карт\p{L}*|(?:16|шестнадцать)\s+цифр\p{L}*|срок\p{L}*\s+действия|card\s+(?:number|details|data)|(?:16|sixteen)\s+digits|expiry\s+date`)],
    ['money_transfer', P(String.raw`pul\s+lazım\p{L}*|manat\s+lazım\p{L}*|нужн\p{L}*\s+(?:\d+\s+\p{L}+\s+)?деньг\p{L}*|деньги\s+нужн\p{L}*|need\s+[\d,]*\s*(?:manat\s+)?(?:money|cash)|pul\p{L}*\s+(?:köçür|göndər|keçir)\p{L}*|(?:köçürün|köçürmə\p{L}*\s+edin)|перевед\p{L}*|перечисл\p{L}*|переве\p{L}*\s+деньг\p{L}*|transfer\s+(?:the\s+)?money|wire\s+(?:the\s+)?(?:money|funds)|send\s+(?:me\s+)?[\d,]+\s*(?:manat|azn|usd|dollars?)|gift\s+cards?|bitcoin|kriptovalyut\p{L}*|криптовалют\p{L}*|pick\s+up\s+the\s+cash|nağd\s+pul\p{L}*\s+(?:gələcək|götürəcək)`)],
    ['prize_fee', P(String.raw`uduş\p{L}*|lotereya\p{L}*|qazandınız|hədiyyə\s+qazan\p{L}*|выигр\p{L}*|лотере\p{L}*|\bprize\b|lottery|you\s+(?:have\s+)?won|processing\s+fee|komissiya\s+(?:haqqı|ödə)\p{L}*|комисси\p{L}*\s+(?:за|оплат)\p{L}*`)],
    ['investment', P(String.raw`zəmanətli\s+gəlir|gəlir\p{L}*\s+zəmanət\p{L}*|(?:iki|2)\s+qat\p{L}*\s+(?:qazanc|gəlir)|səhm\p{L}*\s+al\p{L}*|гарантированн\p{L}+\s+доход\p{L}*|удво\p{L}+|инвестиц\p{L}*\s+платформ\p{L}*|guaranteed\s+(?:profit|return|income)|double\s+your\s+(?:money|savings)|no\s+risk\s+at\s+all`)],
    ['impersonation', P(String.raw`təhlükəsizlik\s+şöbə\p{L}*|bank\p{L}*\s+(?:əməkdaş\p{L}*|işçi\p{L}*|nümayəndə\p{L}*)|bankdan\s+zəng|polis\p{L}*|prokuror\p{L}*|daxili\s+işlər|DİN\b|vergi\s+(?:xidmət|orqan)\p{L}*|ASAN\b|məhkəmə\p{L}*|служб\p{L}*\s+безопасност\p{L}*|сотрудник\p{L}*\s+банк\p{L}*|полици\p{L}*|следовател\p{L}*|прокуратур\p{L}*|налогов\p{L}*|security\s+department|bank'?s?\s+security|technical\s+support|tax\s+office|police`)],
    ['urgency', P(String.raw`təcili|dərhal|bu\s+dəqiqə|(?:bir|1)\s+saat\s+ərzində|vaxt\p{L}*\s+(?:az|qalmayıb)|срочно|немедленно|прямо\s+сейчас|в\s+течение\s+часа|urgent\p{L}*|immediately|right\s+now|hurry|in\s+one\s+hour|expires\s+today|bloklan\p{L}*|заблокир\p{L}*|will\s+be\s+blocked`)],
    ['secrecy', P(String.raw`heç\s+kimə\s+(?:demə\p{L}*|danışma\p{L}*|bildirmə\p{L}*)|ailə\p{L}*\s+(?:demə|bildirmə)\p{L}*|никому\s+не\s+(?:говори\p{L}*|рассказ\p{L}*|сообща\p{L}*)|don'?t\s+tell\s+(?:anyone|your\s+family)|keep\s+(?:it|this)\s+(?:a\s+)?secret`)],
  ];

  /* Sentence-level intent: is the sensitive item requested, or is the speaker warning NOT to share it? */
  const REQUEST = /(?<!\p{L})(?:deyin|de|oxuyun|oxuyasınız|göndərin|yazın|diktə\s+edin|verin|söyləyin|bildirin|təsdiqləyin|назовите|продиктуйте|скажите|сообщите\s+мне|отправьте|пришлите|введите|подтвердите|read\s+(?:me|it)|tell\s+me|give\s+me|send\s+(?:me|it)|confirm|enter|type)(?!\p{L})/iu;
  const NEGATION = /heç\s+vaxt|heç\s+kimə\s+(?:verməyin|deməyin|göndərməyin|paylaşmayın|bildirməyin)|paylaşmayın|deməyin|verməyin|soruşmuruq|soruşmur|istəmir\p{L}*|никогда|никому\s+не\s+(?:сообщайте|передавайте|называйте)|не\s+(?:сообщайте|передавайте|просим|запрашиваем)|never\s+(?:ask|share|give|tell)|do\s+not\s+share|don'?t\s+share|we\s+will\s+never/iu;

  function sentenceAt(text, i) {
    let a = i, b = i;
    while (a > 0 && !/[.!?\n]/.test(text[a - 1])) a--;
    while (b < text.length && !/[.!?\n]/.test(text[b])) b++;
    return text.slice(a, b);
  }

  /* ---------- links ---------- */
  const OFFICIAL = ['kapitalbank.az', 'birbank.az', 'abb-bank.az', 'pashabank.az', 'bankofbaku.com', 'xalqbank.az', 'unibank.az', 'accessbank.az',
    'yelo.az', 'leobank.az', 'm10.az', 'gov.az', 'e-gov.az', 'asan.gov.az', 'my.gov.az', 'cbar.az', 'socar.az', 'azercell.com', 'bakcell.com', 'nar.az', 'azerpost.az'];
  const BRANDS = ['kapital', 'birbank', 'abb', 'pasha', 'xalq', 'unibank', 'leobank', 'm10', 'asan', 'egov', 'e-gov', 'mygov', 'socar', 'azercell', 'bakcell', 'azerpost', 'cbar', 'bank', 'kart', 'card'];
  const SHORTENERS = ['bit.ly', 'tinyurl.com', 'cutt.ly', 'is.gd', 't.co', 'goo.gl', 'rb.gy', 'shorturl.at', 'ow.ly', 'clck.ru', 'tiny.cc', 'qps.ru'];
  const RISKY_TLD = /\.(?:xyz|top|click|online|site|shop|live|icu|buzz|rest|cfd|sbs|monster|cam|gq|tk|ml|ga|cf|work|support|info)$/i;
  const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:az|com|ru|net|org|xyz|top|click|online|site|shop|live|info|icu|me|io|ly|gl|co)(?:\/[^\s<>"']*)?)/giu;

  function analyzeLinks(text) {
    const out = [];
    URL_RE.lastIndex = 0; let m;
    while ((m = URL_RE.exec(text))) {
      const raw = m[1].replace(/[),.;!?]+$/, '');
      let host = '', proto = '';
      try { const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw); host = u.hostname.toLowerCase(); proto = /^https?:\/\//i.test(raw) ? u.protocol : ''; }
      catch (e) { continue; }
      const reasons = []; let risk = 0;
      const official = OFFICIAL.some(d => host === d || host.endsWith('.' + d));
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) { reasons.push('ip'); risk = Math.max(risk, 0.75); }
      if (host.includes('xn--')) { reasons.push('punycode'); risk = Math.max(risk, 0.8); }
      if (SHORTENERS.includes(host)) { reasons.push('shortener'); risk = Math.max(risk, 0.55); }
      if (RISKY_TLD.test(host)) { reasons.push('risky_tld'); risk = Math.max(risk, 0.6); }
      if (!official && BRANDS.some(b => host.replace(/[.-]/g, '').includes(b.replace('-', '')))) { reasons.push('lookalike'); risk = Math.max(risk, 0.82); }
      if (proto === 'http:' && !official) { reasons.push('no_https'); risk = Math.max(risk, 0.45); }
      if (raw.includes('@')) { reasons.push('at_sign'); risk = Math.max(risk, 0.7); }
      if (host.split('.').length > 4) { reasons.push('deep_subdomain'); risk = Math.max(risk, 0.5); }
      out.push({ url: raw, host, official, risk: official ? 0 : risk, reasons, start: m.index, end: m.index + raw.length });
    }
    return out;
  }

  const LINK_REASON = {
    ip: { az: 'domen əvəzinə IP ünvanı', ru: 'IP-адрес вместо домена', en: 'raw IP address instead of a domain' },
    punycode: { az: 'saxta hərflərlə yazılmış domen', ru: 'домен с поддельными буквами', en: 'look-alike (punycode) letters' },
    shortener: { az: 'qısaldılmış link, əsl ünvan gizlidir', ru: 'сокращённая ссылка скрывает адрес', en: 'shortened link hides the real address' },
    risky_tld: { az: 'tez-tez fırıldaqda istifadə olunan domen zonası', ru: 'доменная зона, частая у мошенников', en: 'domain zone often used by scammers' },
    lookalike: { az: 'bank/dövlət adını təqlid edir, rəsmi sayt deyil', ru: 'похоже на банк/госсайт, но не официальный', en: 'imitates a bank or government name but is not official' },
    no_https: { az: 'şifrələnməmiş (http) əlaqə', ru: 'нет шифрования (http)', en: 'no encryption (http)' },
    at_sign: { az: 'linkdə «@» işarəsi ünvanı gizlədir', ru: '«@» в ссылке скрывает адрес', en: '“@” in the link hides the destination' },
    deep_subdomain: { az: 'çox sayda alt domen', ru: 'слишком много поддоменов', en: 'unusually deep subdomain' },
  };

  /* ---------- main ---------- */
  function analyze(text) {
    text = String(text || '');
    const evidence = [];
    /* Message-level intent: a text that warns "never share this code" and asks for nothing
     * (typical bank OTP SMS) is advice, even if the code itself is mentioned in another sentence. */
    const CODE_WORD = /kod|код|code|p[iİı]n|parol|şifrə|пароль|password/iu;
    const adviceOnly = !REQUEST.test(text) && text.split(/[.!?\n]+/).some(s => NEGATION.test(s) && CODE_WORD.test(s));
    for (const [tactic, re] of PATTERNS) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(text))) {
        if (!m[0]) { re.lastIndex++; continue; }
        let t = tactic, weight = TACTICS[tactic].risk;
        const s = sentenceAt(text, m.index), req = REQUEST.test(s), neg = NEGATION.test(s);
        if (tactic === 'secrecy' && CODE_WORD.test(s) && !req) { t = 'safety_advice'; weight = 0; }
        if (tactic === 'impersonation' && neg && !req) weight = 0;            /* "…not even to bank staff" */
        if (tactic === 'otp_request' || tactic === 'card_request') {
          if ((neg && !req) || adviceOnly) { t = 'safety_advice'; weight = 0; }
          else if (!req && tactic === 'otp_request') weight = 0.62; /* code mentioned, not yet asked for */
        }
        evidence.push({ tactic: t, quote: m[0], start: m.index, end: m.index + m[0].length, weight, source: 'rules' });
      }
    }
    const links = analyzeLinks(text);
    for (const l of links) if (l.risk > 0) evidence.push({ tactic: 'suspicious_link', quote: l.url, start: l.start, end: l.end, weight: l.risk, source: 'rules', reasons: l.reasons });

    /* Combinations: what makes a pattern a scam is a sensitive request plus pressure or a fake identity. */
    const has = t => evidence.some(e => e.tactic === t && e.weight > 0);
    const sensitive = ['otp_request', 'card_request', 'money_transfer', 'safe_account', 'remote_access', 'prize_fee', 'investment', 'suspicious_link'].filter(has);
    const levers = ['impersonation', 'urgency', 'secrecy'].filter(has);
    let risk = evidence.reduce((r, e) => Math.max(r, e.weight), 0);
    const combos = [];
    if (sensitive.length && levers.length) { risk = Math.max(risk, 0.84); combos.push(sensitive[0] + '+' + levers[0]); }
    if (levers.length >= 2) { risk = Math.max(risk, 0.5); combos.push(levers.join('+')); }
    if (sensitive.length >= 2) { risk = Math.max(risk, 0.86); combos.push(sensitive.slice(0, 2).join('+')); }
    const advice = has('safety_advice') || evidence.some(e => e.tactic === 'safety_advice');
    return {
      risk: Math.round(risk * 100) / 100,
      level: risk >= 0.8 ? 'danger' : risk >= 0.45 ? 'caution' : 'safe',
      tactics: [...new Set(evidence.filter(e => e.weight > 0).map(e => e.tactic))],
      evidence: evidence.sort((a, b) => a.start - b.start),
      links, combos, advice
    };
  }

  /* Legacy shape used by the call screen (highlighting): [{tag,lvl,risk,re}] */
  const LEGACY = { otp_request: 'code', remote_access: 'code', safe_account: 'code', card_request: 'card', money_transfer: 'card', prize_fee: 'card', investment: 'card', impersonation: 'pressure', urgency: 'pressure', secrecy: 'pressure' };
  const RULES = PATTERNS.map(([tactic, re]) => ({ tag: LEGACY[tactic], tactic, lvl: TACTICS[tactic].level === 'weak' ? 'weak' : TACTICS[tactic].level, risk: TACTICS[tactic].risk, re }));

  /* Fusion policy (same in browser and server):
   *  - "hard" rule evidence (risk >= 0.8: a code/PIN request, safe-account transfer, remote access,
   *    sensitive request + pressure) can never be lowered by the AI;
   *  - softer rule hits are capped below "caution" when the AI is confident the text is normal (risk < 0.3),
   *    because single keywords ("pul lazımdır") also appear in harmless family talk;
   *  - otherwise the higher score wins. Without an AI verdict the rules decide alone. */
  function fuse(rules, ai) {
    const r = rules ? rules.risk : 0;
    if (!ai) return { risk: r, level: lvl(r), decidedBy: 'rules' };
    const softR = r >= 0.8 ? r : (ai.risk < 0.3 ? Math.min(r, 0.44) : r);
    const risk = Math.max(ai.risk, softR);
    return { risk: Math.round(risk * 100) / 100, level: lvl(risk), decidedBy: risk === ai.risk && ai.risk >= softR ? (r >= ai.risk ? 'both' : 'ai') : 'rules' };
  }
  const lvl = r => (r >= 0.8 ? 'danger' : r >= 0.45 ? 'caution' : 'safe');

  return { TACTICS, PATTERNS, RULES, LINK_REASON, OFFICIAL, analyze, analyzeLinks, fuse };
});
