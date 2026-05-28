/* ═══════════════════════════════════════════════════════════════════════════
   LABEL MAPS — human-readable labels for property field values
   Used by PropertyDetailDialog (view mode)
   ═══════════════════════════════════════════════════════════════════════════ */

const HOUSE_TYPE: Record<string, string> = {
  panel: 'Панельный',
  brick: 'Кирпичный',
  monolith: 'Монолитный',
  'monolith-brick': 'Монолитно-кирпичный',
  block: 'Блочный',
  wood: 'Деревянный',
};

const RENOVATION: Record<string, string> = {
  cosmetic: 'Косметический',
  euro: 'Евро',
  designer: 'Дизайнерский',
  requires: 'Требуется',
};

const BATHROOM: Record<string, string> = {
  combined: 'Совмещённый',
  separate: 'Раздельный',
};

const HOUSE_BATHROOM: Record<string, string> = {
  inside: 'В доме',
  outside: 'На улице',
};

const BALCONY: Record<string, string> = {
  balcony: 'Балкон',
  loggia: 'Лоджия',
  none: 'Нет',
};

const VIEW: Record<string, string> = {
  yard: 'Во двор',
  street: 'На улицу',
  sunny: 'На солнечную сторону',
};

const PARKING: Record<string, string> = {
  underground: 'Подземная',
  ground: 'Наземная многоуровневая',
  yard_open: 'Открытая во дворе',
  yard_barrier: 'За шлагбаумом во дворе',
  guest: 'Гостевая',
};

const HOUSE_OBJECT_TYPE: Record<string, string> = {
  house: 'Дом',
  cottage: 'Коттедж',
  dacha: 'Дача',
  townhouse: 'Таунхаус',
};

const APARTMENT_TYPE: Record<string, string> = {
  apartment: 'Квартира',
  apartments: 'Апартаменты',
};

const COMMERCIAL_TYPE: Record<string, string> = {
  office: 'Офисное помещение',
  free_purpose: 'Помещение свободного назначения',
  retail: 'Торговое помещение',
  warehouse: 'Складское помещение',
  production: 'Производственное помещение',
  catering: 'Помещение общественного питания',
  hotel: 'Гостиница',
  autoservice: 'Автосервис',
  building: 'Здание',
  coworking: 'Коворкинг',
  storage: 'Кладовая',
  residential: 'Жилой дом',
  other: 'Другое',
};

const WALLS_TYPE: Record<string, string> = {
  brick: 'Кирпич',
  wood: 'Дерево',
  block: 'Блоки',
  monolith: 'Монолит',
  frame: 'Каркас',
};

const YES_NO: Record<string, string> = {
  yes: 'Есть',
  no: 'Нет',
};

const WATER_SUPPLY_TYPE: Record<string, string> = {
  central: 'Центральное',
  well: 'Скважина',
  spring: 'Колодец',
  no: 'Нет',
};

const SEWERAGE_TYPE: Record<string, string> = {
  central: 'Центральная',
  septic: 'Септик',
  cesspool: 'Выгребная яма',
  bio_station: 'Станция биоочистки',
  no: 'Нет',
};

const GAS_SUPPLY_TYPE: Record<string, string> = {
  in_house: 'В доме',
  border: 'По границе участка',
  no: 'Нет',
};

const HEATING_TYPE: Record<string, string> = {
  central: 'Центральное',
  gas: 'Газовое',
  electric: 'Электрическое',
  solid: 'Жидкотопливный котёл',
  stove: 'Печь',
  fireplace: 'Камин',
  other: 'Другое',
};

const LAND_STATUS: Record<string, string> = {
  izhs: 'ИЖС',
  snt: 'СНТ',
  dnp: 'ДНП',
  lpx: 'ЛПХ',
};

const FURNITURE: Record<string, string> = {
  full: 'Полная',
  partial: 'Частичная',
  none: 'Без мебели',
};

const PREPAYMENT: Record<string, string> = {
  '1': '1 месяц',
  '2': '2 месяца',
  '3': '3 месяца',
  '6': 'Полгода',
  '12': 'Год',
};

const LEASE_TERM: Record<string, string> = {
  long: 'Длительный',
  short: 'Краткосрочный',
  any: 'Любой',
};

const ELECTRICITY: Record<string, string> = {
  yes: 'Есть',
  no: 'Нет',
};

const CATEGORY_LABEL: Record<string, string> = {
  apartment_sell: 'Продажа квартиры',
  apartment_rent: 'Аренда квартиры',
  house: 'Дом, дача',
  land: 'Земельный участок',
  commercial: 'Коммерция',
};

/** Resolve a raw value to a human-readable label using the given map.
 *  Supports comma-separated multi-values (e.g. "balcony,loggia"). */
export function labelOf(
  value: string | number | null | undefined,
  map: Record<string, string>
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const resolved = parts.map((p) => map[p] || p);
  return resolved.join(', ');
}

export const PL = {
  houseType: (v: string | null | undefined) => labelOf(v, HOUSE_TYPE),
  renovation: (v: string | null | undefined) => labelOf(v, RENOVATION),
  bathroom: (v: string | null | undefined) => labelOf(v, BATHROOM),
  houseBathroom: (v: string | null | undefined) => labelOf(v, HOUSE_BATHROOM),
  balcony: (v: string | null | undefined) => labelOf(v, BALCONY),
  view: (v: string | null | undefined) => labelOf(v, VIEW),
  parking: (v: string | null | undefined) => labelOf(v, PARKING),
  houseObjectType: (v: string | null | undefined) => labelOf(v, HOUSE_OBJECT_TYPE),
  apartmentType: (v: string | null | undefined) => labelOf(v, APARTMENT_TYPE),
  commercialType: (v: string | null | undefined) => labelOf(v, COMMERCIAL_TYPE),
  wallsType: (v: string | null | undefined) => labelOf(v, WALLS_TYPE),
  yesNo: (v: string | null | undefined) => labelOf(v, YES_NO),
  waterSupply: (v: string | null | undefined) => labelOf(v, WATER_SUPPLY_TYPE),
  sewerage: (v: string | null | undefined) => labelOf(v, SEWERAGE_TYPE),
  gasSupply: (v: string | null | undefined) => labelOf(v, GAS_SUPPLY_TYPE),
  heating: (v: string | null | undefined) => labelOf(v, HEATING_TYPE),
  landStatus: (v: string | null | undefined) => labelOf(v, LAND_STATUS),
  furniture: (v: string | null | undefined) => labelOf(v, FURNITURE),
  prepayment: (v: string | null | undefined) => labelOf(v, PREPAYMENT),
  leaseTerm: (v: string | null | undefined) => labelOf(v, LEASE_TERM),
  electricity: (v: string | null | undefined) => labelOf(v, ELECTRICITY),
  category: (v: string | null | undefined) => labelOf(v, CATEGORY_LABEL),
};
