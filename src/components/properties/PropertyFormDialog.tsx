import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PropertyCreate, Property } from '@/hooks/useProperties';
import { Loader2, Building2, Home, TreePine, Store, Key, MapPin, Ruler, DoorOpen, AlertTriangle, Sparkles, House, UserRound, ImageIcon as PhotoIcon, GripVertical, Trash2, Map as MapIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatPhoneRu } from '@/lib/phone-utils';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { useClient, useClientSearch, useClientAccessCheck } from '@/hooks/useClients';
import { compressImages, type CompressedPhoto } from '@/lib/imageCompress';
import Sortable from 'sortablejs';

/* ═══════════════════════════════════════════════════════════════════════════
   RUSSIAN CITIES
   ═══════════════════════════════════════════════════════════════════════════ */

const RUSSIAN_CITIES = [
  'Москва','Санкт-Петербург','Новосибирск','Екатеринбург','Казань','Нижний Новгород','Челябинск','Самара','Омск','Ростов-на-Дону',
  'Уфа','Красноярск','Воронеж','Пермь','Волгоград','Краснодар','Саратов','Тюмень','Тольятти','Ижевск',
  'Барнаул','Ульяновск','Иркутск','Хабаровск','Ярославль','Владивосток','Махачкала','Томск','Оренбург','Кемерово',
  'Новокузнецк','Рязань','Астрахань','Набережные Челны','Пенза','Липецк','Тула','Киров','Чебоксары','Калининград',
  'Брянск','Курск','Иваново','Магнитогорск','Улан-Удэ','Тверь','Ставрополь','Белгород','Сочи','Нижний Тагил',
  'Архангельск','Владимир','Калуга','Смоленск','Чита','Саранск','Волжский','Сургут','Череповец','Вологда',
  'Орёл','Курган','Владикавказ','Якутск','Грозный','Мурманск','Тамбов','Стерлитамак','Петрозаводск','Кострома',
  'Нижневартовск','Новороссийск','Йошкар-Ола','Таганрог','Комсомольск-на-Амуре','Сыктывкар','Нальчик','Шахты','Дзержинск','Братск',
  'Орск','Ангарск','Старый Оскол','Великий Новгород','Благовещенск','Энгельс','Бийск','Королёв','Псков','Люберцы',
  'Южно-Сахалинск','Армавир','Балашиха','Рыбинск','Абакан','Северодвинск','Петропавловск-Камчатский','Норильск','Подольск','Сызрань',
  'Каменск-Уральский','Златоуст','Мытищи','Электросталь','Миасс','Салават','Копейск','Альметьевск','Пятигорск','Одинцово',
  'Коломна','Находка','Березники','Домодедово','Хасавюрт','Серпухов','Кисловодск','Новомосковск','Нефтеюганск','Нефтекамск',
  'Димитровград','Первоуральск','Черкесск','Дербент','Невинномысск','Кызыл','Обнинск','Каспийск','Батайск','Назрань',
  'Новочебоксарск','Щёлково','Муром','Камышин','Ессентуки','Новочеркасск','Жуковский','Долгопрудный','Раменское','Реутов',
  'Пушкино','Ноябрьск','Элиста','Артём','Бердск','Ачинск','Северск','Анапа','Геленджик','Ейск',
  'Железноводск','Минеральные Воды','Майкоп','Черногорск','Лобня','Клин','Воскресенск','Ивантеевка','Фрязино','Дубна',
  'Лыткарино','Котельники','Видное','Егорьевск','Ступино','Чехов','Наро-Фоминск','Дмитров','Павловский Посад','Красногорск',
  'Химки','Ногинск','Воткинск','Глазов','Сарапул','Кунгур','Соликамск','Лысьва','Чусовой','Краснокамск',
  'Туймазы','Ишимбай','Октябрьский','Белорецк','Кумертау','Мелеуз','Бирск','Учалы','Сибай','Янаул',
  'Лениногорск','Бугульма','Елабуга','Зеленодольск','Нижнекамск','Заинск','Чистополь','Буинск',
].sort();

/* ═══════════════════════════════════════════════════════════════════════════
   CATEGORIES (Avito)
   ═══════════════════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  { value: 'apartment_sell', label: 'Продажа квартиры', icon: Building2 },
  { value: 'apartment_rent', label: 'Аренда квартиры', icon: Key },
  { value: 'house', label: 'Дом, дача', icon: House },
  { value: 'land', label: 'Земельный участок', icon: TreePine },
  { value: 'commercial', label: 'Коммерция', icon: Store },
];

/* ═══════════════════════════════════════════════════════════════════════════
   SELECT OPTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

const OPT_HOUSE_TYPE = [
  { value: 'panel', label: 'Панельный' },
  { value: 'brick', label: 'Кирпичный' },
  { value: 'monolith', label: 'Монолитный' },
  { value: 'monolith-brick', label: 'Монолитно-кирпичный' },
  { value: 'block', label: 'Блочный' },
  { value: 'wood', label: 'Деревянный' },
];

const OPT_RENOVATION = [
  { value: 'cosmetic', label: 'Косметический' },
  { value: 'euro', label: 'Евро' },
  { value: 'designer', label: 'Дизайнерский' },
  { value: 'requires', label: 'Требуется' },
];

const OPT_BATHROOM = [
  { value: 'combined', label: 'Совмещённый' },
  { value: 'separate', label: 'Раздельный' },
];

const OPT_HOUSE_BATHROOM = [
  { value: 'inside', label: 'В доме' },
  { value: 'outside', label: 'На улице' },
];

const OPT_BALCONY = [
  { value: 'balcony', label: 'Балкон' },
  { value: 'loggia', label: 'Лоджия' },
  { value: 'none', label: 'Нет' },
];

const OPT_ELEVATOR_COUNT = [
  { value: '0', label: 'Нет' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

const OPT_VIEW = [
  { value: 'yard', label: 'Во двор' },
  { value: 'street', label: 'На улицу' },
  { value: 'sunny', label: 'На солнечную сторону' },
];

const OPT_PARKING = [
  { value: 'underground', label: 'Подземная' },
  { value: 'ground', label: 'Наземная многоуровневая' },
  { value: 'yard_open', label: 'Открытая во дворе' },
  { value: 'yard_barrier', label: 'За шлагбаумом во дворе' },
  { value: 'guest', label: 'Гостевая' },
];

const OPT_HOUSE_OBJECT_TYPE = [
  { value: 'house', label: 'Дом' },
  { value: 'cottage', label: 'Коттедж' },
  { value: 'dacha', label: 'Дача' },
  { value: 'townhouse', label: 'Таунхаус' },
];

const OPT_APARTMENT_TYPE = [
  { value: 'apartment', label: 'Квартира' },
  { value: 'apartments', label: 'Апартаменты' },
];

const OPT_COMMERCIAL_TYPE = [
  { value: 'office', label: 'Офисное помещение' },
  { value: 'free_purpose', label: 'Помещение свободного назначения' },
  { value: 'retail', label: 'Торговое помещение' },
  { value: 'warehouse', label: 'Складское помещение' },
  { value: 'production', label: 'Производственное помещение' },
  { value: 'catering', label: 'Помещение общественного питания' },
  { value: 'hotel', label: 'Гостиница' },
  { value: 'autoservice', label: 'Автосервис' },
  { value: 'building', label: 'Здание' },
  { value: 'coworking', label: 'Коворкинг' },
  { value: 'storage', label: 'Кладовая' },
  { value: 'residential', label: 'Жилой дом' },
  { value: 'other', label: 'Другое' },
];

const OPT_HOUSE_ROOMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10 и более', 'Своб. планировка'];

const OPT_ROOMS = ['Студия', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10 и более', 'Своб. планировка'];

const OPT_ROOM_TYPE = ['Изолированные', 'Смежные', 'Смежно-изолированные', 'Свободная планировка'];
const OPT_DEAL_TYPE = ['Прямая продажа', 'Альтернативная'];
const OPT_SALE_OPTIONS = ['Можно в ипотеку', 'Ипотека и маткапитал'];

const OPT_WALLS_TYPE = [
  { value: 'brick', label: 'Кирпич' },
  { value: 'wood', label: 'Дерево' },
  { value: 'block', label: 'Блоки' },
  { value: 'monolith', label: 'Монолит' },
  { value: 'frame', label: 'Каркас' },
];

const OPT_YES_NO = [
  { value: 'yes', label: 'Есть' },
  { value: 'no', label: 'Нет' },
];

// Detailed utility types for Avito houses
const OPT_WATER_SUPPLY_TYPE = [
  { value: 'central', label: 'Центральное' },
  { value: 'well', label: 'Скважина' },
  { value: 'spring', label: 'Колодец' },
  { value: 'no', label: 'Нет' },
];

const OPT_SEWERAGE_TYPE = [
  { value: 'central', label: 'Центральная' },
  { value: 'septic', label: 'Септик' },
  { value: 'cesspool', label: 'Выгребная яма' },
  { value: 'bio_station', label: 'Станция биоочистки' },
  { value: 'no', label: 'Нет' },
];

const OPT_GAS_SUPPLY_TYPE = [
  { value: 'in_house', label: 'В доме' },
  { value: 'border', label: 'По границе участка' },
  { value: 'no', label: 'Нет' },
];

const OPT_HEATING_TYPE = [
  { value: 'central', label: 'Центральное' },
  { value: 'gas', label: 'Газовое' },
  { value: 'electric', label: 'Электрическое' },
  { value: 'solid', label: 'Жидкотопливный котёл' },
  { value: 'stove', label: 'Печь' },
  { value: 'fireplace', label: 'Камин' },
  { value: 'other', label: 'Другое' },
];

const OPT_LAND_STATUS = [
  { value: 'izhs', label: 'ИЖС' },
  { value: 'snt', label: 'СНТ' },
  { value: 'dnp', label: 'ДНП' },
  { value: 'lpx', label: 'ЛПХ' },
];

const OPT_FURNITURE = [
  { value: 'full', label: 'Полная' },
  { value: 'partial', label: 'Частичная' },
  { value: 'none', label: 'Без мебели' },
];

const OPT_PREPAYMENT = [
  { value: '1', label: '1 месяц' },
  { value: '2', label: '2 месяца' },
  { value: '3', label: '3 месяца' },
  { value: '6', label: 'Полгода' },
  { value: '12', label: 'Год' },
];

const OPT_LEASE_TERM = [
  { value: 'long', label: 'Длительный' },
  { value: 'short', label: 'Краткосрочный' },
  { value: 'any', label: 'Любой' },
];

/* ═══════════════════════════════════════════════════════════════════════════
   GEOCODER (via backend proxy)
   ═══════════════════════════════════════════════════════════════════════════ */

