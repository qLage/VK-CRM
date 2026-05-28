const ExcelJS = require('exceljs');
const path = require('path');
const { query } = require('../db');
const { v4: uuidv4 } = require('uuid');

// Month name to number mapping
const MONTH_MAP = {
  'январь': 1, 'января': 1,
  'февраль': 2, 'февраля': 2,
  'март': 3, 'марта': 3,
  'апрель': 4, 'апреля': 4,
  'май': 5, 'мая': 5,
  'июнь': 6, 'июня': 6,
  'июль': 7, 'июля': 7,
  'август': 8, 'августа': 8,
  'сентябрь': 9, 'сентября': 9,
  'октябрь': 10, 'октября': 10,
  'ноябрь': 11, 'ноября': 11,
  'декабрь': 12, 'декабря': 12
};

function parseMonth(monthStr) {
  if (!monthStr || typeof monthStr !== 'string') return null;

  const lower = monthStr.toLowerCase().trim();

  // Handle ranges like "Декабрь-январь" - take the last month
  if (lower.includes('-')) {
    const parts = lower.split('-');
    const lastMonth = parts[parts.length - 1].trim();
    return MONTH_MAP[lastMonth] || null;
  }

  return MONTH_MAP[lower] || null;
}

function parseDate(dateValue) {
  if (!dateValue) return null;

  // exceljs automatically converts Excel dates to JS Date objects
  if (dateValue instanceof Date) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Handle numeric Excel date serial (fallback)
  if (typeof dateValue === 'number') {
    // Excel date serial to JS Date
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

function parsePercent(val) {
  if (!val) return 0;
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  // If value is between 0 and 1, assume it's decimal format (0.5 = 50%)
  if (num > 0 && num <= 1) return num * 100;
  return num;
}

function parseNumber(val) {
  if (!val) return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

function calculateFormulas(row) {
  const commission_total_fact = parseFloat(row.commission_seller_fact || 0) + parseFloat(row.commission_buyer_fact || 0);
  const agent_income = (commission_total_fact * parseFloat(row.agent_percent || 0) / 100) + parseFloat(row.agent_manual_bonus || 0);
  const rop_income = (commission_total_fact * parseFloat(row.rop_percent || 0) / 100) + parseFloat(row.rop_manual_bonus || 0);
  const company_revenue = commission_total_fact - agent_income - rop_income - parseFloat(row.other_expenses || 0);
  const plan_total = parseFloat(row.commission_seller_plan || 0) + parseFloat(row.commission_buyer_plan || 0);
  const plan_completion = plan_total > 0 ? (commission_total_fact / plan_total) * 100 : 0;
  const marginality = commission_total_fact > 0 ? (company_revenue / commission_total_fact) * 100 : 0;

  return {
    commission_total_fact: commission_total_fact.toFixed(2),
    agent_income: agent_income.toFixed(2),
    rop_income: rop_income.toFixed(2),
    company_revenue: company_revenue.toFixed(2),
    plan_completion: plan_completion.toFixed(2),
    marginality: marginality.toFixed(2)
  };
}

async function importExcelFile(filePath) {
  console.log(`\n📄 Processing: ${path.basename(filePath)}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let totalImported = 0;
  let totalSkipped = 0;

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;
    console.log(`\n  📋 Sheet: ${sheetName}`);

    // Get all rows as array of arrays
    const data = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowData = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        rowData.push(cell.value || '');
      });
      data.push(rowData);
    });

    if (data.length < 2) {
      console.log('    ⚠️  Empty sheet, skipping');
      continue;
    }

    const headers = data[0];
    const rows = data.slice(1);

    // Find column indices
    const colMap = {
      month: headers.findIndex(h => h && h.includes('Месяц')),
      property: headers.findIndex(h => h && h.includes('Объект недвижимости')),
      document: headers.findIndex(h => h && h.includes('Документ')),
      depositDate: headers.findIndex(h => h && h.includes('дата задатка')),
      dealDate: headers.findIndex(h => h && h.includes('дата сделки')),
      paymentDate: headers.findIndex(h => h && h.includes('дата поуступления')),
      commSellerPlan: headers.findIndex(h => h && h.includes('Комиссия продавец план')),
      commBuyerPlan: headers.findIndex(h => h && h.includes('Комиссия покупатель план')),
      commSellerFact: headers.findIndex(h => h && h.includes('Комиссия продавец получено')),
      commBuyerFact: headers.findIndex(h => h && h.includes('Комиссия покупатель получено')),
      agentPercentSeller: headers.findIndex(h => h && h.includes('% агента продавец')),
      agentPercentBuyer: headers.findIndex(h => h && h.includes('% агента покупатель')),
      ropPercent: headers.findIndex(h => h && h.includes('Процент РОП')),
      mortgage: headers.findIndex(h => h && h.includes('Ипотека')),
      comment: headers.findIndex(h => h && h.includes('Информация'))
    };

    // If month column not found by header, assume it's the first column (index 0)
    if (colMap.month === -1) {
      colMap.month = 0;
      console.log('    ℹ️  Month column not found in header, using first column');
    }

    let lastValidMonth = null; // Fill-forward pattern for month

    for (const row of rows) {
      // Skip empty rows
      const property = row[colMap.property];
      if (!property || property.trim() === '') {
        totalSkipped++;
        continue;
      }

      // Fill-forward pattern: use current month if present, otherwise use last valid month
      const monthStr = row[colMap.month];
      if (monthStr && monthStr.trim() !== '') {
        const parsed = parseMonth(monthStr);
        if (parsed) {
          lastValidMonth = parsed;
        }
      }

      const month = lastValidMonth;
      if (!month) {
        console.log(`    ⚠️  Skipping row: no valid month (current: "${monthStr}")`);
        totalSkipped++;
        continue;
      }

      // Parse agent percent (use seller percent, or buyer if seller is empty)
      let agentPercent = parsePercent(row[colMap.agentPercentSeller]);
      if (agentPercent === 0) {
        agentPercent = parsePercent(row[colMap.agentPercentBuyer]);
      }

      const dealRow = {
        month,
        year: 2026,
        property_name: property.trim(),
        document_type: row[colMap.document]?.trim() || 'ДДУ',
        agent_name: sheetName.trim(),
        rop_name: '',
        deposit_date: parseDate(row[colMap.depositDate]),
        deal_date: parseDate(row[colMap.dealDate]),
        payment_date: parseDate(row[colMap.paymentDate]),
        commission_seller_plan: parseNumber(row[colMap.commSellerPlan]),
        commission_buyer_plan: parseNumber(row[colMap.commBuyerPlan]),
        commission_seller_fact: parseNumber(row[colMap.commSellerFact]),
        commission_buyer_fact: parseNumber(row[colMap.commBuyerFact]),
        agent_percent: agentPercent,
        rop_percent: parsePercent(row[colMap.ropPercent]),
        agent_manual_bonus: 0,
        rop_manual_bonus: 0,
        other_expenses: 0,
        mortgage: row[colMap.mortgage] ? 1 : 0,
        comment: row[colMap.comment]?.toString().trim() || ''
      };

      // Calculate formulas
      const calculated = calculateFormulas(dealRow);

      try {
        await query(`
          INSERT INTO deal_table_rows (
            id, month, year, deposit_date, deal_date, payment_date,
            property_name, document_type, agent_name, rop_name, mortgage, comment,
            commission_seller_plan, commission_buyer_plan,
            commission_seller_fact, commission_buyer_fact,
            agent_percent, rop_percent,
            agent_manual_bonus, rop_manual_bonus, other_expenses,
            commission_total_fact, agent_income, rop_income,
            company_revenue, plan_completion, marginality,
            created_by, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26, $27, $28, $29, $30
          )
        `, [
          uuidv4(), dealRow.month, dealRow.year, dealRow.deposit_date, dealRow.deal_date, dealRow.payment_date,
          dealRow.property_name, dealRow.document_type, dealRow.agent_name, dealRow.rop_name,
          dealRow.mortgage, dealRow.comment,
          dealRow.commission_seller_plan, dealRow.commission_buyer_plan,
          dealRow.commission_seller_fact, dealRow.commission_buyer_fact,
          dealRow.agent_percent, dealRow.rop_percent,
          dealRow.agent_manual_bonus, dealRow.rop_manual_bonus, dealRow.other_expenses,
          calculated.commission_total_fact, calculated.agent_income, calculated.rop_income,
          calculated.company_revenue, calculated.plan_completion, calculated.marginality,
          null, new Date().toISOString(), new Date().toISOString()
        ]);

        totalImported++;
      } catch (error) {
        console.error(`    ❌ Error inserting row:`, error.message);
        totalSkipped++;
      }
    }
  }

  return { imported: totalImported, skipped: totalSkipped };
}

async function main() {
  console.log('🚀 Starting Excel import...\n');

  const filesDir = path.join(__dirname, '../../../files');
  const files = [
    path.join(filesDir, '2026 Матвеева комиссия.xlsx'),
    path.join(filesDir, '2026 Шишакова Комиссия АН ВК 3КВ.xlsx')
  ];

  let totalImported = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const result = await importExcelFile(file);
    totalImported += result.imported;
    totalSkipped += result.skipped;
  }

  console.log('\n✅ Import completed!');
  console.log(`   Imported: ${totalImported} rows`);
  console.log(`   Skipped: ${totalSkipped} rows`);

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
