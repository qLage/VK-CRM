const url = 'https://geocode-maps.yandex.ru/1.x/?apikey=ee98d354-dc43-46d3-9c87-89b17e6faffa&geocode=Moscow&format=json&results=1';
fetch(url).then(r => { console.log('status:', r.status); return r.text(); }).then(t => console.log(t.substring(0, 500))).catch(e => console.error(e));
