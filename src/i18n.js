// 界面文字：中文原文就是 key，跟着 Obsidian 的界面语言走，没有的语言用英文。
// 和浏览器扩展同样的 13 种语言；扩展里已有的句子照抄扩展的译法（core/i18n/*.js）。
// 新加一句，13 种都要补齐（tests/i18n.test.mjs 会查）。

export const LANGUAGES = ['zh', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'th', 'vi'];

export const MESSAGES = {
  "会员": {"zh-TW":"會員", "en":"Member", "ja":"会員", "ko":"회원", "es":"Miembro", "fr":"Membre", "de":"Mitglied", "pt":"Assinante", "ru":"Подписка", "ar":"مشترك", "th":"สมาชิก", "vi":"Thành viên"},
  "小小东账号": {"zh-TW":"小小東帳號", "en":"Xiaoxiaodong account", "ja":"Xiaoxiaodong アカウント", "ko":"Xiaoxiaodong 계정", "es":"Cuenta Xiaoxiaodong", "fr":"Compte Xiaoxiaodong", "de":"Xiaoxiaodong-Konto", "pt":"Conta Xiaoxiaodong", "ru":"Аккаунт Xiaoxiaodong", "ar":"حساب Xiaoxiaodong", "th":"บัญชี Xiaoxiaodong", "vi":"Tài khoản Xiaoxiaodong"},
  "登录": {"zh-TW":"登入", "en":"Sign in", "ja":"ログイン", "ko":"로그인", "es":"Iniciar sesión", "fr":"Se connecter", "de":"Anmelden", "pt":"Entrar", "ru":"Войти", "ar":"تسجيل الدخول", "th":"เข้าสู่ระบบ", "vi":"Đăng nhập"},
  "退出登录": {"zh-TW":"登出", "en":"Sign out", "ja":"ログアウト", "ko":"로그아웃", "es":"Cerrar sesión", "fr":"Se déconnecter", "de":"Abmelden", "pt":"Sair", "ru":"Выйти", "ar":"تسجيل الخروج", "th":"ออกจากระบบ", "vi":"Đăng xuất"},
  "连接 GitHub": {"zh-TW":"連接 GitHub", "en":"Connect GitHub", "ja":"GitHub に接続", "ko":"GitHub 연결", "es":"Conectar GitHub", "fr":"Connecter GitHub", "de":"GitHub verbinden", "pt":"Conectar GitHub", "ru":"Подключить GitHub", "ar":"ربط GitHub", "th":"เชื่อมต่อ GitHub", "vi":"Kết nối GitHub"},
  "发到 GitHub": {"zh-TW":"發到 GitHub", "en":"Send to GitHub", "ja":"GitHub に送る", "ko":"GitHub로 보내기", "es":"Enviar a GitHub", "fr":"Envoyer vers GitHub", "de":"An GitHub senden", "pt":"Enviar ao GitHub", "ru":"Отправить в GitHub", "ar":"إرسال إلى GitHub", "th":"ส่งไป GitHub", "vi":"Gửi lên GitHub"},
  "在 GitHub 打开 #{number}": {"zh-TW":"在 GitHub 開啟 #{number}", "en":"Open #{number} on GitHub", "ja":"GitHub で #{number} を開く", "ko":"GitHub에서 #{number} 열기", "es":"Abrir #{number} en GitHub", "fr":"Ouvrir #{number} sur GitHub", "de":"#{number} auf GitHub öffnen", "pt":"Abrir #{number} no GitHub", "ru":"Открыть #{number} на GitHub", "ar":"فتح #{number} في GitHub", "th":"เปิด #{number} บน GitHub", "vi":"Mở #{number} trên GitHub"},
  "在 GitHub 打开": {"zh-TW":"在 GitHub 打開", "en":"Open on GitHub", "ja":"GitHub で開く", "ko":"GitHub에서 열기", "es":"Abrir en GitHub", "fr":"Ouvrir sur GitHub", "de":"Auf GitHub öffnen", "pt":"Abrir no GitHub", "ru":"Открыть на GitHub", "ar":"افتح على GitHub", "th":"เปิดบน GitHub", "vi":"Mở trên GitHub"},
  "来自今日待办 · {date}": {"zh-TW":"來自今日待辦 · {date}", "en":"From 今日待办 · {date}", "ja":"今日待办より · {date}", "ko":"今日待办에서 · {date}", "es":"Desde 今日待办 · {date}", "fr":"Depuis 今日待办 · {date}", "de":"Aus 今日待办 · {date}", "pt":"Do 今日待办 · {date}", "ru":"Из 今日待办 · {date}", "ar":"من 今日待办 · {date}", "th":"จาก 今日待办 · {date}", "vi":"Từ 今日待办 · {date}"},
  "请先登录小小东账号": {"zh-TW":"請先登入小小東帳號", "en":"Please sign in with your Xiaoxiaodong account first", "ja":"先に Xiaoxiaodong アカウントでログインしてください", "ko":"먼저 Xiaoxiaodong 계정으로 로그인하세요", "es":"Inicia sesión primero con tu cuenta Xiaoxiaodong", "fr":"Connectez-vous d'abord avec votre compte Xiaoxiaodong", "de":"Bitte zuerst mit deinem Xiaoxiaodong-Konto anmelden", "pt":"Entre primeiro com sua conta Xiaoxiaodong", "ru":"Сначала войдите в аккаунт Xiaoxiaodong", "ar":"سجّل الدخول بحساب Xiaoxiaodong أولًا", "th":"โปรดเข้าสู่ระบบด้วยบัญชี Xiaoxiaodong ก่อน", "vi":"Vui lòng đăng nhập tài khoản Xiaoxiaodong trước"},
  "找项目": {"zh-TW":"找項目", "en":"Find a repo", "ja":"リポジトリを探す", "ko":"저장소 찾기", "es":"Buscar repositorio", "fr":"Trouver un dépôt", "de":"Repo suchen", "pt":"Buscar repositório", "ru":"Найти репозиторий", "ar":"ابحث عن مستودع", "th":"ค้นหาโปรเจกต์", "vi":"Tìm repo"},
  "发到 GitHub 是会员功能": {"zh-TW":"發到 GitHub 是會員功能", "en":"Sending to GitHub is a member feature", "ja":"GitHub への送信はメンバー機能です", "ko":"GitHub로 보내기는 멤버 기능입니다", "es":"Enviar a GitHub es una función para miembros", "fr":"L’envoi vers GitHub est réservé aux membres", "de":"Senden an GitHub ist eine Mitgliederfunktion", "pt":"Enviar ao GitHub é um recurso para membros", "ru":"Отправка в GitHub — функция для участников", "ar":"الإرسال إلى GitHub ميزة للأعضاء", "th":"การส่งไป GitHub เป็นฟีเจอร์สำหรับสมาชิก", "vi":"Gửi lên GitHub là tính năng hội viên"},
  "会员到 {date}": {"zh-TW":"會員到 {date}", "en":"Member until {date}", "ja":"{date} までメンバー", "ko":"{date}까지 멤버", "es":"Miembro hasta el {date}", "fr":"Membre jusqu’au {date}", "de":"Mitglied bis {date}", "pt":"Membro até {date}", "ru":"Участник до {date}", "ar":"عضو حتى {date}", "th":"สมาชิกถึง {date}", "vi":"Thành viên đến {date}"},
  "免费": {"zh-TW":"免費", "en":"Free", "ja":"無料", "ko":"무료", "es":"Gratis", "fr":"Gratuit", "de":"Kostenlos", "pt":"Grátis", "ru":"Бесплатно", "ar":"مجاني", "th":"ฟรี", "vi":"Miễn phí"},
  "登录后能把事情发到 GitHub，问题关了自动打勾": {"zh-TW":"登入後能把事情發到 GitHub，問題關了自動打勾", "en":"Sign in to send to-dos to GitHub and tick them off when the issue closes", "ja":"ログインすると ToDo を GitHub に送れて、Issue が閉じたら自動でチェックされます", "ko":"로그인하면 할 일을 GitHub로 보내고, 이슈가 닫히면 자동으로 체크돼요", "es":"Inicia sesión para enviar tareas a GitHub y marcarlas al cerrarse el issue", "fr":"Connectez-vous pour envoyer des tâches vers GitHub et les cocher à la fermeture de l’issue", "de":"Melde dich an, um Aufgaben an GitHub zu senden und sie beim Schließen des Issues abzuhaken", "pt":"Entre para enviar tarefas ao GitHub e marcá-las quando a issue fechar", "ru":"Войдите, чтобы отправлять задачи в GitHub и отмечать их, когда issue закроют", "ar":"سجّل الدخول لإرسال المهام إلى GitHub ووضع علامة عليها عند إغلاق المشكلة", "th":"เข้าสู่ระบบเพื่อส่งงานไป GitHub และติ๊กให้อัตโนมัติเมื่อ issue ปิด", "vi":"Đăng nhập để gửi việc lên GitHub và tự đánh dấu khi issue đóng"},
  "去浏览器里授权…": {"zh-TW":"去瀏覽器裡授權…", "en":"Authorize in your browser…", "ja":"ブラウザで許可してください…", "ko":"브라우저에서 승인하세요…", "es":"Autoriza en el navegador…", "fr":"Autorisez dans le navigateur…", "de":"Im Browser autorisieren…", "pt":"Autorize no navegador…", "ru":"Разрешите в браузере…", "ar":"امنح الإذن في المتصفح…", "th":"อนุญาตในเบราว์เซอร์…", "vi":"Cho phép trong trình duyệt…"},
  "{count} 个项目": {"zh-TW":"{count} 個項目", "en":"{count} repos", "ja":"{count} 件のリポジトリ", "ko":"저장소 {count}개", "es":"{count} repositorios", "fr":"{count} dépôts", "de":"{count} Repos", "pt":"{count} repositórios", "ru":"Репозиториев: {count}", "ar":"{count} مستودعات", "th":"{count} โปรเจกต์", "vi":"{count} repo"},
  "登录好了": {"zh-TW":"登入好了", "en":"Signed in", "ja":"ログインしました", "ko":"로그인했어요", "es":"Sesión iniciada", "fr":"Connecté", "de":"Angemeldet", "pt":"Conectado", "ru":"Вход выполнен", "ar":"تم تسجيل الدخول", "th":"เข้าสู่ระบบแล้ว", "vi":"Đã đăng nhập"},
  "登录没成功，再试一次": {"zh-TW":"登入沒成功，再試一次", "en":"Sign-in didn’t finish — try again", "ja":"ログインできませんでした。もう一度お試しください", "ko":"로그인하지 못했어요. 다시 시도하세요", "es":"No se pudo iniciar sesión; inténtalo de nuevo", "fr":"La connexion n’a pas abouti, réessayez", "de":"Anmeldung nicht abgeschlossen – bitte erneut versuchen", "pt":"Não foi possível entrar; tente de novo", "ru":"Не удалось войти, попробуйте ещё раз", "ar":"لم يكتمل تسجيل الدخول، حاول مرة أخرى", "th":"เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง", "vi":"Chưa đăng nhập được, hãy thử lại"},
  "正在发到 {repo}…": {"zh-TW":"正在發到 {repo}…", "en":"Sending to {repo}…", "ja":"{repo} に送信中…", "ko":"{repo}로 보내는 중…", "es":"Enviando a {repo}…", "fr":"Envoi vers {repo}…", "de":"Wird an {repo} gesendet…", "pt":"Enviando para {repo}…", "ru":"Отправка в {repo}…", "ar":"جارٍ الإرسال إلى {repo}…", "th":"กำลังส่งไป {repo}…", "vi":"Đang gửi đến {repo}…"},
  "发到了 {repo} #{number}": {"zh-TW":"發到了 {repo} #{number}", "en":"Sent to {repo} #{number}", "ja":"{repo} #{number} に送りました", "ko":"{repo} #{number}로 보냈어요", "es":"Enviado a {repo} #{number}", "fr":"Envoyé vers {repo} #{number}", "de":"An {repo} #{number} gesendet", "pt":"Enviado para {repo} #{number}", "ru":"Отправлено в {repo} #{number}", "ar":"أُرسلت إلى {repo} #{number}", "th":"ส่งไป {repo} #{number} แล้ว", "vi":"Đã gửi đến {repo} #{number}"},
  "先在设置里连接 GitHub": {"zh-TW":"先在設定裡連接 GitHub", "en":"Connect GitHub in settings first", "ja":"先に設定で GitHub に接続してください", "ko":"먼저 설정에서 GitHub를 연결하세요", "es":"Primero conecta GitHub en los ajustes", "fr":"Connectez d’abord GitHub dans les réglages", "de":"Verbinde zuerst GitHub in den Einstellungen", "pt":"Conecte o GitHub nas configurações primeiro", "ru":"Сначала подключите GitHub в настройках", "ar":"اربط GitHub من الإعدادات أولًا", "th":"เชื่อมต่อ GitHub ในการตั้งค่าก่อน", "vi":"Hãy kết nối GitHub trong cài đặt trước"},
  "连不上小小东会员站，稍后再试": {"zh-TW":"連不上小小東會員站，稍後再試", "en":"Can’t reach the Xiaoxiaodong member site — try again later", "ja":"小小東メンバーサイトに接続できません。後でもう一度お試しください", "ko":"Xiaoxiaodong 멤버 사이트에 연결할 수 없어요. 나중에 다시 시도하세요", "es":"No se puede conectar con el sitio de miembros de Xiaoxiaodong; inténtalo más tarde", "fr":"Impossible de joindre le site membre Xiaoxiaodong, réessayez plus tard", "de":"Xiaoxiaodong-Mitgliederseite nicht erreichbar – später erneut versuchen", "pt":"Não foi possível acessar o site de membros Xiaoxiaodong; tente mais tarde", "ru":"Сайт участников Xiaoxiaodong недоступен, попробуйте позже", "ar":"تعذّر الوصول إلى موقع أعضاء Xiaoxiaodong، حاول لاحقًا", "th":"เชื่อมต่อเว็บสมาชิก Xiaoxiaodong ไม่ได้ ลองใหม่ภายหลัง", "vi":"Không kết nối được trang thành viên Xiaoxiaodong, hãy thử lại sau"},
  "没发出去，稍后再试": {"zh-TW":"沒發出去，稍後再試", "en":"Didn’t send — try again later", "ja":"送信できませんでした。後でもう一度お試しください", "ko":"보내지 못했어요. 나중에 다시 시도하세요", "es":"No se envió; inténtalo más tarde", "fr":"Non envoyé, réessayez plus tard", "de":"Nicht gesendet – später erneut versuchen", "pt":"Não foi enviado; tente mais tarde", "ru":"Не отправлено, попробуйте позже", "ar":"لم يُرسل، حاول لاحقًا", "th":"ส่งไม่สำเร็จ ลองใหม่ภายหลัง", "vi":"Chưa gửi được, hãy thử lại sau"},
  "GitHub 上关了 {count} 件，已打勾": {"zh-TW":"GitHub 上關了 {count} 件，已打勾", "en":"{count} closed on GitHub — ticked off", "ja":"GitHub で {count} 件が閉じたのでチェックしました", "ko":"GitHub에서 {count}개가 닫혀 체크했어요", "es":"{count} cerradas en GitHub; marcadas", "fr":"{count} fermées sur GitHub, cochées", "de":"{count} auf GitHub geschlossen – abgehakt", "pt":"{count} fechadas no GitHub — marcadas", "ru":"На GitHub закрыто {count} — отмечено", "ar":"أُغلقت {count} على GitHub — وُضعت علامة عليها", "th":"ปิดบน GitHub {count} รายการ ติ๊กแล้ว", "vi":"Đã đóng {count} trên GitHub — đã đánh dấu"},
  '浏览器里的今日待办想连接「{vault}」': {
    'zh-TW': '瀏覽器裡的今日待辦想連接「{vault}」', en: 'Today’s To-dos in your browser wants to connect to “{vault}”',
    ja: 'ブラウザの「今日のToDo」が「{vault}」に接続しようとしています', ko: '브라우저의 Today’s To-dos가 “{vault}”에 연결하려고 해요',
    es: 'Today’s To-dos de tu navegador quiere conectarse a «{vault}»', fr: 'Today’s To-dos dans votre navigateur veut se connecter à « {vault} »',
    de: 'Today’s To-dos im Browser möchte sich mit „{vault}“ verbinden', pt: 'O Today’s To-dos do navegador quer se conectar a “{vault}”',
    ru: 'Today’s To-dos в браузере хочет подключиться к «{vault}»', ar: 'يريد Today’s To-dos في المتصفح الاتصال بـ «{vault}»',
    th: 'Today’s To-dos ในเบราว์เซอร์ต้องการเชื่อมต่อกับ “{vault}”', vi: 'Today’s To-dos trong trình duyệt muốn kết nối với “{vault}”'
  },
  '允许': {
    'zh-TW': '允許', en: 'Allow', ja: '許可', ko: '허용', es: 'Permitir', fr: 'Autoriser', de: 'Erlauben',
    pt: 'Permitir', ru: 'Разрешить', ar: 'السماح', th: 'อนุญาต', vi: 'Cho phép'
  },
  '不允许': {
    'zh-TW': '不允許', en: 'Don’t allow', ja: '許可しない', ko: '허용 안 함', es: 'No permitir', fr: 'Refuser', de: 'Nicht erlauben',
    pt: 'Não permitir', ru: 'Запретить', ar: 'عدم السماح', th: 'ไม่อนุญาต', vi: 'Không cho phép'
  },
  '连着的浏览器': {
    'zh-TW': '連著的瀏覽器', en: 'Connected browser', ja: '接続中のブラウザ', ko: '연결된 브라우저', es: 'Navegador conectado',
    fr: 'Navigateur connecté', de: 'Verbundener Browser', pt: 'Navegador conectado', ru: 'Подключённый браузер',
    ar: 'متصفح متصل', th: 'เบราว์เซอร์ที่เชื่อมต่อ', vi: 'Trình duyệt đã kết nối'
  },
  '断开': {
    'zh-TW': '斷開', en: 'Disconnect', ja: '切断', ko: '연결 해제', es: 'Desconectar', fr: 'Déconnecter', de: 'Trennen',
    pt: 'Desconectar', ru: 'Отключить', ar: 'قطع الاتصال', th: 'ตัดการเชื่อมต่อ', vi: 'Ngắt kết nối'
  },
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
