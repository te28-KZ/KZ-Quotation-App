/**
 * 【見積マスター用 Web API & 内部共通処理】
 */
const MASTER_CONFIG = {
  TEMPLATE_SPREADSHEET_ID: '1QiFOlOhv_1fvM-pX_EB4-GgbWjYUrmZ0XTvdXMTRX1U',
  LEDGER_SPREADSHEET_ID: '1lbzNr8CKPqY9AmL7m-zisgpvJ1vu8o8Vac3gvcREDGQ',
  LEDGER_SHEET_NAME: 'Quotation Summary Master',
  HOLIDAY_SHEET_NAME: 'Holidays',
  STAFF_SHEET_NAME: 'Staff',
  QUOTE_SHEET_NAME: 'Quotation',
  // ▼ 物件管理
  PROJECT_SHEET_NAME: 'Projects',
  CLIENT_SHEET_NAME: 'Clients',
  PROJECT_ROOT_FOLDER_ID: '12D6L4a2YJH7xcLQriGhqDfbdIExCz6nk',   // 物件管理 (Buddy)
  // 物件フォルダ内の標準フォルダ（日本語_ベトナム語）
  PROJECT_SUBFOLDERS: ['01資料_Tài liệu', '02見積り_Báo giá', '03図面_Bản vẽ', '04製作・発注_Sản xuất・Đặt hàng', '05納品・請求_Giao hàng・Hóa đơn'],
  QUOTE_SUBFOLDER: '02見積り_Báo giá',
  QUOTE_SUBFOLDER_OLD: '02見積り',   // 旧名（名前を変える前のフォルダも見積フォルダとして使う）
  PROJECT_STAGES: ['1. Inquiry', '2. Quoting', '3. Ordered', '4. In Production', '5. Delivered', '6. Completed', '9. Lost'],
  PROJECT_COL: { NO: 1, NAME: 2, CLIENT: 3, CATEGORY: 4, SALES: 5, STAGE: 6, AMOUNT: 7, DELIVERY: 8, FOLDER: 9, CREATED: 10, UPDATED: 11, MEMO: 12, LEGACY: 13, CONTACT: 14, LOST_REASON: 15 },  // N列: 客先担当者（見積には載せない） / O列: 不成立の理由
  // 段階「9. 不成立」の理由（O列にはこのコードで保存）。cancelled（案件の中止・延期）は受注率の計算から除く
  LOST_REASONS: ['price', 'competitor', 'spec', 'cancelled', 'no_response', 'other'],
  // ▼ 見積フォーマット（国内顧客用 / 親会社(日本)用）
  //   テンプレート内に両方のTHシートを持ち、作成時に不要な方を非表示にする
  TH_SHEET_VN: 'TH',       // 国内(ベトナム)顧客用
  TH_SHEET_JP: 'TH_JP',    // 親会社(日本)用
  JP_QUOTE_PREFIX: 'JP',   // 親会社向け管理№の接頭辞（例: JP2611000101-01）
  JP_CATEGORY_LABEL: '親会社(Japan HQ)',
  JP_CLIENT_NAME: 'KATZ JP',   // 親会社の客先名（区分「親会社」と連動）
  // ▼ 提出後フォロー通知：「2. Submitted」のまま最後の操作からこの日数が経った案件を通知
  FOLLOWUP_DAYS: 14,
  FOLLOWUP_MAIL_HOUR: 8,              // メール通知の送信時刻（ベトナム時間、8時台に送信）
  APP_URL: '',                        // メール内に載せるアプリのURL（空なら載せない）
  // ▼ ログイン（Googleアカウント）
  //   OAuthクライアントIDはスクリプトプロパティ GOOGLE_CLIENT_ID に設定
  SESSION_DAYS: 30,                   // ログイン状態の有効日数
  LANGS: ['ja', 'vi', 'en'],
  // Staffシートの列は1行目の見出しで判定（列の並び替え・追加・削除に強くするため）
  //   Email = ログイン用Googleアカウント（社員の識別キー） / Notify Email = 通知の送り先（空欄ならEmailへ送信）
  STAFF_HEADERS: { NAME: /name|氏名/i, ROLE: /role|役職/i, EMAIL: /^email$/i, LANG: /language|言語/i, NOTIFY_EMAIL: /notify/i },
  CELLS: {
    QUOTE_NO: 'J3',
    DATE: 'J4',
    SALES_PERSON: 'J7',
    TOTAL_AMOUNT: 'J34',
    TRADE_TYPE: 'A9',
    CLIENT: 'A11'
  },
  LEDGER_COL: {
    DATE: 1,           // A列
    QUOTE_NO: 2,       // B列
    AMOUNT: 3,         // C列 (金額)
    CLIENT: 4,         // D列 (客先名)
    CATEGORY: 5,       // E列
    TRADE_TYPE: 6,     // F列
    SALES_PERSON: 7,   // G列
    STATUS: 8,         // H列
    LINK: 9,           // I列
    DELIVERY_DATE: 10, // J列
    ORDER_DEADLINE: 11,// K列
    DETAILS: 12,       // L列 (見積内容)
    MEMO: 13,          // M列
    NEXT_FOLLOWUP: 14, // N列 (次回フォロー日：この日まで通知を保留)
    PROJECT_NO: 15     // O列 (物件No：旧形式の見積を物件に紐付ける。空なら見積番号から判定)
  }
};

/** Staffシートの見出し行から各列の位置（0始まり）を取得 */
function getStaffColumns(header) {
  const cols = {};
  Object.keys(MASTER_CONFIG.STAFF_HEADERS).forEach(key => {
    cols[key] = header.findIndex(h => MASTER_CONFIG.STAFF_HEADERS[key].test(String(h).trim()));
  });
  if (cols.NAME < 0 || cols.EMAIL < 0) throw new Error('Staffシートに「Name」「Email」の見出しが見つかりません。');
  return cols;
}

/**
 * 社員一覧（ログイン用メールアドレスをキーにしたオブジェクト）
 * メールアドレスはサーバー内部（ログイン照合・メール通知）でのみ使用し、アプリには返さない
 */
function getStaffMaster(ledgerSS) {
  const sheet = ledgerSS.getSheetByName(MASTER_CONFIG.STAFF_SHEET_NAME);
  if (!sheet) throw new Error('台帳に「' + MASTER_CONFIG.STAFF_SHEET_NAME + '」シートが見つかりません。');
  const data = sheet.getDataRange().getDisplayValues();
  const C = getStaffColumns(data[0]);
  const cell = (row, idx) => idx >= 0 ? String(row[idx] || '').trim() : '';
  const staffList = {};
  for (let i = 1; i < data.length; i++) {
    const email = cell(data[i], C.EMAIL).toLowerCase();
    const name = cell(data[i], C.NAME);
    if (!email || !name) continue;
    const lang = cell(data[i], C.LANG).toLowerCase();
    staffList[email] = {
      email: email,
      name: name,
      position: cell(data[i], C.ROLE),
      lang: MASTER_CONFIG.LANGS.includes(lang) ? lang : 'en',
      notifyEmail: cell(data[i], C.NOTIFY_EMAIL),
      row: i + 1,
      langCol: C.LANG >= 0 ? C.LANG + 1 : -1
    };
  }
  return staffList;
}

/** 'VN' or 'JP' に正規化（未指定は従来どおり国内顧客用） */
function normalizeQuoteFormat(fmt) {
  return String(fmt || '').trim().toUpperCase() === 'JP' ? 'JP' : 'VN';
}

