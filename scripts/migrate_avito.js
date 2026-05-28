var pg = require("pg");
var c = new pg.Client({connectionString:"postgresql://admin_crm:fMYnGIEdYNW2@master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru:5432/crm",ssl:{rejectUnauthorized:false}});
c.connect().then(function(){
  return c.query("ALTER TABLE properties ADD COLUMN IF NOT EXISTS deal_type VARCHAR(50) DEFAULT 'Прямая продажа', ADD COLUMN IF NOT EXISTS property_rights VARCHAR(50) DEFAULT 'Посредник', ADD COLUMN IF NOT EXISTS room_type VARCHAR(50), ADD COLUMN IF NOT EXISTS sale_options TEXT");
}).then(function(r){
  console.log("Migration done");
  return c.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('phone','name','email') ORDER BY ordinal_position");
}).then(function(r){
  console.log("User cols:", r.rows.map(function(x){return x.column_name}).join(","));
  c.end();
}).catch(function(e){console.error(e.message);c.end()});
