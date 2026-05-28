const url = 'https://suggest-maps.yandex.ru/v1/suggest?apikey=2d9021b2-7f67-499a-86ae-b5ca95efcd36&text=Moscow&types=geo&lang=ru_RU&results=3';
fetch(url).then(r => { console.log('status:', r.status); return r.text(); }).then(t => console.log(t.substring(0, 500))).catch(e => console.error(e));
