const { query } = require('./index');

async function createDealTableRows() {
  try {
    console.log('📦 Creating deal_table_rows table...');

    const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    const idType = isPostgres ? 'UUID' : 'TEXT';
    const textType = isPostgres ? 'TEXT' : 'TEXT';
    const realType = isPostgres ? 'NUMERIC(12,2)' : 'REAL';
    const timestampType = isPostgres ? 'TIMESTAMP' : 'TEXT';
    const now = isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";

    await query(`
      CREATE TABLE IF NOT EXISTS deal_table_rows (
        id ${idType} PRIMARY KEY,

        -- Dates
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        deposit_date ${textType},
        deal_date ${textType},
        payment_date ${textType},

        -- Basic info
        property_name ${textType} NOT NULL,
        document_type ${textType} NOT NULL,
        document_link ${textType},
        seller ${textType},
        buyer ${textType},
        service ${textType},
        information ${textType},
        agent_name ${textType},
        mop_name ${textType},
        rop_name ${textType},
        team_id ${idType},
        branch_id ${idType},
        comment ${textType},

        -- Manual commissions
        commission_seller_plan ${realType} DEFAULT 0,
        commission_buyer_plan ${realType} DEFAULT 0,
        commission_seller_fact ${realType} DEFAULT 0,
        commission_buyer_fact ${realType} DEFAULT 0,

        -- Manual percentages
        agent_percent ${realType} DEFAULT 0,
        rop_percent ${realType} DEFAULT 0,
        agent_percent_seller ${realType} DEFAULT 0,
        agent_percent_buyer ${realType} DEFAULT 0,
        mop_percent ${realType} DEFAULT 0,

        -- Manual bonuses/expenses
        agent_manual_bonus ${realType} DEFAULT 0,
        rop_manual_bonus ${realType} DEFAULT 0,
        other_expenses ${realType} DEFAULT 0,
        mortgage_deduction ${realType} DEFAULT 0,

        -- Payout info
        payout_date ${textType},
        payout_mop_note ${textType},
        payout_rop_note ${textType},

        -- Calculated fields (stored, not computed on query)
        commission_total_fact ${realType} DEFAULT 0,
        agent_income ${realType} DEFAULT 0,
        rop_payout ${realType} DEFAULT 0,
        mop_revenue ${realType} DEFAULT 0,
        company_revenue ${realType} DEFAULT 0,
        plan_completion ${realType} DEFAULT 0,
        marginality ${realType} DEFAULT 0,

        -- Metadata
        created_by ${idType},
        created_at ${timestampType} DEFAULT ${now},
        updated_at ${timestampType} DEFAULT ${now}
      );
    `);

    // Ensure all columns exist (for cases where table was created earlier with fewer columns)
    if (isPostgres) {
      const columns = [
        ['mop_name', textType],
        ['rop_name', textType],
        ['team_id', idType],
        ['branch_id', idType],
        ['comment', textType],
        ['payout_date', textType],
        ['payout_mop_note', textType],
        ['payout_rop_note', textType],
        ['commission_total_fact', realType, '0'],
        ['agent_income', realType, '0'],
        ['rop_payout', realType, '0'],
        ['mop_revenue', realType, '0'],
        ['company_revenue', realType, '0'],
        ['plan_completion', realType, '0'],
        ['marginality', realType, '0']
      ];

      for (const [colName, colType, defaultVal] of columns) {
        try {
          await query(`ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS ${colName} ${colType}${defaultVal ? ` DEFAULT ${defaultVal}` : ''};`);
        } catch (err) {
          console.log(`Note: Column ${colName} might already exist or handled: ${err.message}`);
        }
      }
    }

    // Create indexes for performance
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_year_month ON deal_table_rows(year, month);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_agent ON deal_table_rows(agent_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_mop ON deal_table_rows(mop_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_rop ON deal_table_rows(rop_name);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_team ON deal_table_rows(team_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_deal_table_document_type ON deal_table_rows(document_type);`);

    console.log('✅ deal_table_rows table created successfully');
  } catch (error) {
    console.error('❌ Error creating deal_table_rows:', error.message);
    throw error;
  }
}

module.exports = createDealTableRows;