/** フォルダ名（枝番を除いた部分）: 2611000101-01 → 2611000101 */
function getFolderBase(quoteNo) {
  return String(quoteNo).split('-')[0];
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;

    // ログイン前でも呼べるのは getConfig / login のみ
    if (action === 'getConfig') {
      return jsonOut({ status: 'success', clientId: getGoogleClientId() });
    }

    const ledgerSS = SpreadsheetApp.openById(MASTER_CONFIG.LEDGER_SPREADSHEET_ID);

    if (action === 'login') {
      return jsonOut({ status: 'success', ...executeLogin(postData.idToken, ledgerSS) });
    }

    // ここから先はログイン済み（セッショントークン）必須
    const session = getSession(postData.token);
    if (!session) throw apiError('AUTH', 'Session expired');
    const staffMap = getStaffMaster(ledgerSS);
    const staff = staffMap[session.email];
    if (!staff) throw apiError('AUTH', 'Staff not found');

    switch (action) {
      case 'whoami':
        return jsonOut({ status: 'success', user: publicUser(staff), staffNames: staffNames(staffMap) });
      case 'logout':
        deleteSession(postData.token);
        return jsonOut({ status: 'success' });
      case 'setLanguage':
        setStaffLanguage(staff, postData.lang, ledgerSS);
        return jsonOut({ status: 'success' });
      case 'createQuotation': // 旧アプリ互換：物件（名称未設定）＋見積を作成
        return jsonOut({ status: 'success', ...executeCreateProject(staff.name, postData, ledgerSS) });
      case 'getProjects':
        return jsonOut({ status: 'success', ...executeGetProjects(ledgerSS) });
      case 'createProject':
        return jsonOut({ status: 'success', ...executeCreateProject(staff.name, postData, ledgerSS) });
      case 'addBranch':
        assertCanEdit(staff, findProject(postData.projectNo, ledgerSS).salesPerson);
        return jsonOut({ status: 'success', ...executeAddBranch(staff.name, postData, ledgerSS) });
      case 'addQuoteToProject':
        assertCanEdit(staff, findProject(postData.projectNo, ledgerSS).salesPerson);
        return jsonOut({ status: 'success', ...executeAddQuoteToProject(staff.name, postData, ledgerSS) });
      case 'updateProjectInfo':
        assertCanEdit(staff, findProject(postData.projectNo, ledgerSS).salesPerson);
        return jsonOut({ status: 'success', ...executeUpdateProjectInfo(staff.name, postData, ledgerSS) });
      case 'addClient':
        return jsonOut({ status: 'success', clients: addClientIfMissing(postData.name, ledgerSS) });
      case 'getFollowUps':
        return jsonOut({ status: 'success', data: executeGetFollowUps(ledgerSS), days: MASTER_CONFIG.FOLLOWUP_DAYS });
      case 'searchProjects':
        return jsonOut({ status: 'success', data: executeSearch(postData.query, ledgerSS) });
      case 'updateProject':
        assertCanEdit(staff, quoteSalesPerson(postData.quoteNo, ledgerSS));
        return jsonOut({ status: 'success', data: executeUpdateProject(staff.name, postData, ledgerSS) });
      case 'createRevision':
        assertCanEdit(staff, quoteSalesPerson(postData.quoteNo, ledgerSS));
        return jsonOut({ status: 'success', ...executeCreateRevision(staff.name, postData.quoteNo, ledgerSS) });
    }
    throw new Error('無効なアクションです');
  } catch (error) {
    return jsonOut({ status: 'error', code: error.code || '', message: error.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/* =====================================================================
 * ログイン（Googleアカウント）とセッション管理
 * ===================================================================== */

function getGoogleClientId() {
  return PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
}

/** GoogleのIDトークンを検証 → Staffシートのメールと照合 → セッションを発行 */
function executeLogin(idToken, ledgerSS) {
  const email = verifyGoogleIdToken(idToken);
  const staffMap = getStaffMaster(ledgerSS);
  const staff = staffMap[email];
  if (!staff) throw apiError('NOT_STAFF', 'Not registered: ' + email);
  const token = createSession(staff.email);
  return { token: token, user: publicUser(staff), staffNames: staffNames(staffMap) };
}

function verifyGoogleIdToken(idToken) {
  const clientId = getGoogleClientId();
  if (!clientId) throw apiError('CONFIG', 'GOOGLE_CLIENT_ID is not set');
  if (!idToken) throw apiError('LOGIN_FAILED', 'No token');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw apiError('LOGIN_FAILED', 'Invalid Google token');
  const p = JSON.parse(res.getContentText());
  const issOk = p.iss === 'accounts.google.com' || p.iss === 'https://accounts.google.com';
  if (p.aud !== clientId || !issOk || String(p.email_verified) !== 'true' || Number(p.exp) * 1000 < Date.now()) {
    throw apiError('LOGIN_FAILED', 'Invalid Google token');
  }
  return String(p.email).toLowerCase();
}

function publicUser(staff) {
  return { name: staff.name, position: staff.position, lang: staff.lang, isAdmin: isOwnerStaff(staff) };
}

/* ---------- 編集権限：担当者本人とオーナー（このGASの所有者）だけが編集できる ---------- */

/** オーナー＝このWebアプリを実行しているGoogleアカウント（見積マスター・物件フォルダの所有者） */
function ownerEmail() {
  return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
}

function isOwnerStaff(staff) {
  return !!staff && staff.email === ownerEmail();
}

/** 担当者名（例: 'Nguyễn Tiến Thịnh' / 旧台帳の 'Thịnh'）が本人か、またはオーナーなら編集可 */
function assertCanEdit(staff, salesPerson) {
  if (isOwnerStaff(staff)) return;
  if (matchStaff(salesPerson, [staff])) return;
  throw apiError('FORBIDDEN', 'Only the person in charge can edit this (' + (salesPerson || '-') + ')');
}

/** 見積番号 → 見積一覧の担当者名 */
function quoteSalesPerson(quoteNo, ledgerSS) {
  const sh = ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME) || ledgerSS.getSheets()[0];
  const C = MASTER_CONFIG.LEDGER_COL;
  const data = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][C.QUOTE_NO - 1]).trim() === String(quoteNo || '').trim()) return String(data[i][C.SALES_PERSON - 1]);
  }
  throw new Error('Quote not found: ' + quoteNo);
}

/** 担当者名 → Staffシートのメール（見つからなければ ''） */
function staffEmailOf(salesPerson, ledgerSS) {
  const s = matchStaff(salesPerson, Object.values(getStaffMaster(ledgerSS)));
  return s ? s.email : '';
}

/** 物件フォルダに担当者を編集者として追加（オーナー本人は不要） */
function grantFolderEditor(folder, salesPerson, ledgerSS) {
  const email = staffEmailOf(salesPerson, ledgerSS);
  if (!email || email === ownerEmail()) return;
  try { folder.addEditor(email); } catch (e) { console.warn('addEditor failed: ' + email + ' ' + e.message); }
}

function staffNames(staffMap) {
  return Object.values(staffMap).map(s => s.name);
}

function createSession(email) {
  const props = PropertiesService.getScriptProperties();
  purgeExpiredSessions(props);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props.setProperty('SESSION_' + token, JSON.stringify({ email: email, exp: Date.now() + MASTER_CONFIG.SESSION_DAYS * 86400000 }));
  return token;
}

