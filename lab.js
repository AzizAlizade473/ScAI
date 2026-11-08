/* Scam Guardian — Check (message / link / voice analysis), Simulation Lab (voiced calls with real
 * speech-to-text), Judge Mode, History of analyses, Settings and the evaluation dashboard.
 * Loaded after the main script in index.html and reuses its state, renderers (R), actions (A),
 * helpers (t, ic, esc, go, render, snack) and design tokens. */
(function () {
'use strict';

/* ---------------- icons ---------------- */
Object.assign(I, {
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3"/><path d="M7.5 14h9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  thumbUp: '<path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 10l4-7a2.5 2.5 0 0 1 2.5 3L13 10h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 21H7"/>',
  thumbDown: '<path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1zM17 14l-4 7a2.5 2.5 0 0 1-2.5-3l.5-4H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 3H17"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  news: '<path d="M4 5h13v14H5a1 1 0 0 1-1-1zM17 9h3v9a1 1 0 0 1-1 1h-2"/><path d="M7 9h7M7 12.5h7M7 16h4"/>',
  wand: '<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.5 3.5 17 5M18.5 8.5 17 7M3 21l11-11"/>',
  timeline: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M6 8v8M10 6h10M10 18h10M10 12h6"/>',
});

/* ---------------- strings ---------------- */
const LSTR = {
az: {
 'nav.check': 'Yoxla', 'nav.lab': 'Laboratoriya', 'menu.settings': 'Ayarlar', 'set.title': 'Ayarlar',
 'chk.title': 'Mesajı yoxla', 'chk.lead': 'Şübhəli SMS, WhatsApp mesajı, link və ya zəng mətnini yapışdırın. Qaydalar və süni intellekt birlikdə yoxlayır.',
 'chk.ph': 'Mesajı bura yapışdırın…', 'chk.run': 'Yoxla', 'chk.voice': 'Səslə', 'chk.known': 'Göndərən kontaktlarımdadır', 'chk.samples': 'Nümunələr',
 'chk.empty': 'Mətn yazın və ya nümunə seçin.', 'chk.busy': 'Yoxlanılır…',
 'res.evidence': 'Sübutlar', 'res.text': 'Mətndə tapılanlar', 'res.links': 'Linklər', 'res.actions': 'İndi nə etməli', 'res.tech': 'Texniki detallar',
 'res.noEvidence': 'Fırıldaq əlaməti tapılmadı.', 'res.official': 'rəsmi domen', 'res.rules': 'Qaydalar', 'res.ai': 'Süni intellekt', 'res.fused': 'Yekun',
 'res.decided.rules': 'qaydalar qərar verdi', 'res.decided.ai': 'süni intellekt qərar verdi', 'res.decided.both': 'hər ikisi razılaşdı',
 'res.latency': 'Gecikmə', 'res.model': 'Model', 'res.sent': 'Gemini-yə göndərilən (redaktə olunmuş)', 'res.cached': 'keşdən (əvvəlki real nəticə)',
 'res.aiOff': 'Süni intellekt əlçatmazdır — yalnız qaydalar işlədi.', 'res.saved': 'Yalnız redaktə olunmuş mətn tarixçədə saxlanıldı.',
 'fb.q': 'Nəticə düzgündür?', 'fb.yes': 'Düzgün', 'fb.no': 'Səhv', 'fb.thanks': 'Təşəkkürlər! Rəyiniz qeydə alındı.',
 'act.hang': 'Zəngi bitirin. Bank kod istəmir.', 'act.noCode': 'Heç bir kodu, PİN-i və ya kart məlumatını deməyin.', 'act.callBack': 'Bankın rəsmi nömrəsinə (kartın arxasında) özünüz zəng edin.',
 'act.noLink': 'Linkə keçməyin. Rəsmi saytı özünüz yazın.', 'act.family': 'Etibarlı şəxsinizlə məsləhətləşin.', 'act.noPay': 'Heç bir ödəniş və köçürmə etməyin.', 'act.ok': 'Xüsusi addım lazım deyil. Yenə də kodlarınızı heç kimə deməyin.',
 'lab.title': 'Laboratoriya', 'lab.lead': 'Fırıldaq zənglərini təhlükəsiz şəkildə sınayın və süni intellektin necə qərar verdiyini görün.',
 'lab.honest': '<b>Simulyasiya.</b> Zəng səsi əvvəlcədən hazırlanmış audio fayldır (Gemini nitq sintezi). Android başqa tətbiqlərə real zəng səsini vermir — tətbiq buna çıxış iddia etmir. <b>Nitq tanıma və süni intellekt analizi isə realdır</b> və hər dəfə yenidən hesablanır.',
 'lab.news.t': 'Niyə vacibdir', 'lab.news.b': '3 noyabr 2026: Azərbaycan DİN və Ukrayna polisi Kiyevdə Azərbaycan vətəndaşlarını hədəf alan qanunsuz zəng mərkəzlərini aşkar edib. 11 operator saxlanılıb və Azərbaycana ekstradisiya edilib. Operatorlar hazır ssenarilər və psixoloji manipulyasiya ilə işləyirdi. Scam Guardian məhz bu cür ssenariləri tanımaq üçündür, lakin hər fırıldağın qarşısını alacağına zəmanət vermir.',
 'lab.sim': 'Canlı zəng simulyasiyası', 'lab.demo': '90 saniyəlik demo', 'lab.demo.b': 'Əvvəl həqiqi bank zəngi, sonra saxta bank zəngi avtomatik oynayır. Eyni «bank» iddiası — fərqli qərar.', 'lab.demo.run': 'Demonu başlat',
 'lab.cmp': 'Həqiqi və fırıldaq müqayisəsi', 'lab.cmp.empty': 'Hər iki bank zəngini oynadın — nəticələr burada yan-yana görünəcək.',
 'lab.judge': 'Münsif rejimi', 'lab.judge.b': 'Öz mətninizi, səsinizi və ya ssenarinizi yoxlayın. Hər nəticə canlı hesablanır.', 'lab.judge.tech': 'Texniki detalları göstər (bal, gecikmə, model)',
 'lab.custom': 'Öz ssenariniz', 'lab.custom.ph': 'Zəng edənin cümlələri, hər sətirdə bir cümlə…', 'lab.custom.text': 'Mətnlə zəng', 'lab.custom.voice': 'Səsləndir və zəng et',
 'lab.custom.voiceNote': 'Səsləndirmə Gemini TTS ilə edilir (pulsuz limit: ~3 sətir/dəqiqə). Ən çox 4 sətir.', 'lab.custom.gen': 'Səsləndirilir {i}/{n}…',
 'lab.rec': 'Səsinizi yazın', 'lab.rec.b': 'Öz səsinizlə şübhəli cümlə deyin — real nitq tanıma və analiz.',
 'lab.eval': 'Model keyfiyyəti', 'lab.eval.b': 'Komandanın yazdığı {n} etiketli nümunə üzərində real nəticələr ({date}). İnkişaf dəstidir: qaydalar bu dəstlə tənzimlənib, müstəqil test deyil.',
 'lab.eval.none': 'Qiymətləndirmə hələ işə salınmayıb: node eval/run.js', 'lab.eval.hard': 'Çətin nümunələr', 'lab.eval.lang': 'Dillər üzrə', 'lab.eval.lat': 'Gecikmə',
 'lab.eval.fb': 'İstifadəçi rəyləri: {c} düzgün, {w} səhv', 'lab.eval.method': 'Üsul',
 'lab.res.ok': 'düzgün', 'lab.res.bad': 'səhv', 'lab.kind.scam': 'Fırıldaq', 'lab.kind.legit': 'Həqiqi', 'lab.firstWarn': 'İlk xəbərdarlıq', 'lab.stt': 'Nitq tanıma', 'lab.lines': 'cümlə',
 'stt.wait': 'Nitq tanınır…', 'stt.by': 'nitq tanıma', 'stt.fallback': 'ssenari mətni (nitq tanıma əlçatmaz)', 'stt.cached': 'keş',
 'ev.title': 'Sübut xronologiyası', 'ev.empty': 'Hələ sübut yoxdur.', 'ev.stt': 'Nitq tanındı', 'ev.rule': 'Qayda', 'ev.ai': 'Süni intellekt', 'ev.level': 'Risk səviyyəsi',
 'ctl.evidence': 'Sübutlar',
 'notify.title': 'SMS · Etibarlı şəxs (simulyasiya)', 'notify.body': '{name}, Elmira xanım indi şübhəli zəng alır (Scam Guardian). Zəhmət olmasa ona zəng edin.',
 'rec.title': 'Səs yazısı', 'rec.consent': 'Razıyam: səs yazım yalnız nitqi mətnə çevirmək üçün Gemini-yə göndərilir və heç yerdə saxlanılmır.', 'rec.start': 'Yazmağa başla', 'rec.stop': 'Dayandır', 'rec.send': 'Tanı və yoxla', 'rec.max': 'Ən çox 30 saniyə',
 'rec.noMic': 'Mikrofona icazə verilmədi.', 'rec.busy': 'Nitq tanınır…', 'rec.got': 'Tanınan mətn',
 'set.scan': 'Zənglərdə avtomatik fırıldaq yoxlaması', 'set.scanD': 'Hər zəngdə özü açılır', 'set.voice': 'Səsli xəbərdarlıq', 'set.voiceD': 'Təhlükədə səs, vibrasiya və danışıq',
 'set.family': 'Etibarlı şəxsə xəbər ver', 'set.familyD': 'Təhlükəli zəngdə (simulyasiya)', 'set.judge': 'Texniki detallar', 'set.judgeD': 'Münsiflər üçün: bal, gecikmə, model',
 'set.ai': 'Süni intellekt xidməti', 'set.on': 'Qoşulub', 'set.off': 'Qoşulmayıb — yalnız qaydalar', 'set.privacy': 'Məxfilik', 'set.privacyB': 'Səs heç vaxt saxlanılmır. Gemini-yə yalnız redaktə olunmuş mətn gedir (kart, telefon, kod rəqəmləri silinir). Tarixçədə yalnız nəticə və redaktə olunmuş mətn qalır.',
 'set.clear': 'Tarixçəni sil', 'set.cleared': 'Tarixçə silindi', 'set.clearQ': 'Bütün yoxlama tarixçəsi silinsin? Bunu geri qaytarmaq olmaz.', 'set.about': 'Haqqında', 'set.aboutB': 'Scam Guardian prototipidir. Real telefonda zəng səsi Android Əlçatanlıq xidməti və dinamik vasitəsilə alınmalıdır; bu demo isə zəngləri simulyasiya edir.',
 'hist.alerts': 'Zəng xəbərdarlıqları', 'hist.checks': 'Yoxlamalar', 'hist.none': 'Hələ yoxlama yoxdur.', 'hist.demo': 'Nümunə (demo) məlumat', 'hist.server': 'Serverdə saxlanılan redaktə olunmuş nəticələr',
 'err.noServer': 'Server işləmir. node server.js ilə başladın.', 'err.generic': 'Xəta: {m}', 'home.demoNote': 'Zəng tarixçəsi nümunədir (demo).',
 'tac.emotional_manipulation': 'Emosional təzyiq', 'tac.other': 'Digər',
},
ru: {
 'nav.check': 'Проверка', 'nav.lab': 'Лаборатория', 'menu.settings': 'Настройки', 'set.title': 'Настройки',
 'chk.title': 'Проверить сообщение', 'chk.lead': 'Вставьте подозрительное SMS, сообщение WhatsApp, ссылку или текст звонка. Правила и ИИ проверяют вместе.',
 'chk.ph': 'Вставьте сообщение сюда…', 'chk.run': 'Проверить', 'chk.voice': 'Голосом', 'chk.known': 'Отправитель есть в контактах', 'chk.samples': 'Примеры',
 'chk.empty': 'Введите текст или выберите пример.', 'chk.busy': 'Проверяем…',
 'res.evidence': 'Доказательства', 'res.text': 'Найдено в тексте', 'res.links': 'Ссылки', 'res.actions': 'Что сделать сейчас', 'res.tech': 'Технические детали',
 'res.noEvidence': 'Признаков мошенничества не найдено.', 'res.official': 'официальный домен', 'res.rules': 'Правила', 'res.ai': 'ИИ', 'res.fused': 'Итог',
 'res.decided.rules': 'решили правила', 'res.decided.ai': 'решил ИИ', 'res.decided.both': 'оба согласны',
 'res.latency': 'Задержка', 'res.model': 'Модель', 'res.sent': 'Отправлено в Gemini (обезличено)', 'res.cached': 'из кэша (прежний реальный результат)',
 'res.aiOff': 'ИИ недоступен — работали только правила.', 'res.saved': 'В истории сохранён только обезличенный текст.',
 'fb.q': 'Результат верный?', 'fb.yes': 'Верно', 'fb.no': 'Ошибка', 'fb.thanks': 'Спасибо! Отзыв сохранён.',
 'act.hang': 'Положите трубку. Банк не просит коды.', 'act.noCode': 'Не называйте коды, PIN и данные карты.', 'act.callBack': 'Сами позвоните в банк по номеру на обороте карты.',
 'act.noLink': 'Не открывайте ссылку. Наберите адрес сайта сами.', 'act.family': 'Посоветуйтесь с доверенным человеком.', 'act.noPay': 'Не делайте никаких платежей и переводов.', 'act.ok': 'Ничего делать не нужно. Но никому не сообщайте свои коды.',
 'lab.title': 'Лаборатория', 'lab.lead': 'Безопасно проверьте мошеннические звонки и посмотрите, как решает ИИ.',
 'lab.honest': '<b>Симуляция.</b> Звук звонка — заранее подготовленный аудиофайл (синтез речи Gemini). Android не даёт другим приложениям доступ к звуку звонка — приложение этого не утверждает. <b>Распознавание речи и анализ ИИ — настоящие</b> и выполняются каждый раз заново.',
 'lab.news.t': 'Почему это важно', 'lab.news.b': '3 ноября 2026: МВД Азербайджана и полиция Украины раскрыли в Киеве незаконные колл-центры, нацеленные на граждан Азербайджана. 11 операторов задержаны и экстрадированы. Они работали по готовым сценариям с психологическим давлением. Scam Guardian распознаёт такие сценарии, но не гарантирует предотвращение любого мошенничества.',
 'lab.sim': 'Симуляция звонка', 'lab.demo': 'Демо за 90 секунд', 'lab.demo.b': 'Сначала настоящий звонок банка, затем фальшивый. Одинаковое «я из банка» — разные решения.', 'lab.demo.run': 'Запустить демо',
 'lab.cmp': 'Настоящий против мошенника', 'lab.cmp.empty': 'Проиграйте оба банковских звонка — результаты появятся рядом.',
 'lab.judge': 'Режим жюри', 'lab.judge.b': 'Проверьте свой текст, голос или сценарий. Каждый результат считается заново.', 'lab.judge.tech': 'Показывать технические детали (баллы, задержка, модель)',
 'lab.custom': 'Свой сценарий', 'lab.custom.ph': 'Фразы звонящего, по одной на строку…', 'lab.custom.text': 'Звонок текстом', 'lab.custom.voice': 'Озвучить и позвонить',
 'lab.custom.voiceNote': 'Озвучка через Gemini TTS (бесплатный лимит ~3 строки в минуту). Не более 4 строк.', 'lab.custom.gen': 'Озвучиваем {i}/{n}…',
 'lab.rec': 'Запишите свой голос', 'lab.rec.b': 'Скажите подозрительную фразу — настоящее распознавание и анализ.',
 'lab.eval': 'Качество модели', 'lab.eval.b': 'Реальные результаты на {n} размеченных примерах, написанных командой ({date}). Это набор для разработки: правила настраивались на нём, это не независимый тест.',
 'lab.eval.none': 'Оценка ещё не запускалась: node eval/run.js', 'lab.eval.hard': 'Сложные примеры', 'lab.eval.lang': 'По языкам', 'lab.eval.lat': 'Задержка',
 'lab.eval.fb': 'Отзывы пользователей: {c} верно, {w} ошибок', 'lab.eval.method': 'Метод',
 'lab.res.ok': 'верно', 'lab.res.bad': 'ошибка', 'lab.kind.scam': 'Мошенник', 'lab.kind.legit': 'Настоящий', 'lab.firstWarn': 'Первое предупреждение', 'lab.stt': 'Распознавание', 'lab.lines': 'фраз',
 'stt.wait': 'Распознаём речь…', 'stt.by': 'распознавание', 'stt.fallback': 'текст сценария (распознавание недоступно)', 'stt.cached': 'кэш',
 'ev.title': 'Хронология доказательств', 'ev.empty': 'Доказательств пока нет.', 'ev.stt': 'Речь распознана', 'ev.rule': 'Правило', 'ev.ai': 'ИИ', 'ev.level': 'Уровень риска',
 'ctl.evidence': 'Доказательства',
 'notify.title': 'SMS · Доверенное лицо (симуляция)', 'notify.body': '{name}, Эльмире-ханым сейчас звонят мошенники (Scam Guardian). Пожалуйста, позвоните ей.',
 'rec.title': 'Запись голоса', 'rec.consent': 'Согласен(на): запись отправляется в Gemini только для распознавания речи и нигде не хранится.', 'rec.start': 'Начать запись', 'rec.stop': 'Стоп', 'rec.send': 'Распознать и проверить', 'rec.max': 'Не более 30 секунд',
 'rec.noMic': 'Доступ к микрофону не разрешён.', 'rec.busy': 'Распознаём…', 'rec.got': 'Распознанный текст',
 'set.scan': 'Авто-проверка звонков', 'set.scanD': 'Включается на каждом звонке', 'set.voice': 'Голосовое предупреждение', 'set.voiceD': 'Звук, вибрация и голос при опасности',
 'set.family': 'Сообщать доверенному лицу', 'set.familyD': 'При опасном звонке (симуляция)', 'set.judge': 'Технические детали', 'set.judgeD': 'Для жюри: баллы, задержка, модель',
 'set.ai': 'Сервис ИИ', 'set.on': 'Подключён', 'set.off': 'Не подключён — только правила', 'set.privacy': 'Конфиденциальность', 'set.privacyB': 'Голос никогда не сохраняется. В Gemini уходит только обезличенный текст (номера карт, телефонов и коды удаляются). В истории — только результат и обезличенный текст.',
 'set.clear': 'Очистить историю', 'set.cleared': 'История очищена', 'set.clearQ': 'Удалить всю историю проверок? Это нельзя отменить.', 'set.about': 'О приложении', 'set.aboutB': 'Прототип Scam Guardian. На реальном телефоне звук звонка нужно получать через службу специальных возможностей Android и громкую связь; это демо звонки симулирует.',
 'hist.alerts': 'Предупреждения звонков', 'hist.checks': 'Проверки', 'hist.none': 'Проверок пока нет.', 'hist.demo': 'Демо-данные', 'hist.server': 'Обезличенные результаты на сервере',
 'err.noServer': 'Сервер не запущен. Запустите node server.js.', 'err.generic': 'Ошибка: {m}', 'home.demoNote': 'История звонков — демо-данные.',
 'tac.emotional_manipulation': 'Эмоциональное давление', 'tac.other': 'Другое',
},
en: {
 'nav.check': 'Check', 'nav.lab': 'Lab', 'menu.settings': 'Settings', 'set.title': 'Settings',
 'chk.title': 'Check a message', 'chk.lead': 'Paste a suspicious SMS, WhatsApp message, link or call text. Rules and AI check it together.',
 'chk.ph': 'Paste the message here…', 'chk.run': 'Check', 'chk.voice': 'Voice', 'chk.known': 'The sender is in my contacts', 'chk.samples': 'Examples',
 'chk.empty': 'Type a text or pick an example.', 'chk.busy': 'Checking…',
 'res.evidence': 'Evidence', 'res.text': 'Found in the text', 'res.links': 'Links', 'res.actions': 'What to do now', 'res.tech': 'Technical details',
 'res.noEvidence': 'No signs of fraud found.', 'res.official': 'official domain', 'res.rules': 'Rules', 'res.ai': 'AI', 'res.fused': 'Final',
 'res.decided.rules': 'decided by rules', 'res.decided.ai': 'decided by AI', 'res.decided.both': 'both agree',
 'res.latency': 'Latency', 'res.model': 'Model', 'res.sent': 'Sent to Gemini (redacted)', 'res.cached': 'from cache (earlier real result)',
 'res.aiOff': 'AI unavailable — only the rules ran.', 'res.saved': 'Only the redacted text was saved to history.',
 'fb.q': 'Is this result right?', 'fb.yes': 'Right', 'fb.no': 'Wrong', 'fb.thanks': 'Thank you! Feedback saved.',
 'act.hang': 'Hang up. Banks never ask for codes.', 'act.noCode': 'Do not share any code, PIN or card details.', 'act.callBack': 'Call your bank yourself on the number on the back of your card.',
 'act.noLink': 'Do not open the link. Type the official site yourself.', 'act.family': 'Talk to your trusted person first.', 'act.noPay': 'Do not pay or transfer anything.', 'act.ok': 'Nothing special to do. Still, never share your codes.',
 'lab.title': 'Lab', 'lab.lead': 'Try scam calls safely and see how the AI decides.',
 'lab.honest': '<b>Simulation.</b> The call audio is a pre-generated file (Gemini text-to-speech). Android does not give other apps access to real call audio, and this app does not claim it. <b>The speech-to-text and the AI analysis are real</b> and recomputed every time.',
 'lab.news.t': 'Why this matters', 'lab.news.b': '3 November 2026: Azerbaijan\'s Interior Ministry and Ukrainian police uncovered illegal call centres in Kyiv targeting Azerbaijani citizens. 11 operators were arrested and extradited. They worked from pre-written scripts with psychological manipulation. Scam Guardian is built to recognise such scripts, but it cannot guarantee to stop every scam.',
 'lab.sim': 'Live call simulation', 'lab.demo': '90-second demo', 'lab.demo.b': 'A real bank call plays first, then a fake one. Same “I\'m from your bank” — different verdict.', 'lab.demo.run': 'Start demo',
 'lab.cmp': 'Real vs scam', 'lab.cmp.empty': 'Play both bank calls — the results will appear side by side.',
 'lab.judge': 'Judge mode', 'lab.judge.b': 'Test your own text, voice or scenario. Every result is computed live.', 'lab.judge.tech': 'Show technical details (scores, latency, model)',
 'lab.custom': 'Your own scenario', 'lab.custom.ph': 'The caller\'s sentences, one per line…', 'lab.custom.text': 'Text call', 'lab.custom.voice': 'Voice it and call',
 'lab.custom.voiceNote': 'Voiced with Gemini TTS (free-tier limit ~3 lines a minute). At most 4 lines.', 'lab.custom.gen': 'Voicing {i}/{n}…',
 'lab.rec': 'Record your voice', 'lab.rec.b': 'Say a suspicious sentence yourself — real speech-to-text and analysis.',
 'lab.eval': 'Model quality', 'lab.eval.b': 'Real results on {n} labelled examples written by the team ({date}). Development set: the rules were tuned on it, so it is not an independent test.',
 'lab.eval.none': 'The evaluation has not been run yet: node eval/run.js', 'lab.eval.hard': 'Hard cases', 'lab.eval.lang': 'By language', 'lab.eval.lat': 'Latency',
 'lab.eval.fb': 'User feedback: {c} right, {w} wrong', 'lab.eval.method': 'Method',
 'lab.res.ok': 'correct', 'lab.res.bad': 'wrong', 'lab.kind.scam': 'Scam', 'lab.kind.legit': 'Legit', 'lab.firstWarn': 'First warning', 'lab.stt': 'Speech-to-text', 'lab.lines': 'lines',
 'stt.wait': 'Transcribing…', 'stt.by': 'speech-to-text', 'stt.fallback': 'script text (speech-to-text unavailable)', 'stt.cached': 'cache',
 'ev.title': 'Evidence timeline', 'ev.empty': 'No evidence yet.', 'ev.stt': 'Speech transcribed', 'ev.rule': 'Rule', 'ev.ai': 'AI', 'ev.level': 'Risk level',
 'ctl.evidence': 'Evidence',
 'notify.title': 'SMS · Trusted person (simulated)', 'notify.body': '{name}, Mrs Elmira is getting a suspicious call right now (Scam Guardian). Please call her.',
 'rec.title': 'Voice recording', 'rec.consent': 'I agree: my recording is sent to Gemini only to turn speech into text, and it is not stored anywhere.', 'rec.start': 'Start recording', 'rec.stop': 'Stop', 'rec.send': 'Transcribe and check', 'rec.max': 'Up to 30 seconds',
 'rec.noMic': 'Microphone permission was denied.', 'rec.busy': 'Transcribing…', 'rec.got': 'Transcribed text',
 'set.scan': 'Automatic scam check on calls', 'set.scanD': 'Turns on by itself on every call', 'set.voice': 'Spoken warning', 'set.voiceD': 'Sound, vibration and voice on danger',
 'set.family': 'Alert my trusted person', 'set.familyD': 'On a dangerous call (simulated)', 'set.judge': 'Technical details', 'set.judgeD': 'For judges: scores, latency, model',
 'set.ai': 'AI service', 'set.on': 'Connected', 'set.off': 'Not connected — rules only', 'set.privacy': 'Privacy', 'set.privacyB': 'Audio is never stored. Only redacted text goes to Gemini (card, phone and code digits removed). History keeps only the verdict and the redacted text.',
 'set.clear': 'Clear history', 'set.cleared': 'History cleared', 'set.clearQ': 'Delete the whole check history? This cannot be undone.', 'set.about': 'About', 'set.aboutB': 'Scam Guardian prototype. On a real phone, call audio would come through the Android Accessibility service and the speakerphone; this demo simulates the calls.',
 'hist.alerts': 'Call alerts', 'hist.checks': 'Checks', 'hist.none': 'No checks yet.', 'hist.demo': 'Demo data', 'hist.server': 'Redacted results stored on the server',
 'err.noServer': 'The server is not running. Start it with node server.js.', 'err.generic': 'Error: {m}', 'home.demoNote': 'The call history is demo data.',
 'tac.emotional_manipulation': 'Emotional pressure', 'tac.other': 'Other',
}};
for (const l of Object.keys(LSTR)) Object.assign(STR[l], LSTR[l]);

/* ---------------- settings & state ---------------- */
const SETTINGS_KEY = 'sg.settings';
const saved = (() => { try { return JSON.parse(store.get(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } })();
Object.assign(state, {
  autoScan: saved.autoScan !== false, judge: !!saved.judge,
  check: { text: '', busy: false, res: null, err: null, known: false, fb: null, source: 'check' },
  lab: { results: {}, custom: '', customBusy: '', demo: false, last: null },
  hist: { tab: 'alerts', items: null, loading: false, err: null },
  health: null, evalData: null, evalErr: null, rec: null
});
if (saved.sound === false) state.sound = false;
const saveSettings = () => store.set(SETTINGS_KEY, JSON.stringify({ autoScan: state.autoScan, judge: state.judge, sound: state.sound }));
const SERVER = location.protocol.startsWith('http');
NAV_SCREENS.push('check', 'lab');

async function api(path, o = {}) {
  if (!SERVER) throw new Error(t('err.noServer'));
  const headers = Object.assign(o.json ? { 'Content-Type': 'application/json' } : {}, o.headers || {});
  let r;
  try { r = await fetch(path, { method: o.method || 'GET', headers, body: o.json ? JSON.stringify(o.json) : o.body }); }
  catch (e) { throw new Error(t('err.noServer')); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : await r.blob();
  if (!r.ok) throw Object.assign(new Error((data && data.error) || 'HTTP ' + r.status), { status: r.status });
  return data;
}
window.SGapi = api;
async function loadHealth() { try { state.health = await api('/api/health'); } catch (e) { state.health = { gemini: false, error: e.message }; } }
loadHealth();

const L = () => state.lang;
const tacticLabel = tc => (ScamRules.TACTICS[tc] ? ScamRules.TACTICS[tc].label[L()] : t('tac.' + tc) !== 'tac.' + tc ? t('tac.' + tc) : tc);
const tacticClass = tc => { const x = ScamRules.TACTICS[tc]; return x ? (x.level === 'danger' ? 'danger' : x.level === 'info' ? 'info' : x.level === 'weak' ? 'weak' : '') : 'weak'; };
const pct = r => Math.round((r || 0) * 100) + '%';
const ms = v => (v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms');
const lvIcon = lv => (lv === 'danger' ? 'octagon' : lv === 'caution' ? 'alert' : 'shieldCheck');

/* ---------------- Check screen ---------------- */
const SAMPLES = [
  { k: 'az-sms', label: { az: 'Saxta bank SMS', ru: 'Фейковое SMS банка', en: 'Fake bank SMS' }, text: 'Hörmətli müştəri, kartınız bloklanıb. 24 saat ərzində bərpa etmək üçün keçin: http://kapital-bank-az.xyz/login' },
  { k: 'az-prize', label: { az: 'Uduş', ru: 'Выигрыш', en: 'Prize' }, text: 'Təbriklər! Siz 5000 AZN uduş qazandınız. Hədiyyəni almaq üçün 20 AZN komissiya haqqı ödəyin: bit.ly/udus-az' },
  { k: 'az-kid', label: { az: '«Yeni nömrəm»', ru: '«Мой новый номер»', en: '“My new number”' }, text: 'Ana, telefonum xarab olub, bu yeni nömrəmdir. Təcili 300 manat lazımdır, bu karta göndər, sonra izah edərəm. Ataya demə.' },
  { k: 'ru-call', label: { az: 'Rusca zəng', ru: 'Звонок (RU)', en: 'Russian call' }, text: 'Здравствуйте, служба безопасности банка. По вашей карте подозрительная операция. Назовите код из SMS, который сейчас придёт.' },
  { k: 'az-otp', label: { az: 'Həqiqi OTP SMS', ru: 'Настоящий OTP', en: 'Real OTP SMS' }, text: 'Kapital Bank: Sizin təsdiq kodunuz 482913. Bu kodu heç kimə, hətta bank əməkdaşına belə deməyin.' },
  { k: 'az-mom', label: { az: 'Ailə mesajı', ru: 'Семейное', en: 'Family text' }, text: 'Salam ana, axşam yeməyə gəlirik, saat yeddidə orda olarıq. Çörək alım?' },
];
function markText(text, ev) {
  const spans = (ev || []).filter(e => e.end > e.start && e.tactic !== 'safety_advice').sort((a, b) => a.start - b.start);
  let out = '', pos = 0;
  for (const e of spans) {
    if (e.start < pos) continue;
    const cls = tacticClass(e.tactic) === 'danger' ? 'danger' : 'caution';
    out += esc(text.slice(pos, e.start)) + `<mark class="kw kw-${cls}" title="${esc(tacticLabel(e.tactic))}">${esc(text.slice(e.start, e.end))}</mark>`;
    pos = e.end;
  }
  return out + esc(text.slice(pos));
}
function defaultActions(tactics, level) {
  if (level === 'safe') return [t('act.ok')];
  const a = [];
  if (tactics.some(x => ['otp_request', 'card_request', 'impersonation'].includes(x))) a.push(t('act.hang'), t('act.noCode'), t('act.callBack'));
  if (tactics.includes('suspicious_link')) a.push(t('act.noLink'));
  if (tactics.some(x => ['money_transfer', 'safe_account', 'prize_fee', 'investment'].includes(x))) a.push(t('act.noPay'));
  a.push(t('act.family'));
  return [...new Set(a)].slice(0, 3);
}
function resultHTML(res, text) {
  if (!res) return '';
  const f = res.fused, lv = f.level, ai = res.ai, rules = res.rules;
  const tactics = [...new Set((rules ? rules.tactics : []).concat(ai ? ai.tactics : []))];
  const why = ai && (ai.reason[L()] || ai.reason.en) || (lv === 'safe' ? t('res.noEvidence') : tactics.map(tacticLabel).join(', '));
  const evRules = (rules.evidence || []).filter(e => e.weight > 0);
  const evAI = ai ? ai.evidence : [];
  const actions = (ai && ai.safeActions[L()] && ai.safeActions[L()].length) ? ai.safeActions[L()] : defaultActions(tactics, lv);
  const links = rules.links || [];
  const decided = t('res.decided.' + f.decidedBy);
  return `<section class="rk rk-${lv}" aria-live="polite">
    <div class="rk-head">${ic(lvIcon(lv))}<b>${t('risk.' + lv)}</b><span class="rk-pct">${t('call.risk')}: ${pct(f.risk)}</span></div>
    <div class="rk-bar" role="meter" aria-label="${t('call.risk')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f.risk * 100)}" style="--v:${f.risk}"><i></i></div>
    <p class="rk-why">${esc(why)}</p>
    ${!ai ? `<p class="hint" style="text-align:left">${ic('info', 'ic-sm')} ${t('res.aiOff')}${res.aiError ? ' (' + esc(res.aiError.slice(0, 120)) + ')' : ''}</p>` : ''}
    ${text && evRules.length ? `<h3>${t('res.text')}</h3><div class="rk-text">${markText(text, rules.evidence)}</div>` : ''}
    <h3>${t('res.evidence')}</h3>
    ${evRules.length || evAI.length ? `<ul class="ev-list">
      ${evRules.map(e => `<li><span class="src-tag">${t('res.rules')}</span><span class="tg ${tacticClass(e.tactic)}">${esc(tacticLabel(e.tactic))}</span><q>${esc(e.quote)}</q></li>`).join('')}
      ${evAI.map(e => `<li><span class="src-tag ai">AI</span><span class="tg ${tacticClass(e.tactic)}">${esc(tacticLabel(e.tactic))}</span><q>${esc(e.quote)}</q></li>`).join('')}</ul>`
      : `<p class="muted">${t('res.noEvidence')}</p>`}
    ${links.length ? `<h3>${t('res.links')}</h3><div class="ev-list">${links.map(l => `<div class="lk ${l.official ? 'ok' : l.risk >= .45 ? 'bad' : ''}"><b>${ic('link', 'ic-sm')} ${esc(l.host)}</b><span>${l.official ? t('res.official') : l.reasons.map(r => ScamRules.LINK_REASON[r] ? ScamRules.LINK_REASON[r][L()] : r).join(' · ') || '—'}</span></div>`).join('')}</div>` : ''}
    <h3>${t('res.actions')}</h3><ol class="acts">${actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>
    ${state.judge ? `<h3>${t('res.tech')}</h3><table class="tech">
      <tr><th>${t('res.rules')}</th><td>${rules.tactics.join(', ') || '—'}</td><td class="n">${pct(rules.risk)}</td></tr>
      <tr><th>${t('res.ai')}</th><td>${ai ? esc(ai.model) + (ai.cached ? ' · ' + t('res.cached') : '') : '—'}</td><td class="n">${ai ? pct(ai.risk) : '—'}</td></tr>
      <tr><th>${t('res.fused')}</th><td>${decided}</td><td class="n">${pct(f.risk)}</td></tr>
      <tr><th>${t('res.latency')}</th><td>${t('res.rules')} ${ms(res.latency.rulesMs)} · AI ${ms(res.latency.aiMs)}</td><td class="n">${ms(res.latency.totalMs)}</td></tr></table>
      <h3>${t('res.sent')}</h3><pre class="redacted">${esc(res.textRedacted)}</pre>` : ''}
    ${res.id ? `<div class="fb"><span>${t('fb.q')}</span>
      <button class="lb-btn" data-action="fb" data-id="${res.id}" data-v="correct" aria-pressed="${res.fb === 'correct'}">${ic('thumbUp')}${t('fb.yes')}</button>
      <button class="lb-btn" data-action="fb" data-id="${res.id}" data-v="wrong" aria-pressed="${res.fb === 'wrong'}">${ic('thumbDown')}${t('fb.no')}</button></div>
      <p class="hint" style="text-align:left;margin-top:8px">${ic('lock', 'ic-sm')} ${t('res.saved')}</p>` : ''}
  </section>`;
}
R.check = () => {
  const c = state.check;
  return `<div class="dl">
    <h1 class="dl-title" tabindex="-1" data-focus>${t('chk.title')}</h1>
    <p class="dl-lead">${t('chk.lead')}</p>
    <div class="lb-card">
      <label class="sr-only" for="chkText">${t('chk.ph')}</label>
      <textarea id="chkText" class="lb-ta" placeholder="${t('chk.ph')}" maxlength="4000">${esc(c.text)}</textarea>
      <div class="chips wrap" role="group" aria-label="${t('chk.samples')}">${SAMPLES.map(s => `<button class="fchip sm" data-action="chkSample" data-k="${s.k}">${esc(s.label[L()])}</button>`).join('')}</div>
      <label class="lb-check"><input type="checkbox" id="chkKnown" ${c.known ? 'checked' : ''}>${t('chk.known')}</label>
      <div class="lb-row">
        <button class="lb-btn primary" data-action="chkRun" ${c.busy ? 'aria-busy="true" disabled' : ''}>${c.busy ? `<span class="spinner"></span>${t('chk.busy')}` : `${ic('shieldCheck')}${t('chk.run')}`}</button>
        <button class="lb-btn" data-action="recOpen" data-for="check">${ic('mic')}${t('chk.voice')}</button></div>
    </div>
    ${c.err ? `<div class="lb-err" role="alert">${ic('alert')}<span>${esc(c.err)}</span></div>` : ''}
    <div id="chkRes">${resultHTML(c.res, c.resText)}</div>
  </div>`;
};
async function runCheck(text, source) {
  const c = state.check;
  text = String(text || '').trim();
  if (!text) { c.err = t('chk.empty'); render(); $('#chkText')?.focus(); return; }
  c.text = text; c.busy = true; c.err = null; c.source = source || 'check'; render();
  const known = !!$('#chkKnown')?.checked; c.known = known;
  try {
    const res = await api('/api/analyze', { method: 'POST', json: { text, channel: source === 'voice' ? 'voice' : 'message', knownContact: known, lang: state.lang, source: c.source, fresh: state.judge } });
    c.res = res; c.resText = text; state.hist.items = null;
  } catch (e) {
    /* No server: the rules engine still runs in the browser. */
    if (!SERVER || e.message === t('err.noServer')) {
      const rules = ScamRules.analyze(text);
      c.res = { rules, ai: null, aiError: t('err.noServer'), fused: ScamRules.fuse(rules, null), latency: {}, textRedacted: ScamCheck.redact(text) };
      c.resText = text;
    } else c.err = t('err.generic', { m: e.message });
  }
  c.busy = false;
  if (state.screen === 'check') { render(); $('#chkRes .rk')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ---------------- recorder (consented, WAV in the browser) ---------------- */
function recSheet() {
  const r = state.rec; if (!r) return '';
  return `<div class="scrim" data-action="recClose"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="recT"><div class="handle"></div>
    <h2 id="recT">${t('rec.title')}</h2>
    <label class="lb-check" style="margin:0 8px"><input type="checkbox" id="recConsent" ${r.consent ? 'checked' : ''} ${r.on ? 'disabled' : ''}>${t('rec.consent')}</label>
    <button class="rec-big ${r.on ? 'on' : ''}" data-action="recToggle" ${r.consent && !r.busy ? '' : 'disabled'} aria-label="${r.on ? t('rec.stop') : t('rec.start')}">${ic(r.on ? 'x' : 'mic')}</button>
    <p class="rec-t2" id="recTime">${fmtTime(r.sec || 0)}</p>
    <div class="rec-lvl"><i id="recLvl"></i></div>
    <p class="hint">${r.busy ? `<span class="spinner" style="display:inline-block;vertical-align:-4px"></span> ${t('rec.busy')}` : r.err ? esc(r.err) : t('rec.max')}</p>
    ${r.wav && !r.on ? `<div class="lb-row" style="padding:0 8px"><button class="lb-btn primary" data-action="recSend" ${r.busy ? 'disabled' : ''}>${ic('shieldCheck')}${t('rec.send')}</button></div>` : ''}
  </div>`;
}
const _renderSheet = renderSheet;
renderSheet = function () {   /* eslint-disable-line no-global-assign */
  if (state.rec) { $('#sheetHost').innerHTML = recSheet(); return; }
  if (state.sheet === 'evidence') { $('#sheetHost').innerHTML = evidenceSheet(); return; }
  _renderSheet();
};
function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
let recCtx = null;
async function recStart() {
  const r = state.rec;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = []; const ratio = ctx.sampleRate / 16000;
    proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0); let peak = 0;
      const out = new Float32Array(Math.floor(d.length / ratio));
      for (let i = 0; i < out.length; i++) { const x = d[Math.floor(i * ratio)]; out[i] = x; peak = Math.max(peak, Math.abs(x)); }
      chunks.push(out); const l = $('#recLvl'); if (l) l.style.width = Math.min(100, peak * 160) + '%';
    };
    src.connect(proc); proc.connect(ctx.destination);
    recCtx = { stream, ctx, proc, chunks };
    Object.assign(r, { on: true, sec: 0, wav: null, err: null });
    r.timer = setInterval(() => { r.sec++; const e = $('#recTime'); if (e) e.textContent = fmtTime(r.sec); if (r.sec >= 30) recStop(); }, 1000);
    renderSheet();
  } catch (e) { r.err = t('rec.noMic'); renderSheet(); }
}
function recStop() {
  const r = state.rec; if (!recCtx || !r) return;
  clearInterval(r.timer);
  recCtx.proc.disconnect(); recCtx.stream.getTracks().forEach(tr => tr.stop()); recCtx.ctx.close();
  const n = recCtx.chunks.reduce((s, c) => s + c.length, 0), all = new Float32Array(n); let o = 0;
  for (const c of recCtx.chunks) { all.set(c, o); o += c.length; }
  recCtx = null; r.on = false; r.wav = n > 8000 ? encodeWav(all, 16000) : null;
  if (!r.wav) r.err = t('rec.max');
  renderSheet();
}
async function recSend() {
  const r = state.rec; if (!r || !r.wav) return;
  r.busy = true; renderSheet();
  try {
    const out = await api('/api/transcribe?fresh=1&store=0', { method: 'POST', body: r.wav, headers: { 'Content-Type': 'audio/wav' } });
    const target = r.for;
    state.rec = null; renderSheet();
    if (!out.text) throw new Error('—');
    log(`Recording transcribed by ${out.model} in ${out.ms} ms`);
    state.check.text = out.text;
    if (state.screen !== 'check') go('check');
    snack(t('rec.got') + ': “' + out.text.slice(0, 80) + '”');
    runCheck(out.text, 'voice');
    void target;
  } catch (e) { if (state.rec) { r.busy = false; r.err = t('err.generic', { m: e.message }); renderSheet(); } }
}

/* ---------------- Simulation Lab: voiced calls with real speech-to-text ---------------- */
let labAudio = null;
window.labStop = () => { if (labAudio) { try { labAudio.pause(); } catch (e) {} labAudio = null; } };
function scenarioScript(sc) {
  return { id: sc.id, lab: true, kind: sc.kind, sms: sc.smsAt, lines: sc.lines.map(([who, text, en], i) => ({ who, ref: text, en, audio: `audio/${sc.id}/${i}.wav` })) };
}
function startLab(sc, script) {
  stopCall();
  if (!permsOK()) state.perms = { mic: true, acc: true, beep: true };
  state.lab.last = sc.id;
  state.labScript = script || scenarioScript(sc);
  state.callee = Object.assign({ dir: 'in', lab: sc.id }, sc.caller);
  go('incoming'); vibrate([300, 200, 300]);
  log(`Simulation Lab: incoming "${sc.id}" (simulated call, pre-generated audio)`);
  if (state.lab.demo) setTimeout(() => { if (state.screen === 'incoming' && state.labScript) A.answer(); }, 2200);
}
/* hook used by index.html's nextLine() for lines that carry audio.
 * The audio always plays, so the conversation goes on even with scam check off; speech-to-text,
 * the transcript and the analysis run only while scam check is on. The clip is fetched once and
 * played from a blob URL — the same bytes go to speech-to-text — which also makes repeated runs
 * independent of the browser's media cache. */
window.labLine = function (c, k) {
  const src = c.script.lines[k], analyse = c.phase === 'listening';
  const l = { who: src.who, text: '', stt: analyse ? 'wait' : 'off', ref: src.ref, en: src.en };
  c.lines.push(l); const i = c.lines.length - 1; c.playing = true;
  if (k === c.script.sms && !c.smsArrived) { c.smsArrived = true; log('Signal: SMS code arrived during the call'); vibrate(60); }
  if (analyse) {
    c.typing = i;
    const lis = $('#listening'); if (lis) lis.insertAdjacentHTML('beforebegin', lineHTML(l, i, false));
    const tl = $('#trList'); if (tl) tl.scrollTop = tl.scrollHeight;
    setPipe([2, 3, 4], ['stt']); flash(4);
  }
  let audioDone = false, textDone = !analyse;
  const next = () => {
    if (!(audioDone && textDone) || state.call !== c || !c.playing) return;
    c.playing = false;
    if (c.scriptIdx < c.script.lines.length) { labLater(c, nextLine, 450); return; }
    /* 90-second demo: when a call finishes without an alert, hang up and ring the next scenario */
    if (state.lab.demo && c.level !== 'danger') labLater(c, () => {
      hangUp();
      const nx = (state.lab.queue || []).shift();
      if (nx) setTimeout(() => { if (state.screen === 'ended') startLab(Scenarios.byId(nx)); }, 2500); else state.lab.demo = false;
    }, 1500);
  };
  const finishText = () => {
    if (state.call !== c) return;
    if (c.phase !== 'listening' || l.stt === 'off') {           /* scam check was switched off meanwhile */
      if (c.typing === i) c.typing = -1;
      if (l.stt === 'wait') l.stt = 'off';
      textDone = true; next(); return;
    }
    (c.timeline = c.timeline || []).push({ t: c.sec, kind: 'stt', text: l.text, meta: l.stt === 'ok' ? `${l.sttModel} · ${ms(l.sttMs)}${l.sttCached ? ' · ' + t('stt.cached') : ''}` : t('stt.fallback') });
    if (l.stt === 'ok') c.sttCount = (c.sttCount || 0) + 1, c.sttMsSum = (c.sttMsSum || 0) + l.sttMs;
    typeLine(c, i, () => { if (c.phase === 'listening') lineDone(i); else if (c.typing === i) c.typing = -1; textDone = true; next(); });
  };
  const t0 = performance.now();
  fetch(src.audio).then(r => { if (!r.ok) throw new Error('audio ' + r.status); return r.blob(); }).then(blob => {
    if (state.call !== c) return;
    const url = URL.createObjectURL(blob), a = new Audio(url);
    labAudio = a;                                                /* Mute is the user's microphone; the caller stays audible */
    const done = () => { if (audioDone) return; audioDone = true; URL.revokeObjectURL(url); if (labAudio === a) labAudio = null; next(); };
    a.onended = done; a.onerror = done;
    a.play().catch(done);
    if (!analyse) return;
    api('/api/transcribe' + (state.judge ? '?fresh=1' : ''), { method: 'POST', body: blob, headers: { 'Content-Type': 'audio/wav' } })
      .then(out => { if (!out.text) throw new Error('empty'); Object.assign(l, { text: out.text, stt: 'ok', sttModel: out.model, sttMs: out.ms || Math.round(performance.now() - t0), sttCached: !!out.cached }); })
      .catch(err => { Object.assign(l, { text: src.ref, stt: 'fallback', sttErr: err.message }); log('STT unavailable: ' + err.message); })
      .finally(finishText);
  }).catch(err => {                                                 /* clip missing: show the script text, labelled */
    log('Lab audio unavailable: ' + err.message);
    Object.assign(l, { text: src.ref, stt: analyse ? 'fallback' : 'off' });
    setTimeout(() => { audioDone = true; next(); }, 1200 + src.ref.split(' ').length * 260);
    if (analyse) finishText();
  });
};
function typeLine(c, i, done) {
  const l = c.lines[i], li = $(`#trList .line[data-i="${i}"]`);
  if (!li) { done(); return; }
  li.classList.remove('stt-wait');
  const p = li.querySelector('p'), words = l.text.split(' '); let w = 0;
  const iv = setInterval(() => {
    if (!p.isConnected || state.call !== c) { clearInterval(iv); done(); return; }
    w += 2; p.textContent = words.slice(0, w).join(' ');
    const tl = $('#trList'); if (tl) tl.scrollTop = tl.scrollHeight;
    if (w >= words.length) { clearInterval(iv); done(); }
  }, 70);
}
/* hook: evidence chips + timeline after each analysed line */
window.onLineAnalyzed = function (c, i) {
  const l = c.lines[i]; if (!l || l.who !== 'caller') return;
  const ra = ScamRules.analyze(lineText(l));
  l.ev = ra.evidence.filter(e => e.weight > 0).map(e => ({ tactic: e.tactic, quote: e.quote, src: 'rules' }));
  c.timeline = c.timeline || [];
  for (const e of l.ev) c.timeline.push({ t: c.sec, kind: 'rule', text: tacticLabel(e.tactic), meta: '“' + e.quote + '”', lv: tacticClass(e.tactic) });
  paintEvidence(c, i);
};
window.onAIResult = function (c, r) {
  c.timeline = c.timeline || [];
  c.timeline.push({ t: c.sec, kind: 'ai', text: `${t('risk.' + r.level)} · ${pct(r.risk)}`, meta: `${r.model} · ${ms(r.ms)}${r.cached ? ' · ' + t('stt.cached') : ''}${r.tactics && r.tactics.length ? ' · ' + r.tactics.map(tacticLabel).join(', ') : ''}`, lv: r.level });
  for (const e of (r.evidence || [])) {
    const q = e.quote.toLowerCase();
    const idx = c.lines.findIndex(l => l.who === 'caller' && lineText(l).toLowerCase().includes(q.slice(0, 40)));
    if (idx < 0) continue;
    const l = c.lines[idx]; l.ev = l.ev || [];
    if (!l.ev.some(x => x.src === 'ai' && x.tactic === e.tactic)) { l.ev.push({ tactic: e.tactic, quote: e.quote, src: 'ai' }); paintEvidence(c, idx); }
  }
};
window.onLevel = function (c, lv) {
  c.timeline = c.timeline || []; c.timeline.push({ t: c.sec, kind: 'level', text: t('risk.' + lv), lv });
  if (lv !== 'safe' && c.firstWarnAt == null) c.firstWarnAt = c.sec;
};
function paintEvidence(c, i) {
  const li = $(`#trList .line[data-i="${i}"]`); if (!li) return;
  let box = li.querySelector('.evs'); if (!box) { box = document.createElement('div'); box.className = 'evs'; li.appendChild(box); }
  const seen = new Set();
  box.innerHTML = (c.lines[i].ev || []).filter(e => !seen.has(e.tactic + e.src) && seen.add(e.tactic + e.src))
    .map(e => `<span class="evc ${tacticClass(e.tactic) === 'danger' ? 'danger' : ''} ${e.src === 'ai' ? 'ai' : ''}">${e.src === 'ai' ? '✦ ' : ''}${esc(tacticLabel(e.tactic))}</span>`).join('');
}
window.lineExtra = function (l) {
  if (l.stt === 'wait') return `<div class="stt-meta">${t('stt.wait')}</div>`;
  if (l.stt === 'ok' && state.judge) return `<div class="stt-meta">${ic('mic', 'ic-sm')} ${esc(l.sttModel)} · ${ms(l.sttMs)}${l.sttCached ? ' · ' + t('stt.cached') : ''}</div>`;
  if (l.stt === 'fallback') return `<div class="stt-meta">${t('stt.fallback')}</div>`;
  return '';
};
function evidenceSheet() {
  const c = state.call, tl = (c && c.timeline) || [];
  return `<div class="scrim" data-action="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="evT"><div class="handle"></div>
    <h2 id="evT">${t('ev.title')}</h2>
    ${tl.length ? `<ol class="tl">${tl.map(e => `<li><time>${fmtTime(e.t)}</time><div><span class="tg ${e.lv === 'danger' ? 'danger' : e.lv === 'safe' || e.kind === 'stt' ? 'info' : e.lv === 'weak' ? 'weak' : ''}">${t('ev.' + e.kind)}</span> ${esc(e.text)}${e.meta ? `<small>${esc(e.meta)}</small>` : ''}</div></li>`).join('')}</ol>` : `<p class="hint">${t('ev.empty')}</p>`}
  </div>`;
}
/* hook: a finished Lab call → scorecard + persistent alert record */
window.onCallEnd = function (c, who) {
  if (!c) return;
  const r = c.ai && c.ai.result;
  const rec = {
    scenario: c.script && c.script.id, level: c.level, risk: c.risk, durationSec: c.sec, sttLines: c.sttCount || 0,
    tactics: [...new Set(c.lines.flatMap(l => (l.ev || []).map(e => e.tactic)))], scamType: r ? r.scamType : null,
    reason: r ? r.reason : null, number: who.number
  };
  if (c.script && c.script.lab) {
    state.lab.results[c.script.id] = Object.assign({}, rec, { kind: c.script.kind, firstWarnAt: c.firstWarnAt, sttAvg: c.sttCount ? Math.round(c.sttMsSum / c.sttCount) : null, aiMs: r ? r.ms : null, model: r ? r.model : null });
  }
  if (c.phase === 'listening' && SERVER) api('/api/history', { method: 'POST', json: rec }).then(() => { state.hist.items = null; }).catch(() => {});
};

/* ---------------- Lab screen ---------------- */
const SC_ICON = { bank: 'bank', shield: 'shield', spark: 'spark', users: 'users' };
function scenarioRow(sc) {
  const res = state.lab.results[sc.id];
  const ok = res ? ((res.level === 'safe') === (sc.kind === 'legit')) : null;
  return `<li class="crow scn"><span class="cav2" style="--c:${sc.kind === 'scam' ? '#A1251B' : '#0D5C2E'}">${ic(SC_ICON[sc.icon] || 'phone')}</span>
    <span class="crow-txt"><span class="cname">${esc(sc.title[L()])}</span>
      <span class="csub" style="white-space:normal">${esc(sc.sub[L()])}</span>
      <span class="csub"><span class="kind-tag ${sc.kind}">${t('lab.kind.' + sc.kind)}</span>${res ? `<span class="res-chip ${ok ? 'ok' : 'bad'}">${ic(ok ? 'check' : 'x', 'ic-sm')}${t('risk.' + res.level)} · ${t(ok ? 'lab.res.ok' : 'lab.res.bad')}</span>` : ''}</span></span>
    <button class="playb" data-action="labStart" data-id="${sc.id}" aria-label="${t('common.call')}: ${esc(sc.title[L()])}">${ic('phoneFill')}</button></li>`;
}
function cmpHTML() {
  const a = state.lab.results.realbank, b = state.lab.results.bank;
  if (!a || !b) return `<p class="muted" style="font-size:15px">${t('lab.cmp.empty')}</p>`;
  const col = (sc, r) => `<div class="rk-${r.level}"><b>${esc(Scenarios.byId(sc).title[L()])}</b>
     <div class="lvl">${t('risk.' + r.level)} · ${pct(r.risk)}</div>
     <small>${r.level !== 'safe' && r.tactics.length ? r.tactics.map(tacticLabel).join(', ') : (r.reason && r.reason[L()]) || t('res.noEvidence')}</small>
     ${r.firstWarnAt != null ? `<small>${t('lab.firstWarn')}: ${fmtTime(r.firstWarnAt)}</small>` : ''}
     <small>${t('lab.stt')}: ${r.sttLines} ${t('lab.lines')}${r.sttAvg ? ' · ⌀ ' + ms(r.sttAvg) : ''}</small></div>`;
  return `<div class="cmp">${col('realbank', a)}${col('bank', b)}</div>`;
}
function evalHTML() {
  const d = state.evalData;
  if (state.evalErr) return `<p class="muted" style="font-size:15px">${esc(state.evalErr)}</p>`;
  if (!d) return `<div class="sk" style="height:120px;border-radius:16px"></div>`;
  const m = d.metrics, rows = [['rules', t('res.rules')], ['ai', 'Gemini'], ['fused', t('res.fused')]].filter(([k]) => m[k]);
  const best = rows.reduce((b, [k]) => (!b || m[k].f1 > m[b].f1 ? k : b), null);
  const f = d.feedback;
  return `<p style="font-size:14.5px;color:var(--text-2);line-height:1.4;margin-top:4px">${t('lab.eval.b', { n: d.dataset.n, date: new Date(d.ranAt).toLocaleDateString() })}</p>
    <div class="kpis"><div class="kpi"><b>${Math.round(m.fused.precision * 100)}%</b><span>Precision</span></div><div class="kpi"><b>${Math.round(m.fused.recall * 100)}%</b><span>Recall</span></div><div class="kpi"><b>${ms(d.latency.aiMsP50)}</b><span>AI p50</span></div></div>
    <table class="mt"><thead><tr><th>${t('lab.eval.method')}</th><th>Prec.</th><th>Recall</th><th>F1</th><th>FP</th><th>FN</th></tr></thead><tbody>
      ${rows.map(([k, n]) => `<tr class="${k === best ? 'best' : ''}"><td>${n}</td><td>${m[k].precision.toFixed(2)}</td><td>${m[k].recall.toFixed(2)}</td><td>${m[k].f1.toFixed(2)}</td><td>${m[k].fp}</td><td>${m[k].fn}</td></tr>`).join('')}
      <tr><td>${t('lab.eval.hard')} (${t('res.rules')})</td><td>${m.rulesHardOnly.precision.toFixed(2)}</td><td>${m.rulesHardOnly.recall.toFixed(2)}</td><td>${m.rulesHardOnly.f1.toFixed(2)}</td><td>${m.rulesHardOnly.fp}</td><td>${m.rulesHardOnly.fn}</td></tr>
      <tr><td>${t('lab.eval.hard')} (${t('res.fused')})</td><td>${m.fusedHardOnly.precision.toFixed(2)}</td><td>${m.fusedHardOnly.recall.toFixed(2)}</td><td>${m.fusedHardOnly.f1.toFixed(2)}</td><td>${m.fusedHardOnly.fp}</td><td>${m.fusedHardOnly.fn}</td></tr>
    </tbody></table>
    <table class="mt"><thead><tr><th>${t('lab.eval.lang')}</th><th>n</th><th>Acc.</th><th>Recall</th><th>FP</th></tr></thead><tbody>
      ${Object.entries(d.byLang).map(([k, v]) => `<tr><td>${k.toUpperCase()}</td><td>${v.n}</td><td>${v.accuracy.toFixed(2)}</td><td>${v.recall.toFixed(2)}</td><td>${v.fp}</td></tr>`).join('')}</tbody></table>
    <table class="tech" style="margin-top:8px"><tr><th>${t('lab.eval.lat')}</th><td>${t('res.rules')} p50 ${ms(d.latency.rulesMsP50)} · Gemini p50 ${ms(d.latency.aiMsP50)} · p95 ${ms(d.latency.aiMsP95)}</td></tr>
      <tr><th>${t('res.model')}</th><td>${esc(d.model || '—')} · ${d.latency.aiCalls} AI / ${d.latency.aiFailures} ${t('lab.res.bad')}</td></tr>
      ${f ? `<tr><th>${t('fb.q').replace('?', '')}</th><td>${t('lab.eval.fb', { c: f.correct, w: f.wrong })}</td></tr>` : ''}</table>`;
}
async function loadEval() {
  if (state.evalData || state.evalErr || state.evalLoading) return;
  state.evalLoading = true;
  try { state.evalData = await api('/api/eval'); try { state.evalData.feedback = (await api('/api/stats')).feedback; } catch (e) {} }
  catch (e) { state.evalErr = e.status === 404 ? t('lab.eval.none') : e.message; }
  state.evalLoading = false;
  const box = $('#evalBox'); if (box) box.innerHTML = evalHTML();
}
R.lab = () => {
  setTimeout(loadEval, 0);
  const busy = state.lab.customBusy;
  return `<div class="dl">
    <h1 class="dl-title" tabindex="-1" data-focus>${t('lab.title')}</h1>
    <p class="dl-lead">${t('lab.lead')}</p>
    <div class="lb-note" role="note">${ic('info')}<span>${t('lab.honest')}</span></div>
    <div class="lb-card news"><h2>${ic('news')}${t('lab.news.t')}</h2><p>${t('lab.news.b')}</p>
      <div class="src"><a href="https://report.az/en/incident/azerbaijan-s-interior-ministry-and-ukrainian-police-conduct-joint-operation-against-cyber-fraudsters" target="_blank" rel="noopener noreferrer">Report.az ↗</a>
      <a href="https://1news.az/en/news/20261103122005522-Main-Department-for-Combating-Cybercrime-carries-out-large-scale-operation-together-with-Ukrainian-police-PHOTO-VIDEO" target="_blank" rel="noopener noreferrer">1news.az ↗</a></div></div>
    <div class="lb-card"><h2>${ic('play')}${t('lab.demo')}</h2><p>${t('lab.demo.b')}</p>
      <div class="lb-row"><button class="lb-btn green" data-action="labDemo">${ic('play')}${t('lab.demo.run')}</button></div></div>
    <h2 class="lb-sec">${t('lab.sim')}<span class="sim-tag">SIM</span></h2>
    <ul class="clist">${Scenarios.LIST.map(scenarioRow).join('')}</ul>
    <h2 class="lb-sec">${t('lab.cmp')}</h2>
    <div class="lb-card">${cmpHTML()}</div>
    <h2 class="lb-sec">${t('lab.judge')}</h2>
    <div class="lb-card"><p>${t('lab.judge.b')}</p>
      <label class="lb-check"><input type="checkbox" data-action="judgeToggle" ${state.judge ? 'checked' : ''}>${t('lab.judge.tech')}</label></div>
    <div class="lb-card"><h2>${ic('wand')}${t('lab.custom')}</h2>
      <label class="sr-only" for="labCustom">${t('lab.custom.ph')}</label>
      <textarea id="labCustom" class="lb-ta" placeholder="${t('lab.custom.ph')}" maxlength="1200">${esc(state.lab.custom)}</textarea>
      <div class="lb-row"><button class="lb-btn" data-action="labCustomText" ${busy ? 'disabled' : ''}>${ic('msg')}${t('lab.custom.text')}</button>
        <button class="lb-btn green" data-action="labCustomVoice" ${busy ? 'aria-busy="true" disabled' : ''}>${busy ? `<span class="spinner"></span>${esc(busy)}` : `${ic('phoneFill')}${t('lab.custom.voice')}`}</button></div>
      <p class="hint" style="text-align:left">${t('lab.custom.voiceNote')}</p></div>
    <div class="lb-card"><h2>${ic('mic')}${t('lab.rec')}</h2><p>${t('lab.rec.b')}</p>
      <div class="lb-row"><button class="lb-btn" data-action="recOpen" data-for="lab">${ic('mic')}${t('lab.rec')}</button>
        <button class="lb-btn" data-go="check">${ic('shieldCheck')}${t('chk.title')}</button></div></div>
    <h2 class="lb-sec">${t('lab.eval')}<span>${ic('chart')}</span></h2>
    <div class="lb-card" id="evalBox">${evalHTML()}</div>
  </div>`;
};
const CUSTOM_VOICES = ['Charon', 'Fenrir', 'Orus'];
function customLines() {
  return String($('#labCustom')?.value || state.lab.custom).split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 8);
}
function customScenario(lines, audios) {
  return { id: 'custom', kind: null, icon: 'wand', title: { az: 'Öz ssenari', ru: 'Свой сценарий', en: 'Custom scenario' }, caller: { name: '', number: '+994 99 000 00 00', reports: 0 }, lines: lines.map(x => ['caller', x, '']), audios };
}

/* ---------------- History: add server-side checks ---------------- */
const _history = R.history;
function histSeg() {
  return `<div class="chips" role="group" style="margin:-6px 0 14px">${['alerts', 'checks'].map(k => `<button class="fchip" data-action="histTab" data-k="${k}" aria-pressed="${state.hist.tab === k}">${t('hist.' + k)}</button>`).join('')}</div>`;
}
function histChecksHTML() {
  const h = state.hist;
  if (h.err) return `<div class="lb-err">${ic('alert')}<span>${esc(h.err)}</span></div>`;
  if (!h.items) { setTimeout(loadHist, 0); return skeleton(3); }
  if (!h.items.length) return `<div class="empty"><span class="e-ic">${ic('shieldCheck')}</span><strong>${t('hist.none')}</strong></div>`;
  return `<p class="note">${ic('lock')}<span>${t('hist.server')}</span></p><ul class="alist">${h.items.map(e => {
    const lv = e.level === 'safe' ? 'safe' : e.level, d = new Date(e.at);
    const title = e.kind === 'call' ? (Scenarios.byId(e.scenario) ? Scenarios.byId(e.scenario).title[L()] : t('scam.other')) : (e.textRedacted || '').slice(0, 70);
    return `<li class="lvl-${lv === 'safe' ? 'caution' : lv}"><div class="arow-btn" style="cursor:default"><span class="aav" style="${lv === 'safe' ? 'background:var(--safe-fill)' : ''}">${ic(e.kind === 'call' ? 'phone' : e.kind === 'voice' ? 'mic' : 'msg')}</span>
      <span class="arow-body"><span class="arow-main"><span class="atitle" style="font-size:16.5px;font-weight:600">${esc(title)}</span>
      <span class="asub meta"><span class="lvl-tag" style="${lv === 'safe' ? 'background:var(--safe-bg);color:var(--on-safe-bg)' : ''}">${t('risk.' + lv)} · ${pct(e.risk)}</span>${shortDate(d)}${e.simulated ? ' · SIM' : ''}${e.feedback ? ' · ' + ic(e.feedback === 'correct' ? 'thumbUp' : 'thumbDown', 'ic-sm') : ''}</span>
      ${e.reason && e.reason[L()] ? `<span class="asub">${esc(e.reason[L()])}</span>` : ''}</span>
      <button class="acirc" data-action="histDel" data-id="${e.id}" aria-label="${t('family.remove')}">${ic('trash')}</button></span></div></li>`;
  }).join('')}</ul>`;
}
async function loadHist() {
  const h = state.hist; if (h.loading) return; h.loading = true;
  try { h.items = (await api('/api/history?limit=100')).items; h.err = null; } catch (e) { h.err = e.message; h.items = []; }
  h.loading = false; if (state.screen === 'history' && h.tab === 'checks') render();
}
R.history = () => {
  if (state.hist.tab === 'alerts') return _history().replace('</h1>', '</h1>' + histSeg()).replace('<p class="note">', `<p class="note">${ic('info')}<span>${t('hist.demo')}.</span></p><p class="note">`);
  return `${topbar({ back: true })}<div class="scroll has-top has-nav"><h1 class="ltitle" tabindex="-1" data-focus>${t('history.title')}</h1>${histSeg()}${histChecksHTML()}</div>`;
};

/* ---------------- Settings ---------------- */
R.settings = () => {
  const h = state.health || {}, f = state.family;
  const sw = (act, on, title, desc) => `<button class="switch-row" role="switch" aria-checked="${on}" data-action="${act}"><span class="txt"><strong>${title}</strong><small>${desc}</small></span><span class="switch"></span></button>`;
  return `${topbar({ back: true })}<div class="scroll has-top has-nav">
    <h1 class="ltitle" tabindex="-1" data-focus>${t('set.title')}</h1>
    <div class="set-list">
      ${sw('setScan', state.autoScan, t('set.scan'), t('set.scanD'))}
      ${sw('setVoice', state.sound, t('set.voice'), t('set.voiceD'))}
      ${sw('setFamily', !!(f && f.notify), t('set.family'), f ? esc(f.name) + ' · ' + t('set.familyD') : t('danger.noFamily'))}
      ${sw('setJudge', state.judge, t('set.judge'), t('set.judgeD'))}
    </div>
    <h2 class="lb-sec">${t('set.ai')}</h2>
    <div class="lb-card"><p style="color:var(--text)"><span class="stat-dot ${h.gemini ? 'on' : ''}"></span>${h.gemini ? t('set.on') : t('set.off')}</p>
      ${h.gemini ? `<table class="tech" style="margin-top:8px"><tr><th>${t('res.ai')}</th><td>${esc(h.model)}</td></tr><tr><th>${t('lab.stt')}</th><td>${esc(h.stt)}</td></tr><tr><th>TTS</th><td>${esc(h.tts)}</td></tr><tr><th>${t('menu.alerts')}</th><td>${h.history | 0}</td></tr></table>` : `<p class="hint" style="text-align:left">${esc(h.error || '')}</p>`}</div>
    <h2 class="lb-sec">${t('set.privacy')}</h2>
    <div class="lb-card"><p>${t('set.privacyB')}</p><div class="lb-row"><button class="lb-btn" data-action="setClear">${ic('trash')}${t('set.clear')}</button></div></div>
    <h2 class="lb-sec">${t('set.about')}</h2>
    <div class="lb-card"><p>${t('set.aboutB')}</p></div>
    <div class="set-list" style="margin-top:12px">
      <button class="opt-row" data-action="openLang">${ic('globe')}${t('lang.title')}<span class="v">${state.lang.toUpperCase()}</span></button>
      <button class="opt-row" data-action="toggleTheme">${ic(state.theme === 'dark' ? 'sun' : 'moon')}${state.theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}</button>
    </div></div>`;
};

/* ---------------- actions ---------------- */
Object.assign(A, {
  chkSample(el) { const s = SAMPLES.find(x => x.k === el.dataset.k); if (!s) return; state.check.text = s.text; state.check.res = null; render(); $('#chkText')?.focus(); },
  chkRun() { runCheck($('#chkText')?.value, 'check'); },
  async fb(el) {
    const res = state.check.res; const v = el.dataset.v;
    try { await api('/api/feedback', { method: 'POST', json: { id: el.dataset.id, verdict: v } }); if (res && res.id === el.dataset.id) res.fb = v; snack(t('fb.thanks')); state.hist.items = null; state.evalData = null; render(); }
    catch (e) { snack(t('err.generic', { m: e.message })); }
  },
  recOpen(el) { state.sheet = false; state.rec = { for: el.dataset.for, consent: false, on: false, sec: 0 }; renderSheet(); },
  recClose() { if (state.rec && state.rec.on) recStop(); state.rec = null; renderSheet(); },
  recToggle() { if (!state.rec) return; if (state.rec.on) recStop(); else recStart(); },
  recSend() { recSend(); },
  labStart(el) { state.lab.demo = false; const sc = Scenarios.byId(el.dataset.id); if (sc) startLab(sc); },
  labDemo() { state.lab.demo = true; state.lab.queue = ['bank']; startLab(Scenarios.byId('realbank')); },
  judgeToggle(el) { state.judge = el.checked; saveSettings(); },
  labCustomText() {
    const lines = customLines(); if (!lines.length) { snack(t('chk.empty')); return; }
    state.lab.custom = lines.join('\n'); state.lab.demo = false;
    const sc = customScenario(lines);
    startLab(sc, { id: 'custom', lab: false, kind: null, lines: lines.map(text => ({ who: 'caller', text })) });
  },
  async labCustomVoice() {
    const lines = customLines().slice(0, 4); if (!lines.length) { snack(t('chk.empty')); return; }
    state.lab.custom = lines.join('\n'); state.lab.demo = false;
    const voice = CUSTOM_VOICES[Math.floor(Math.random() * CUSTOM_VOICES.length)], urls = [];
    try {
      for (let i = 0; i < lines.length; i++) {
        state.lab.customBusy = t('lab.custom.gen', { i: i + 1, n: lines.length }); if (state.screen === 'lab') render();
        const blob = await api('/api/tts', { method: 'POST', json: { text: lines[i], voice, style: 'Say in a natural phone-call voice' } });
        urls.push(URL.createObjectURL(blob));
      }
    } catch (e) { state.lab.customBusy = ''; render(); snack(t('err.generic', { m: e.message })); return; }
    state.lab.customBusy = '';
    const sc = customScenario(lines);
    startLab(sc, { id: 'custom', lab: true, kind: null, lines: lines.map((text, i) => ({ who: 'caller', ref: text, en: '', audio: urls[i] })) });
  },
  histTab(el) { state.hist.tab = el.dataset.k; render(); },
  async histDel(el) { try { await api('/api/history/' + el.dataset.id, { method: 'DELETE' }); state.hist.items = (state.hist.items || []).filter(e => e.id !== el.dataset.id); render(); } catch (e) { snack(t('err.generic', { m: e.message })); } },
  setScan(el) { state.autoScan = !state.autoScan; el.setAttribute('aria-checked', state.autoScan); saveSettings(); },
  setVoice(el) { state.sound = !state.sound; el.setAttribute('aria-checked', state.sound); saveSettings(); updatePanel(); },
  setFamily(el) { if (!state.family) { go('family'); return; } state.family.notify = !state.family.notify; el.setAttribute('aria-checked', state.family.notify); },
  setJudge(el) { state.judge = !state.judge; el.setAttribute('aria-checked', state.judge); saveSettings(); },
  async setClear() {
    if (!window.confirm(t('set.clearQ'))) return;
    try { await api('/api/history', { method: 'DELETE' }); state.hist.items = null; snack(t('set.cleared')); loadHealth(); } catch (e) { snack(t('err.generic', { m: e.message })); }
  },
  evidence() { state.sheet = 'evidence'; renderSheet(); },
});
document.addEventListener('input', e => {
  if (e.target.id === 'chkText') state.check.text = e.target.value;
  if (e.target.id === 'labCustom') state.lab.custom = e.target.value;
  if (e.target.id === 'recConsent' && state.rec) { state.rec.consent = e.target.checked; renderSheet(); }
});
document.addEventListener('change', e => { if (e.target.id === 'recConsent' && state.rec) { state.rec.consent = e.target.checked; renderSheet(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.rec) A.recClose();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.id === 'chkText') A.chkRun();
});
})();
