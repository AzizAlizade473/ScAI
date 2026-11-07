/* Scam Guardian — Simulation Lab scenarios.
 * Written by the team for the demo (not recordings of real people). Each line is voiced once with
 * Gemini text-to-speech (scripts/gen-voices.js → audio/<id>/<n>.wav). During the demo the audio is
 * played and transcribed again with real speech-to-text; detection never reads this script text.
 * `kind` is the ground truth used only for the evaluation and the scorecard. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scenarios = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const YOU = 'Gacrux';                     /* mature female voice for the person being called */
  const YOU_STYLE = 'Say in Azerbaijani, as a polite elderly woman on the phone';
  const LIST = [
    {
      id: 'bank', kind: 'scam', icon: 'bank',
      title: { az: 'Saxta bank əməkdaşı', ru: 'Фальшивый сотрудник банка', en: 'Fake bank employee' },
      sub: { az: 'Kart məlumatı və SMS kodu istəyir', ru: 'Просит данные карты и SMS-код', en: 'Asks for card details and the SMS code' },
      caller: { name: '', number: '+994 12 404 77 31', reports: 12 },
      voice: 'Charon', style: 'Say in Azerbaijani, as a confident, slightly hurried man pretending to be a bank security officer',
      smsAt: 6,
      lines: [
        ['caller', 'Salam, Elmira xanım. Mən bankınızın təhlükəsizlik şöbəsindən, Rəşad Məmmədov danışıram.', 'Hello Mrs Elmira, this is Rashad Mammadov from your bank\'s security department.'],
        ['you', 'Salam, buyurun, eşidirəm.', 'Hello, go ahead, I\'m listening.'],
        ['caller', 'Kartınızdan indicə Gəncədə səkkiz yüz manatlıq şübhəli ödəniş cəhdi olub. Onu bloklamalıyıq.', 'There was just a suspicious 800-manat payment attempt in Ganja on your card. We must block it.'],
        ['you', 'Aman Allah, mən heç nə almamışam.', 'Oh my God, I haven\'t bought anything.'],
        ['caller', 'Narahat olmayın, kömək edəcəyik. Təsdiq üçün kartın üzərindəki on altı rəqəmi və son istifadə tarixini deyin.', 'Don\'t worry, we\'ll help. To confirm, tell me the 16 digits on the card and the expiry date.'],
        ['you', 'Bir dəqiqə, kartı tapım.', 'One moment, let me find the card.'],
        ['caller', 'Tələsin, xanım. İndi telefonunuza SMS kodu gələcək, o kodu mənə oxuyun. Heç kimə deməyin, bu məxfi araşdırmadır.', 'Hurry, madam. An SMS code will arrive now — read it to me. Don\'t tell anyone, this is a confidential investigation.']
      ]
    },
    {
      id: 'police', kind: 'scam', icon: 'shield',
      title: { az: 'Saxta polis', ru: 'Фальшивый полицейский', en: 'Fake police officer' },
      sub: { az: 'Qohumun «qəzası» üçün təcili pul', ru: 'Срочно деньги за «аварию» родственника', en: 'Urgent money for a relative’s “accident”' },
      caller: { name: '', number: '+994 70 512 03 88', reports: 7 },
      voice: 'Fenrir', style: 'Say in Azerbaijani, as a stern, authoritative male police officer',
      lines: [
        ['caller', 'Alo, Daxili İşlər Nazirliyindən baş leytenant Əliyev danışır.', 'Hello, this is Senior Lieutenant Aliyev from the Ministry of Internal Affairs.'],
        ['you', 'Bəli, nə olub?', 'Yes, what happened?'],
        ['caller', 'Oğlunuz qəza törədib, hazırda bölmədədir. İş məhkəməyə getməsin deyə təcili kömək lazımdır.', 'Your son caused an accident and is at the station. Urgent help is needed so the case doesn\'t go to court.'],
        ['you', 'Necə yəni? Onunla danışa bilərəmmi?', 'What do you mean? Can I talk to him?'],
        ['caller', 'Hazırda danışa bilməz. İşi bağlamaq üçün iki min manatı bir saat ərzində göstərdiyim hesaba köçürün.', 'He can\'t talk now. To close the case, transfer two thousand manat to the account I give you within one hour.'],
        ['you', 'Bu qədər pulu haradan tapım?', 'Where would I find that much money?'],
        ['caller', 'Bu barədə heç kimə danışmayın, yoxsa işi ağırlaşdırarsınız. Kuryerimiz özü gəlib nağd pulu götürəcək.', 'Don\'t tell anyone about this or you\'ll make it worse. Our courier will come and pick up the cash.']
      ]
    },
    {
      id: 'invest', kind: 'scam', icon: 'spark',
      title: { az: 'İnvestisiya fırıldağı', ru: 'Инвестиционное мошенничество', en: 'Investment scam' },
      sub: { az: '«Zəmanətli gəlir» və AnyDesk', ru: '«Гарантированный доход» и AnyDesk', en: '“Guaranteed profit” and AnyDesk' },
      caller: { name: '', number: '+994 55 260 41 19', reports: 3 },
      voice: 'Orus', style: 'Say in Azerbaijani, as an overly friendly, enthusiastic young male salesman',
      lines: [
        ['caller', 'Salam! Mən investisiya platformasından məsləhətçi Kamranam. Sizə xüsusi təklifimiz var.', 'Hello! I\'m Kamran, an adviser from an investment platform. We have a special offer for you.'],
        ['you', 'Hansı təklif?', 'What offer?'],
        ['caller', 'Neft şirkətinin səhmlərinə cəmi dörd yüz manat qoyursunuz, bir ayda iki qat qazanc əldə edirsiniz. Gəlir zəmanətlidir, heç bir risk yoxdur.', 'You put just 400 manat into oil-company shares and double it in a month. The profit is guaranteed, there is no risk.'],
        ['you', 'Doğrudan? Bu necə işləyir?', 'Really? How does it work?'],
        ['caller', 'Telefonunuza kiçik bir proqram yükləyəcəyik, AnyDesk adlanır, hər şeyi özüm quraşdıracağam.', 'We\'ll install a small app on your phone called AnyDesk, I\'ll set everything up myself.'],
        ['you', 'Bilmirəm, uşaqlarla məsləhətləşim.', 'I don\'t know, let me ask my children.'],
        ['caller', 'Təklif yalnız bu gün etibarlıdır, yerlər azdır. Kart məlumatlarınızı deyin, indi qeydiyyatdan keçirək.', 'The offer is valid only today, places are limited. Tell me your card details and we\'ll register you now.']
      ]
    },
    {
      id: 'realbank', kind: 'legit', icon: 'bank',
      title: { az: 'Həqiqi bank zəngi', ru: 'Настоящий звонок из банка', en: 'Real bank call' },
      sub: { az: 'Ödənişi təsdiqləyir, heç nə istəmir', ru: 'Подтверждает платёж, ничего не просит', en: 'Confirms a payment, asks for nothing' },
      caller: { name: '', number: '+994 12 196 00 00', reports: 0 },
      voice: 'Iapetus', style: 'Say in Azerbaijani, as a calm, polite male bank customer-service agent',
      lines: [
        ['caller', 'Salam, Elmira xanım. Bankınızın müştəri xidmətindən Nicat danışır.', 'Hello Mrs Elmira, this is Nijat from your bank\'s customer service.'],
        ['you', 'Salam, buyurun.', 'Hello, go ahead.'],
        ['caller', 'Kartınızla bu gün Bakıda qırx manatlıq ödəniş edildi. Bu ödənişi siz etmisiniz?', 'A 40-manat payment was made with your card in Baku today. Did you make it?'],
        ['you', 'Bəli, aptekdə ödəmişəm.', 'Yes, I paid at the pharmacy.'],
        ['caller', 'Çox gözəl, təşəkkür edirik. Xatırladırıq: bank heç vaxt sizdən SMS kodu, PİN və ya kart nömrəsi istəmir.', 'Great, thank you. A reminder: the bank never asks you for an SMS code, PIN or card number.'],
        ['you', 'Yaxşı, bilirəm.', 'Okay, I know.'],
        ['caller', 'Sualınız olsa, kartın arxasındakı nömrəyə özünüz zəng edin. Gözəl gün arzulayıram.', 'If you have questions, call the number on the back of your card yourself. Have a nice day.']
      ]
    },
    {
      id: 'grandson', kind: 'legit', icon: 'users',
      title: { az: 'Nəvənin həqiqi zəngi', ru: 'Настоящий звонок внука', en: 'Real call from a grandson' },
      sub: { az: 'Ailə söhbəti, pul və ya kod yoxdur', ru: 'Семейный разговор, без денег и кодов', en: 'Family chat, no money or codes' },
      caller: { name: 'Murad', number: '+994 50 377 21 64', reports: 0, c: '#1B5DB8' },
      voice: 'Puck', style: 'Say in Azerbaijani, as a warm, cheerful young man talking to his grandmother',
      lines: [
        ['caller', 'Salam nənə, mənəm, Murad. Necəsən?', 'Hi grandma, it\'s me, Murad. How are you?'],
        ['you', 'Salam, can bala! Yaxşıyam, sən necəsən?', 'Hello, my dear! I\'m fine, how are you?'],
        ['caller', 'Yaxşıyam. Şənbə günü anamla sizə gələcəyik. Bir şey lazımdırsa, alaq?', 'I\'m good. Mum and I will visit on Saturday. Do you need anything?'],
        ['you', 'Heç nə lazım deyil, özünüz gəlin.', 'Nothing at all, just come yourselves.'],
        ['caller', 'Onda çörək və meyvə alarıq. Dərmanlarını vaxtında içirsən?', 'Then we\'ll bring bread and fruit. Are you taking your medicine on time?'],
        ['you', 'Bəli, içirəm.', 'Yes, I am.'],
        ['caller', 'Afərin. Şənbə görüşərik, öpürəm səni!', 'Well done. See you Saturday, big hug!']
      ]
    }
  ];
  /* Spoken warning played on the red alert screen */
  const ALERT = {
    voice: 'Kore', style: 'Say clearly and calmly, as a caring female safety assistant',
    text: {
      az: 'Diqqət! Bu zəng fırıldaq ola bilər. Heç bir kodu və kart məlumatını deməyin. Zəngi bitirin.',
      ru: 'Внимание! Этот звонок может быть мошенническим. Не называйте никаких кодов и данных карты. Положите трубку.',
      en: 'Warning! This call may be a scam. Do not share any codes or card details. Hang up now.'
    }
  };
  return { LIST, YOU, YOU_STYLE, ALERT, byId: id => LIST.find(s => s.id === id) };
});
