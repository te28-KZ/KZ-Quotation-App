/**
 * 【見積マスター用】単価（I列）の表示形式を通貨（J6）に合わせて切り替える
 *
 * 見積マスターのスプレッドシートに直接入れるスクリプト（Buddy本体の Code.gs とは別）。
 * 見積マスターをコピーして作る見積にも、このスクリプトが一緒にコピーされる。
 *
 * 動くタイミング（人がシートを操作したときだけ）:
 *   - Quotation の J6（通貨）を変えたとき
 *   - Quotation の単価（I列の明細）を入力・貼り付けしたとき
 * 表示:
 *   - USD → $16.4
 *   - VND → 9,000,000 VND
 * 中身の数字は変えない（表示形式だけを変える）。
 */
const UPF = {
  SHEET: 'Quotation',
  CURRENCY_CELL: 'J6',
  PRICE_COL: 9,        // I列
  FIRST_ROW: 14,       // 明細の1行目
  FORMATS: {
    USD: '"$"#,##0.0',
    VND: '#,##0" VND"'
  }
};

function onEdit(e) {
  if (!e || !e.range) return;
  const r = e.range;
  const sh = r.getSheet();
  if (sh.getName() !== UPF.SHEET) return;

  const cur = sh.getRange(UPF.CURRENCY_CELL);
  const touchesCurrency = r.getRow() <= cur.getRow() && r.getLastRow() >= cur.getRow()
    && r.getColumn() <= cur.getColumn() && r.getLastColumn() >= cur.getColumn();
  const touchesPrice = r.getLastRow() >= UPF.FIRST_ROW
    && r.getColumn() <= UPF.PRICE_COL && r.getLastColumn() >= UPF.PRICE_COL;
  if (!touchesCurrency && !touchesPrice) return;

  applyUnitPriceFormat_(sh);
}

/** 明細の範囲（14行目〜「TOTAL」の行の手前）の単価に、通貨の表示形式を付ける */
function applyUnitPriceFormat_(sh) {
  const currency = String(sh.getRange(UPF.CURRENCY_CELL).getValue()).trim().toUpperCase();
  const format = UPF.FORMATS[currency] || UPF.FORMATS.VND;
  const lastRow = itemLastRow_(sh);
  if (lastRow < UPF.FIRST_ROW) return;
  sh.getRange(UPF.FIRST_ROW, UPF.PRICE_COL, lastRow - UPF.FIRST_ROW + 1, 1).setNumberFormat(format);
}

/** I列で「TOTAL」と書かれた行を探し、その手前を明細の最後とする（行を足しても追従する） */
function itemLastRow_(sh) {
  const maxRow = sh.getLastRow();
  const col = sh.getRange(UPF.FIRST_ROW, UPF.PRICE_COL, Math.max(maxRow - UPF.FIRST_ROW + 1, 1), 1).getDisplayValues();
  for (let i = 0; i < col.length; i++) {
    if (/^TOTAL/i.test(String(col[i][0]).trim())) return UPF.FIRST_ROW + i - 1;
  }
  return UPF.FIRST_ROW + 17;   // 見つからなければ従来の 14〜31 行
}
