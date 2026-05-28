var c=require('pg');
var p = new c.Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
p.connect().then(function(){
  return p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%propert%' OR tablename LIKE '%avito%'");
}).then(function(r){
  r.rows.forEach(function(x){console.log(x.tablename)});
  if(r.rows.length===0) console.log('NO TABLES FOUND matching properties/avito');
  p.end();
}).catch(function(e){console.error('ERROR: '+e.message);p.end()});
