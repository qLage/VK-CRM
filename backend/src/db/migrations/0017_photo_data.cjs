var c=require('pg');
var p=new c.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
p.connect().then(function(){
  return p.query("ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS file_data BYTEA; ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);");
}).then(function(){
  console.log('MIGRATION OK: added file_data and mime_type columns');
  p.end();
}).catch(function(e){console.error('FAILED:',e.message);p.end();process.exit(1)});