function getSession(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('SESSION_' + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  // 期限切れ、または旧形式（社員番号で記録）のセッションは無効
  if (s.exp < Date.now() || !s.email) { props.deleteProperty('SESSION_' + token); return null; }
  return s;
}

function deleteSession(token) {
  if (/^[a-f0-9]{64}$/.test(String(token || ''))) PropertiesService.getScriptProperties().deleteProperty('SESSION_' + token);
}

function purgeExpiredSessions(props) {
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (!k.startsWith('SESSION_')) return;
    try { if (JSON.parse(all[k]).exp < Date.now()) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/** 表示言語をStaffシートに保存（メール通知の言語にも使用） */
function setStaffLanguage(staff, lang, ledgerSS) {
  lang = String(lang || '').toLowerCase();
  if (!MASTER_CONFIG.LANGS.includes(lang)) throw new Error('Invalid language');
  if (staff.langCol < 0) return; // Language列が無ければ保存しない（ブラウザ側の設定のみ）
  ledgerSS.getSheetByName(MASTER_CONFIG.STAFF_SHEET_NAME).getRange(staff.row, staff.langCol).setValue(lang);
}

/* =====================================================================
 * 物件管理
 *   物件No（10桁）= 年月4桁 + その月の物件連番4桁 + 枝番2桁   例: 2611 0002 01
 *     枝番：01 = 最初の仕事。物件の完了後にメンテナンス等で費用が発生したら 02, 03 … と増やす
 *   見積番号 = 物件No + '-' + 連番2桁（改訂・別案）           例: 2611000201-01
 *   親会社向けは頭に JP を付ける（桁数には数えない）         例: JP2611000101-01
 * ===================================================================== */

function categoryFor(format, isDomestic) {
  if (format === 'JP') return MASTER_CONFIG.JP_CATEGORY_LABEL;
  const dom = (isDomestic === true || isDomestic === 'true' || isDomestic === '国内(Domestic)');
  return dom ? '国内(Domestic)' : '輸出(Overseas)';
}

/** 見積番号 → 物件No（新形式の番号のみ。旧形式 2025050301 などは '' ） */
function projectNoOf(quoteNo) {
  const m = String(quoteNo || '').trim().match(/^((?:JP)?\d{10})-\d{2}$/);
  return m ? m[1] : '';
}

/** 物件No → 枝番を除いた元の番号（例: 2611000202 → 26110002） */
function projectBaseOf(projectNo) {
  return String(projectNo || '').slice(0, -2);
}

/** 区分・客先の連動：親会社なら客先は KATZ JP、客先が KATZ JP なら親会社 */
function isJpClient(client, ledgerSS) {
  return canonicalName(client, ledgerSS) === MASTER_CONFIG.JP_CLIENT_NAME;
}

/** 客先一覧の表記にそろえた名前（一覧に追加はしない） */
function canonicalName(name, ledgerSS) {
  name = String(name || '').trim();
  return findClientByName(name, getClientEntries(ledgerSS)) || name;
}

/** 見積一覧の1行から物件Noを取得（O列を優先。空なら見積番号から判定） */
function projectNoOfRow(row) {
  const explicit = String(row[MASTER_CONFIG.LEDGER_COL.PROJECT_NO - 1] || '').trim();
  return explicit || projectNoOf(row[MASTER_CONFIG.LEDGER_COL.QUOTE_NO - 1]);
}

/** 次の物件Noを採番（見積一覧と物件一覧の両方を見て重複しないようにする） */
function allocateProjectNo(format, ledgerSS, yymmOverride) {
  const yymm = yymmOverride || Utilities.formatDate(new Date(), 'Asia/Saigon', 'yyMM');
  const seqKey = (format === 'JP' ? MASTER_CONFIG.JP_QUOTE_PREFIX : '') + yymm;
  const used = [];
  const ledger = ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME);
  if (ledger.getLastRow() >= 2) {
    ledger.getRange(2, MASTER_CONFIG.LEDGER_COL.QUOTE_NO, ledger.getLastRow() - 1, 1).getDisplayValues().forEach(r => used.push(String(r[0]).trim()));
  }
  const proj = getProjectSheet(ledgerSS);
  if (proj.getLastRow() >= 2) {
    proj.getRange(2, MASTER_CONFIG.PROJECT_COL.NO, proj.getLastRow() - 1, 1).getDisplayValues().forEach(r => used.push(String(r[0]).trim()));
  }
  let maxSeq = 0;
  used.forEach(v => {
    if (v.startsWith(seqKey) && v.length >= seqKey.length + 4) {
      const n = parseInt(v.substring(seqKey.length, seqKey.length + 4), 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
  });
  return seqKey + ('0000' + (maxSeq + 1)).slice(-4) + '01';
}

function getProjectSheet(ledgerSS) {
  const sh = ledgerSS.getSheetByName(MASTER_CONFIG.PROJECT_SHEET_NAME);
  if (!sh) throw new Error('台帳に「' + MASTER_CONFIG.PROJECT_SHEET_NAME + '」シートがありません。');
  return sh;
}

function stageNum(stage) {
  return parseInt(String(stage || '').trim(), 10) || 0;
}

function nowStamp() {
  return Utilities.formatDate(new Date(), 'Asia/Saigon', 'yyyy-MM-dd HH:mm');
}

function folderIdFromUrl(url) {
  const m = String(url || '').match(/folders\/([a-zA-Z0-9_-]+)/) || String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

/** 物件フォルダ名：「物件No 客先名(略称) 物件名」（客先が空・物件名が未設定なら省く） */
function projectFolderName(projectNo, client, name, ledgerSS) {
  let short = clientShortName(client, ledgerSS);
  let nm = String(name || '').trim();
  if (nm === '（未設定）') nm = '';
  // 物件名が客先名で始まる場合（例: 客先 FRONTIER / 物件名 FRONTIER CONSULTING VIETNAM）は客先名を重ねない
  if (nm && short && (nm === String(client).trim() || nm.toLowerCase().startsWith(short.toLowerCase()))) short = '';
  return [projectNo, short, nm].filter(Boolean).join(' ');
}

/** 物件フォルダ（＋サブフォルダ）を作成 */
function createProjectFolder(projectNo, client, name, ledgerSS, parentFolderId) {
  const root = DriveApp.getFolderById(parentFolderId || MASTER_CONFIG.PROJECT_ROOT_FOLDER_ID);
  const folder = root.createFolder(projectFolderName(projectNo, client, name, ledgerSS));
  MASTER_CONFIG.PROJECT_SUBFOLDERS.forEach(n => folder.createFolder(n));
  return folder;
}

/** 物件フォルダ内の「02見積り」（無ければ作成） */
function getQuoteFolder(projectFolderUrl) {
  const folder = DriveApp.getFolderById(folderIdFromUrl(projectFolderUrl));
  for (const n of [MASTER_CONFIG.QUOTE_SUBFOLDER, MASTER_CONFIG.QUOTE_SUBFOLDER_OLD]) {
    const it = folder.getFoldersByName(n);
    if (it.hasNext()) return it.next();
  }
  return folder.createFolder(MASTER_CONFIG.QUOTE_SUBFOLDER);
}

/** 見積の回ごとのフォルダ名（見積番号の '-' の後ろの番号と同じ）例: 01 1回目_Lần 1 */
function roundFolderName(n) {
  return `${('00' + n).slice(-2)} ${n}回目_Lần ${n}`;
}

function isRoundFolderName(name) {
  return /^\d{2} \d+回目_Lần \d+$/.test(String(name || ''));
}

/** 見積フォルダの中の「n回目」フォルダ（無ければ作成） */
function getRoundFolder(quoteFolder, n) {
  const name = roundFolderName(n);
  const it = quoteFolder.getFoldersByName(name);
  return it.hasNext() ? it.next() : quoteFolder.createFolder(name);
}

/** 見積番号の '-' の後ろの番号（例: 2611000201-03 → 3） */
function quoteSeqOf(quoteNo) {
  const m = String(quoteNo || '').match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : 1;
}

/** 物件一覧の1行 → オブジェクト（表示値） */
function rowToProjectInfo(row, rowIndex) {
  const C = MASTER_CONFIG.PROJECT_COL;
  const v = c => String(row[c - 1] || '').trim();
  return {
    projectNo: v(C.NO), name: v(C.NAME), client: v(C.CLIENT), category: v(C.CATEGORY),
    salesPerson: v(C.SALES), stage: v(C.STAGE) || '1. Inquiry', orderAmount: v(C.AMOUNT),
    deliveryDate: normDate(v(C.DELIVERY)), folderUrl: v(C.FOLDER),
    created: normDate(v(C.CREATED)), updated: normDate(v(C.UPDATED)), memo: v(C.MEMO), contact: v(C.CONTACT), lostReason: v(C.LOST_REASON), row: rowIndex
  };
}

function findProject(projectNo, ledgerSS) {
  const sh = getProjectSheet(ledgerSS);
  const data = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][MASTER_CONFIG.PROJECT_COL.NO - 1]).trim() === String(projectNo).trim()) return rowToProjectInfo(data[i], i + 1);
  }
  throw new Error('Project not found: ' + projectNo);
}

function writeProjectCell(ledgerSS, row, col, value, asText) {
  const r = getProjectSheet(ledgerSS).getRange(row, col);
  if (asText) r.setNumberFormat('@');
  r.setValue(value);
}

/** 物件の作成（物件フォルダと最初の見積を同時に作成） */
function executeCreateProject(salesPerson, p, ledgerSS) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let format = normalizeQuoteFormat(p.quoteFormat);
    if (isJpClient(p.client, ledgerSS)) format = 'JP';            // 客先が KATZ JP → 親会社
    const name = String(p.name || '').trim() || '（未設定）';
    const client = format === 'JP' ? MASTER_CONFIG.JP_CLIENT_NAME : canonicalClient(p.client, ledgerSS); // 親会社 → 客先は KATZ JP
    const contact = String(p.contact || '').trim();
    const category = categoryFor(format, p.isDomestic);
    const projectNo = allocateProjectNo(format, ledgerSS);
    const folder = createProjectFolder(projectNo, client, name, ledgerSS);
    grantFolderEditor(folder, salesPerson, ledgerSS);   // 担当者だけが編集できる
    const today = todayVN();
    const C = MASTER_CONFIG.PROJECT_COL;

    const row = [];
    row[C.NO - 1] = projectNo;
    row[C.NAME - 1] = name;
    row[C.CLIENT - 1] = client;
    row[C.CATEGORY - 1] = category;
    row[C.SALES - 1] = salesPerson;
    row[C.STAGE - 1] = '2. Quoting';
    row[C.AMOUNT - 1] = '';
    row[C.DELIVERY - 1] = p.deliveryDate || '';
    row[C.FOLDER - 1] = folder.getUrl();
    row[C.CREATED - 1] = today;
    row[C.UPDATED - 1] = today;
    row[C.MEMO - 1] = `[${nowStamp()}] Created by ${salesPerson}`;
    row[C.LEGACY - 1] = '';
    row[C.CONTACT - 1] = contact;
    appendProjectRow(ledgerSS, row);
    addClientContact(client, contact, ledgerSS);

    const project = { projectNo, name, client, category, folderUrl: folder.getUrl() };
    const quote = createQuoteInProject(project, salesPerson, p.tradeType, p.deliveryDate, ledgerSS);
    return { projectNo, folderUrl: folder.getUrl(), quoteNo: quote.quoteNo, fileUrl: quote.fileUrl, orderDeadline: quote.orderDeadline };
  } finally {
    lock.releaseLock();
  }
}

