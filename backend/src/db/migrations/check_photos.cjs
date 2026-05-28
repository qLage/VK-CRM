var c=require('pg');
var p=new c.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
p.connect().then(function(){
  return p.query('SELECT id, file_url FROM property_photos LIMIT 10');
}).then(function(r){
  r.rows.forEach(function(x){console.log(x.id, x.file_url)});
  if(r.rows.length===0) console.log('NO PHOTOS');
  p.end();
}).catch(function(e){console.error(e.message);p.end()});
