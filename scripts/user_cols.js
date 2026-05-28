var pg = require("pg");
var c = new pg.Client({connectionString:"postgresql://admin_crm:fMYnGIEdYNW2@master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru:5432/crm",ssl:{rejectUnauthorized:false}});
c.connect().then(function(){
  return c.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position");
}).then(function(r){
  console.log(r.rows.map(function(x){return x.column_name}).join("\n"));
  c.end();
}).catch(function(e){console.error(e.message);c.end()});