/** 既存の物件に見積を追加（物件内の見積番号を+1） */
function executeAddQuoteToProject(salesPerson, p, ledgerSS) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const project = findProject(p.projectNo, ledgerSS);
    const quote = createQuoteInProject(project, project.salesPerson || salesPerson, p.tradeType, p.deliveryDate || project.deliveryDate, ledgerSS);
    if (stageNum(project.stage) <= 1) writeProjectCell(ledgerSS, project.row, MASTER_CONFIG.PROJECT_COL.STAGE, '2. Quoting');
    touchProject(ledgerSS, project, `Quote ${quote.quoteNo} added by ${salesPerson}`);
    return quote;
  } finally {
    lock.releaseLock();
  }
}

/** 物件一覧に1行追加（物件Noは文字列として保存） */
function appendProjectRow(ledgerSS, row) {
  const sh = getProjectSheet(ledgerSS);
  sh.appendRow(row);
  sh.getRange(sh.getLastRow(), MASTER_CONFIG.PROJECT_COL.NO).setNumberFormat('@').setValue(row[MASTER_CONFIG.PROJECT_COL.NO - 1]);
}

/**
 * 枝番を追加（物件の完了後のメンテナンス・追加工事など）
 *   物件No = 元の番号 + 次の枝番（例: 2611000201 → 2611000202）
 *   フォルダは枝番01の物件フォルダの中に作る。最初の見積も同時に作成。
 */
function executeAddBranch(salesPerson, p, ledgerSS) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const src = findProject(p.projectNo, ledgerSS);
    const base = projectBaseOf(src.projectNo);
    const C = MASTER_CONFIG.PROJECT_COL;
    const sh = getProjectSheet(ledgerSS);
    let maxBranch = 0, rootFolderUrl = '';
    sh.getRange(2, C.NO, sh.getLastRow() - 1, C.FOLDER).getDisplayValues().forEach(r => {
      const no = String(r[0]).trim();
      if (no.length === base.length + 2 && no.startsWith(base)) {
        const n = parseInt(no.slice(-2), 10);
        if (!isNaN(n) && n > maxBranch) maxBranch = n;
        if (n === 1) rootFolderUrl = String(r[C.FOLDER - 1]).trim();
      }
    });
    if (maxBranch >= 99) throw new Error('枝番が上限(99)に達しています');
    const projectNo = base + ('00' + (maxBranch + 1)).slice(-2);
    const name = String(p.name || '').trim() || src.name;
    const contact = p.contact === undefined ? src.contact : String(p.contact || '').trim();
    const parentId = folderIdFromUrl(rootFolderUrl || src.folderUrl);
    let folder;
    try { folder = createProjectFolder(projectNo, src.client, name, ledgerSS, parentId || null); }
    catch (e) { folder = createProjectFolder(projectNo, src.client, name, ledgerSS); } // 元のフォルダが無い（フォルダ無しの物件）場合は直下に作る
    const today = todayVN();

    const row = [];
    row[C.NO - 1] = projectNo;
    row[C.NAME - 1] = name;
    row[C.CLIENT - 1] = src.client;
    row[C.CATEGORY - 1] = src.category;
    row[C.SALES - 1] = src.salesPerson;   // 枝番の担当は元の物件の担当を引き継ぐ
    row[C.STAGE - 1] = '2. Quoting';
    row[C.AMOUNT - 1] = '';
    row[C.DELIVERY - 1] = p.deliveryDate || '';
    row[C.FOLDER - 1] = folder.getUrl();
    row[C.CREATED - 1] = today;
    row[C.UPDATED - 1] = today;
    row[C.MEMO - 1] = `[${nowStamp()}] Branch of ${src.projectNo} created by ${salesPerson}`;
    row[C.LEGACY - 1] = '';
    row[C.CONTACT - 1] = contact;
    appendProjectRow(ledgerSS, row);
    addClientContact(src.client, contact, ledgerSS);

    grantFolderEditor(folder, src.salesPerson, ledgerSS);
    const project = { projectNo, name, client: src.client, category: src.category, folderUrl: folder.getUrl() };
    const quote = createQuoteInProject(project, src.salesPerson, p.tradeType, p.deliveryDate, ledgerSS);
    return { projectNo, folderUrl: folder.getUrl(), quoteNo: quote.quoteNo, fileUrl: quote.fileUrl, orderDeadline: quote.orderDeadline };
  } finally {
    lock.releaseLock();
  }
}

function touchProject(ledgerSS, project, logLine) {
  const C = MASTER_CONFIG.PROJECT_COL;
  writeProjectCell(ledgerSS, project.row, C.UPDATED, todayVN());
  if (logLine) {
    const memo = `[${nowStamp()}] ${logLine}` + (project.memo ? '\n\n' + project.memo : '');
    writeProjectCell(ledgerSS, project.row, C.MEMO, memo);
    project.memo = memo;
  }
}