interface GeoSuggestion {
  name: string;
  description: string;
  fullAddress?: string;
  lat?: number;
  lng?: number;
}

// Suggest API: lightweight autocomplete (no lat/lng yet)
async function fetchAddressSuggestions(city: string, query: string): Promise<GeoSuggestion[]> {
  if (!query.trim()) return [];
  // Pass the city as part of the query to bias suggestions to that area
  const q = city ? `${city} ${query}` : query;
  try {
    const { data } = await localAPI.request(`/properties/suggest?q=${encodeURIComponent(q)}`);
    return (data as any)?.suggestions || [];
  } catch {
    return [];
  }
}

// Geocoder: resolve final address to lat/lng on selection
async function resolveAddressCoords(fullAddress: string): Promise<{ lat: number; lng: number } | null> {
  if (!fullAddress.trim()) return null;
  try {
    const { data } = await localAPI.request(`/properties/geocode?q=${encodeURIComponent(fullAddress)}`);
    const list = (data as any)?.suggestions || [];
    if (list.length > 0 && typeof list[0].lat === 'number' && typeof list[0].lng === 'number') {
      return { lat: list[0].lat, lng: list[0].lng };
    }
  } catch {
    // ignore
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITY AUTOCOMPLETE
   ═══════════════════════════════════════════════════════════════════════════ */

function CityAutocomplete({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [inputVal, setInputVal] = useState(value || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputVal(value || ''); }, [value]);

  const filtered = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    if (!q) return [];
    return RUSSIAN_CITIES.filter(c => c.toLowerCase().includes(q)).slice(0, 10);
  }, [inputVal]);

  useEffect(() => { setHighlightIdx(-1); }, [filtered]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (city: string) => {
    setInputVal(city);
    onChange(city);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || !filtered.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && highlightIdx >= 0) { e.preventDefault(); select(filtered[highlightIdx]); }
    else if (e.key === 'Escape') { setShowDropdown(false); }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={inputVal}
        onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setShowDropdown(true); }}
        onFocus={() => { if (inputVal.trim()) setShowDropdown(true); }}
        onKeyDown={handleKeyDown}
        placeholder="Начните вводить город..."
        className={className}
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto">
          {filtered.map((city, i) => (
            <button
              key={city}
              type="button"
              onMouseDown={() => select(city)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm transition-colors",
                i === highlightIdx ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADDRESS AUTOCOMPLETE (Yandex Geocoder)
   ═══════════════════════════════════════════════════════════════════════════ */

function AddressAutocomplete({
  value,
  city,
  onChange,
  onSelect,
  className,
}: {
  value: string;
  city: string;
  onChange: (v: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
  className?: string;
}) {
  const [inputVal, setInputVal] = useState(value || '');
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setInputVal(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (val: string) => {
    setInputVal(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim() || !city.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await fetchAddressSuggestions(city, val);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setHighlightIdx(-1);
    }, 300);
  };

  const select = async (s: GeoSuggestion) => {
    setInputVal(s.name);
    setShowDropdown(false);
    // If suggest didn't include coords, hit geocoder for the full address
    let lat = s.lat;
    let lng = s.lng;
    if (lat == null || lng == null) {
      const coords = await resolveAddressCoords(s.fullAddress || `${city} ${s.name}`);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }
    onSelect(s.name, lat ?? 0, lng ?? 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && highlightIdx >= 0) { e.preventDefault(); void select(suggestions[highlightIdx]); }
    else if (e.key === 'Escape') { setShowDropdown(false); }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={inputVal}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length) setShowDropdown(true); }}
        onKeyDown={handleKeyDown}
        placeholder={city ? 'Улица, дом...' : 'Сначала выберите город'}
        disabled={!city.trim()}
        className={className}
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[220px] overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={`${s.name}-${s.fullAddress || ''}-${i}`}
              type="button"
              onMouseDown={() => void select(s)}
              className={cn(
                "w-full text-left px-3 py-2 transition-colors",
                i === highlightIdx ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="text-sm">{s.name}</div>
              {s.description && <div className="text-[10px] text-white/40">{s.description}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   YANDEX MAP PICKER (uses ymaps 2.1 — no referer restrictions needed)
   ═══════════════════════════════════════════════════════════════════════════ */

const YANDEX_JS_KEY = 'ee98d354-dc43-46d3-9c87-89b17e6faffa';

let _ymapsLoading: Promise<any> | null = null;
function loadYmaps(): Promise<any> {
  if ((window as any).ymaps && (window as any).ymaps.Map) return Promise.resolve((window as any).ymaps);
  if (_ymapsLoading) return _ymapsLoading;
  _ymapsLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_JS_KEY}&lang=ru_RU`;
    s.async = true;
    s.onload = () => {
      (window as any).ymaps.ready(() => resolve((window as any).ymaps));
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _ymapsLoading;
}

function YandexMapPicker({
  lat, lng, city,
  onPick,
}: {
  lat?: number; lng?: number; city: string;
  onPick: (data: { lat: number; lng: number; address: string; city?: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ map?: any; placemark?: any }>({});
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  const initialCoords: [number, number] = useMemo(() => {
    if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) return [lat, lng];
    return [55.7558, 37.6173];
  }, [lat, lng]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ymaps = await loadYmaps();
        if (cancelled || !containerRef.current) return;

        const map = new ymaps.Map(containerRef.current, {
          center: initialCoords,
          zoom: 14,
          controls: ['zoomControl'],
        });

        const placemark = new ymaps.Placemark(initialCoords, {}, {
          preset: 'islands#violetDotIcon',
          draggable: false,
        });
        map.geoObjects.add(placemark);

        // Click on map → reverse geocode
        map.events.add('click', async (e: any) => {
          const coords = e.get('coords') as [number, number]; // [lat, lng]
          placemark.geometry.setCoordinates(coords);
          setResolving(true);
          try {
            const { data } = await localAPI.request(`/properties/geocode?q=${encodeURIComponent(`${coords[1]},${coords[0]}`)}`);
            const list = (data as any)?.suggestions || [];
            if (list.length > 0) {
              onPick({
                lat: coords[0],
                lng: coords[1],
                address: list[0].name || list[0].fullAddress || '',
                city: list[0].description?.split(',')[0] || undefined,
              });
            } else {
              onPick({ lat: coords[0], lng: coords[1], address: '' });
            }
          } catch {
            onPick({ lat: coords[0], lng: coords[1], address: '' });
          } finally { setResolving(false); }
        });

        stateRef.current = { map, placemark };
        setLoading(false);
      } catch (e) {
        console.error('[YMap] failed to init:', e);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      try { stateRef.current.map?.destroy(); } catch {}
      stateRef.current = {};
    };
  }, []);

  // Update marker when external lat/lng change
  useEffect(() => {
    const { map, placemark } = stateRef.current;
    if (!map || !placemark) return;
    if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
      placemark.geometry.setCoordinates([lat, lng]);
      map.setCenter([lat, lng], Math.max(map.getZoom(), 15), { duration: 300 });
    }
  }, [lat, lng]);

  // When city changes without coordinates, recenter
  useEffect(() => {
    const { map } = stateRef.current;
    if (!map || !city) return;
    if (typeof lat === 'number' && lat !== 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await localAPI.request(`/properties/geocode?q=${encodeURIComponent(city)}`);
        const list = (data as any)?.suggestions || [];
        if (cancelled || !list.length) return;
        map.setCenter([list[0].lat, list[0].lng], 11, { duration: 300 });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [city]);

  return (
    <div className="relative w-full h-[280px] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900">
      <div ref={containerRef} className="absolute inset-0" />
      {(loading || resolving) && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm pointer-events-none">
          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
        </div>
      )}
      <div className="absolute top-2 left-2 right-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-white/80 uppercase tracking-widest pointer-events-none">
        <MapIcon className="h-3.5 w-3.5 text-primary" />
        Кликните по карте — адрес заполнится автоматически
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FIELD COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PropertyCreate, photos?: File[], newClient?: { full_name: string; phone: string; birthday?: string; comment?: string }) => Promise<void>;
  isPending: boolean;
  initialData?: Property;
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SelectField({ value, onValueChange, options, placeholder = '—' }: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[] | string[];
  placeholder?: string;
}) {
  const inputCls = "h-11 rounded-xl bg-zinc-900/60 border-white/5";
  const items = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <SelectTrigger className={inputCls}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {items.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function MultiSelectField({ value, onValueChange, options, comboValue }: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  comboValue?: { values: string[]; result: string };
}) {
  const selected = useMemo(() => {
    if (!value) return [];
    return String(value).split(',').map(v => v.trim()).filter(Boolean);
  }, [value]);

  const toggle = (val: string) => {
    let next: string[];
    const exists = selected.includes(val);
    if (exists) {
      next = selected.filter(v => v !== val);
    } else {
      next = [...selected, val];
    }
    // Если comboValue задан и все значения combo выбраны — заменяем на combo.result
    if (comboValue) {
      const allComboSelected = comboValue.values.every(v => next.includes(v));
      const hasComboResult = next.includes(comboValue.result);
      if (allComboSelected && !hasComboResult) {
        next = next.filter(v => !comboValue.values.includes(v));
        next.push(comboValue.result);
      } else if (!allComboSelected && hasComboResult) {
        next = next.filter(v => v !== comboValue.result);
      }
    }
    onValueChange(next.join(','));
  };

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {options.map(o => (
        <div key={o.value} className="flex items-center gap-1.5 cursor-pointer" onClick={() => toggle(o.value)}>
          <div className={cn(
            "w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
            selected.includes(o.value) ? "border-emerald-500" : "border-zinc-500"
          )}>
            {selected.includes(o.value) && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
          </div>
          <span className="text-sm text-zinc-300">{o.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION HEADER
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon: Icon, color, label }: { icon: any; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className={`p-1.5 rounded-lg bg-${color}-500/10 border border-${color}-500/10`}>
        <Icon className={`h-3 w-3 text-${color}-400`} />
      </div>
      <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENT AUTOCOMPLETE
   ═══════════════════════════════════════════════════════════════════════════ */

function ClientAutocomplete({ value, onChange, suggestions, onSelect, inputCls }: {
  value: string;
  onChange: (v: string) => void;
  suggestions: { id: string; full_name: string; phone: string; status: string }[];
  onSelect: (c: { id: string; full_name: string; phone: string }) => void;
  inputCls: string;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setShowDropdown(true); }}
        onFocus={() => { if (suggestions.length) setShowDropdown(true); }}
        placeholder="Поиск клиента по ФИО или телефону..."
        className={inputCls}
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => { onSelect(c); setShowDropdown(false); }}
              className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between"
            >
              <span>{c.full_name}</span>
              <span className="text-[10px] text-white/40">{c.phone || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewClientInlineForm({ defaultName, onSave, inputCls }: {
  defaultName: string;
  onSave: (data: { full_name: string; phone: string; birthday?: string; comment?: string }) => void;
  inputCls: string;
}) {
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [comment, setComment] = useState('');

  const handlePhoneChange = (val: string) => {
    setPhone(formatPhoneRu(val));
  };

  return (
    <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 space-y-3">
      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Создать нового клиента</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">ФИО</label>
          <Input value={defaultName} disabled className={cn(inputCls, 'mt-1 opacity-70 normal-case tracking-normal')} />
        </div>
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">Телефон <span className="text-red-500">*</span></label>
          <Input
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="+7 (999) 123-45-67"
            inputMode="tel"
            type="tel"
            className={cn(inputCls, 'mt-1 normal-case font-medium tracking-normal')}
          />
        </div>
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">Дата рождения</label>
          <Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} className={cn(inputCls, 'mt-1')} />
        </div>
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">Комментарий</label>
          <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Заметка..." className={cn(inputCls, 'mt-1')} />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!phone.trim()}
        onClick={() => onSave({ full_name: defaultName, phone, birthday: birthday || undefined, comment: comment || undefined })}
        className="text-[9px] uppercase tracking-widest"
      >
        Подтвердить
      </Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PHOTO SORTABLE GRID (SortableJS)
   ═══════════════════════════════════════════════════════════════════════════ */

function PhotoSortableGrid({
  photos,
  setPhotos,
  initialData,
}: {
  photos: { file?: File; id: string; preview: string; isExisting?: boolean; dbId?: string }[];
  setPhotos: React.Dispatch<React.SetStateAction<{ file?: File; id: string; preview: string; isExisting?: boolean; dbId?: string }[]>>;
  initialData?: Property;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    if (!containerRef.current) return;
    const sortable = Sortable.create(containerRef.current, {
      animation: 150,
      ghostClass: 'opacity-40',
      chosenClass: 'scale-[1.02]',
      dragClass: 'shadow-2xl',
      onEnd: (evt) => {
        const items = Array.from(photosRef.current);
        const [moved] = items.splice(evt.oldIndex!, 1);
        items.splice(evt.newIndex!, 0, moved);
        setPhotos(items);
        const existingIds = items.filter(p => p.isExisting && p.dbId).map(p => p.dbId!);
        if (initialData?.id && existingIds.length > 0) {
          localAPI.request(`/properties/${initialData.id}/photos/reorder`, {
            method: 'PUT',
            body: { photo_ids: existingIds }
          }).catch(() => {});
        }
      }
    });
    return () => sortable.destroy();
  }, [photos.length, initialData?.id, setPhotos]);

  return (
    <div ref={containerRef} className="flex gap-2 flex-wrap">
      {photos.map((p, i) => (
        <div
          key={p.id}
          data-id={p.id}
          className="relative group w-24 h-24 rounded-xl overflow-hidden border-2 cursor-grab active:cursor-grabbing flex-shrink-0 border-white/10 hover:border-white/30"
        >
          <img src={p.preview} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          {i === 0 && (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary/90 rounded text-[8px] font-black text-white uppercase tracking-wider">Гл</div>
          )}
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (p.isExisting && initialData?.id && p.dbId) {
                await localAPI.request(`/properties/${initialData.id}/photos/${p.dbId}`, { method: 'DELETE' });
              } else {
                URL.revokeObjectURL(p.preview);
              }
              setPhotos(prev => prev.filter((_, idx) => idx !== i));
            }}
            className="absolute top-1 right-1 p-1 rounded bg-red-600/90 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-80 pointer-events-none">
            <GripVertical className="h-3 w-3 text-white drop-shadow" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export function PropertyFormDialog({ open, onOpenChange, onSubmit, isPending, initialData }: Props) {
  const { user } = useAuth();
  const inputCls = "h-11 rounded-xl bg-zinc-900/60 border-white/5 mt-0";

  // ── Form state ──────────────────────────────────────────────────────────

  const buildInitial = useCallback((): PropertyCreate => ({
    category: initialData?.category || 'apartment_sell',
    city: initialData?.city || '',
    address: initialData?.address || '',
    lat: (initialData as any)?.lat || undefined,
    lng: (initialData as any)?.lng || undefined,
    price: initialData?.price || 0,
    area_total: initialData?.area_total || undefined,
    area_living: initialData?.area_living || undefined,
    area_kitchen: initialData?.area_kitchen || undefined,
    rooms: initialData?.rooms || undefined,
    floor: initialData?.floor || undefined,
    floors_total: initialData?.floors_total || undefined,
    description: initialData?.description || '',
    house_type: (initialData as any)?.house_type || undefined,
    year_built: (initialData as any)?.year_built || undefined,
    renovation: ((initialData as any)?.renovation === 'without'
      ? 'requires'
      : (initialData as any)?.renovation) || undefined,
    bathroom: (initialData as any)?.bathroom || undefined,
    balcony: (initialData as any)?.balcony || undefined,
    ceiling_height: (initialData as any)?.ceiling_height || undefined,
    parking: (initialData as any)?.parking || undefined,
    view_from_window: (initialData as any)?.view_from_window || undefined,
    elevator: (initialData as any)?.elevator || undefined,
    land_area: (initialData as any)?.land_area || undefined,
    land_status: (initialData as any)?.land_status || undefined,
    commercial_type: (initialData as any)?.commercial_type || undefined,
    object_type: (initialData as any)?.object_type || undefined,
    bathroom_location: (initialData as any)?.bathroom_location || undefined,
    apartment_type: (initialData as any)?.apartment_type || undefined,
    smoking_allowed: (initialData as any)?.smoking_allowed || undefined,
    deal_type: (initialData as any)?.deal_type || undefined,
    room_type: (initialData as any)?.room_type || undefined,
    sale_options: (initialData as any)?.sale_options || undefined,
    walls_type: (initialData as any)?.walls_type || undefined,
    heating: (initialData as any)?.heating || undefined,
    water_supply: (initialData as any)?.water_supply || undefined,
    sewerage: (initialData as any)?.sewerage || undefined,
    gas_supply: (initialData as any)?.gas_supply || undefined,
    built_year: (initialData as any)?.built_year || undefined,
    client_id: (initialData as any)?.client_id || undefined,
    // Avito rent fields
    furniture: (initialData as any)?.furniture || undefined,
    appliances: (initialData as any)?.appliances || undefined,
    internet: (initialData as any)?.internet || undefined,
    conditioner: (initialData as any)?.conditioner || undefined,
    washing_machine: (initialData as any)?.washing_machine || undefined,
    dishwasher: (initialData as any)?.dishwasher || undefined,
    fridge: (initialData as any)?.fridge || undefined,
    tv: (initialData as any)?.tv || undefined,
    pets_allowed: (initialData as any)?.pets_allowed || undefined,
    children_allowed: (initialData as any)?.children_allowed || undefined,
    prepayment: (initialData as any)?.prepayment || undefined,
    deposit_amount: (initialData as any)?.deposit_amount || undefined,
    lease_term: (initialData as any)?.lease_term || undefined,
    tenant_requirements: (initialData as any)?.tenant_requirements || undefined,
    // Avito common
    infrastructure: (initialData as any)?.infrastructure || undefined,
    transport_accessibility: (initialData as any)?.transport_accessibility || undefined,
    utility_details: (initialData as any)?.utility_details || undefined,
  }), [initialData]);

  const [form, setForm] = useState<PropertyCreate>(buildInitial);
  const [photos, setPhotos] = useState<{file?: File; id: string; preview: string; isExisting?: boolean; dbId?: string}[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState({ done: 0, total: 0 });
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [newClientData, setNewClientData] = useState<{ full_name: string; phone: string; birthday?: string; comment?: string } | null>(null);
  const setFormField = useCallback((key: string, value: any) => setForm((f) => ({ ...f, [key]: value })), []);

  // Dirty-check state
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState('');

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    const current = JSON.stringify({ form, photos, client: selectedClient, newClient: newClientData });
    return current !== initialSnapshot;
  }, [form, photos, selectedClient, newClientData, initialSnapshot]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      setShowDiscardDialog(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleDiscard = () => {
    setShowDiscardDialog(false);
    onOpenChange(false);
  };

  const { data: clientAccessCheck } = useClientAccessCheck();
  const { data: clientSuggestions = [] } = useClientSearch(clientSearch);
  const linkedClientId = open
    ? String((initialData as any)?.client_id || form.client_id || '')
    : '';
  const { data: linkedClient } = useClient(linkedClientId || null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    // Initialize form only when dialog is opened.
    // Do not reset state on every parent rerender while user edits fields.
    if (open && !wasOpenRef.current) {
      const nextForm = buildInitial();
      setForm(nextForm);
      photos.forEach(p => { if (!p.isExisting && p.preview.startsWith('blob:')) URL.revokeObjectURL(p.preview); });
      if (initialData?.photos && initialData.photos.length > 0) {
        setPhotos(initialData.photos.map(p => ({
          id: p.id,
          preview: p.file_url,
          isExisting: true,
          dbId: p.id
        })));
      } else {
        setPhotos([]);
      }
      setNewClientData(null);
      setClientSearch('');

      const initialClientId = (initialData as any)?.client_id || nextForm.client_id;
      const initialClient = initialClientId
        ? {
            id: String(initialClientId),
            full_name: (initialData as any)?.client_name || 'Клиент',
            phone: (initialData as any)?.client_phone || '',
          }
        : null;
      setSelectedClient(initialClient);

      // Save snapshot for dirty-check
      const initialPhotos = initialData?.photos && initialData.photos.length > 0
        ? initialData.photos.map((p: any) => ({
            id: p.id,
            preview: p.file_url,
            isExisting: true,
            dbId: p.id
          }))
        : [];
      setInitialSnapshot(JSON.stringify({
        form: nextForm,
        photos: initialPhotos,
        client: initialClient,
        newClient: null
      }));
    }
    wasOpenRef.current = open;
  }, [open, buildInitial, initialData]);

  // Load photos from detail API when editing (list view doesn't include photos)
  useEffect(() => {
    if (!open || !initialData?.id || initialData.photos) return;
    let cancelled = false;
    localAPI.request(`/properties/${initialData.id}`).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Failed to load property detail:', error);
        return;
      }
      if (!data) return;
      const detail = data as any;
      if (detail.photos && Array.isArray(detail.photos)) {
        const loadedPhotos = detail.photos.map((p: any) => ({
          id: p.id,
          preview: p.file_url,
          isExisting: true,
          dbId: p.id
        }));
        setPhotos(loadedPhotos);
        // Update snapshot so loaded photos don't count as dirty
        setInitialSnapshot(prev => {
          if (!prev) return prev;
          const snap = JSON.parse(prev);
          snap.photos = loadedPhotos;
          return JSON.stringify(snap);
        });
      }
    }).catch((err) => {
      console.error('Exception loading property detail:', err);
    });
    return () => { cancelled = true; };
  }, [open, initialData]);

  // When editing an object with linked client_id, resolve and pin real client data.
  // This prevents "Клиент" placeholder and keeps selected client stable in edit mode.
  useEffect(() => {
    if (!open || !linkedClient?.id) return;
    const resolved = {
      id: String(linkedClient.id),
      full_name: linkedClient.full_name || 'Клиент',
      phone: linkedClient.phone || '',
    };
    setSelectedClient((prev) => {
      if (
        prev &&
        String(prev.id) === resolved.id &&
        prev.full_name === resolved.full_name &&
        (prev.phone || '') === (resolved.phone || '')
      ) {
        return prev;
      }
      return resolved;
    });
    if (String(form.client_id || '') !== resolved.id) {
      setFormField('client_id', resolved.id);
    }
    // Update snapshot so linked-client resolution doesn't count as dirty
    setInitialSnapshot(prev => {
      if (!prev) return prev;
      const snap = JSON.parse(prev);
      snap.form.client_id = resolved.id;
      snap.client = resolved;
      return JSON.stringify(snap);
    });
  }, [open, linkedClient?.id, linkedClient?.full_name, linkedClient?.phone, form.client_id, setFormField]);

  // ── Category helpers ────────────────────────────────────────────────────

  const cat = form.category;
  const isAptSell = cat === 'apartment_sell';
  const isAptRent = cat === 'apartment_rent';
  const isApt = isAptSell || isAptRent;
  const isHouse = cat === 'house';
  const isLand = cat === 'land';
  const isCommercial = cat === 'commercial';
  const showRoomType = isApt && form.rooms && form.rooms !== 'Студия' && form.rooms !== 'Своб. планировка';

  // ── Validation ──────────────────────────────────────────────────────────

  const MIN_DESCRIPTION_LENGTH = 50;

  const isValid = useMemo(() => {
    const desc = (form.description || '').trim();
    const hasClient = clientAccessCheck?.restricted
      ? true
      : Boolean(form.client_id || selectedClient?.id || newClientData?.full_name?.trim());
    const hasBase = !!(form.category && form.city?.trim() && form.address?.trim() && form.price && desc.length >= MIN_DESCRIPTION_LENGTH && hasClient);
    if (!hasBase) return false;

    if (isAptSell) {
      return !!(form.rooms && form.floor && form.floors_total && form.area_total && form.house_type && form.renovation);
    }
    if (isAptRent) {
      return !!(form.rooms && form.floor && form.floors_total && form.area_total);
    }
    if (isHouse) {
      return !!(form.area_total && form.floors_total && form.land_area);
    }
    if (isLand) {
      return !!form.land_area;
    }
    // commercial — only base fields required
    return true;
  }, [form, isAptSell, isAptRent, isHouse, isLand, clientAccessCheck?.restricted, selectedClient?.id, newClientData?.full_name]);

  // ── Duplicate detection (debounced) ─────────────────────────────────────

  const [duplicates, setDuplicates] = useState<any[]>([]);

  useEffect(() => {
    const addr = (form.address || '').trim();
    const city = (form.city || '').trim();
    if (!addr && !city) { setDuplicates([]); return; }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (addr) params.set('address', addr);
        else params.set('city', city);
        if (initialData?.id) params.set('exclude_id', initialData.id);
        const { data } = await localAPI.request(`/properties/check/duplicate?${params}`);
        setDuplicates((data as any)?.duplicates || []);
      } catch { setDuplicates([]); }
    }, 500);
    return () => clearTimeout(t);
  }, [form.address, form.city, initialData?.id]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValid || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const formData = { ...form };
      if (formData.renovation === 'without') {
        formData.renovation = 'requires';
      }
      if (selectedClient) {
        formData.client_id = selectedClient.id;
      }
      const newPhotos = photos.filter(p => p.file).map(p => p.file!);
      await onSubmit(formData, newPhotos.length > 0 ? newPhotos : undefined, newClientData || undefined);
      onOpenChange(false);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  // Sidebar navigation sections
  const SECTIONS = [
    { id: 'category', label: 'Категория', icon: Building2 },
    { id: 'location', label: 'Локация', icon: MapPin },
    { id: 'params', label: 'Параметры', icon: Ruler },
    { id: 'details', label: 'Детали', icon: Sparkles },
    ...(isAptRent ? [{ id: 'rent', label: 'Аренда', icon: Key }] : []),
    { id: 'description', label: 'Описание', icon: Home },
    { id: 'photos', label: 'Фото', icon: PhotoIcon },
    { id: 'client', label: 'Клиент', icon: UserRound },
  ];

  const [activeSection, setActiveSection] = useState('category');
  const formScrollRef = useRef<HTMLFormElement>(null);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const container = formScrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`#section-${id}`);
    if (!el) return;
    container.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: 'auto' });
  };

  const syncActiveSectionByScroll = () => {
    const container = formScrollRef.current;
    if (!container) return;
    const sectionIds = SECTIONS.map((s) => s.id);
    const scrollAnchor = container.scrollTop + 120;
    let current = sectionIds[0] || 'category';
    for (const id of sectionIds) {
      const el = container.querySelector<HTMLElement>(`#section-${id}`);
      if (el && el.offsetTop <= scrollAnchor) current = id;
    }
    setActiveSection((prev) => (prev === current ? prev : current));
  };

  useEffect(() => {
    if (!open) return;
    syncActiveSectionByScroll();
  }, [open, isAptRent]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          onPointerDownOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setShowDiscardDialog(true);
            }
          }}
          onInteractOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setShowDiscardDialog(true);
            }
          }}
          style={{
          ['--dialog-content-max-width' as any]: '1500px',
          maxHeight: 'calc(100vh - 1.5rem)',
          height: 'calc(100vh - 1.5rem)',
          width: '98vw',
          maxWidth: '1500px',
          overflow: 'hidden',
        }}
        className="!p-0 !rounded-xl !bg-zinc-950/98 !border-white/10 shadow-2xl flex flex-col"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-zinc-900/50 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg sm:text-xl font-semibold text-white truncate">
                {initialData ? 'Редактирование объекта' : 'Новый объект'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {CATEGORIES.find(c => c.value === form.category)?.label || 'Объект недвижимости'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Body: Sidebar + Content ─────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="hidden sm:flex flex-col w-56 border-r border-white/5 bg-zinc-900/30 py-4 px-3 gap-1 flex-shrink-0 overflow-y-auto">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm",
                    activeSection === s.id
                      ? "bg-primary/15 text-primary border border-primary/20"
                      : "text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium truncate">{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Form Content */}
          <form ref={formScrollRef} onSubmit={handleSubmit} onScroll={syncActiveSectionByScroll} className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-10">

            {/* ═══ Category ═══ */}
            <div id="section-category" className="space-y-4">
              <SectionHeader icon={Building2} color="primary" label="Категория объекта" />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {CATEGORIES.map(c => {
                  const Icon = c.icon;
                  const active = form.category === c.value;
                  return (
                    <button
                      type="button"
                      key={c.value}
                      onClick={() => setFormField('category', c.value)}
                      className={cn(
                        "flex flex-col items-center gap-2 py-4 px-3 rounded-2xl border transition-all",
                        active
                          ? "bg-primary/15 border-primary/40 text-primary shadow-lg shadow-primary/10"
                          : "bg-white/[0.02] border-white/5 text-white/50 hover:text-white/80 hover:border-white/10"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ═══ Location & Price ═══ */}
            <div id="section-location" className="space-y-5 pt-4 border-t border-white/5">
              <SectionHeader icon={MapPin} color="amber" label="Локация и цена" />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: inputs */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Город" required>
                      <CityAutocomplete value={form.city || ''} onChange={v => setFormField('city', v)} className={inputCls} />
                    </Field>
                    <Field label="Цена, ₽" required>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={form.price ? Number(form.price).toLocaleString('ru-RU') : ''}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setFormField('price', Number(raw) || 0);
                        }}
                        placeholder="5 000 000"
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  <Field label="Адрес (улица, дом)" required>
                    <AddressAutocomplete
                      value={form.address || ''}
                      city={form.city || ''}
                      onChange={v => setFormField('address', v)}
                      onSelect={(addr, lat, lng) => {
                        setFormField('address', addr);
                        setFormField('lat', lat);
                        setFormField('lng', lng);
                      }}
                      className={inputCls}
                    />
                  </Field>

                  {/* Duplicate warning */}
                  {duplicates.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Возможные дубли ({duplicates.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {duplicates.slice(0, 3).map((d: any) => (
                          <div key={d.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-black/30">
                            <div className="flex-1 min-w-0">
                              <p className="text-white truncate">{d.address || d.city}</p>
                              <p className="text-[10px] text-white/50">
                                {Number(d.price).toLocaleString('ru-RU')} ₽ · {d.owner_name}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Map */}
                <div>
                  <YandexMapPicker
                    lat={form.lat}
                    lng={form.lng}
                    city={form.city || ''}
                    onPick={({ lat, lng, address, city }) => {
                      setFormField('lat', lat);
                      setFormField('lng', lng);
                      if (address) setFormField('address', address);
                      if (city) setFormField('city', city);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ═══ Parameters ═══ */}
            <div id="section-params" className="space-y-5 pt-4 border-t border-white/5">
              <SectionHeader icon={Ruler} color="emerald" label="Параметры" />

              {/* Apartment area */}
              {isApt && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Комнат" required>
                    <SelectField
                      value={form.rooms ? String(form.rooms) : undefined}
                      onValueChange={v => setFormField('rooms', v)}
                      options={OPT_ROOMS.map(r => ({ value: r, label: r }))}
                    />
                  </Field>
                  <Field label="Площадь общая, м²" required>
                    <Input type="number" step="0.1" value={form.area_total || ''} onChange={e => setFormField('area_total', Number(e.target.value) || undefined)} placeholder="65" className={inputCls} />
                  </Field>
                  <Field label="Этаж" required>
                    <Input type="number" value={form.floor || ''} onChange={e => setFormField('floor', Number(e.target.value) || undefined)} placeholder="5" className={inputCls} />
                  </Field>
                  <Field label="Этажность дома" required>
                    <Input type="number" value={form.floors_total || ''} onChange={e => setFormField('floors_total', Number(e.target.value) || undefined)} placeholder="9" className={inputCls} />
                  </Field>
                </div>
              )}
              {isApt && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Жилая, м²">
                    <Input type="number" step="0.1" value={form.area_living || ''} onChange={e => setFormField('area_living', Number(e.target.value) || undefined)} placeholder="42" className={inputCls} />
                  </Field>
                  <Field label="Кухня, м²">
                    <Input type="number" step="0.1" value={form.area_kitchen || ''} onChange={e => setFormField('area_kitchen', Number(e.target.value) || undefined)} placeholder="12" className={inputCls} />
                  </Field>
                  {showRoomType && (
                    <Field label="Тип комнат">
                      <SelectField value={form.room_type} onValueChange={v => setFormField('room_type', v || undefined)} options={OPT_ROOM_TYPE.map(r => ({ value: r, label: r }))} />
                    </Field>
                  )}
                </div>
              )}

              {/* House params */}
              {isHouse && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Площадь дома, м²" required>
                    <Input type="number" step="0.1" value={form.area_total || ''} onChange={e => setFormField('area_total', Number(e.target.value) || undefined)} placeholder="120" className={inputCls} />
                  </Field>
                  <Field label="Участок, сотки" required>
                    <Input type="number" step="0.1" value={form.land_area || ''} onChange={e => setFormField('land_area', Number(e.target.value) || undefined)} placeholder="6.5" className={inputCls} />
                  </Field>
                  <Field label="Этажность" required>
                    <Input type="number" value={form.floors_total || ''} onChange={e => setFormField('floors_total', Number(e.target.value) || undefined)} placeholder="2" className={inputCls} />
                  </Field>
                  <Field label="Комнат">
                    <SelectField
                      value={form.rooms ? String(form.rooms) : undefined}
                      onValueChange={v => setFormField('rooms', v)}
                      options={OPT_HOUSE_ROOMS.map(r => ({ value: r, label: r }))}
                    />
                  </Field>
                  <Field label="Тип объекта">
                    <SelectField value={form.object_type} onValueChange={v => setFormField('object_type', v || undefined)} options={OPT_HOUSE_OBJECT_TYPE} />
                  </Field>
                </div>
              )}

              {/* Land params */}
              {isLand && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Площадь, сотки" required>
                    <Input type="number" step="0.1" value={form.land_area || ''} onChange={e => setFormField('land_area', Number(e.target.value) || undefined)} placeholder="10" className={inputCls} />
                  </Field>
                  <Field label="Назначение земли">
                    <SelectField value={form.land_status} onValueChange={v => setFormField('land_status', v || undefined)} options={OPT_LAND_STATUS} />
                  </Field>
                </div>
              )}

              {/* Commercial params */}
              {isCommercial && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Вид объекта">
                    <SelectField value={form.commercial_type} onValueChange={v => setFormField('commercial_type', v || undefined)} options={OPT_COMMERCIAL_TYPE} />
                  </Field>
                  <Field label="Площадь, м²">
                    <Input type="number" step="0.1" value={form.area_total || ''} onChange={e => setFormField('area_total', Number(e.target.value) || undefined)} placeholder="100" className={inputCls} />
                  </Field>
                  <Field label="Этаж">
                    <Input type="number" value={form.floor || ''} onChange={e => setFormField('floor', Number(e.target.value) || undefined)} placeholder="1" className={inputCls} />
                  </Field>
                  <Field label="Этажность здания">
                    <Input type="number" value={form.floors_total || ''} onChange={e => setFormField('floors_total', Number(e.target.value) || undefined)} placeholder="5" className={inputCls} />
                  </Field>
                </div>
              )}
            </div>

            {/* ═══ Details / Characteristics ═══ */}
            <div id="section-details" className="space-y-5 pt-4 border-t border-white/5">
              <SectionHeader icon={Sparkles} color="indigo" label="Характеристики" />

              {/* Apartment sell characteristics */}
              {isAptSell && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field label="Тип дома" required>
                      <SelectField value={form.house_type} onValueChange={v => setFormField('house_type', v || undefined)} options={OPT_HOUSE_TYPE} />
                    </Field>
                    <Field label="Ремонт" required>
                      <SelectField value={form.renovation} onValueChange={v => setFormField('renovation', v || undefined)} options={OPT_RENOVATION} />
                    </Field>
                    <Field label="Санузел">
                      <MultiSelectField value={form.bathroom} onValueChange={v => setFormField('bathroom', v || undefined)} options={OPT_BATHROOM} />
                    </Field>
                    <Field label="Балкон / лоджия">
                      <MultiSelectField value={form.balcony} onValueChange={v => setFormField('balcony', v || undefined)} options={OPT_BALCONY} comboValue={{ values: ['balcony', 'loggia'], result: 'both' }} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field label="Вид из окон">
                      <MultiSelectField value={form.view_from_window} onValueChange={v => setFormField('view_from_window', v || undefined)} options={OPT_VIEW} />
                    </Field>
                    <Field label="Пассажирский лифт">
                      <SelectField value={form.passenger_elevator_count?.toString()} onValueChange={v => setFormField('passenger_elevator_count', v ? Number(v) : undefined)} options={OPT_ELEVATOR_COUNT} />
                    </Field>
                    <Field label="Грузовой лифт">
                      <SelectField value={form.freight_elevator_count?.toString()} onValueChange={v => setFormField('freight_elevator_count', v ? Number(v) : undefined)} options={OPT_ELEVATOR_COUNT} />
                    </Field>
                    <Field label="Парковка">
                      <MultiSelectField value={form.parking} onValueChange={v => setFormField('parking', v || undefined)} options={OPT_PARKING} />
                    </Field>
                    <Field label="Высота потолков, м">
                      <Input type="number" step="0.1" value={form.ceiling_height || ''} onChange={e => setFormField('ceiling_height', Number(e.target.value) || undefined)} placeholder="2.7" className={inputCls} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field label="Год постройки">
                      <Input type="number" value={form.year_built || ''} onChange={e => setFormField('year_built', Number(e.target.value) || undefined)} placeholder="2010" className={inputCls} />
                    </Field>
                    <Field label="Тип сделки">
                      <SelectField value={form.deal_type} onValueChange={v => setFormField('deal_type', v || undefined)} options={OPT_DEAL_TYPE.map(r => ({ value: r, label: r }))} />
                    </Field>
                    <Field label="Условия продажи">
                      <SelectField value={form.sale_options} onValueChange={v => setFormField('sale_options', v || undefined)} options={OPT_SALE_OPTIONS.map(r => ({ value: r, label: r }))} />
                    </Field>
                    <Field label="Тип жилья">
                      <SelectField value={form.apartment_type} onValueChange={v => setFormField('apartment_type', v || undefined)} options={OPT_APARTMENT_TYPE} />
                    </Field>
                  </div>
                </div>
              )}

              {/* Apartment rent characteristics */}
              {isAptRent && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Тип дома">
                    <SelectField value={form.house_type} onValueChange={v => setFormField('house_type', v || undefined)} options={OPT_HOUSE_TYPE} />
                  </Field>
                  <Field label="Ремонт">
                    <SelectField value={form.renovation} onValueChange={v => setFormField('renovation', v || undefined)} options={OPT_RENOVATION} />
                  </Field>
                  <Field label="Санузел">
                    <MultiSelectField value={form.bathroom} onValueChange={v => setFormField('bathroom', v || undefined)} options={OPT_HOUSE_BATHROOM} />
                  </Field>
                  <Field label="Балкон / лоджия">
                    <MultiSelectField value={form.balcony} onValueChange={v => setFormField('balcony', v || undefined)} options={OPT_BALCONY} comboValue={{ values: ['balcony', 'loggia'], result: 'both' }} />
                  </Field>
                  <Field label="Вид из окон">
                    <MultiSelectField value={form.view_from_window} onValueChange={v => setFormField('view_from_window', v || undefined)} options={OPT_VIEW} />
                  </Field>
                  <Field label="Пассажирский лифт">
                    <SelectField value={form.passenger_elevator_count?.toString()} onValueChange={v => setFormField('passenger_elevator_count', v ? Number(v) : undefined)} options={OPT_ELEVATOR_COUNT} />
                  </Field>
                  <Field label="Грузовой лифт">
                    <SelectField value={form.freight_elevator_count?.toString()} onValueChange={v => setFormField('freight_elevator_count', v ? Number(v) : undefined)} options={OPT_ELEVATOR_COUNT} />
                  </Field>
                  <Field label="Парковка">
                    <MultiSelectField value={form.parking} onValueChange={v => setFormField('parking', v || undefined)} options={OPT_PARKING} />
                  </Field>
                </div>
              )}

              {/* House characteristics */}
              {isHouse && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field label="Ремонт">
                      <SelectField value={form.renovation} onValueChange={v => setFormField('renovation', v || undefined)} options={OPT_RENOVATION} />
                    </Field>
                    <Field label="Материал стен">
                      <SelectField value={form.walls_type} onValueChange={v => setFormField('walls_type', v || undefined)} options={OPT_WALLS_TYPE} />
                    </Field>
                    <Field label="Санузел">
                      <MultiSelectField value={form.bathroom_location} onValueChange={v => setFormField('bathroom_location', v || undefined)} options={OPT_HOUSE_BATHROOM} />
                    </Field>
                    <Field label="Назначение земли">
                      <SelectField value={form.land_status} onValueChange={v => setFormField('land_status', v || undefined)} options={OPT_LAND_STATUS} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <Field label="Тип водоснабжения">
                      <SelectField
                        value={form.utility_details?.water_supply_type}
                        onValueChange={v => setFormField('utility_details', { ...form.utility_details, water_supply_type: v || undefined })}
                        options={OPT_WATER_SUPPLY_TYPE}
                      />
                    </Field>
                    <Field label="Тип канализации">
                      <SelectField
                        value={form.utility_details?.sewerage_type}
                        onValueChange={v => setFormField('utility_details', { ...form.utility_details, sewerage_type: v || undefined })}
                        options={OPT_SEWERAGE_TYPE}
                      />
                    </Field>
                    <Field label="Тип газоснабжения">
                      <SelectField
                        value={form.utility_details?.gas_supply_type}
                        onValueChange={v => setFormField('utility_details', { ...form.utility_details, gas_supply_type: v || undefined })}
                        options={OPT_GAS_SUPPLY_TYPE}
                      />
                    </Field>
                    <Field label="Тип отопления">
                      <SelectField
                        value={form.utility_details?.heating_type}
                        onValueChange={v => setFormField('utility_details', { ...form.utility_details, heating_type: v || undefined })}
                        options={OPT_HEATING_TYPE}
                      />
                    </Field>
                    <Field label="Электричество">
                      <SelectField
                        value={form.utility_details?.electricity}
                        onValueChange={v => setFormField('utility_details', { ...form.utility_details, electricity: v || undefined })}
                        options={OPT_YES_NO}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field label="Год постройки">
                      <Input type="number" value={form.year_built || ''} onChange={e => setFormField('year_built', Number(e.target.value) || undefined)} placeholder="2010" className={inputCls} />
                    </Field>
                  </div>
                </div>
              )}

              {/* Infrastructure for all */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3">
                <Field label="Инфраструктура рядом">
                  <Input value={form.infrastructure || ''} onChange={e => setFormField('infrastructure', e.target.value || undefined)} placeholder="Школа, детский сад, магазин, парк..." className={inputCls} />
                </Field>
                <Field label="Транспортная доступность">
                  <Input value={form.transport_accessibility || ''} onChange={e => setFormField('transport_accessibility', e.target.value || undefined)} placeholder="5 мин до метро, остановка рядом..." className={inputCls} />
                </Field>
              </div>
            </div>

            {/* ═══ Rent conditions ═══ */}
            {isAptRent && (
              <div id="section-rent" className="space-y-5 pt-4 border-t border-white/5">
                <SectionHeader icon={Key} color="cyan" label="Условия аренды" />

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Мебель">
                    <SelectField value={form.furniture} onValueChange={v => setFormField('furniture', v || undefined)} options={OPT_FURNITURE} />
                  </Field>
                  <Field label="Предоплата">
                    <SelectField value={form.prepayment} onValueChange={v => setFormField('prepayment', v || undefined)} options={OPT_PREPAYMENT} />
                  </Field>
                  <Field label="Срок аренды">
                    <SelectField value={form.lease_term} onValueChange={v => setFormField('lease_term', v || undefined)} options={OPT_LEASE_TERM} />
                  </Field>
                  <Field label="Залог (депозит)">
                    <Input value={form.deposit_amount || ''} onChange={e => setFormField('deposit_amount', e.target.value || undefined)} placeholder="1 месяц" className={inputCls} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Кондиционер">
                    <SelectField value={form.conditioner} onValueChange={v => setFormField('conditioner', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                  <Field label="Стиральная машина">
                    <SelectField value={form.washing_machine} onValueChange={v => setFormField('washing_machine', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                  <Field label="Холодильник">
                    <SelectField value={form.fridge} onValueChange={v => setFormField('fridge', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                  <Field label="Интернет">
                    <SelectField value={form.internet} onValueChange={v => setFormField('internet', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Посудомоечная">
                    <SelectField value={form.dishwasher} onValueChange={v => setFormField('dishwasher', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                  <Field label="Телевизор">
                    <SelectField value={form.tv} onValueChange={v => setFormField('tv', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                  <Field label="Можно с животными">
                    <SelectField value={form.pets_allowed} onValueChange={v => setFormField('pets_allowed', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                  <Field label="Можно с детьми">
                    <SelectField value={form.children_allowed} onValueChange={v => setFormField('children_allowed', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                  <Field label="Можно курить">
                    <SelectField value={form.smoking_allowed} onValueChange={v => setFormField('smoking_allowed', v || undefined)} options={OPT_YES_NO} />
                  </Field>
                </div>

                <Field label="Требования к арендаторам">
                  <Textarea
                    value={form.tenant_requirements || ''}
                    onChange={e => setFormField('tenant_requirements', e.target.value || undefined)}
                    placeholder="Семья, без вредных привычек..."
                    className="rounded-xl bg-zinc-900/60 border-white/5 mt-0 min-h-[60px] resize-none"
                  />
                </Field>
              </div>
            )}

            {/* ═══ Description ═══ */}
            <div id="section-description" className="space-y-4 pt-4 border-t border-white/5">
              <SectionHeader icon={Home} color="sky" label="Описание" />
              <Field label={`Описание объекта (мин. ${MIN_DESCRIPTION_LENGTH} символов)`} required>
                <Textarea
                  value={form.description || ''}
                  onChange={e => setFormField('description', e.target.value)}
                  placeholder="Подробное описание объекта: ремонт, инфраструктура, особенности, преимущества расположения..."
                  className="rounded-xl bg-zinc-900/60 border-white/5 mt-0 !min-h-[360px] resize-none"
                />
                {form.description && form.description.trim().length > 0 && form.description.trim().length < MIN_DESCRIPTION_LENGTH && (
                  <p className="text-[10px] text-amber-400 mt-1">{form.description.trim().length}/{MIN_DESCRIPTION_LENGTH} символов</p>
                )}
              </Field>
            </div>

            {/* ═══ Photos ═══ */}
            <div id="section-photos" className="space-y-4 pt-4 border-t border-white/5">
              <SectionHeader icon={PhotoIcon} color="pink" label="Фотографии" />
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    setCompressing(true);
                    setCompressProgress({ done: 0, total: files.length });
                    try {
                      const compressed = await compressImages(Array.from(files), (done, total) =>
                        setCompressProgress({ done, total })
                      );
                      const newPhotos = compressed.map((c: CompressedPhoto) => ({
                        file: c.file,
                        id: `${c.originalName}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        preview: c.thumbnail,
                      }));
                      setPhotos((prev) => [...prev, ...newPhotos]);
                    } catch (err) {
                      console.error('Photo compression error:', err);
                    } finally {
                      setCompressing(false);
                      setCompressProgress({ done: 0, total: 0 });
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className={`flex items-center justify-center gap-2 h-16 rounded-2xl border-2 border-dashed text-xs font-bold uppercase tracking-widest transition-all ${
                    compressing
                      ? 'bg-primary/5 border-primary/30 text-primary cursor-wait'
                      : 'bg-white/[0.02] border-white/10 text-white/50 hover:text-white/80 hover:border-primary/40 hover:bg-primary/5 cursor-pointer'
                  }`}
                >
                  {compressing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Сжатие фото {compressProgress.done}/{compressProgress.total}…
                    </>
                  ) : (
                    <>
                      <PhotoIcon className="h-5 w-5" />
                      Нажмите или перетащите фото ({photos.length}/50)
                    </>
                  )}
                </label>
                {photos.length > 0 && (
                  <PhotoSortableGrid
                    photos={photos}
                    setPhotos={setPhotos}
                    initialData={initialData}
                  />
                )}
              </div>
            </div>

            {/* ═══ Client ═══ */}
            {!clientAccessCheck?.restricted && (
              <div id="section-client" className="space-y-4 pt-4 border-t border-white/5">
                <SectionHeader icon={UserRound} color="violet" label="Клиент *" />
                
                {selectedClient ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-violet-300">{selectedClient.full_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedClient.full_name}</p>
                      {selectedClient.phone && <p className="text-[10px] text-white/50">{selectedClient.phone}</p>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedClient(null); setClientSearch(''); setFormField('client_id', undefined); }}>
                      ✕
                    </Button>
                  </div>
                ) : newClientData ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-emerald-300">{newClientData.full_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{newClientData.full_name} <span className="text-[9px] text-emerald-400 uppercase">(новый)</span></p>
                      {newClientData.phone && <p className="text-[10px] text-white/50">{newClientData.phone}</p>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNewClientData(null)}>
                      ✕
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ClientAutocomplete
                      value={clientSearch}
                      onChange={setClientSearch}
                      suggestions={clientSuggestions}
                      onSelect={(c) => { setSelectedClient(c); setFormField('client_id', c.id); }}
                      inputCls={cn(inputCls, 'normal-case tracking-normal')}
                    />
                    {clientSearch.length >= 2 && clientSuggestions.length === 0 && (
                      <NewClientInlineForm
                        defaultName={clientSearch}
                        onSave={(data) => setNewClientData(data)}
                        inputCls={inputCls}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* spacer for footer */}
            <div className="h-4" />
          </form>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="border-t border-white/10 p-4 sm:p-5 flex gap-3 flex-shrink-0 bg-zinc-900/50 backdrop-blur-md">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-12 rounded-xl border-white/10 text-white/70 hover:text-white text-sm font-medium">
            Отмена
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={isPending || !isValid}
            className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-widest text-xs shadow-lg shadow-primary/20 disabled:opacity-40"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? 'Сохранить изменения' : 'Создать объект'}
          </Button>
        </div>
      </DialogContent>
      </Dialog>

      {/* Discard confirmation */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent className="bg-zinc-900 border-white/10 rounded-3xl shadow-2xl max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black">
              {initialData ? 'Отменить редактирование?' : 'Отменить создание объекта?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 font-bold">
              Все несохранённые изменения будут сброшены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="h-11 !px-4 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase !tracking-wide flex-1">
              Продолжить редактирование
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="h-11 !px-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black uppercase !tracking-wide shadow-lg shadow-rose-500/20 flex-1"
            >
              Закрыть без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
