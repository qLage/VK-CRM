var pg = require("pg");
var c = new pg.Client({connectionString:"postgresql://admin_crm:fMYnGIEdYNW2@master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru:5432/crm",ssl:{rejectUnauthorized:false}});
c.connect().then(function(){return c.query("UPDATE properties SET address='Ленина ул., д.5', city='Воронежская область, Воронеж г.' WHERE id='44939f04-571e-4086-a02f-6ff76a72af53'")}).then(function(r){console.log("Updated:", r.rowCount);c.end()}).catch(function(e){console.error(e.message);c.end()});