/** 物件内に見積ファイルを作成し、見積一覧に登録（呼び出し側でロック済みであること） */
function createQuoteInProject(project, salesPerson, tradeType, deliveryDateStr, ledgerSS) {
  const format = String(project.projectNo).startsWith(MASTER_CONFIG.JP_QUOTE_PREFIX) ? 'JP' : 'VN';
  const ledgerSheet = ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME) || ledgerSS.getSheets()[0];

  // 物件内の見積の連番（'-' の後ろ2桁）の最大値 +1
  let maxSeq = 0;
  const prefix = project.projectNo + '-';
  if (ledgerSheet.getLastRow() >= 2) {
    ledgerSheet.getRange(2, MASTER_CONFIG.LEDGER_COL.QUOTE_NO, ledgerSheet.getLastRow() - 1, 1).getDisplayValues().forEach(r => {
      const q = String(r[0]).trim();
      if (q.startsWith(prefix)) {
        const n = parseInt(q.slice(prefix.length), 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
  }
  const newQuoteNo = prefix + ('00' + (maxSeq + 1)).slice(-2);

  const today = new Date();
  const dateString = Utilities.formatDate(today, 'Asia/Saigon', 'yyyy-MM-dd');
  const targetFolder = getRoundFolder(getQuoteFolder(project.folderUrl), maxSeq + 1); // 回ごとのフォルダ
  const masterFile = DriveApp.getFileById(MASTER_CONFIG.TEMPLATE_SPREADSHEET_ID);
  const newFile = masterFile.makeCopy(`【見積】${newQuoteNo}_${project.client || '未設定'}`, targetFolder);
  const newSS = SpreadsheetApp.openById(newFile.getId());
  const newQuoteSheet = newSS.getSheetByName(MASTER_CONFIG.QUOTE_SHEET_NAME);

  newQuoteSheet.getRange(MASTER_CONFIG.CELLS.QUOTE_NO).setValue(newQuoteNo);
  newQuoteSheet.getRange(MASTER_CONFIG.CELLS.DATE).setValue(dateString);
  newQuoteSheet.getRange(MASTER_CONFIG.CELLS.SALES_PERSON).setValue(salesPerson);
  const tradeTypeText = tradeType === 'Via Forwarder' ? '通関業者経由 / Via Forwarder' : '直接取引 / Direct Trade';
  newQuoteSheet.getRange(MASTER_CONFIG.CELLS.TRADE_TYPE).setValue(tradeTypeText);

  // 見積フォーマットに応じてTHシートを切替（使わない方は非表示）
  try {
    applyThFormat(newSS, format);
  } catch (err) {
    newFile.setTrashed(true); // 中途半端なファイルを残さない
    throw err;
  }

  if (tradeType === 'Via Forwarder') {
    const tcSheet = newSS.getSheetByName('Terms_Conditions');
    if (tcSheet) {
      tcSheet.appendRow(['']);
      tcSheet.appendRow(['【通関に関する特記事項 / Customs Clearance Notes】']);
      tcSheet.appendRow(['・間に通関手続き業者を挟む場合、通関手数料および関連費用は別途協議またはお客様負担となります。']);
    }
  }

  // 国内案件のみ手配期限を自動計算
  let orderDeadlineStr = '';
  if (String(project.category).includes('国内') && deliveryDateStr) {
    orderDeadlineStr = Utilities.formatDate(calculateWorkingDaysBack(deliveryDateStr, 20, ledgerSS), 'Asia/Saigon', 'yyyy-MM-dd');
  }

  const L = MASTER_CONFIG.LEDGER_COL;
  const newRow = [];
  newRow[L.DATE - 1] = dateString;
  newRow[L.QUOTE_NO - 1] = newQuoteNo;
  newRow[L.AMOUNT - 1] = 0;
  newRow[L.CLIENT - 1] = project.client || '（未入力）';
  newRow[L.CATEGORY - 1] = project.category;
  newRow[L.TRADE_TYPE - 1] = tradeType === 'Via Forwarder' ? '通関業者経由(Via Forwarder)' : '直接取引(Direct)';
  newRow[L.SALES_PERSON - 1] = salesPerson;
  newRow[L.STATUS - 1] = '1. Draft';
  newRow[L.LINK - 1] = newFile.getUrl();
  newRow[L.DELIVERY_DATE - 1] = deliveryDateStr || '';
  newRow[L.ORDER_DEADLINE - 1] = orderDeadlineStr;
  newRow[L.DETAILS - 1] = project.name && project.name !== '（未設定）' ? project.name : '';
  newRow[L.MEMO - 1] = `[${nowStamp()}] Created by ${salesPerson}`;
  newRow[L.NEXT_FOLLOWUP - 1] = '';
  newRow[L.PROJECT_NO - 1] = project.projectNo;
  ledgerSheet.appendRow(newRow);

  return { quoteNo: newQuoteNo, fileUrl: newFile.getUrl(), orderDeadline: orderDeadlineStr, quoteFormat: format, projectNo: project.projectNo };
}

/** 見積が「4. Accepted」になったら物件を「3. Ordered」にし、受注金額を記録 */
function onQuoteAccepted(quoteNo, amountDisplay, staffName, ledgerSS, projectNoHint) {
  const projectNo = projectNoHint || projectNoOf(quoteNo);
  if (!projectNo) return;
  let project;
  try { project = findProject(projectNo, ledgerSS); } catch (e) { return; } // 物件未登録の見積は対象外
  const C = MASTER_CONFIG.PROJECT_COL;
  if (stageNum(project.stage) < 3) writeProjectCell(ledgerSS, project.row, C.STAGE, '3. Ordered');
  writeProjectCell(ledgerSS, project.row, C.AMOUNT, amountDisplay, true);
  touchProject(ledgerSS, project, `Ordered: ${quoteNo} (${amountDisplay}) by ${staffName}`);
}

/** 物件の一覧（見積を紐付けて返す）と客先一覧 */
function executeGetProjects(ledgerSS) {
  const projData = getProjectSheet(ledgerSS).getDataRange().getDisplayValues();
  const projects = [];
  const byNo = {};
  for (let i = 1; i < projData.length; i++) {
    const p = rowToProjectInfo(projData[i], i + 1);
    if (!p.projectNo) continue;
    delete p.row;
    p.quotes = [];
    projects.push(p);
    byNo[p.projectNo] = p;
  }
  const ledger = (ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME) || ledgerSS.getSheets()[0]).getDataRange().getDisplayValues();
  for (let i = 1; i < ledger.length; i++) {
    const q = rowToProject(ledger[i]);
    const p = byNo[q.projectNo];
    if (p) p.quotes.push(q); // 編集画面でそのまま開けるよう全項目を返す
  }
  return { projects: projects.reverse(), clients: getClients(ledgerSS), clientContacts: getClientContacts(ledgerSS),
           lostReasons: MASTER_CONFIG.LOST_REASONS, jpClient: MASTER_CONFIG.JP_CLIENT_NAME, jpAliases: jpClientAliases(ledgerSS), stages: MASTER_CONFIG.PROJECT_STAGES };
}

/** KATZ JP の別名（画面側で区分を自動で切り替えるため） */
function jpClientAliases(ledgerSS) {
  const e = getClientEntries(ledgerSS).find(c => c.name === MASTER_CONFIG.JP_CLIENT_NAME);
  return e ? e.aliases : [];
}

/** 物件情報の更新（名称・客先・段階・納期・メモ） */
function executeUpdateProjectInfo(staffName, p, ledgerSS) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const project = findProject(p.projectNo, ledgerSS);
    const C = MASTER_CONFIG.PROJECT_COL;
    const changes = [];
    const name = String(p.name ?? project.name).trim() || project.name;
    const isJpProject = String(project.projectNo).startsWith(MASTER_CONFIG.JP_QUOTE_PREFIX);
    let client = p.client === undefined ? project.client : String(p.client || '').trim();
    if (isJpProject) client = MASTER_CONFIG.JP_CLIENT_NAME;                       // 親会社の物件は客先固定
    else if (client && isJpClient(client, ledgerSS)) throw new Error(MASTER_CONFIG.JP_CLIENT_NAME + ' は親会社区分の物件でのみ選べます');
    else if (p.client !== undefined) client = canonicalClient(client, ledgerSS);
    const contact = p.contact === undefined ? project.contact : String(p.contact || '').trim();
    const stage = MASTER_CONFIG.PROJECT_STAGES.includes(p.stage) ? p.stage : project.stage;
    const delivery = p.deliveryDate === undefined ? project.deliveryDate : normDate(p.deliveryDate);
    let lostReason = p.lostReason === undefined ? project.lostReason : String(p.lostReason || '').trim();
    if (stage === '9. Lost') {
      if (!MASTER_CONFIG.LOST_REASONS.includes(lostReason)) throw apiError('REASON', 'Please choose the reason (不成立の理由を選んでください)');
    } else lostReason = '';
    let amount = p.orderAmount === undefined ? project.orderAmount : String(p.orderAmount || '').trim();
    if (amount === '-') amount = '';

    if (name !== project.name) {
      writeProjectCell(ledgerSS, project.row, C.NAME, name);
      changes.push(`Name: ${project.name} -> ${name}`);
    }
    if (client !== project.client) {
      writeProjectCell(ledgerSS, project.row, C.CLIENT, client);
      changes.push(`Client: ${project.client || '-'} -> ${client || '-'}`);
    }
    if (name !== project.name || client !== project.client) {   // フォルダ名も付け直す
      try { DriveApp.getFolderById(folderIdFromUrl(project.folderUrl)).setName(projectFolderName(project.projectNo, client, name, ledgerSS)); } catch (e) {}
    }
    if (contact !== project.contact) {
      writeProjectCell(ledgerSS, project.row, C.CONTACT, contact);
      addClientContact(client, contact, ledgerSS);
      changes.push(`Contact: ${project.contact || '-'} -> ${contact || '-'}`);
    }
    if (stage !== project.stage) {
      writeProjectCell(ledgerSS, project.row, C.STAGE, stage);
      changes.push(`Stage: ${project.stage} -> ${stage}`);
    }
    if (lostReason !== String(project.lostReason || '').trim()) {
      writeProjectCell(ledgerSS, project.row, C.LOST_REASON, lostReason, true);
      changes.push(`Lost reason: ${project.lostReason || '-'} -> ${lostReason || '-'}`);
    }
    if (amount !== String(project.orderAmount || '').trim()) {   // 受注金額（手入力。通貨記号付きの文字列で保存）
      writeProjectCell(ledgerSS, project.row, C.AMOUNT, amount, true);
      changes.push(`Order amount: ${project.orderAmount || '-'} -> ${amount || '-'}`);
    }
    if (delivery !== project.deliveryDate) {
      writeProjectCell(ledgerSS, project.row, C.DELIVERY, delivery);
      changes.push(`Delivery: ${project.deliveryDate || '-'} -> ${delivery || '-'}`);
    }
    const memo = String(p.memo || '').trim();
    if (memo) changes.push(`Memo: ${memo}`);
    if (changes.length) touchProject(ledgerSS, project, `Updated by ${staffName}\n- ` + changes.join('\n- '));
    return { projectNo: project.projectNo };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 客先一覧（Clients シート） ---------- */

function clientKey(name) {
  return String(name || '').toLowerCase().replace(/[\s.,，。・\-_()（）]/g, '');
}

function getClients(ledgerSS) {
  return getClientEntries(ledgerSS).map(c => c.name);
}

/** 客先一覧（A列：正式名、C列：別名、D列：担当者［カンマ区切り］、E列：略称［フォルダ名に使う］） */
function getClientEntries(ledgerSS) {
  const sh = ledgerSS.getSheetByName(MASTER_CONFIG.CLIENT_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return [];
  const split = v => String(v || '').split(/[,、，]/).map(a => a.trim()).filter(Boolean);
  const cols = Math.max(4, Math.min(5, sh.getLastColumn()));
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols).getDisplayValues()
    .map((r, i) => ({ name: String(r[0]).trim(), aliases: split(r[2]), contacts: split(r[3]), short: String(r[4] || '').trim(), row: i + 2 }))
    .filter(c => c.name);
}

/** 客先の略称（E列）。空なら正式名 */
function clientShortName(client, ledgerSS) {
  client = String(client || '').trim();
  if (!client) return '';
  const e = getClientEntries(ledgerSS).find(c => c.name === client);
  return (e && e.short) || client;
}

/** 客先ごとの担当者一覧 { 客先名: [担当者…] } */
function getClientContacts(ledgerSS) {
  const map = {};
  getClientEntries(ledgerSS).forEach(c => { if (c.contacts.length) map[c.name] = c.contacts; });
  return map;
}

/** 客先の担当者一覧（D列）に名前を追加（既にあれば何もしない） */
function addClientContact(client, contact, ledgerSS) {
  contact = String(contact || '').trim();
  if (!client || !contact) return;
  const entry = getClientEntries(ledgerSS).find(c => c.name === client);
  if (!entry) return;
  if (entry.contacts.some(x => clientKey(x) === clientKey(contact))) return;
  ledgerSS.getSheetByName(MASTER_CONFIG.CLIENT_SHEET_NAME).getRange(entry.row, 4).setValue(entry.contacts.concat(contact).join(', '));
}

/** 正式名・別名のどちらかが一致する客先の正式名（無ければ ''） */
function findClientByName(name, entries) {
  const k = clientKey(name);
  if (!k) return '';
  const hit = entries.find(c => clientKey(c.name) === k || c.aliases.some(a => clientKey(a) === k));
  return hit ? hit.name : '';
}

/** 客先名を客先一覧の表記にそろえる（一覧に無ければ追加） */
function canonicalClient(name, ledgerSS) {
  name = String(name || '').trim();
  if (!name) return '';
  const hit = findClientByName(name, getClientEntries(ledgerSS));
  if (hit) return hit;
  addClientIfMissing(name, ledgerSS);
  return name;
}

/** 客先を追加（表記ゆれ＝大文字小文字・空白・句読点の違いは同じ客先とみなす）。客先一覧を返す */
function addClientIfMissing(name, ledgerSS) {
  name = String(name || '').trim();
  const entries = getClientEntries(ledgerSS);
  const clients = entries.map(c => c.name);
  if (!name || findClientByName(name, entries)) return clients;
  ledgerSS.getSheetByName(MASTER_CONFIG.CLIENT_SHEET_NAME).appendRow([name, '']);
  return clients.concat(name);
}

function executeUpdateProject(staffName, postData, ledgerSS) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME) || ledgerSS.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    const quoteNoToUpdate = String(postData.quoteNo || '').trim();
    let targetRow = -1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][MASTER_CONFIG.LEDGER_COL.QUOTE_NO - 1]).trim() === quoteNoToUpdate) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) throw new Error('該当する物件番号が見つかりません: ' + quoteNoToUpdate);

    const fileUrl = String(data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.LINK - 1] || '');
    let clientName = String(data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.CLIENT - 1]);
    let totalAmount = data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.AMOUNT - 1];

    if (fileUrl.includes('spreadsheets/d/')) {
      try {
        const fileId = fileUrl.split('/d/')[1].split('/')[0];
        const targetSS = SpreadsheetApp.openById(fileId);
        const qSheet = targetSS.getSheetByName(MASTER_CONFIG.QUOTE_SHEET_NAME);
        if (qSheet) {
          const val = String(qSheet.getRange(MASTER_CONFIG.CELLS.CLIENT).getValue() || '').trim();
          if (val) clientName = val.replace(/^(To|MESSRS|Messrs)[\s:：]*/i, '').trim();
          const amtVal = qSheet.getRange(MASTER_CONFIG.CELLS.TOTAL_AMOUNT).getValue();
          if (amtVal !== '') totalAmount = amtVal;
          if (clientName && clientName !== '（未入力）') {
            DriveApp.getFileById(fileId).setName(`【見積】${quoteNoToUpdate}_${clientName}`);
          }
        }
      } catch (e) {}
    }

    const nowStr = Utilities.formatDate(new Date(), 'Asia/Saigon', 'yyyy-MM-dd HH:mm');
    const oldStatus = String(data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.STATUS - 1]);
    const newStatus = postData.status;
    const newDeliveryDate = postData.deliveryDate || '';
    const newTradeType = postData.tradeType;
    const newDetails = postData.details || '';
    const userMemo = postData.memo || '';
    const oldNextFollowUp = normDate(data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.NEXT_FOLLOWUP - 1]);
    // アプリから送られてこない場合（旧バージョン等）は現状維持
    const newNextFollowUp = postData.nextFollowUp === undefined ? oldNextFollowUp : normDate(postData.nextFollowUp);
    let newOrderDeadline = String(data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.ORDER_DEADLINE - 1]);
    const category = String(data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.CATEGORY - 1]);

    if (newDeliveryDate && category.includes('国内')) {
      const targetDate = calculateWorkingDaysBack(newDeliveryDate, 20, ledgerSS);
      newOrderDeadline = Utilities.formatDate(targetDate, 'Asia/Saigon', 'yyyy-MM-dd');
    } else if (!newDeliveryDate) {
      newOrderDeadline = '';
    }

    let logText = `[${nowStr}] Updated by ${staffName}`;
    if (oldStatus !== newStatus) logText += `\n- Status: ${oldStatus} -> ${newStatus}`;
    if (oldNextFollowUp !== newNextFollowUp) logText += `\n- Next follow-up: ${oldNextFollowUp || '-'} -> ${newNextFollowUp || '-'}`;
    if (userMemo) logText += `\n- Memo: ${userMemo}`;

    const currentMemo = String(data[targetRow - 1][MASTER_CONFIG.LEDGER_COL.MEMO - 1] || '');
    const updatedMemo = currentMemo ? logText + '\n\n' + currentMemo : logText;

    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.AMOUNT).setValue(totalAmount);
    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.CLIENT).setValue(clientName);
    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.TRADE_TYPE).setValue(newTradeType);
    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.DELIVERY_DATE).setValue(newDeliveryDate);
    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.ORDER_DEADLINE).setValue(newOrderDeadline);
    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.DETAILS).setValue(newDetails);
    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.MEMO).setValue(updatedMemo);
    sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.NEXT_FOLLOWUP).setValue(newNextFollowUp);

    const statusCell = sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.STATUS);
    statusCell.clearDataValidations();
    statusCell.setValue(newStatus);

    if (newStatus.startsWith('4. Accepted') && !oldStatus.startsWith('4. Accepted')) {
      SpreadsheetApp.flush();
      const amountDisplay = sheet.getRange(targetRow, MASTER_CONFIG.LEDGER_COL.AMOUNT).getDisplayValue();
      onQuoteAccepted(quoteNoToUpdate, amountDisplay, staffName, ledgerSS, projectNoOfRow(data[targetRow - 1]));
    }

    if (newStatus.startsWith('4. Accepted')) {
      // 同じ見積の他の改訂版（-01, -02…）のみ自動で失注にする
      // （同じ物件内の別の見積＝別の範囲の見積は対象外）
      const baseProjectPrefix = getFolderBase(quoteNoToUpdate) + '-';
      for (let i = 1; i < data.length; i++) {
        const qNo = String(data[i][MASTER_CONFIG.LEDGER_COL.QUOTE_NO - 1]).trim();
        if (qNo.startsWith(baseProjectPrefix) && qNo !== quoteNoToUpdate) {
          const rIdx = i + 1;
          const targetStatusCell = sheet.getRange(rIdx, MASTER_CONFIG.LEDGER_COL.STATUS);
          targetStatusCell.clearDataValidations();
          targetStatusCell.setValue('9. Lost / Cancelled');
          const prevMemo = String(sheet.getRange(rIdx, MASTER_CONFIG.LEDGER_COL.MEMO).getValue() || '');
          sheet.getRange(rIdx, MASTER_CONFIG.LEDGER_COL.MEMO).setValue(`[${nowStr}] Auto-lost because ${quoteNoToUpdate} was Accepted.\n\n` + prevMemo);
        }
      }
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function executeCreateRevision(staffName, baseQuoteNo, ledgerSS) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME) || ledgerSS.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    const prefix = baseQuoteNo.split('-')[0];
    let maxBranch = 0;
    let baseRowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      const qNo = String(data[i][MASTER_CONFIG.LEDGER_COL.QUOTE_NO - 1]).trim();
      if (qNo.startsWith(prefix)) {
        const parts = qNo.split('-');
        if (parts.length > 1) {
          const bNum = parseInt(parts[1], 10);
          if (!isNaN(bNum) && bNum > maxBranch) maxBranch = bNum;
        }
      }
      if (qNo === baseQuoteNo) {
        baseRowIndex = i + 1;
      }
    }

    if (baseRowIndex === -1) throw new Error('元データが見つかりません: ' + baseQuoteNo);

    const nextBranchStr = ('00' + (maxBranch + 1)).slice(-2);
    const newQuoteNo = `${prefix}-${nextBranchStr}`;

    const originalFileUrl = String(data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.LINK - 1] || '');
    if (!originalFileUrl.includes('/d/')) throw new Error('元の見積ファイルURLが無効です');
    const originalFileId = originalFileUrl.split('/d/')[1].split('/')[0];
    const originalFile = DriveApp.getFileById(originalFileId);
    
    const clientName = String(data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.CLIENT - 1]);
    // 改訂版は「02見積り」の中の新しい回のフォルダに作る
    const originalParents = originalFile.getParents();
    let quoteFolder = originalParents.hasNext() ? originalParents.next() : DriveApp.getRootFolder();
    if (isRoundFolderName(quoteFolder.getName())) {
      const up = quoteFolder.getParents();
      if (up.hasNext()) quoteFolder = up.next();
    }
    const targetFolder = getRoundFolder(quoteFolder, quoteSeqOf(newQuoteNo));

    const newFileName = `【見積】${newQuoteNo}_${clientName !== '（未入力）' ? clientName : '未設定'}`;
    const newFile = originalFile.makeCopy(newFileName, targetFolder);
    const newSS = SpreadsheetApp.openById(newFile.getId());
    const qSheet = newSS.getSheetByName(MASTER_CONFIG.QUOTE_SHEET_NAME);
    if (qSheet) {
      qSheet.getRange(MASTER_CONFIG.CELLS.QUOTE_NO).setValue(newQuoteNo);
      qSheet.getRange(MASTER_CONFIG.CELLS.DATE).setValue(Utilities.formatDate(new Date(), 'Asia/Saigon', 'yyyy-MM-dd'));
      qSheet.getRange(MASTER_CONFIG.CELLS.SALES_PERSON).setValue(staffName);
    }

    const todayStr = Utilities.formatDate(new Date(), 'Asia/Saigon', 'yyyy-MM-dd');
    const newRow = [];
    newRow[MASTER_CONFIG.LEDGER_COL.DATE - 1] = todayStr;
    newRow[MASTER_CONFIG.LEDGER_COL.QUOTE_NO - 1] = newQuoteNo;
    newRow[MASTER_CONFIG.LEDGER_COL.AMOUNT - 1] = data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.AMOUNT - 1];
    newRow[MASTER_CONFIG.LEDGER_COL.CLIENT - 1] = clientName;
    newRow[MASTER_CONFIG.LEDGER_COL.CATEGORY - 1] = data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.CATEGORY - 1];
    newRow[MASTER_CONFIG.LEDGER_COL.TRADE_TYPE - 1] = data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.TRADE_TYPE - 1];
    newRow[MASTER_CONFIG.LEDGER_COL.SALES_PERSON - 1] = data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.SALES_PERSON - 1] || staffName; // 担当は元の見積を引き継ぐ
    newRow[MASTER_CONFIG.LEDGER_COL.STATUS - 1] = '1. Draft';
    newRow[MASTER_CONFIG.LEDGER_COL.LINK - 1] = newFile.getUrl();
    newRow[MASTER_CONFIG.LEDGER_COL.DELIVERY_DATE - 1] = data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.DELIVERY_DATE - 1];
    newRow[MASTER_CONFIG.LEDGER_COL.ORDER_DEADLINE - 1] = data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.ORDER_DEADLINE - 1];
    newRow[MASTER_CONFIG.LEDGER_COL.DETAILS - 1] = data[baseRowIndex - 1][MASTER_CONFIG.LEDGER_COL.DETAILS - 1];
    newRow[MASTER_CONFIG.LEDGER_COL.MEMO - 1] = `[${Utilities.formatDate(new Date(), 'Asia/Saigon', 'yyyy-MM-dd HH:mm')}] Revision created from ${baseQuoteNo} by ${staffName}`;
    newRow[MASTER_CONFIG.LEDGER_COL.NEXT_FOLLOWUP - 1] = '';
    newRow[MASTER_CONFIG.LEDGER_COL.PROJECT_NO - 1] = projectNoOfRow(data[baseRowIndex - 1]); // 改訂版は元の物件を引き継ぐ

    sheet.appendRow(newRow);
    return { quoteNo: newQuoteNo, fileUrl: newFile.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

function executeSearch(query, ledgerSS) {
  query = String(query || '').trim().toLowerCase(); // 'JP2611…' など大文字入力でもヒットさせる
  const sheet = ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME) || ledgerSS.getSheets()[0];
  const data = sheet.getDataRange().getDisplayValues();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const p = rowToProject(data[i]);
    if (!query || p.quoteNo.toLowerCase().includes(query) || p.client.toLowerCase().includes(query) || p.details.toLowerCase().includes(query)) {
      results.push(p);
    }
  }
  return query ? results.reverse() : results.reverse().slice(0, 10);
}

