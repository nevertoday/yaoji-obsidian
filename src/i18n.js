// 界面文字：中文原文就是 key，跟着 Obsidian 的界面语言走，没有的语言用英文。
// 和浏览器扩展同样的 13 种语言；扩展里已有的句子照抄扩展的译法（core/i18n/*.js）。
// 新加一句，13 种都要补齐（tests/i18n.test.mjs 会查）。

export const LANGUAGES = ['zh', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'th', 'vi'];

export const MESSAGES = {
  '今日待办': {
    'zh-TW': '今日待辦', en: 'Today’s To-dos', ja: '今日のToDo', ko: 'Today’s To-dos', es: 'Today’s To-dos', fr: 'Today’s To-dos',
    de: 'Today’s To-dos', pt: 'Today’s To-dos', ru: 'Today’s To-dos', ar: 'Today’s To-dos', th: 'Today’s To-dos', vi: 'Today’s To-dos'
  },
  '在侧边栏打开': {
    'zh-TW': '在側邊欄打開', en: 'Open in sidebar', ja: 'サイドバーで開く', ko: '사이드바에서 열기', es: 'Abrir en la barra lateral',
    fr: 'Ouvrir dans la barre latérale', de: 'In der Seitenleiste öffnen', pt: 'Abrir na barra lateral', ru: 'Открыть на боковой панели',
    ar: 'افتح في الشريط الجانبي', th: 'เปิดในแถบข้าง', vi: 'Mở ở thanh bên'
  },
  '回到今天': {
    'zh-TW': '回到今天', en: 'Back to today', ja: '今日に戻る', ko: '오늘로 돌아가기', es: 'Volver a hoy', fr: 'Revenir à aujourd’hui',
    de: 'Zurück zu heute', pt: 'Voltar para hoje', ru: 'Вернуться к сегодня', ar: 'العودة إلى اليوم', th: 'กลับไปวันนี้', vi: 'Về hôm nay'
  },
  '前一天': {
    'zh-TW': '前一天', en: 'Previous day', ja: '前の日', ko: '전날', es: 'Día anterior', fr: 'Jour précédent',
    de: 'Vorheriger Tag', pt: 'Dia anterior', ru: 'Предыдущий день', ar: 'اليوم السابق', th: 'วันก่อนหน้า', vi: 'Ngày trước'
  },
  '后一天': {
    'zh-TW': '後一天', en: 'Next day', ja: '次の日', ko: '다음 날', es: 'Día siguiente', fr: 'Jour suivant',
    de: 'Nächster Tag', pt: 'Dia seguinte', ru: 'Следующий день', ar: 'اليوم التالي', th: 'วันถัดไป', vi: 'Ngày sau'
  },
  '星标': {
    'zh-TW': '星標', en: 'Star', ja: 'スターを付ける', ko: '별표', es: 'Destacar', fr: 'Ajouter une étoile',
    de: 'Mit Stern markieren', pt: 'Destacar', ru: 'Отметить звёздочкой', ar: 'تمييز بنجمة', th: 'ติดดาว', vi: 'Gắn sao'
  },
  '取消星标': {
    'zh-TW': '取消星標', en: 'Unstar', ja: 'スターを外す', ko: '별표 해제', es: 'Quitar destacado', fr: 'Retirer l’étoile',
    de: 'Stern entfernen', pt: 'Remover destaque', ru: 'Снять звёздочку', ar: 'إزالة النجمة', th: 'เลิกติดดาว', vi: 'Bỏ gắn sao'
  },
  '删除': {
    'zh-TW': '刪除', en: 'Delete', ja: '削除', ko: '삭제', es: 'Eliminar', fr: 'Supprimer', de: 'Löschen',
    pt: 'Excluir', ru: 'Удалить', ar: 'حذف', th: 'ลบ', vi: 'Xóa'
  },
  '已删除': {
    'zh-TW': '已刪除', en: 'Deleted', ja: '削除しました', ko: '삭제됨', es: 'Eliminado', fr: 'Supprimé', de: 'Gelöscht',
    pt: 'Excluído', ru: 'Удалено', ar: 'حُذف', th: 'ลบแล้ว', vi: 'Đã xóa'
  },
  '添加待办': {
    'zh-TW': '新增待辦', en: 'Add a to-do', ja: 'ToDo を追加', ko: '할 일 추가', es: 'Añadir una tarea', fr: 'Ajouter une tâche',
    de: 'Aufgabe hinzufügen', pt: 'Adicionar tarefa', ru: 'Добавить задачу', ar: 'إضافة مهمة', th: 'เพิ่มงาน', vi: 'Thêm việc'
  },
  '打开今天': {
    'zh-TW': '打開今天', en: 'Open today', ja: '今日を開く', ko: '오늘 열기', es: 'Abrir hoy', fr: 'Ouvrir aujourd’hui',
    de: 'Heute öffnen', pt: 'Abrir hoje', ru: 'Открыть сегодня', ar: 'افتح اليوم', th: 'เปิดวันนี้', vi: 'Mở hôm nay'
  },
  '把没做完的带到今天': {
    'zh-TW': '把沒做完的帶到今天', en: 'Bring unfinished to today', ja: '未完了を今日に持ってくる', ko: '못 끝낸 일을 오늘로 가져오기',
    es: 'Traer lo pendiente a hoy', fr: 'Ramener l’inachevé à aujourd’hui', de: 'Unerledigtes auf heute holen', pt: 'Trazer o pendente para hoje',
    ru: 'Перенести незавершённое на сегодня', ar: 'انقل غير المنجز إلى اليوم', th: 'ยกงานค้างมาวันนี้', vi: 'Mang việc dở dang sang hôm nay'
  },
  '加一件事，回车': {
    'zh-TW': '加一件事，按 Enter', en: 'Add something, press Enter', ja: 'やることを入力して Enter', ko: '할 일을 적고 Enter',
    es: 'Escribe algo y pulsa Intro', fr: 'Écrivez une tâche, puis Entrée', de: 'Etwas eingeben, Enter drücken', pt: 'Escreva algo e tecle Enter',
    ru: 'Введите дело и нажмите Enter', ar: 'اكتب مهمة واضغط Enter', th: 'พิมพ์งานแล้วกด Enter', vi: 'Nhập việc rồi nhấn Enter'
  },
  '加上了': {
    'zh-TW': '加上了', en: 'Added', ja: '追加しました', ko: '추가했어요', es: 'Añadida', fr: 'Ajoutée', de: 'Hinzugefügt',
    pt: 'Adicionada', ru: 'Добавлено', ar: 'أُضيفت', th: 'เพิ่มแล้ว', vi: 'Đã thêm'
  },
  '带来了昨天的 {count} 件': {
    'zh-TW': '帶來了昨天的 {count} 件', en: 'Brought over {count} from yesterday', ja: '昨日の {count} 件を持ってきました',
    ko: '어제 일 {count}개를 가져왔어요', es: 'Se trajeron {count} de ayer', fr: '{count} d’hier reprises', de: '{count} von gestern übernommen',
    pt: 'Trouxe {count} de ontem', ru: 'Перенесено {count} со вчера', ar: 'نُقلت {count} من أمس', th: 'ยกมาจากเมื่อวาน {count} รายการ',
    vi: 'Đã mang sang {count} việc từ hôm qua'
  },
  '带来了之前的 {count} 件': {
    'zh-TW': '帶來了之前的 {count} 件', en: 'Brought over {count} from earlier days', ja: '以前の {count} 件を持ってきました',
    ko: '이전 일 {count}개를 가져왔어요', es: 'Se trajeron {count} de días anteriores', fr: '{count} des jours précédents reprises',
    de: '{count} von früheren Tagen übernommen', pt: 'Trouxe {count} de dias anteriores', ru: 'Перенесено {count} с прошлых дней',
    ar: 'نُقلت {count} من أيام سابقة', th: 'ยกมาจากวันก่อน ๆ {count} รายการ', vi: 'Đã mang sang {count} việc từ những ngày trước'
  },
  '昨天剩 {count} 件，太多了没带': {
    'zh-TW': '昨天剩 {count} 件，太多了沒帶', en: '{count} left from yesterday — too many to bring over',
    ja: '昨日の残り {count} 件。多すぎるので持ってきていません', ko: '어제 남은 일 {count}개 — 너무 많아서 가져오지 않았어요',
    es: 'Quedan {count} de ayer; demasiadas para traerlas', fr: '{count} restants d’hier — trop pour les reprendre',
    de: '{count} von gestern offen – zu viele zum Übernehmen', pt: 'Sobraram {count} de ontem — muitas para trazer',
    ru: 'Со вчера осталось {count} — слишком много, не перенесено', ar: 'تبقّى {count} من أمس — كثيرة جدًا فلم تُنقل',
    th: 'เหลือจากเมื่อวาน {count} รายการ มากเกินไปจึงไม่ได้ยกมา', vi: 'Còn {count} việc từ hôm qua — quá nhiều nên chưa mang sang'
  },
  '之前剩 {count} 件，太多了没带': {
    'zh-TW': '之前剩 {count} 件，太多了沒帶', en: '{count} left from earlier days — too many to bring over',
    ja: '以前の残り {count} 件。多すぎるので持ってきていません', ko: '이전에 남은 일 {count}개 — 너무 많아서 가져오지 않았어요',
    es: 'Quedan {count} de días anteriores; demasiadas para traerlas', fr: '{count} restants des jours précédents — trop pour les reprendre',
    de: '{count} von früheren Tagen offen – zu viele zum Übernehmen', pt: 'Sobraram {count} de dias anteriores — muitas para trazer',
    ru: 'С прошлых дней осталось {count} — слишком много, не перенесено', ar: 'تبقّى {count} من أيام سابقة — كثيرة جدًا فلم تُنقل',
    th: 'เหลือจากวันก่อน ๆ {count} รายการ มากเกินไปจึงไม่ได้ยกมา', vi: 'Còn {count} việc từ những ngày trước — quá nhiều nên chưa mang sang'
  },
  '去看看': {
    'zh-TW': '去看看', en: 'Take a look', ja: '見に行く', ko: '보러 가기', es: 'Ver', fr: 'Voir', de: 'Ansehen',
    pt: 'Ver', ru: 'Посмотреть', ar: 'عرض', th: 'ไปดู', vi: 'Xem'
  },
  '撤销': {
    'zh-TW': '撤銷', en: 'Undo', ja: '元に戻す', ko: '실행 취소', es: 'Deshacer', fr: 'Annuler', de: 'Rückgängig',
    pt: 'Desfazer', ru: 'Отменить', ar: 'تراجع', th: 'เลิกทำ', vi: 'Hoàn tác'
  },
  '撤回了': {
    'zh-TW': '撤回了', en: 'Undone', ja: '元に戻しました', ko: '되돌렸어요', es: 'Deshecho', fr: 'Annulé', de: 'Rückgängig gemacht',
    pt: 'Desfeito', ru: 'Отменено', ar: 'تم التراجع', th: 'เลิกทำแล้ว', vi: 'Đã hoàn tác'
  },
  '有的日记这期间改过，那部分没撤回': {
    'zh-TW': '有的日記這期間改過，那部分沒撤回', en: 'Some notes changed in the meantime, so those weren’t undone',
    ja: 'その間に変更されたノートがあり、その分は元に戻していません', ko: '그사이 바뀐 노트가 있어 그 부분은 되돌리지 않았어요',
    es: 'Algunas notas cambiaron mientras tanto; esas no se deshicieron', fr: 'Certaines notes ont changé entre-temps ; elles n’ont pas été annulées',
    de: 'Einige Notizen wurden inzwischen geändert und nicht zurückgesetzt', pt: 'Algumas notas mudaram nesse meio-tempo e não foram desfeitas',
    ru: 'Некоторые заметки за это время изменились, их не вернули', ar: 'تغيّرت بعض الملاحظات في الأثناء، فلم يُتراجع عنها',
    th: 'บางบันทึกถูกแก้ระหว่างนั้น ส่วนนั้นจึงไม่ได้เลิกทำ', vi: 'Một số ghi chú đã đổi trong lúc đó nên phần ấy chưa hoàn tác'
  },
  '以前的都做完了': {
    'zh-TW': '以前的都做完了', en: 'Nothing left from earlier days', ja: '以前の分はすべて完了しています', ko: '이전 일은 다 끝냈어요',
    es: 'No queda nada de días anteriores', fr: 'Rien ne reste des jours précédents', de: 'Von früher ist nichts mehr offen',
    pt: 'Nada pendente de dias anteriores', ru: 'С прошлых дней ничего не осталось', ar: 'لا شيء متبقٍّ من الأيام السابقة',
    th: 'งานวันก่อน ๆ เสร็จหมดแล้ว', vi: 'Những ngày trước đã xong hết'
  },
  '写不进今天的日记：{error}': {
    'zh-TW': '寫不進今天的日記：{error}', en: 'Couldn’t write today’s note: {error}', ja: '今日のノートに書き込めません：{error}',
    ko: '오늘 노트에 쓸 수 없어요: {error}', es: 'No se pudo escribir la nota de hoy: {error}', fr: 'Impossible d’écrire la note du jour : {error}',
    de: 'Heutige Notiz konnte nicht geschrieben werden: {error}', pt: 'Não foi possível escrever a nota de hoje: {error}',
    ru: 'Не удалось записать заметку на сегодня: {error}', ar: 'تعذّرت الكتابة في ملاحظة اليوم: {error}',
    th: 'เขียนบันทึกวันนี้ไม่ได้: {error}', vi: 'Không ghi được ghi chú hôm nay: {error}'
  },
  '日记放在「{path}」，和日记插件一样': {
    'zh-TW': '日記放在「{path}」，和日記外掛一樣', en: 'Daily notes go in “{path}”, same as your daily notes plugin',
    ja: 'デイリーノートは「{path}」に。デイリーノートプラグインと同じです', ko: '데일리 노트는 “{path}”에 둬요. 데일리 노트 플러그인과 같아요',
    es: 'Las notas diarias van en «{path}», igual que tu plugin de notas diarias', fr: 'Les notes du jour vont dans « {path} », comme votre plugin de notes quotidiennes',
    de: 'Tagesnotizen liegen in „{path}“, wie bei deinem Tagesnotizen-Plugin', pt: 'As notas diárias ficam em “{path}”, como no seu plugin de notas diárias',
    ru: 'Ежедневные заметки — в «{path}», как в вашем плагине ежедневных заметок', ar: 'الملاحظات اليومية في «{path}»، مثل إضافة الملاحظات اليومية لديك',
    th: 'บันทึกประจำวันอยู่ที่ “{path}” เหมือนปลั๊กอินบันทึกประจำวันของคุณ', vi: 'Ghi chú hằng ngày nằm ở “{path}”, giống plugin ghi chú hằng ngày của bạn'
  },
  '改': {
    'zh-TW': '改', en: 'Change', ja: '変更', ko: '바꾸기', es: 'Cambiar', fr: 'Modifier', de: 'Ändern',
    pt: 'Alterar', ru: 'Изменить', ar: 'تغيير', th: 'เปลี่ยน', vi: 'Đổi'
  },
  '日记放在哪': {
    'zh-TW': '日記放在哪', en: 'Daily notes folder', ja: 'デイリーノートの場所', ko: '데일리 노트 위치', es: 'Carpeta de notas diarias',
    fr: 'Dossier des notes du jour', de: 'Ordner für Tagesnotizen', pt: 'Pasta das notas diárias', ru: 'Папка ежедневных заметок',
    ar: 'مجلد الملاحظات اليومية', th: 'โฟลเดอร์บันทึกประจำวัน', vi: 'Thư mục ghi chú hằng ngày'
  },
  '文件名': {
    'zh-TW': '檔名', en: 'File name', ja: 'ファイル名', ko: '파일 이름', es: 'Nombre del archivo', fr: 'Nom du fichier',
    de: 'Dateiname', pt: 'Nome do arquivo', ru: 'Имя файла', ar: 'اسم الملف', th: 'ชื่อไฟล์', vi: 'Tên tệp'
  },
  '今天是 {path}': {
    'zh-TW': '今天是 {path}', en: 'Today: {path}', ja: '今日：{path}', ko: '오늘: {path}', es: 'Hoy: {path}', fr: 'Aujourd’hui : {path}',
    de: 'Heute: {path}', pt: 'Hoje: {path}', ru: 'Сегодня: {path}', ar: 'اليوم: {path}', th: 'วันนี้: {path}', vi: 'Hôm nay: {path}'
  },
  '待办放在哪个标题下': {
    'zh-TW': '待辦放在哪個標題下', en: 'Heading for to-dos', ja: 'ToDo を置く見出し', ko: '할 일을 둘 제목', es: 'Encabezado de las tareas',
    fr: 'Titre des tâches', de: 'Überschrift für Aufgaben', pt: 'Título das tarefas', ru: 'Заголовок для задач',
    ar: 'العنوان الذي توضع تحته المهام', th: 'หัวข้อสำหรับงาน', vi: 'Tiêu đề cho việc cần làm'
  },
  '新日记用的模板': {
    'zh-TW': '新日記用的範本', en: 'Template for new notes', ja: '新しいノートのテンプレート', ko: '새 노트 템플릿', es: 'Plantilla para notas nuevas',
    fr: 'Modèle des nouvelles notes', de: 'Vorlage für neue Notizen', pt: 'Modelo para notas novas', ru: 'Шаблон новых заметок',
    ar: 'قالب الملاحظات الجديدة', th: 'เทมเพลตบันทึกใหม่', vi: 'Mẫu cho ghi chú mới'
  },
  '不用模板': {
    'zh-TW': '不用範本', en: 'No template', ja: 'テンプレートなし', ko: '템플릿 없음', es: 'Sin plantilla', fr: 'Aucun modèle',
    de: 'Keine Vorlage', pt: 'Sem modelo', ru: 'Без шаблона', ar: 'بلا قالب', th: 'ไม่ใช้เทมเพลต', vi: 'Không dùng mẫu'
  },
  '用日记插件的设置': {
    'zh-TW': '用日記外掛的設定', en: 'Use your daily notes settings', ja: 'デイリーノートの設定を使う', ko: '데일리 노트 설정 사용',
    es: 'Usar tu configuración de notas diarias', fr: 'Utiliser vos réglages de notes du jour', de: 'Einstellungen der Tagesnotizen übernehmen',
    pt: 'Usar suas configurações de notas diárias', ru: 'Взять настройки ежедневных заметок', ar: 'استخدم إعدادات الملاحظات اليومية',
    th: 'ใช้การตั้งค่าบันทึกประจำวัน', vi: 'Dùng cài đặt ghi chú hằng ngày'
  },
  '沿用': {
    'zh-TW': '沿用', en: 'Use', ja: '使う', ko: '사용', es: 'Usar', fr: 'Utiliser', de: 'Übernehmen',
    pt: 'Usar', ru: 'Взять', ar: 'استخدام', th: 'ใช้', vi: 'Dùng'
  }
};

let current = 'zh';

// Obsidian 的界面语言：新版有 getLanguage()，旧版存在 localStorage 'language'（没有就是英文）
export function detectLanguage(obsidian = {}) {
  let raw = '';
  try { raw = typeof obsidian.getLanguage === 'function' ? obsidian.getLanguage() : ''; } catch { raw = ''; }
  if (!raw) {
    try { raw = globalThis.localStorage?.getItem('language') || 'en'; } catch { raw = 'en'; }
  }
  return normalizeLanguage(raw);
}

export function normalizeLanguage(raw) {
  const value = String(raw || '').trim().replace('_', '-');
  if (/^zh-(tw|hk|hant)/i.test(value)) return 'zh-TW';
  const base = value.split('-')[0].toLowerCase();
  if (base === 'zh') return 'zh';
  return LANGUAGES.includes(base) ? base : 'en';
}

export function setLanguage(language) {
  current = LANGUAGES.includes(language) ? language : 'en';
}

export function language() {
  return current;
}

export function t(key, vars = {}) {
  const text = current === 'zh' ? key : (MESSAGES[key]?.[current] || MESSAGES[key]?.en || key);
  return text.replace(/{(\w+)}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
}
