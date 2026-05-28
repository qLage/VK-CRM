-- Change properties.rooms from integer to text to support labels like 'Студия', '10 и более', 'Своб. планировка'
ALTER TABLE properties ALTER COLUMN rooms TYPE text;