/** 台帳1行（表示値）→ アプリ用オブジェクト */
function rowToProject(row) {
  const C = MASTER_CONFIG.LEDGER_COL;
  const memo = String(row[C.MEMO - 1] || '');
  const lastActionDate = getLastActionDate(memo, String(row[C.DATE - 1] || ''));
  const nextFollowUp = normDate(row[C.NEXT_FOLLOWUP - 1]);
  return {
    quoteNo: String(row[C.QUOTE_NO - 1] || ''),
    projectNo: projectNoOfRow(row),
    client: String(row[C.CLIENT - 1] || ''),
    amount: row[C.AMOUNT - 1] || '0',
    details: String(row[C.DETAILS - 1] || ''),
    category: row[C.CATEGORY - 1] || '',
    tradeType: row[C.TRADE_TYPE - 1] || '',
    salesPerson: row[C.SALES_PERSON - 1] || '',
    status: row[C.STATUS - 1] || '1. Draft',
    deliveryDate: row[C.DELIVERY_DATE - 1] || '',
    orderDeadline: row[C.ORDER_DEADLINE - 1] || '',
    fileUrl: row[C.LINK - 1] || '',
    memo: memo,
    lastActionDate: lastActionDate,
    daysSinceAction: daysSince(lastActionDate),
    nextFollowUp: nextFollowUp
  };
}

