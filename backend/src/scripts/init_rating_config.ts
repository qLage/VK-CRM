import { query } from './src/db';

async function initRatingConfig() {
  const ratingConfig = {
    metrics: [
      { key: 'target_objects', label: 'Рост базы', value: 20, period: 'quarter' },
      { key: 'target_revenue', label: 'Валовая выручка', value: 1500000, period: 'quarter' },
      { key: 'target_deposits', label: 'Задатки', value: 18, period: 'quarter' }
    ],
    updatedAt: new Date().toISOString()
  };

  try {
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
      ['rating_config', JSON.stringify(ratingConfig), new Date().toISOString()]
    );
    console.log('Initial rating configuration saved successfully');
  } catch (error) {
    console.error('Error saving initial rating configuration:', error);
  }
}

initRatingConfig();
