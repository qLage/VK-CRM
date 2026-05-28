var s=require('fs').readFileSync('/app/dist/server.js','utf8');
console.log('has propertiesRoutes:', s.includes('propertiesRoutes'));
console.log('has /api/properties:', s.includes('/api/properties'));
console.log('has properties_routes:', s.includes('properties_routes'));
// search for route registration
var m = s.match(/properties/g);
console.log('total "properties" occurrences:', m ? m.length : 0);