/**
 * 最後の操作日 = メモ履歴の一番新しい日付（履歴は新しい順に先頭へ追記されている）。
 * 履歴が無ければ作成日。
 */
function getLastActionDate(memo, fallbackDate) {
  const m = String(memo).match(/\[(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : normDate(fallbackDate);
}

/**
 * 日付を 'yyyy-MM-dd' に正規化。Dateオブジェクト / 'yyyy-M-d' / 'yyyy/MM/dd' / 'yy/MM/dd'（台帳A列の表示形式）に対応。
 * 解釈できなければ ''。
 */
function normDate(v) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, 'Asia/Saigon', 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{2}|\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (!m) return '';
  const y = m[1].length === 2 ? '20' + m[1] : m[1];
  return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function todayVN() {
  return Utilities.formatDate(new Date(), 'Asia/Saigon', 'yyyy-MM-dd');
}

/** 'yyyy-MM-dd' から今日（ベトナム時間）までの日数。日付不明は null */
function daysSince(dateStr) {
  if (!dateStr) return null;
  const today = todayVN();
  const a = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  if (isNaN(a)) return null;
  return Math.floor((b - a) / 86400000);
}

/**
 * フォローが必要な「2. Submitted」案件（経過日数の多い順）
 *  - 次回フォロー日が未来        → 保留（通知しない）
 *  - 次回フォロー日を過ぎ、その日以降に操作なし → 通知（reason: 'due'）
 *  - それ以外：最後の操作から FOLLOWUP_DAYS 日以上 → 通知（reason: 'idle'）
 */
function executeGetFollowUps(ledgerSS) {
  const sheet = ledgerSS.getSheetByName(MASTER_CONFIG.LEDGER_SHEET_NAME) || ledgerSS.getSheets()[0];
  const data = sheet.getDataRange().getDisplayValues();
  const today = todayVN();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const p = rowToProject(data[i]);
    if (!p.quoteNo || !String(p.status).startsWith('2.')) continue;

    if (p.nextFollowUp) {
      if (today < p.nextFollowUp) continue;                 // スヌーズ中
      if (p.lastActionDate < p.nextFollowUp) {              // 予定日以降まだ何もしていない
        p.reason = 'due';
        p.overdueDays = daysSince(p.nextFollowUp);
        results.push(p);
        continue;
      }
    }
    if (p.daysSinceAction !== null && p.daysSinceAction >= MASTER_CONFIG.FOLLOWUP_DAYS) {
      p.reason = 'idle';
      results.push(p);
    }
  }
  return results.sort((a, b) => b.daysSinceAction - a.daysSinceAction);
}

/* =====================================================================
 * フォロー通知メール（時間主導トリガーで毎朝実行）
 * ===================================================================== */

/** 【初回のみ手動実行】毎朝 FOLLOWUP_MAIL_HOUR 時（ベトナム時間）に sendFollowUpEmails を実行するトリガーを作成 */
function setupFollowUpTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendFollowUpEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendFollowUpEmails')
    .timeBased()
    .everyDays(1)
    .atHour(MASTER_CONFIG.FOLLOWUP_MAIL_HOUR)
    .inTimezone('Asia/Ho_Chi_Minh')
    .create();
  Logger.log('トリガーを作成しました：毎日 ' + MASTER_CONFIG.FOLLOWUP_MAIL_HOUR + '時台（ベトナム時間）');
}

/** 担当者ごとに、フォローが必要な自分の案件をメールで通知（休業日・該当なしの人には送らない） */
function sendFollowUpEmails() {
  const ledgerSS = SpreadsheetApp.openById(MASTER_CONFIG.LEDGER_SPREADSHEET_ID);
  const today = todayVN();
  if (!isBusinessDay(today, ledgerSS)) {
    Logger.log(today + ' は休業日のため送信しません');
    return;
  }

  const followUps = executeGetFollowUps(ledgerSS);
  if (followUps.length === 0) return;

  const staffList = Object.values(getStaffMaster(ledgerSS));
  const byStaff = {};
  followUps.forEach(p => {
    const staff = matchStaff(p.salesPerson, staffList);
    const to = staff ? (staff.notifyEmail || staff.email) : '';   // 通知用アドレス優先、なければログイン用
    if (!to) {
      Logger.log('送信先が見つかりません: ' + p.quoteNo + ' / 担当: ' + p.salesPerson);
      return;
    }
    (byStaff[to] = byStaff[to] || { staff: staff, items: [] }).items.push(p);
  });

  Object.keys(byStaff).forEach(email => {
    const { staff, items } = byStaff[email];
    MailApp.sendEmail({
      to: email,
      subject: MAIL_TEXT[staff.lang].subject(items.length),
      htmlBody: buildFollowUpMailHtml(staff.name, items, staff.lang)
    });
  });
}

const MAIL_TEXT = {
  ja: {
    subject: n => `【見積フォロー】提出後アクションのない案件が ${n} 件あります`,
    greeting: name => `${name} さん`,
    intro: n => `「2. Submitted」のまま動きのない見積が <b>${n}件</b> あります。客先へのフォローをお願いします。<br>対応したらアプリでメモを残して保存するか、次回フォロー日を設定してください。`,
    cols: ['見積No.', '客先', '内容', '最終更新', '状況', ''],
    due: d => `次回フォロー日 ${d} を経過`,
    idle: n => `${n}日 アクションなし`,
    open: '見積を開く', app: 'アプリを開く'
  },
  vi: {
    subject: n => `[Theo dõi báo giá] Có ${n} báo giá chưa có hoạt động sau khi gửi`,
    greeting: name => `Chào ${name},`,
    intro: n => `Có <b>${n}</b> báo giá vẫn ở trạng thái "2. Submitted" mà chưa có hoạt động. Vui lòng liên hệ lại với khách hàng.<br>Sau khi liên hệ, hãy thêm ghi chú và lưu trên ứng dụng, hoặc đặt ngày theo dõi tiếp theo.`,
    cols: ['Số báo giá', 'Khách hàng', 'Nội dung', 'Cập nhật lần cuối', 'Tình trạng', ''],
    due: d => `Đã quá ngày theo dõi ${d}`,
    idle: n => `${n} ngày không hoạt động`,
    open: 'Mở báo giá', app: 'Mở ứng dụng'
  },
  en: {
    subject: n => `[Quote follow-up] ${n} submitted quote(s) with no recent action`,
    greeting: name => `Hi ${name},`,
    intro: n => `<b>${n}</b> quote(s) are still in "2. Submitted" with no recent action. Please follow up with the client.<br>After following up, add a memo and save in the app, or set the next follow-up date.`,
    cols: ['Quote No.', 'Client', 'Details', 'Last update', 'Status', ''],
    due: d => `Follow-up date ${d} passed`,
    idle: n => `No action for ${n} days`,
    open: 'Open quote', app: 'Open the app'
  }
};

function buildFollowUpMailHtml(name, items, lang) {
  const T = MAIL_TEXT[lang] || MAIL_TEXT.en;
  const esc = v => String(v || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const td = 'padding:6px 10px;border:1px solid #ddd;';
  const rows = items.map(p => {
    const why = p.reason === 'due' ? T.due(esc(p.nextFollowUp)) : T.idle(p.daysSinceAction);
    const link = p.fileUrl ? `<a href="${esc(p.fileUrl)}">${T.open}</a>` : '';
    return `<tr><td style="${td}">${esc(p.quoteNo)}</td><td style="${td}">${esc(p.client)}</td><td style="${td}">${esc(p.details)}</td>`
      + `<td style="${td}">${esc(p.lastActionDate)}</td><td style="${td}color:#C0392B;">${why}</td><td style="${td}">${link}</td></tr>`;
  }).join('');
  const head = T.cols.map(c => `<th style="${td}">${c}</th>`).join('');
  const appLink = MASTER_CONFIG.APP_URL ? `<p><a href="${esc(MASTER_CONFIG.APP_URL)}">${T.app}</a></p>` : '';
  return `<div style="font-family:sans-serif;font-size:14px;">
    <p>${esc(T.greeting(name))}</p>
    <p>${T.intro(items.length)}</p>
    <table style="border-collapse:collapse;font-size:13px;"><tr style="background:#f3f3f3;">${head}</tr>${rows}</table>${appLink}
  </div>`;
}

/** 台帳の担当者名（例: 'Tetsuya Goto' / 'Thịnh'）から社員を特定 */
function matchStaff(salesPerson, staffList) {
  const sp = String(salesPerson || '').trim().toLowerCase();
  if (!sp) return null;
  return staffList.find(s => s.name.toLowerCase() === sp)
    || staffList.find(s => s.name.toLowerCase().split(/\s+/).some(part => part.length > 2 && sp.includes(part)))
    || staffList.find(s => s.name.toLowerCase().includes(sp))
    || null;
}

/** 営業日判定：土日・ベトナム祝日・Holidaysシートの「休業」は休み、「稼働」は出勤日 */
function isBusinessDay(dateStr, ledgerSS) {
  const sheet = ledgerSS.getSheetByName(MASTER_CONFIG.HOLIDAY_SHEET_NAME);
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0] || normDate(data[i][0]) !== dateStr) continue;
      const type = String(data[i][1]).trim();
      if (type === '稼働') return true;
      if (type === '休業') return false;
    }
  }
  const d = new Date(dateStr + 'T00:00:00+07:00');
  const dow = Number(Utilities.formatDate(d, 'Asia/Saigon', 'u')); // 1=月 … 7=日
  if (dow >= 6) return false;
  try {
    const cal = CalendarApp.getCalendarById('en.vietnamese#holiday@group.v.calendar.google.com');
    if (cal && cal.getEventsForDay(d).length > 0) return false;
  } catch (e) {}
  return true;
}

