var pg = require("pg");
var c = new pg.Client({connectionString:"postgresql://admin_crm:fMYnGIEdYNW2@master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru:5432/crm",ssl:{rejectUnauthorized:false}});
c.connect().then(function(){return c.query("SELECT category, house_type, status, rooms, address, city FROM properties WHERE avito_feed_enabled=true")}).then(function(r){console.log(JSON.stringify(r.rows,null,2));c.end()}).catch(function(e){console.error(e.message);c.end()});