function calculateWorkingDaysBack(dateStr, daysToSubtract, ledgerSS) {
  let currentDate = new Date(dateStr);
  let workingDaysCounted = 0;
  const vnHolidayCalendarId = 'en.vietnamese#holiday@group.v.calendar.google.com';
  const searchStart = new Date(currentDate.getTime() - (60 * 24 * 60 * 60 * 1000));
  const searchEnd = new Date(currentDate.getTime() + (10 * 24 * 60 * 60 * 1000));

  let googleHolidays = [];
  try {
    const events = CalendarApp.getCalendarById(vnHolidayCalendarId).getEvents(searchStart, searchEnd);
    googleHolidays = events.map(e => Utilities.formatDate(e.getStartTime(), 'Asia/Saigon', 'yyyy-MM-dd'));
  } catch (e) {}

  let customHolidays = [];
  let customWorkdays = [];
  const holidaySheet = ledgerSS.getSheetByName(MASTER_CONFIG.HOLIDAY_SHEET_NAME);
  if (holidaySheet) {
    const data = holidaySheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const dStr = Utilities.formatDate(new Date(data[i][0]), 'Asia/Saigon', 'yyyy-MM-dd');
      const type = String(data[i][1]).trim();
      if (type === '休業') customHolidays.push(dStr);
      if (type === '稼働') customWorkdays.push(dStr);
    }
  }

  while (workingDaysCounted < daysToSubtract) {
    currentDate.setDate(currentDate.getDate() - 1);
    const checkDateStr = Utilities.formatDate(currentDate, 'Asia/Saigon', 'yyyy-MM-dd');
    const dayOfWeek = currentDate.getDay();
    let isWorkingDay = true;

    if (customWorkdays.includes(checkDateStr)) {
      isWorkingDay = true;
    } else {
      if (dayOfWeek === 0 || dayOfWeek === 6) isWorkingDay = false;
      else if (googleHolidays.includes(checkDateStr)) isWorkingDay = false;
      else if (customHolidays.includes(checkDateStr)) isWorkingDay = false;
    }

    if (isWorkingDay) workingDaysCounted++;
  }

  return currentDate;
}

/* =====================================================================
 * 見積フォーマット切替（国内顧客用 TH / 親会社用 TH_JP）
 * ===================================================================== */

/** 作成した見積ファイルで、使うTHシートだけを表示する */
function applyThFormat(ss, format) {
  const vnSheet = ss.getSheetByName(MASTER_CONFIG.TH_SHEET_VN);
  const jpSheet = ss.getSheetByName(MASTER_CONFIG.TH_SHEET_JP);
  if (format === 'JP') {
    if (!jpSheet) throw new Error('テンプレートに「' + MASTER_CONFIG.TH_SHEET_JP + '」シートがありません。テンプレートを確認してください。');
    jpSheet.showSheet();
    if (vnSheet) vnSheet.hideSheet();
  } else {
    if (vnSheet) vnSheet.showSheet();
    if (jpSheet) jpSheet.hideSheet();
  }
}
